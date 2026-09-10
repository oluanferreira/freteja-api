import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import authRoutes from './auth.routes';

// In-memory mock database
let mockUsers: Array<{
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
  role: string;
  status: string;
  avatar_url: string | null;
  rating_avg: number;
  rating_count: number;
  created_at: string;
}> = [];

function createMockDb() {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toLowerCase();

      // SELECT for checking existing user
      if (text.includes('select id from users where email')) {
        const email = params?.[0];
        const phone = params?.[1];
        const found = mockUsers.filter(u => u.email === email || u.phone === phone);
        return { rows: found };
      }

      // INSERT user
      if (text.includes('insert into users')) {
        const user = {
          id: `usr_${Date.now()}`,
          name: params?.[0] as string,
          email: params?.[1] as string,
          phone: params?.[2] as string,
          password_hash: params?.[3] as string,
          role: params?.[4] as string,
          status: params?.[5] as string,
          avatar_url: null,
          rating_avg: 0,
          rating_count: 0,
          created_at: new Date().toISOString(),
        };
        mockUsers.push(user);
        return { rows: [user] };
      }

      // SELECT for login (by email)
      if (text.includes('select id, name, email, phone, password_hash')) {
        const email = params?.[0];
        const found = mockUsers.filter(u => u.email === email);
        return { rows: found };
      }

      // SELECT for me/refresh (by id)
      if (text.includes('select id, name, email, phone, role, status') && !text.includes('password_hash')) {
        const id = params?.[0];
        const found = mockUsers.filter(u => u.id === id);
        return { rows: found };
      }

      // SELECT full profile for /me
      if (text.includes('select id, name, email, phone, role, status, avatar_url')) {
        const id = params?.[0];
        const found = mockUsers.filter(u => u.id === id);
        return { rows: found };
      }

      return { rows: [] };
    },
  };
}

async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  // Mock config
  server.decorate('config', {
    API_PORT: 3000,
    API_HOST: '0.0.0.0',
    JWT_SECRET: 'test-secret-key-for-jwt',
    JWT_EXPIRES_IN: '1h',
    NODE_ENV: 'test',
    DATABASE_URL: 'mock',
  });

  // JWT plugin
  await server.register(fastifyJwt, {
    secret: 'test-secret-key-for-jwt',
    sign: { expiresIn: '1h' },
  });

  server.decorate('authenticate', async (request: unknown) => {
    await (request as { jwtVerify: () => Promise<void> }).jwtVerify();
  });

  // Mock DB (cast to unknown to avoid strict Pool type checking in tests)
  server.decorate('db', createMockDb() as unknown as import('pg').Pool);

  // Auth routes
  await server.register(authRoutes);

  return server;
}

describe('Auth Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockUsers = [];
    server = await buildTestServer();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new embarcador', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Joao Silva',
          email: 'joao@test.com',
          phone: '11999990000',
          password: 'Senha123!',
          role: 'embarcador',
        },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.equal(body.user.name, 'Joao Silva');
      assert.equal(body.user.role, 'embarcador');
      assert.equal(body.user.status, 'active');
      assert.ok(body.access_token);
      assert.ok(body.refresh_token);

      await server.close();
    });

    it('should register motorista with pending status', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Maria Motorista',
          email: 'maria@test.com',
          phone: '11888880000',
          password: 'Senha123!',
          role: 'motorista',
        },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.equal(body.user.status, 'pending');

      await server.close();
    });

    it('should reject duplicate email', async () => {
      // Register first
      await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'User 1',
          email: 'dup@test.com',
          phone: '11111111111',
          password: 'Senha123!',
          role: 'embarcador',
        },
      });

      // Try duplicate
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'User 2',
          email: 'dup@test.com',
          phone: '22222222222',
          password: 'Senha123!',
          role: 'embarcador',
        },
      });

      assert.equal(response.statusCode, 409);

      await server.close();
    });

    it('should reject invalid role', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Bad Role',
          email: 'bad@test.com',
          phone: '33333333333',
          password: 'Senha123!',
          role: 'admin',
        },
      });

      assert.equal(response.statusCode, 400);

      await server.close();
    });

    it('should reject missing fields', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'only@test.com' },
      });

      assert.equal(response.statusCode, 400);

      await server.close();
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      // Register first
      await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Login User',
          email: 'login@test.com',
          phone: '44444444444',
          password: 'Senha123!',
          role: 'embarcador',
        },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'login@test.com',
          password: 'Senha123!',
        },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.ok(body.access_token);
      assert.ok(body.refresh_token);
      assert.equal(body.user.email, 'login@test.com');

      await server.close();
    });

    it('should reject wrong password', async () => {
      // Register first
      await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Wrong Pass',
          email: 'wrong@test.com',
          phone: '55555555555',
          password: 'Correct123!',
          role: 'embarcador',
        },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'wrong@test.com',
          password: 'Wrong123!',
        },
      });

      assert.equal(response.statusCode, 401);

      await server.close();
    });

    it('should reject non-existent user', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          email: 'noone@test.com',
          password: 'Nope123!',
        },
      });

      assert.equal(response.statusCode, 401);

      await server.close();
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should return new tokens with valid refresh token', async () => {
      // Register to get tokens
      const registerRes = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Refresh User',
          email: 'refresh@test.com',
          phone: '66666666666',
          password: 'Senha123!',
          role: 'embarcador',
        },
      });

      const { refresh_token } = JSON.parse(registerRes.payload);

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.ok(body.access_token);
      assert.ok(body.refresh_token);

      await server.close();
    });

    it('should reject invalid refresh token', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refresh_token: 'invalid-token' },
      });

      assert.equal(response.statusCode, 401);

      await server.close();
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user profile with valid token', async () => {
      // Register to get token
      const registerRes = await server.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: {
          name: 'Me User',
          email: 'me@test.com',
          phone: '77777777777',
          password: 'Senha123!',
          role: 'embarcador',
        },
      });

      const { access_token } = JSON.parse(registerRes.payload);

      const response = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: {
          authorization: `Bearer ${access_token}`,
        },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.user.email, 'me@test.com');
      assert.equal(body.user.name, 'Me User');

      await server.close();
    });

    it('should reject request without token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/api/auth/me',
      });

      assert.equal(response.statusCode, 401);

      await server.close();
    });
  });
});
