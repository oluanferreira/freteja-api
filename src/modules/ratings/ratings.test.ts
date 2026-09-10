import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import ratingsRoutes from './ratings.routes';

const JWT_SECRET = 'test-secret-key';

let mockRides: Array<{ id: string; embarcador_id: string; driver_id: string; status: string }> = [];
let mockRatings: Array<{ id: string; ride_id: string; from_user_id: string; to_user_id: string; score: number; comment: string | null; created_at: string }> = [];
let mockUsers: Array<{ id: string; rating_avg: string; rating_count: string }> = [];
let ratingIdCounter = 1;

function createMockDb() {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toLowerCase();

      // SELECT ride
      if (text.includes('select id, embarcador_id, driver_id, status from rides')) {
        const rideId = params?.[0];
        const ride = mockRides.find(r => r.id === rideId);
        return { rows: ride ? [{ ...ride }] : [] };
      }

      // SELECT existing rating
      if (text.includes('select id from ratings where ride_id') && text.includes('from_user_id')) {
        const rideId = params?.[0];
        const fromId = params?.[1];
        const existing = mockRatings.find(r => r.ride_id === rideId && r.from_user_id === fromId);
        return { rows: existing ? [{ id: existing.id }] : [] };
      }

      // INSERT rating
      if (text.includes('insert into ratings')) {
        const rating = {
          id: `rating_${ratingIdCounter++}`,
          ride_id: params?.[0] as string,
          from_user_id: params?.[1] as string,
          to_user_id: params?.[2] as string,
          score: params?.[3] as number,
          comment: (params?.[4] as string) || null,
          created_at: new Date().toISOString(),
        };
        mockRatings.push(rating);
        return { rows: [rating] };
      }

      // UPDATE user rating
      if (text.includes('update users set') && text.includes('rating_avg')) {
        const userId = params?.[0] as string;
        const userRatings = mockRatings.filter(r => r.to_user_id === userId);
        const avg = userRatings.length > 0 ? userRatings.reduce((s, r) => s + r.score, 0) / userRatings.length : 0;
        const user = mockUsers.find(u => u.id === userId);
        if (user) {
          user.rating_avg = avg.toFixed(2);
          user.rating_count = userRatings.length.toString();
        }
        return { rows: [] };
      }

      // SELECT ratings for user
      if (text.includes('from ratings r') && text.includes('where r.to_user_id')) {
        const userId = params?.[0];
        return { rows: mockRatings.filter(r => r.to_user_id === userId).map(r => ({ ...r, from_user_name: 'Test User' })) };
      }

      // SELECT user rating avg
      if (text.includes('select rating_avg, rating_count from users')) {
        const userId = params?.[0];
        const user = mockUsers.find(u => u.id === userId);
        return { rows: user ? [user] : [{ rating_avg: '0', rating_count: '0' }] };
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
  server.decorate('config', { API_PORT: 3000, API_HOST: '0.0.0.0', JWT_SECRET, JWT_EXPIRES_IN: '1h', NODE_ENV: 'test', DATABASE_URL: 'mock' });
  await server.register(fastifyJwt, { secret: JWT_SECRET, sign: { expiresIn: '1h' } });
  server.decorate('authenticate', async (request: unknown) => { await (request as { jwtVerify: () => Promise<void> }).jwtVerify(); });
  server.decorate('db', createMockDb() as unknown as import('pg').Pool);
  await server.register(ratingsRoutes);
  return server;
}

describe('Ratings Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockRides = [];
    mockRatings = [];
    mockUsers = [
      { id: 'driver1', rating_avg: '0', rating_count: '0' },
      { id: 'emb1', rating_avg: '0', rating_count: '0' },
    ];
    ratingIdCounter = 1;
    server = await buildTestServer();

    mockRides.push({ id: 'ride_1', embarcador_id: 'emb1', driver_id: 'driver1', status: 'completed' });
  });

  describe('POST /api/rides/:id/rating', () => {
    it('should rate driver as embarcador', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/rating',
        headers: { authorization: `Bearer ${token}` },
        payload: { score: 5, comment: 'Otimo motorista!' },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.equal(body.rating.score, 5);
      await server.close();
    });

    it('should rate embarcador as driver', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/rating',
        headers: { authorization: `Bearer ${token}` },
        payload: { score: 4 },
      });

      assert.equal(response.statusCode, 201);
      await server.close();
    });

    it('should reject invalid score', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/rating',
        headers: { authorization: `Bearer ${token}` },
        payload: { score: 6 },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject duplicate rating', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/rating',
        headers: { authorization: `Bearer ${token}` },
        payload: { score: 5 },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/rating',
        headers: { authorization: `Bearer ${token}` },
        payload: { score: 3 },
      });

      assert.equal(response.statusCode, 409);
      await server.close();
    });

    it('should reject rating for non-completed ride', async () => {
      mockRides[0].status = 'in_transit';
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/rating',
        headers: { authorization: `Bearer ${token}` },
        payload: { score: 5 },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject rating from non-participant', async () => {
      const token = signToken(server, 'stranger', 'embarcador', 's@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/rating',
        headers: { authorization: `Bearer ${token}` },
        payload: { score: 5 },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });
  });

  describe('GET /api/users/:id/ratings', () => {
    it('should list user ratings', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/users/driver1/ratings',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.ok(Array.isArray(body.ratings));
      await server.close();
    });
  });
});
