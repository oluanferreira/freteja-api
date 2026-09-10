import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import chatRoutes from './chat.routes';

const JWT_SECRET = 'test-secret-key';

interface MockMessage {
  id: string;
  ride_id: string;
  sender_id: string;
  text: string;
  type: string;
  created_at: string;
  sender_name?: string;
}

let mockRides: Array<{ id: string; status: string; embarcador_id: string; driver_id: string }> = [];
let mockMessages: MockMessage[] = [];
let msgIdCounter = 1;

function createMockDb() {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toLowerCase();

      // SELECT messages for ride
      if (text.includes('from messages m') && text.includes('join users u')) {
        const rideId = params?.[0];
        return { rows: mockMessages.filter(m => m.ride_id === rideId) };
      }

      // SELECT ride for chat check
      if (text.includes('select id, status, embarcador_id, driver_id from rides')) {
        const rideId = params?.[0];
        const ride = mockRides.find(r => r.id === rideId);
        return { rows: ride ? [{ ...ride }] : [] };
      }

      // INSERT message
      if (text.includes('insert into messages')) {
        const msg: MockMessage = {
          id: `msg_${msgIdCounter++}`,
          ride_id: params?.[0] as string,
          sender_id: params?.[1] as string,
          text: params?.[2] as string,
          type: params?.[3] as string,
          created_at: new Date().toISOString(),
        };
        mockMessages.push(msg);
        return { rows: [msg] };
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
  server.decorate('io', null as unknown as import('socket.io').Server);
  await server.register(chatRoutes);

  return server;
}

describe('Chat Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockRides = [];
    mockMessages = [];
    msgIdCounter = 1;
    server = await buildTestServer();

    mockRides.push({
      id: 'ride_1',
      embarcador_id: 'emb1',
      driver_id: 'driver1',
      status: 'in_transit',
    });
  });

  describe('POST /api/rides/:id/messages', () => {
    it('should send a message as embarcador', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/messages',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: 'Ola, esta chegando?' },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.equal(body.message.text, 'Ola, esta chegando?');
      assert.equal(body.message.type, 'text');
      await server.close();
    });

    it('should send a message as driver', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/messages',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: 'Estou chegando', type: 'quick' },
      });

      assert.equal(response.statusCode, 201);
      await server.close();
    });

    it('should reject message from non-participant', async () => {
      const token = signToken(server, 'other', 'embarcador', 'o@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/messages',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: 'Intruso' },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });

    it('should reject message for completed ride', async () => {
      mockRides[0].status = 'completed';
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/messages',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: 'Tarde demais' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject empty message', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/messages',
        headers: { authorization: `Bearer ${token}` },
        payload: { text: '' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });
  });

  describe('GET /api/rides/:id/messages', () => {
    it('should list messages for a ride', async () => {
      mockMessages.push({
        id: 'msg_1', ride_id: 'ride_1', sender_id: 'emb1',
        text: 'Oi', type: 'text', created_at: new Date().toISOString(),
        sender_name: 'Embarcador',
      });

      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');
      const response = await server.inject({
        method: 'GET',
        url: '/api/rides/ride_1/messages',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.messages.length, 1);
      await server.close();
    });
  });

  describe('GET /api/chat/quick-messages', () => {
    it('should return quick message templates', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/chat/quick-messages',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.ok(body.quick_messages.length > 0);
      await server.close();
    });
  });
});
