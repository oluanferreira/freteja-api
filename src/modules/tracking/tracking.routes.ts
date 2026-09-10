import { type FastifyInstance } from 'fastify';

interface RideParams {
  id: string;
}

interface UpdateStatusBody {
  status: string;
}

interface LocationBody {
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
}

// Valid state transitions (from → to[])
const STATE_TRANSITIONS: Record<string, string[]> = {
  accepted: ['collecting'],
  collecting: ['in_transit'],
  in_transit: ['delivering'],
  delivering: ['completed'],
};

export default async function trackingRoutes(fastify: FastifyInstance): Promise<void> {

  // PATCH /api/rides/:id/status — Motorista advances ride status
  fastify.patch<{ Params: RideParams; Body: UpdateStatusBody }>('/api/rides/:id/status', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;
    const userId = request.user.sub;
    const newStatus = request.body.status;

    if (!newStatus) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'status é obrigatorio',
      });
    }

    // Get ride with current status
    const rideResult = await fastify.db.query(
      'SELECT id, driver_id, status FROM rides WHERE id = $1',
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Frete nao encontrado' });
    }

    const ride = rideResult.rows[0];

    if (ride.driver_id !== userId) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas o motorista do frete pode alterar o status',
      });
    }

    // Validate state transition
    const allowed = STATE_TRANSITIONS[ride.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: `Transicao invalida: '${ride.status}' → '${newStatus}'`,
      });
    }

    // Update status
    const timestampCol = newStatus === 'completed' ? ', completed_at = NOW()' : '';
    await fastify.db.query(
      `UPDATE rides SET status = $1${timestampCol} WHERE id = $2`,
      [newStatus, rideId]
    );

    return reply.send({
      message: 'Status atualizado',
      ride_id: rideId,
      previous_status: ride.status,
      new_status: newStatus,
    });
  });

  // POST /api/rides/:id/location — Motorista sends GPS position
  fastify.post<{ Params: RideParams; Body: LocationBody }>('/api/rides/:id/location', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;
    const userId = request.user.sub;
    const { lat, lng, speed, heading } = request.body;

    if (lat == null || lng == null) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'lat e lng sao obrigatorios',
      });
    }

    // Verify driver is assigned to this ride
    const rideResult = await fastify.db.query(
      'SELECT id, driver_id, status FROM rides WHERE id = $1',
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Frete nao encontrado' });
    }

    const ride = rideResult.rows[0];

    if (ride.driver_id !== userId) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas o motorista do frete pode enviar localizacao',
      });
    }

    const activeStatuses = ['accepted', 'collecting', 'in_transit', 'delivering'];
    if (!activeStatuses.includes(ride.status)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Frete nao esta ativo para tracking',
      });
    }

    // Insert location record
    await fastify.db.query(
      `INSERT INTO ride_locations (ride_id, driver_id, location, speed, heading)
       VALUES ($1, $2, ST_MakePoint($3, $4)::geography, $5, $6)`,
      [rideId, userId, lng, lat, speed || null, heading || null]
    );

    return reply.status(201).send({ message: 'Localizacao registrada' });
  });

  // GET /api/rides/:id/location — Get latest driver position
  fastify.get<{ Params: RideParams }>('/api/rides/:id/location', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;

    const result = await fastify.db.query(
      `SELECT
         ST_Y(location::geometry) as lat,
         ST_X(location::geometry) as lng,
         speed, heading, created_at
       FROM ride_locations
       WHERE ride_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [rideId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Nenhuma localizacao encontrada',
      });
    }

    return reply.send({ location: result.rows[0] });
  });
}
