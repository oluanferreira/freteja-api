import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import proposalsRoutes from './proposals.routes';

const JWT_SECRET = 'test-secret-key';

interface MockRide {
  id: string;
  embarcador_id: string;
  status: string;
  driver_id?: string;
  final_price?: number;
  commission_rate: number;
}

interface MockProposal {
  id: string;
  ride_id: string;
  driver_id: string;
  proposed_price: number;
  message: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

let mockRides: MockRide[] = [];
let mockProposals: MockProposal[] = [];
let proposalIdCounter = 1;

function createMockDb() {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toLowerCase();

      // SELECT ride by id (check exists + status)
      if (text.includes('select id, status from rides where id')) {
        const rideId = params?.[0];
        const ride = mockRides.find(r => r.id === rideId);
        return { rows: ride ? [{ id: ride.id, status: ride.status }] : [] };
      }

      // SELECT existing proposal by ride + driver
      if (text.includes('select id from proposals where ride_id') && text.includes('and driver_id')) {
        const rideId = params?.[0];
        const driverId = params?.[1];
        const existing = mockProposals.find(p => p.ride_id === rideId && p.driver_id === driverId);
        return { rows: existing ? [{ id: existing.id }] : [] };
      }

      // INSERT proposal
      if (text.includes('insert into proposals')) {
        const proposal: MockProposal = {
          id: `proposal_${proposalIdCounter++}`,
          ride_id: params?.[0] as string,
          driver_id: params?.[1] as string,
          proposed_price: params?.[2] as number,
          message: (params?.[3] as string) || null,
          status: 'pending',
          created_at: new Date().toISOString(),
          responded_at: null,
        };
        mockProposals.push(proposal);
        return { rows: [proposal] };
      }

      // SELECT proposals for ride (list)
      if (text.includes('from proposals p') && text.includes('join users u') && text.includes('where p.ride_id')) {
        const rideId = params?.[0];
        const proposals = mockProposals
          .filter(p => p.ride_id === rideId)
          .map(p => ({
            ...p,
            driver_name: 'Driver Test',
            driver_rating: 4.5,
          }));
        return { rows: proposals };
      }

      // SELECT proposal with ride info (accept/reject)
      if (text.includes('from proposals p') && text.includes('join rides r') && text.includes('where p.id')) {
        const proposalId = params?.[0];
        const proposal = mockProposals.find(p => p.id === proposalId);
        if (!proposal) return { rows: [] };
        const ride = mockRides.find(r => r.id === proposal.ride_id);
        if (!ride) return { rows: [] };
        return {
          rows: [{
            id: proposal.id,
            ride_id: proposal.ride_id,
            driver_id: proposal.driver_id,
            proposed_price: proposal.proposed_price,
            status: proposal.status,
            embarcador_id: ride.embarcador_id,
            ride_status: ride.status,
          }],
        };
      }

      // UPDATE proposal accepted
      if (text.includes("update proposals set status = 'accepted'")) {
        const proposalId = params?.[0];
        const p = mockProposals.find(pr => pr.id === proposalId);
        if (p) { p.status = 'accepted'; p.responded_at = new Date().toISOString(); }
        return { rows: [] };
      }

      // UPDATE proposals rejected (batch)
      if (text.includes("update proposals set status = 'rejected'") && text.includes('id !=')) {
        const rideId = params?.[0];
        const excludeId = params?.[1];
        mockProposals.forEach(p => {
          if (p.ride_id === rideId && p.id !== excludeId && p.status === 'pending') {
            p.status = 'rejected';
            p.responded_at = new Date().toISOString();
          }
        });
        return { rows: [] };
      }

      // UPDATE proposal rejected (single)
      if (text.includes("update proposals set status = 'rejected'") && !text.includes('id !=')) {
        const proposalId = params?.[0];
        const p = mockProposals.find(pr => pr.id === proposalId);
        if (p) { p.status = 'rejected'; p.responded_at = new Date().toISOString(); }
        return { rows: [] };
      }

      // UPDATE ride (accept proposal)
      if (text.includes('update rides set') && text.includes("status = 'accepted'")) {
        const driverId = params?.[0];
        const finalPrice = params?.[1];
        const rideId = params?.[2];
        const ride = mockRides.find(r => r.id === rideId);
        if (ride) {
          ride.driver_id = driverId as string;
          ride.final_price = finalPrice as number;
          ride.status = 'accepted';
        }
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
  await server.register(proposalsRoutes);

  return server;
}

describe('Proposals Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockRides = [];
    mockProposals = [];
    proposalIdCounter = 1;
    server = await buildTestServer();

    // Seed a pending ride
    mockRides.push({
      id: 'ride_1',
      embarcador_id: 'emb1',
      status: 'pending',
      commission_rate: 0.15,
    });
  });

  describe('POST /api/rides/:id/proposals', () => {
    it('should create a proposal as motorista', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${token}` },
        payload: { proposed_price: 150.00, message: 'Posso buscar amanha' },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.ok(body.proposal.id);
      assert.equal(body.proposal.proposed_price, 150);
      assert.equal(body.proposal.status, 'pending');

      await server.close();
    });

    it('should reject proposal from embarcador', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${token}` },
        payload: { proposed_price: 100 },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });

    it('should reject invalid price', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${token}` },
        payload: { proposed_price: -5 },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject proposal for non-existent ride', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/nonexistent/proposals',
        headers: { authorization: `Bearer ${token}` },
        payload: { proposed_price: 100 },
      });

      assert.equal(response.statusCode, 404);
      await server.close();
    });

    it('should reject duplicate proposal from same driver', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${token}` },
        payload: { proposed_price: 100 },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${token}` },
        payload: { proposed_price: 120 },
      });

      assert.equal(response.statusCode, 409);
      await server.close();
    });

    it('should reject proposal for non-pending ride', async () => {
      mockRides[0].status = 'accepted';
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${token}` },
        payload: { proposed_price: 100 },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });
  });

  describe('GET /api/rides/:id/proposals', () => {
    it('should list proposals for a ride', async () => {
      const driverToken = signToken(server, 'driver1', 'motorista', 'd@test.com');

      await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { proposed_price: 100 },
      });

      const embToken = signToken(server, 'emb1', 'embarcador', 'e@test.com');
      const response = await server.inject({
        method: 'GET',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${embToken}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.proposals.length, 1);
      assert.equal(body.proposals[0].proposed_price, 100);

      await server.close();
    });
  });

  describe('PATCH /api/proposals/:id/accept', () => {
    it('should accept a proposal as embarcador', async () => {
      const driverToken = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const createRes = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { proposed_price: 150 },
      });
      const { proposal } = JSON.parse(createRes.payload);

      const embToken = signToken(server, 'emb1', 'embarcador', 'e@test.com');
      const response = await server.inject({
        method: 'PATCH',
        url: `/api/proposals/${proposal.id}/accept`,
        headers: { authorization: `Bearer ${embToken}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.message, 'Proposta aceita');
      assert.equal(body.final_price, 150);
      assert.equal(body.driver_id, 'driver1');

      // Check ride was updated
      assert.equal(mockRides[0].status, 'accepted');
      assert.equal(mockRides[0].driver_id, 'driver1');

      await server.close();
    });

    it('should reject other proposals when one is accepted', async () => {
      const driver1Token = signToken(server, 'driver1', 'motorista', 'd1@test.com');
      const driver2Token = signToken(server, 'driver2', 'motorista', 'd2@test.com');

      const res1 = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${driver1Token}` },
        payload: { proposed_price: 100 },
      });

      await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${driver2Token}` },
        payload: { proposed_price: 120 },
      });

      const { proposal } = JSON.parse(res1.payload);
      const embToken = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      await server.inject({
        method: 'PATCH',
        url: `/api/proposals/${proposal.id}/accept`,
        headers: { authorization: `Bearer ${embToken}` },
      });

      // First proposal accepted, second rejected
      assert.equal(mockProposals[0].status, 'accepted');
      assert.equal(mockProposals[1].status, 'rejected');

      await server.close();
    });

    it('should reject accept from non-owner', async () => {
      const driverToken = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const createRes = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { proposed_price: 100 },
      });
      const { proposal } = JSON.parse(createRes.payload);

      const otherToken = signToken(server, 'other_emb', 'embarcador', 'other@test.com');
      const response = await server.inject({
        method: 'PATCH',
        url: `/api/proposals/${proposal.id}/accept`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });

    it('should reject accept for non-existent proposal', async () => {
      const embToken = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'PATCH',
        url: '/api/proposals/nonexistent/accept',
        headers: { authorization: `Bearer ${embToken}` },
      });

      assert.equal(response.statusCode, 404);
      await server.close();
    });
  });

  describe('PATCH /api/proposals/:id/reject', () => {
    it('should reject a proposal as embarcador', async () => {
      const driverToken = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const createRes = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { proposed_price: 100 },
      });
      const { proposal } = JSON.parse(createRes.payload);

      const embToken = signToken(server, 'emb1', 'embarcador', 'e@test.com');
      const response = await server.inject({
        method: 'PATCH',
        url: `/api/proposals/${proposal.id}/reject`,
        headers: { authorization: `Bearer ${embToken}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.message, 'Proposta rejeitada');

      await server.close();
    });

    it('should reject already processed proposal', async () => {
      const driverToken = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const createRes = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/proposals',
        headers: { authorization: `Bearer ${driverToken}` },
        payload: { proposed_price: 100 },
      });
      const { proposal } = JSON.parse(createRes.payload);

      const embToken = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      // Reject once
      await server.inject({
        method: 'PATCH',
        url: `/api/proposals/${proposal.id}/reject`,
        headers: { authorization: `Bearer ${embToken}` },
      });

      // Try reject again
      const response = await server.inject({
        method: 'PATCH',
        url: `/api/proposals/${proposal.id}/reject`,
        headers: { authorization: `Bearer ${embToken}` },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });
  });
});
