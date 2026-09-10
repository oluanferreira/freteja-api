import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import notificationsRoutes from './notifications.routes';

const JWT_SECRET = 'test-secret-key';

interface MockNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: unknown;
  read: boolean;
  created_at: string;
}

let mockNotifications: MockNotification[] = [];
let notifIdCounter = 1;

function createMockDb() {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toLowerCase();

      // SELECT notifications for user
      if (text.includes('from notifications') && text.includes('where user_id')) {
        const userId = params?.[0];
        return {
          rows: mockNotifications
            .filter(n => n.user_id === userId)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 50),
        };
      }

      // UPDATE mark as read (single)
      if (text.includes('update notifications set read = true') && text.includes('where id')) {
        const notifId = params?.[0];
        const userId = params?.[1];
        const notif = mockNotifications.find(n => n.id === notifId && n.user_id === userId);
        if (notif) notif.read = true;
        return { rows: [] };
      }

      // UPDATE mark all as read
      if (text.includes('update notifications set read = true') && text.includes('read = false')) {
        const userId = params?.[0];
        mockNotifications.filter(n => n.user_id === userId && !n.read).forEach(n => { n.read = true; });
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

function signToken(server: FastifyInstance, sub: string, role: string, email: string): string {
  return server.jwt.sign({ sub, role, email });
}

async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  server.decorate('config', {
    API_PORT: 3000, API_HOST: '0.0.0.0', JWT_SECRET,
    JWT_EXPIRES_IN: '1h', NODE_ENV: 'test', DATABASE_URL: 'mock',
  });
  await server.register(fastifyJwt, { secret: JWT_SECRET, sign: { expiresIn: '1h' } });
  server.decorate('authenticate', async (request: unknown) => {
    await (request as { jwtVerify: () => Promise<void> }).jwtVerify();
  });
  server.decorate('db', createMockDb() as unknown as import('pg').Pool);
  await server.register(notificationsRoutes);
  return server;
}

describe('Notifications Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockNotifications = [];
    notifIdCounter = 1;
    server = await buildTestServer();

    // Seed some notifications
    mockNotifications.push(
      {
        id: `notif_${notifIdCounter++}`, user_id: 'user1', type: 'ride_accepted',
        title: 'Frete aceito', body: 'Seu frete foi aceito', data: null,
        read: false, created_at: new Date().toISOString(),
      },
      {
        id: `notif_${notifIdCounter++}`, user_id: 'user1', type: 'new_message',
        title: 'Nova mensagem', body: 'Voce recebeu uma mensagem', data: null,
        read: false, created_at: new Date().toISOString(),
      },
      {
        id: `notif_${notifIdCounter++}`, user_id: 'user2', type: 'proposal',
        title: 'Nova proposta', body: null, data: null,
        read: false, created_at: new Date().toISOString(),
      },
    );
  });

  describe('POST /api/notifications/register', () => {
    it('should register push token', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'u@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: { token: 'expo-push-token-xyz', platform: 'android' },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.registered, true);
      await server.close();
    });

    it('should reject missing token', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'u@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/notifications/register',
        headers: { authorization: `Bearer ${token}` },
        payload: { platform: 'ios' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });
  });

  describe('GET /api/notifications', () => {
    it('should list user notifications', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'u@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/notifications',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.notifications.length, 2);
      await server.close();
    });

    it('should not return other user notifications', async () => {
      const token = signToken(server, 'user3', 'motorista', 'u3@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/notifications',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.notifications.length, 0);
      await server.close();
    });
  });

  describe('PATCH /api/notifications/:id/read', () => {
    it('should mark notification as read', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'u@test.com');

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/notifications/notif_1/read',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(mockNotifications[0].read, true);
      await server.close();
    });
  });

  describe('POST /api/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'u@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/notifications/read-all',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const unread = mockNotifications.filter(n => n.user_id === 'user1' && !n.read);
      assert.equal(unread.length, 0);
      // User2's notification should still be unread
      assert.equal(mockNotifications[2].read, false);
      await server.close();
    });
  });
});
