import { type FastifyInstance } from 'fastify';

interface RideParams {
  id: string;
}

interface CreateRatingBody {
  score: number;
  comment?: string;
}

export default async function ratingsRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/rides/:id/rating — Rate the other party
  fastify.post<{ Params: RideParams; Body: CreateRatingBody }>('/api/rides/:id/rating', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;
    const fromUserId = request.user.sub;
    const { score, comment } = request.body;

    if (!score || score < 1 || score > 5) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'score deve ser entre 1 e 5',
      });
    }

    // Get ride info
    const rideResult = await fastify.db.query(
      'SELECT id, embarcador_id, driver_id, status FROM rides WHERE id = $1',
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Frete nao encontrado' });
    }

    const ride = rideResult.rows[0];

    if (ride.status !== 'completed') {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Frete deve estar concluido para avaliar',
      });
    }

    // Determine who is being rated
    let toUserId: string;
    if (fromUserId === ride.embarcador_id) {
      toUserId = ride.driver_id;
    } else if (fromUserId === ride.driver_id) {
      toUserId = ride.embarcador_id;
    } else {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas participantes do frete podem avaliar',
      });
    }

    // Check for existing rating
    const existing = await fastify.db.query(
      'SELECT id FROM ratings WHERE ride_id = $1 AND from_user_id = $2',
      [rideId, fromUserId]
    );

    if (existing.rows.length > 0) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Voce ja avaliou este frete',
      });
    }

    // Insert rating
    const result = await fastify.db.query(
      `INSERT INTO ratings (ride_id, from_user_id, to_user_id, score, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, score, comment, created_at`,
      [rideId, fromUserId, toUserId, score, comment || null]
    );

    // Update user rating avg
    await fastify.db.query(
      `UPDATE users SET
         rating_avg = (SELECT AVG(score) FROM ratings WHERE to_user_id = $1),
         rating_count = (SELECT COUNT(*) FROM ratings WHERE to_user_id = $1)
       WHERE id = $1`,
      [toUserId]
    );

    return reply.status(201).send({ rating: result.rows[0] });
  });

  // GET /api/users/:id/ratings — User ratings
  fastify.get<{ Params: { id: string } }>('/api/users/:id/ratings', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.params.id;

    const result = await fastify.db.query(
      `SELECT r.id, r.score, r.comment, r.created_at,
              u.name as from_user_name
       FROM ratings r
       JOIN users u ON r.from_user_id = u.id
       WHERE r.to_user_id = $1
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [userId]
    );

    const avgResult = await fastify.db.query(
      'SELECT rating_avg, rating_count FROM users WHERE id = $1',
      [userId]
    );

    return reply.send({
      ratings: result.rows,
      average: parseFloat(avgResult.rows[0]?.rating_avg || '0'),
      count: parseInt(avgResult.rows[0]?.rating_count || '0'),
    });
  });
}
