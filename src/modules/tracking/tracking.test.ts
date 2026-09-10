import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import trackingRoutes from './tracking.routes';

const JWT_SECRET = 'test-secret-key';

interface MockRide {
  id: string;
  embarcador_id: string;
  driver_id: string | null;
  status: string;
}

interface MockLocation {
  ride_id: string;
  driver_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  created_at: string;
}

let mockRides: MockRide[] = [];
let mockLocations: MockLocation[] = [];

function createMockDb() {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toLowerCase();

      // SELECT ride for status/location check
      if (text.includes('select id, driver_id, status from rides')) {
        const rideId = params?.[0];
        const ride = mockRides.find(r => r.id === rideId);
        return { rows: ride ? [{ ...ride }] : [] };
      }

      // UPDATE ride status
      if (text.includes('update rides set status')) {
        const newStatus = params?.[0] as string;
        const rideId = params?.[1] as string;
        const ride = mockRides.find(r => r.id === rideId);
        if (ride) ride.status = newStatus;
        return { rows: [] };
      }

      // INSERT ride_location
      if (text.includes('insert into ride_locations')) {
        const loc: MockLocation = {
          ride_id: params?.[0] as string,
          driver_id: params?.[1] as string,
          lng: params?.[2] as number,
          lat: params?.[3] as number,
          speed: (params?.[4] as number) || null,
          heading: (params?.[5] as number) || null,
          created_at: new Date().toISOString(),
        };
        mockLocations.push(loc);
        return { rows: [] };
      }

      // SELECT latest location
      if (text.includes('from ride_locations') && text.includes('order by')) {
        const rideId = params?.[0];
        const locs = mockLocations.filter(l => l.ride_id === rideId);
        if (locs.length === 0) return { rows: [] };
        const latest = locs[locs.length - 1];
        return {
          rows: [{
            lat: latest.lat,
            lng: latest.lng,
            speed: latest.speed,
            heading: latest.heading,
            created_at: latest.created_at,
          }],
        };
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
  await server.register(trackingRoutes);

  return server;
}

describe('Tracking Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockRides = [];
    mockLocations = [];
    server = await buildTestServer();

    // Seed an accepted ride with driver assigned
    mockRides.push({
      id: 'ride_1',
      embarcador_id: 'emb1',
      driver_id: 'driver1',
      status: 'accepted',
    });
  });

  describe('PATCH /api/rides/:id/status', () => {
    it('should advance status from accepted to collecting', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/rides/ride_1/status',
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'collecting' },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.previous_status, 'accepted');
      assert.equal(body.new_status, 'collecting');
      assert.equal(mockRides[0].status, 'collecting');

      await server.close();
    });

    it('should advance through full lifecycle', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const transitions = [
        { from: 'accepted', to: 'collecting' },
        { from: 'collecting', to: 'in_transit' },
        { from: 'in_transit', to: 'delivering' },
        { from: 'delivering', to: 'completed' },
      ];

      for (const { to } of transitions) {
        const response = await server.inject({
          method: 'PATCH',
          url: '/api/rides/ride_1/status',
          headers: { authorization: `Bearer ${token}` },
          payload: { status: to },
        });
        assert.equal(response.statusCode, 200);
      }

      assert.equal(mockRides[0].status, 'completed');
      await server.close();
    });

    it('should reject invalid transition', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/rides/ride_1/status',
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'completed' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject status change from non-driver', async () => {
      const token = signToken(server, 'other_driver', 'motorista', 'od@test.com');

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/rides/ride_1/status',
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'collecting' },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });

    it('should return 404 for non-existent ride', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/rides/nonexistent/status',
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'collecting' },
      });

      assert.equal(response.statusCode, 404);
      await server.close();
    });
  });

  describe('POST /api/rides/:id/location', () => {
    it('should record driver location', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/location',
        headers: { authorization: `Bearer ${token}` },
        payload: { lat: -14.85, lng: -40.84, speed: 45.5, heading: 180 },
      });

      assert.equal(response.statusCode, 201);
      assert.equal(mockLocations.length, 1);
      assert.equal(mockLocations[0].lat, -14.85);

      await server.close();
    });

    it('should reject location from non-driver', async () => {
      const token = signToken(server, 'other', 'motorista', 'o@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/location',
        headers: { authorization: `Bearer ${token}` },
        payload: { lat: -14.85, lng: -40.84 },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });

    it('should reject location for completed ride', async () => {
      mockRides[0].status = 'completed';
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/location',
        headers: { authorization: `Bearer ${token}` },
        payload: { lat: -14.85, lng: -40.84 },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject missing coordinates', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/location',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });
  });

  describe('GET /api/rides/:id/location', () => {
    it('should return latest location', async () => {
      // Seed a location
      mockLocations.push({
        ride_id: 'ride_1',
        driver_id: 'driver1',
        lat: -14.85,
        lng: -40.84,
        speed: 50,
        heading: 90,
        created_at: new Date().toISOString(),
      });

      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/rides/ride_1/location',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.location.lat, -14.85);
      assert.equal(body.location.lng, -40.84);

      await server.close();
    });

    it('should return 404 when no location exists', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/rides/ride_1/location',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 404);
      await server.close();
    });
  });
});
