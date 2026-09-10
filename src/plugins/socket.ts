import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Server, type Socket } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

interface AuthPayload {
  token: string;
  userId: string;
  role: string;
}

async function socketPlugin(fastify: FastifyInstance): Promise<void> {
  const io = new Server(fastify.server, {
    cors: {
      origin: fastify.config.NODE_ENV === 'development' ? '*' : /\.freteja\.com\.br$/,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Auth middleware for all namespaces
  const authMiddleware = (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      fastify.log.warn(`Socket auth failed: no token (id=${socket.id})`);
      return next(new Error('Authentication required'));
    }

    // TODO: Verify JWT token and extract user info
    // For now, accept any non-empty token in development
    if (fastify.config.NODE_ENV === 'development') {
      const auth = socket.handshake.auth as AuthPayload;
      socket.data.userId = auth.userId || 'dev-user';
      socket.data.role = auth.role || 'embarcador';
      return next();
    }

    return next(new Error('JWT verification not implemented'));
  };

  // Tracking namespace (/tracking)
  const tracking = io.of('/tracking');
  tracking.use(authMiddleware);

  tracking.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const role = socket.data.role as string;

    fastify.log.info(`[tracking] connected: ${userId} (${role}) id=${socket.id}`);

    // Driver joins their own room for targeted updates
    if (role === 'motorista') {
      socket.join(`driver:${userId}`);
    }

    // Listen for location updates from drivers
    socket.on('location:update', (data: { lat: number; lng: number; heading?: number; speed?: number }) => {
      fastify.log.debug(`[tracking] location from ${userId}: ${data.lat},${data.lng}`);
      // TODO: Save to driver_locations table
      // TODO: Broadcast to embarcadores watching this driver
    });

    // Listen for ride tracking subscriptions
    socket.on('ride:subscribe', (rideId: string) => {
      socket.join(`ride:${rideId}`);
      fastify.log.info(`[tracking] ${userId} subscribed to ride:${rideId}`);
    });

    socket.on('ride:unsubscribe', (rideId: string) => {
      socket.leave(`ride:${rideId}`);
    });

    socket.on('disconnect', (reason: string) => {
      fastify.log.info(`[tracking] disconnected: ${userId} reason=${reason}`);
    });

    // Ping/pong for testing
    socket.on('ping', (callback: (response: { pong: boolean; timestamp: string }) => void) => {
      if (typeof callback === 'function') {
        callback({ pong: true, timestamp: new Date().toISOString() });
      }
    });
  });

  // Chat namespace (/chat)
  const chat = io.of('/chat');
  chat.use(authMiddleware);

  chat.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    fastify.log.info(`[chat] connected: ${userId} id=${socket.id}`);

    // Join ride chat room
    socket.on('chat:join', (rideId: string) => {
      socket.join(`chat:${rideId}`);
      fastify.log.info(`[chat] ${userId} joined chat:${rideId}`);
    });

    socket.on('chat:leave', (rideId: string) => {
      socket.leave(`chat:${rideId}`);
    });

    // Send message
    socket.on('chat:message', (data: { rideId: string; text: string; type?: string }) => {
      const message = {
        id: `msg_${Date.now()}`,
        rideId: data.rideId,
        senderId: userId,
        text: data.text,
        type: data.type || 'text',
        timestamp: new Date().toISOString(),
      };

      // Broadcast to ride chat room (including sender)
      chat.to(`chat:${data.rideId}`).emit('chat:message', message);
      // TODO: Persist message to database
    });

    socket.on('disconnect', (reason: string) => {
      fastify.log.info(`[chat] disconnected: ${userId} reason=${reason}`);
    });

    // Ping/pong for testing
    socket.on('ping', (callback: (response: { pong: boolean; timestamp: string }) => void) => {
      if (typeof callback === 'function') {
        callback({ pong: true, timestamp: new Date().toISOString() });
      }
    });
  });

  fastify.decorate('io', io);

  fastify.addHook('onClose', async () => {
    io.close();
    fastify.log.info('Socket.IO server closed');
  });

  fastify.log.info('Socket.IO server initialized with namespaces: /tracking, /chat');
}

export default fp(socketPlugin, {
  name: 'socket',
  dependencies: [],
});
