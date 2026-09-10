import { type FastifyInstance } from 'fastify';

interface RideParams {
  id: string;
}

interface CreatePaymentBody {
  method: 'pix' | 'cartao' | 'dinheiro';
}

interface WithdrawBody {
  amount: number;
  pix_key: string;
}

const COMMISSION_RATE = 0.12;
const MIN_WITHDRAW = 20.0;

export default async function paymentsRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/rides/:id/payment — Create payment for completed ride
  fastify.post<{ Params: RideParams; Body: CreatePaymentBody }>('/api/rides/:id/payment', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;
    const userId = request.user.sub;
    const { method } = request.body;

    if (!method || !['pix', 'cartao', 'dinheiro'].includes(method)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'method deve ser pix, cartao ou dinheiro',
      });
    }

    // Get ride info
    const rideResult = await fastify.db.query(
      'SELECT id, embarcador_id, driver_id, final_price, status FROM rides WHERE id = $1',
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Frete nao encontrado' });
    }

    const ride = rideResult.rows[0];

    if (ride.embarcador_id !== userId) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas o embarcador pode registrar pagamento',
      });
    }

    if (ride.status !== 'completed') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Frete deve estar concluido para pagamento',
      });
    }

    if (!ride.final_price) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Frete sem preco final definido',
      });
    }

    // Check if payment already exists
    const existingPayment = await fastify.db.query(
      'SELECT id FROM payments WHERE ride_id = $1',
      [rideId]
    );

    if (existingPayment.rows.length > 0) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Pagamento ja registrado para este frete',
      });
    }

    const amount = parseFloat(ride.final_price);
    const commissionAmount = Math.round(amount * COMMISSION_RATE * 100) / 100;
    const driverAmount = Math.round((amount - commissionAmount) * 100) / 100;

    // Create payment record
    const paymentResult = await fastify.db.query(
      `INSERT INTO payments (ride_id, payer_id, amount, commission_amount, driver_amount, method, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, amount, commission_amount, driver_amount, method, status`,
      [
        rideId, userId, amount, commissionAmount, driverAmount, method,
        method === 'dinheiro' ? 'pending' : 'paid',
        method === 'dinheiro' ? null : new Date().toISOString(),
      ]
    );

    // For digital payments, credit driver wallet immediately
    if (method !== 'dinheiro') {
      await fastify.db.query(
        `INSERT INTO wallet_transactions (driver_id, ride_id, type, amount, description)
         VALUES ($1, $2, 'credit', $3, $4)`,
        [ride.driver_id, rideId, driverAmount, `Frete #${rideId.slice(0, 8)} - ${method}`]
      );
    }

    return reply.status(201).send({ payment: paymentResult.rows[0] });
  });

  // GET /api/wallet — Driver wallet balance and recent transactions
  fastify.get('/api/wallet', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const role = request.user.role;

    if (role !== 'motorista') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas motoristas possuem carteira',
      });
    }

    // Calculate balance (sum of credits - sum of debits)
    const balanceResult = await fastify.db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) as total_credits,
         COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as total_debits
       FROM wallet_transactions
       WHERE driver_id = $1`,
      [userId]
    );

    const { total_credits, total_debits } = balanceResult.rows[0];
    const balance = Math.round((parseFloat(total_credits) - parseFloat(total_debits)) * 100) / 100;

    // Recent transactions
    const txResult = await fastify.db.query(
      `SELECT id, type, amount, description, created_at
       FROM wallet_transactions
       WHERE driver_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    );

    return reply.send({
      balance,
      total_earned: parseFloat(total_credits),
      total_withdrawn: parseFloat(total_debits),
      transactions: txResult.rows,
    });
  });

  // POST /api/wallet/withdraw — Driver requests withdrawal
  fastify.post<{ Body: WithdrawBody }>('/api/wallet/withdraw', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const role = request.user.role;
    const { amount, pix_key } = request.body;

    if (role !== 'motorista') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas motoristas podem sacar',
      });
    }

    if (!amount || amount < MIN_WITHDRAW) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Valor minimo para saque: R$ ${MIN_WITHDRAW.toFixed(2)}`,
      });
    }

    if (!pix_key) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'pix_key e obrigatorio',
      });
    }

    // Check balance
    const balanceResult = await fastify.db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) -
         COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0) as balance
       FROM wallet_transactions
       WHERE driver_id = $1`,
      [userId]
    );

    const balance = parseFloat(balanceResult.rows[0].balance);

    if (amount > balance) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Saldo insuficiente. Disponivel: R$ ${balance.toFixed(2)}`,
      });
    }

    // Create debit transaction
    const txResult = await fastify.db.query(
      `INSERT INTO wallet_transactions (driver_id, type, amount, description)
       VALUES ($1, 'debit', $2, $3)
       RETURNING id, type, amount, description, created_at`,
      [userId, amount, `Saque Pix - ${pix_key}`]
    );

    return reply.status(201).send({
      message: 'Saque solicitado',
      transaction: txResult.rows[0],
      new_balance: Math.round((balance - amount) * 100) / 100,
    });
  });
}
