import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import paymentsRoutes from './payments.routes';

const JWT_SECRET = 'test-secret-key';

interface MockRide {
  id: string;
  embarcador_id: string;
  driver_id: string;
  final_price: string;
  status: string;
}

interface MockPayment {
  id: string;
  ride_id: string;
  payer_id: string;
  amount: number;
  commission_amount: number;
  driver_amount: number;
  method: string;
  status: string;
}

interface MockWalletTx {
  id: string;
  driver_id: string;
  ride_id: string | null;
  type: string;
  amount: number;
  description: string;
  created_at: string;
}

let mockRides: MockRide[] = [];
let mockPayments: MockPayment[] = [];
let mockWalletTxs: MockWalletTx[] = [];
let paymentIdCounter = 1;
let txIdCounter = 1;

function createMockDb() {
  return {
    query: async (sql: string, params?: unknown[]) => {
      const text = sql.trim().toLowerCase();

      // SELECT ride for payment
      if (text.includes('select id, embarcador_id, driver_id, final_price, status from rides')) {
        const rideId = params?.[0];
        const ride = mockRides.find(r => r.id === rideId);
        return { rows: ride ? [{ ...ride }] : [] };
      }

      // SELECT existing payment
      if (text.includes('select id from payments where ride_id')) {
        const rideId = params?.[0];
        const payment = mockPayments.find(p => p.ride_id === rideId);
        return { rows: payment ? [{ id: payment.id }] : [] };
      }

      // INSERT payment
      if (text.includes('insert into payments')) {
        const payment: MockPayment = {
          id: `pay_${paymentIdCounter++}`,
          ride_id: params?.[0] as string,
          payer_id: params?.[1] as string,
          amount: params?.[2] as number,
          commission_amount: params?.[3] as number,
          driver_amount: params?.[4] as number,
          method: params?.[5] as string,
          status: params?.[6] as string,
        };
        mockPayments.push(payment);
        return { rows: [payment] };
      }

      // INSERT wallet transaction
      if (text.includes('insert into wallet_transactions')) {
        const tx: MockWalletTx = {
          id: `tx_${txIdCounter++}`,
          driver_id: params?.[0] as string,
          ride_id: (params?.[1] as string) || null,
          type: params?.[2] as string || 'debit',
          amount: params?.[2] === 'credit' ? params?.[3] as number : params?.[1] as number,
          description: params?.[3] as string || params?.[2] as string,
          created_at: new Date().toISOString(),
        };
        // Fix: detect credit vs debit insert by checking param positions
        if (text.includes('ride_id')) {
          // Credit: (driver_id, ride_id, 'credit', amount, description)
          tx.driver_id = params?.[0] as string;
          tx.ride_id = params?.[1] as string;
          tx.type = 'credit';
          tx.amount = params?.[2] as number;
          tx.description = params?.[3] as string;
        } else {
          // Debit: (driver_id, 'debit', amount, description)
          tx.driver_id = params?.[0] as string;
          tx.ride_id = null;
          tx.type = 'debit';
          tx.amount = params?.[1] as number;
          tx.description = params?.[2] as string;
        }
        mockWalletTxs.push(tx);
        return { rows: [tx] };
      }

      // SELECT wallet balance (with SUM)
      if (text.includes('from wallet_transactions') && text.includes('sum')) {
        const driverId = params?.[0];
        const txs = mockWalletTxs.filter(t => t.driver_id === driverId);
        const totalCredits = txs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
        const totalDebits = txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

        if (text.includes('as balance')) {
          return { rows: [{ balance: (totalCredits - totalDebits).toString() }] };
        }
        return {
          rows: [{
            total_credits: totalCredits.toString(),
            total_debits: totalDebits.toString(),
          }],
        };
      }

      // SELECT wallet transactions list
      if (text.includes('from wallet_transactions') && text.includes('order by')) {
        const driverId = params?.[0];
        return { rows: mockWalletTxs.filter(t => t.driver_id === driverId) };
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
  await server.register(paymentsRoutes);

  return server;
}

describe('Payments Routes', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    mockRides = [];
    mockPayments = [];
    mockWalletTxs = [];
    paymentIdCounter = 1;
    txIdCounter = 1;
    server = await buildTestServer();

    // Seed a completed ride
    mockRides.push({
      id: 'ride_1',
      embarcador_id: 'emb1',
      driver_id: 'driver1',
      final_price: '150.00',
      status: 'completed',
    });
  });

  describe('POST /api/rides/:id/payment', () => {
    it('should create payment via pix', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { method: 'pix' },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.equal(body.payment.amount, 150);
      assert.equal(body.payment.commission_amount, 18); // 12%
      assert.equal(body.payment.driver_amount, 132); // 88%
      assert.equal(body.payment.status, 'paid');

      // Should credit driver wallet
      assert.equal(mockWalletTxs.length, 1);
      assert.equal(mockWalletTxs[0].type, 'credit');
      assert.equal(mockWalletTxs[0].amount, 132);

      await server.close();
    });

    it('should create payment in cash with pending status', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { method: 'dinheiro' },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.equal(body.payment.status, 'pending');

      // Should NOT credit wallet for cash
      assert.equal(mockWalletTxs.length, 0);

      await server.close();
    });

    it('should reject payment from non-embarcador', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { method: 'pix' },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });

    it('should reject payment for non-completed ride', async () => {
      mockRides[0].status = 'in_transit';
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { method: 'pix' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject duplicate payment', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { method: 'pix' },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { method: 'pix' },
      });

      assert.equal(response.statusCode, 409);
      await server.close();
    });

    it('should reject invalid payment method', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/rides/ride_1/payment',
        headers: { authorization: `Bearer ${token}` },
        payload: { method: 'bitcoin' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });
  });

  describe('GET /api/wallet', () => {
    it('should return driver wallet balance', async () => {
      // Seed wallet transactions
      mockWalletTxs.push({
        id: 'tx_1', driver_id: 'driver1', ride_id: 'ride_1',
        type: 'credit', amount: 132, description: 'Frete',
        created_at: new Date().toISOString(),
      });

      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/wallet',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 200);
      const body = JSON.parse(response.payload);
      assert.equal(body.balance, 132);
      assert.equal(body.total_earned, 132);
      assert.equal(body.total_withdrawn, 0);

      await server.close();
    });

    it('should reject wallet access from embarcador', async () => {
      const token = signToken(server, 'emb1', 'embarcador', 'e@test.com');

      const response = await server.inject({
        method: 'GET',
        url: '/api/wallet',
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.statusCode, 403);
      await server.close();
    });
  });

  describe('POST /api/wallet/withdraw', () => {
    it('should withdraw from wallet', async () => {
      mockWalletTxs.push({
        id: 'tx_1', driver_id: 'driver1', ride_id: 'ride_1',
        type: 'credit', amount: 132, description: 'Frete',
        created_at: new Date().toISOString(),
      });

      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/wallet/withdraw',
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 100, pix_key: '11999999999' },
      });

      assert.equal(response.statusCode, 201);
      const body = JSON.parse(response.payload);
      assert.equal(body.new_balance, 32);

      await server.close();
    });

    it('should reject withdraw below minimum', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/wallet/withdraw',
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 10, pix_key: '11999999999' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject withdraw exceeding balance', async () => {
      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/wallet/withdraw',
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 500, pix_key: '11999999999' },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });

    it('should reject withdraw without pix key', async () => {
      mockWalletTxs.push({
        id: 'tx_1', driver_id: 'driver1', ride_id: 'ride_1',
        type: 'credit', amount: 100, description: 'Frete',
        created_at: new Date().toISOString(),
      });

      const token = signToken(server, 'driver1', 'motorista', 'd@test.com');

      const response = await server.inject({
        method: 'POST',
        url: '/api/wallet/withdraw',
        headers: { authorization: `Bearer ${token}` },
        payload: { amount: 50 },
      });

      assert.equal(response.statusCode, 400);
      await server.close();
    });
  });
});
