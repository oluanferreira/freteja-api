import { type FastifyInstance } from 'fastify';

interface CreateProposalBody {
  proposed_price: number;
  message?: string;
}

interface RideParams {
  id: string;
}

interface ProposalParams {
  id: string;
}

export default async function proposalsRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/rides/:id/proposals — Motorista creates proposal
  fastify.post<{ Params: RideParams; Body: CreateProposalBody }>('/api/rides/:id/proposals', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;
    const driverId = request.user.sub;
    const role = request.user.role;

    if (role !== 'motorista') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas motoristas podem criar propostas',
      });
    }

    const { proposed_price, message } = request.body;

    if (!proposed_price || proposed_price <= 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'proposed_price deve ser maior que zero',
      });
    }

    // Check ride exists and is pending
    const ride = await fastify.db.query(
      'SELECT id, status FROM rides WHERE id = $1',
      [rideId]
    );

    if (ride.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Frete nao encontrado' });
    }

    if (ride.rows[0].status !== 'pending') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Frete nao esta disponivel para propostas',
      });
    }

    // Check if driver already proposed
    const existing = await fastify.db.query(
      'SELECT id FROM proposals WHERE ride_id = $1 AND driver_id = $2',
      [rideId, driverId]
    );

    if (existing.rows.length > 0) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Voce ja fez uma proposta para este frete',
      });
    }

    const result = await fastify.db.query(
      `INSERT INTO proposals (ride_id, driver_id, proposed_price, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, ride_id, driver_id, proposed_price, message, status, created_at`,
      [rideId, driverId, proposed_price, message || null]
    );

    return reply.status(201).send({ proposal: result.rows[0] });
  });

  // GET /api/rides/:id/proposals — List proposals for a ride
  fastify.get<{ Params: RideParams }>('/api/rides/:id/proposals', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;

    const result = await fastify.db.query(
      `SELECT p.id, p.proposed_price, p.message, p.status, p.created_at,
              u.id as driver_id, u.name as driver_name, u.rating_avg as driver_rating
       FROM proposals p
       JOIN users u ON p.driver_id = u.id
       WHERE p.ride_id = $1
       ORDER BY p.created_at ASC`,
      [rideId]
    );

    return reply.send({ proposals: result.rows });
  });

  // PATCH /api/proposals/:id/accept — Embarcador accepts proposal
  fastify.patch<{ Params: ProposalParams }>('/api/proposals/:id/accept', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const proposalId = request.params.id;
    const userId = request.user.sub;

    // Get proposal with ride info
    const proposalResult = await fastify.db.query(
      `SELECT p.id, p.ride_id, p.driver_id, p.proposed_price, p.status,
              r.embarcador_id, r.status as ride_status
       FROM proposals p
       JOIN rides r ON p.ride_id = r.id
       WHERE p.id = $1`,
      [proposalId]
    );

    if (proposalResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Proposta nao encontrada' });
    }

    const proposal = proposalResult.rows[0];

    if (proposal.embarcador_id !== userId) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas o embarcador do frete pode aceitar propostas',
      });
    }

    if (proposal.ride_status !== 'pending') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Frete ja tem uma proposta aceita',
      });
    }

    if (proposal.status !== 'pending') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Esta proposta ja foi processada',
      });
    }

    // Accept this proposal
    await fastify.db.query(
      `UPDATE proposals SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
      [proposalId]
    );

    // Reject all other proposals for this ride
    await fastify.db.query(
      `UPDATE proposals SET status = 'rejected', responded_at = NOW()
       WHERE ride_id = $1 AND id != $2 AND status = 'pending'`,
      [proposal.ride_id, proposalId]
    );

    // Update ride: set driver, final price, status
    await fastify.db.query(
      `UPDATE rides SET
        driver_id = $1, final_price = $2, status = 'accepted', accepted_at = NOW(),
        commission_amount = $2 * commission_rate
       WHERE id = $3`,
      [proposal.driver_id, proposal.proposed_price, proposal.ride_id]
    );

    return reply.send({
      message: 'Proposta aceita',
      ride_id: proposal.ride_id,
      driver_id: proposal.driver_id,
      final_price: proposal.proposed_price,
    });
  });

  // PATCH /api/proposals/:id/reject — Embarcador rejects proposal
  fastify.patch<{ Params: ProposalParams }>('/api/proposals/:id/reject', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const proposalId = request.params.id;
    const userId = request.user.sub;

    const proposalResult = await fastify.db.query(
      `SELECT p.id, p.status, r.embarcador_id
       FROM proposals p
       JOIN rides r ON p.ride_id = r.id
       WHERE p.id = $1`,
      [proposalId]
    );

    if (proposalResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Proposta nao encontrada' });
    }

    const proposal = proposalResult.rows[0];

    if (proposal.embarcador_id !== userId) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas o embarcador do frete pode rejeitar propostas',
      });
    }

    if (proposal.status !== 'pending') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Esta proposta ja foi processada',
      });
    }

    await fastify.db.query(
      `UPDATE proposals SET status = 'rejected', responded_at = NOW() WHERE id = $1`,
      [proposalId]
    );

    return reply.send({ message: 'Proposta rejeitada', proposal_id: proposalId });
  });
}
