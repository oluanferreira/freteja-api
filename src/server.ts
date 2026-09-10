import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import fastifyEnv from '@fastify/env';
import sensible from '@fastify/sensible';

// Env schema validation
const envSchema = {
  type: 'object',
  required: ['API_PORT'],
  properties: {
    API_PORT: { type: 'number', default: 3000 },
    API_HOST: { type: 'string', default: '0.0.0.0' },
    JWT_SECRET: { type: 'string', default: 'dev-secret-change-me' },
    JWT_EXPIRES_IN: { type: 'string', default: '7d' },
    NODE_ENV: { type: 'string', default: 'development' },
    DATABASE_URL: { type: 'string', default: 'postgresql://freteja:freteja@localhost:5432/freteja' },
  },
} as const;

// Extend Fastify type with env config
declare module 'fastify' {
  interface FastifyInstance {
    config: {
      API_PORT: number;
      API_HOST: string;
      JWT_SECRET: string;
      JWT_EXPIRES_IN: string;
      NODE_ENV: string;
      DATABASE_URL: string;
    };
  }
}

const buildServer = async () => {
  const isDev = process.env.NODE_ENV !== 'production';

  const server = Fastify({
    logger: isDev
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
  });

  // Env validation
  await server.register(fastifyEnv, { schema: envSchema, dotenv: true });

  // CORS
  await server.register(cors, {
    origin: isDev ? true : [/\.freteja\.com\.br$/],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Sensible (httpErrors, to, assert)
  await server.register(sensible);

  // Database (PostgreSQL + PostGIS)
  const databasePlugin = await import('./plugins/database');
  await server.register(databasePlugin.default);

  // JWT Auth
  const jwtPlugin = await import('./plugins/jwt');
  await server.register(jwtPlugin.default);

  // Auth routes
  const authRoutes = await import('./modules/auth/auth.routes');
  await server.register(authRoutes.default);

  // Rides routes
  const ridesRoutes = await import('./modules/rides/rides.routes');
  await server.register(ridesRoutes.default);

  // Proposals routes
  const proposalsRoutes = await import('./modules/proposals/proposals.routes');
  await server.register(proposalsRoutes.default);

  // Tracking routes (ride status + GPS)
  const trackingRoutes = await import('./modules/tracking/tracking.routes');
  await server.register(trackingRoutes.default);

  // Payment & wallet routes
  const paymentsRoutes = await import('./modules/payments/payments.routes');
  await server.register(paymentsRoutes.default);

  // Chat routes
  const chatRoutes = await import('./modules/chat/chat.routes');
  await server.register(chatRoutes.default);

  // Ratings routes
  const ratingsRoutes = await import('./modules/ratings/ratings.routes');
  await server.register(ratingsRoutes.default);

  // Notifications routes
  const notificationsRoutes = await import('./modules/notifications/notifications.routes');
  await server.register(notificationsRoutes.default);

  // Socket.IO (realtime: /tracking, /chat) — skipped on serverless (Vercel).
  // Realtime moves to Supabase Realtime; REST (chat history, GPS posts) keeps working.
  if (process.env.VERCEL !== "1" && process.env.DISABLE_SOCKETS !== "true") {
    const socketPlugin = await import('./plugins/socket');
    await server.register(socketPlugin.default);
  }

  // Global error handler
  server.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;

    server.log.error({
      err: error,
      statusCode,
      message: error.message,
    });

    reply.status(statusCode).send({
      statusCode,
      error: error.name ?? 'Internal Server Error',
      message: statusCode >= 500 ? 'Internal Server Error' : error.message,
    });
  });

  // Health check
  server.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: server.config.NODE_ENV,
    };
  });

  return server;
};

const start = async (): Promise<void> => {
  const server = await buildServer();

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      server.log.info(`Received ${signal}, shutting down gracefully...`);
      await server.close();
      process.exit(0);
    });
  }

  try {
    await server.listen({
      port: server.config.API_PORT,
      host: server.config.API_HOST,
    });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

export { buildServer };
