import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import fastifyEnv from '@fastify/env';
import sensible from '@fastify/sensible';
import databasePlugin from './plugins/database';
import jwtPlugin from './plugins/jwt';
import authRoutes from './modules/auth/auth.routes';
import ridesRoutes from './modules/rides/rides.routes';
import proposalsRoutes from './modules/proposals/proposals.routes';
import trackingRoutes from './modules/tracking/tracking.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import chatRoutes from './modules/chat/chat.routes';
import ratingsRoutes from './modules/ratings/ratings.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import socketPlugin from './plugins/socket';

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

  const registerPlugin = (plugin: unknown, opts?: unknown) =>
    (server.register as unknown as (p: unknown, o?: unknown) => Promise<void>)(plugin, opts);

  // Env validation
  await registerPlugin(fastifyEnv, { schema: envSchema, dotenv: true });

  // CORS
  await registerPlugin(cors, {
    origin: isDev ? true : [/\.freteja\.com\.br$/],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Sensible (httpErrors, to, assert)
  await registerPlugin(sensible);

  // Database (PostgreSQL + PostGIS)
  await registerPlugin(databasePlugin);

  // JWT Auth
  await registerPlugin(jwtPlugin);

  // Auth routes
  await registerPlugin(authRoutes);

  // Rides routes
  await registerPlugin(ridesRoutes);

  // Proposals routes
  await registerPlugin(proposalsRoutes);

  // Tracking routes (ride status + GPS)
  await registerPlugin(trackingRoutes);

  // Payment & wallet routes
  await registerPlugin(paymentsRoutes);

  // Chat routes
  await registerPlugin(chatRoutes);

  // Ratings routes
  await registerPlugin(ratingsRoutes);

  // Notifications routes
  await registerPlugin(notificationsRoutes);

  // Socket.IO (realtime: /tracking, /chat) — skipped on serverless (Vercel).
  // Realtime moves to Supabase Realtime; REST (chat history, GPS posts) keeps working.
  if (process.env.VERCEL !== "1" && process.env.DISABLE_SOCKETS !== "true") {
    await registerPlugin(socketPlugin);
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
