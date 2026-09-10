import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import ridesRoutes from './rides.routes';

const JWT_SECRET = 'test-secret-key';

let mockRides: Array<Record<string, unknown>> = [];
let rideIdCounter = 1;

function createMockDb() {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toLowerCase();

      // ST_Distance calculation
      if (text.includes('st_distance')) {
        return { rows: [{ distance_km: '15.5' }] };
      }

      // INSERT ride
      if (text.includes('insert into rides')) {
        const ride = {
          id: `ride_${rideIdCounter++}`,
          embarcador_id: params?.[0] as string,
          status: 'pending',
          origin_address: params?.[1] as string,
          destination_address: params?.[4] as string,
          cargo_description: params?.[7] as string,
          suggested_price: params?.[13] as number,
          created_at: new Date().toISOString(),
        };
        mockRides.push(ride);
        return { rows: [ride] };
      }

      // SELECT rides for embarcador
      if (text.includes('from rides where embarcador_id')) {
        const userId = params?.[0];
        return { rows: mockRides.filter(r => r.embarcador_id === userId) };
      }

      // SELECT available rides
      if (text.includes("where status = 'pending'") || text.includes("where r.status = 'pending'")) {
        return { rows: mockRides.filter(r => r.status === 'pending') };
      }

      // SELECT ride by ID (detail)
      if (text.includes('where r.id = $1')) {
        const id = params?.[0];
        const ride = mockRides.find(r => r.id === id);
        return { rows: ride ? [{ ...ride, origin_lat: -14.8, origin_lng: -40.8, destination_lat: -14.7, destination_lng: -40.7, embarcador_name: 'Test', embarcador_phone: '11999999999' }] : [] };
      }

      // SELECT ride for cancel check
      if (text.includes('select id, embarcador_id, status from rides')) {
        const id = params?.[0];
        const ride = mockRides.find(r => r.id === id);
        return { rows: ride ? [ride] : [] };
      }

      // UPDATE ride cancel
      if (text.includes("update rides set status = 'cancelled'")) {
        const id = params?.[0];
        const ride = mockRides.find(r => r.id === id);
        if (ride) ride.status = 'cancelled';
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
  await server.register(ridesRoutes);

  return server;
}

describe('Rides Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockRides = [];
    rideIdCounter = 1;
    server = await buildTestServer();
  });

  describe('POST /api/rides', () => {
    it('should create a ride as embarcador', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origin_address: 'Rua A, 100',
          origin_lat: -14.85,
          origin_lng: -40.84,
          destination_address: 'Rua B, 200',
          destination_lat: -14.75,
          destination_lng: -40.75,
          cargo_description: 'Mudanca residencial',
          vehicle_type_preferred: 'utilitario',
        },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.ok(body.ride.id);
      assert.equal(body.ride.status, 'pending');
      assert.ok(body.ride.suggested_price > 0);

      await server.close();
    });

    it('should reject ride creation from motorista', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origin_address: 'Rua A',
          origin_lat: -14.85,
          origin_lng: -40.84,
          destination_address: 'Rua B',
          destination_lat: -14.75,
          destination_lng: -40.75,
          cargo_description: 'Test',
        },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });

    it('should create a ride with moto vehicle type', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origin_address: 'Rua A, 100',
          origin_lat: -14.85,
          origin_lng: -40.84,
          destination_address: 'Rua B, 200',
          destination_lat: -14.75,
          destination_lng: -40.75,
          cargo_description: 'Envelope pequeno',
          vehicle_type_preferred: 'moto',
        },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.ok(body.ride.id);
      assert.equal(body.ride.status, 'pending');
      assert.ok(body.ride.suggested_price > 0);

      await server.close();
    });

    it('should reject missing fields', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${token}` },
        payload: { origin_address: 'incomplete' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });
  });

  describe('GET /api/rides', () => {
    it('should list embarcador rides', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'e@test.com');

      // Create a ride first
      await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origin_address: 'A', origin_lat: -14.8, origin_lng: -40.8,
          destination_address: 'B', destination_lat: -14.7, destination_lng: -40.7,
          cargo_description: 'Test cargo',
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/rides',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.rides.length, 1);

      await server.close();
    });

    it('should list available rides for motorista', async () => {
      const embToken = signToken(server, 'user1', 'embarcador', 'e@test.com');
      const drvToken = signToken(server, 'driver1', 'motorista', 'd@test.com');

      await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${embToken}` },
        payload: {
          origin_address: 'A', origin_lat: -14.8, origin_lng: -40.8,
          destination_address: 'B', destination_lat: -14.7, destination_lng: -40.7,
          cargo_description: 'Carga',
        },
      });

      const response = await server.inject({
        method: 'GET',
        url: '/api/rides',
        headers: { authorization: `Bearer ${drvToken}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.rides.length, 1);

      await server.close();
    });
  });

  describe('GET /api/rides/:id', () => {
    it('should return ride details', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'e@test.com');

      const createRes = await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origin_address: 'A', origin_lat: -14.8, origin_lng: -40.8,
          destination_address: 'B', destination_lat: -14.7, destination_lng: -40.7,
          cargo_description: 'Detalhes',
        },
      });

      const { ride } = JSON.parse(createRes.payload);

      const response = await server.inject({
        method: 'GET',
        url: `/api/rides/${ride.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.ok(body.ride.origin_lat);

      await server.close();
    });

    it('should return 404 for unknown ride', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/rides/nonexistent',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 404);
      await server.close();
    });
  });

  describe('PATCH /api/rides/:id/cancel', () => {
    it('should cancel a pending ride', async () => {
      const token = signToken(server, 'user1', 'embarcador', 'e@test.com');

      const createRes = await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          origin_address: 'A', origin_lat: -14.8, origin_lng: -40.8,
          destination_address: 'B', destination_lat: -14.7, destination_lng: -40.7,
          cargo_description: 'Cancelar',
        },
      });

      const { ride } = JSON.parse(createRes.payload);

      const response = await server.inject({
        method: 'PATCH',
        url: `/api/rides/${ride.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.message, 'Frete cancelado');

      await server.close();
    });

    it('should reject cancel from non-owner', async () => {
      const embToken = signToken(server, 'user1', 'embarcador', 'e@test.com');
      const otherToken = signToken(server, 'user2', 'embarcador', 'e2@test.com');

      const createRes = await server.inject({
        method: 'POST',
        url: '/api/rides',
        headers: { authorization: `Bearer ${embToken}` },
        payload: {
          origin_address: 'A', origin_lat: -14.8, origin_lng: -40.8,
          destination_address: 'B', destination_lat: -14.7, destination_lng: -40.7,
          cargo_description: 'Not mine',
        },
      });

      const { ride } = JSON.parse(createRes.payload);

      const response = await server.inject({
        method: 'PATCH',
        url: `/api/rides/${ride.id}/cancel`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });
  });
});
