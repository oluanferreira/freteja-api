import { type FastifyInstance } from 'fastify';

interface RideParams {
  id: string;
}

interface SendMessageBody {
  text: string;
  type?: string;
}

const QUICK_MESSAGES = [
  'Estou chegando',
  'Cheguei no local',
  'Carga carregada',
  'Estou a caminho do destino',
  'Cheguei ao destino',
  'Pode descer para receber',
];

export default async function chatRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /api/rides/:id/messages — Message history
  fastify.get<{ Params: RideParams }>('/api/rides/:id/messages', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;

    const result = await fastify.db.query(
      `SELECT m.id, m.text, m.type, m.created_at,
              m.sender_id, u.name as sender_name
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.ride_id = $1
       ORDER BY m.created_at ASC`,
      [rideId]
    );

    return reply.send({ messages: result.rows });
  });

  // POST /api/rides/:id/messages — Send message
  fastify.post<{ Params: RideParams; Body: SendMessageBody }>('/api/rides/:id/messages', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const rideId = request.params.id;
    const senderId = request.user.sub;
    const { text, type } = request.body;

    if (!text || text.trim().length === 0) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'text e obrigatorio',
      });
    }

    // Verify ride exists and is active
    const rideResult = await fastify.db.query(
      'SELECT id, status, embarcador_id, driver_id FROM rides WHERE id = $1',
      [rideId]
    );

    if (rideResult.rows.length === 0) {
      return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Frete nao encontrado' });
    }

    const ride = rideResult.rows[0];
    const activeStatuses = ['accepted', 'collecting', 'in_transit', 'delivering'];

    if (!activeStatuses.includes(ride.status)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Chat disponivel apenas para fretes ativos',
      });
    }

    // Only embarcador and assigned driver can chat
    if (senderId !== ride.embarcador_id && senderId !== ride.driver_id) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Apenas participantes do frete podem enviar mensagens',
      });
    }

    const result = await fastify.db.query(
      `INSERT INTO messages (ride_id, sender_id, text, type)
       VALUES ($1, $2, $3, $4)
       RETURNING id, text, type, created_at`,
      [rideId, senderId, text.trim(), type || 'text']
    );

    const message = result.rows[0];

    // Emit via Socket.IO if available
    if (fastify.io) {
      fastify.io.of('/chat').to(`chat:${rideId}`).emit('chat:message', {
        ...message,
        sender_id: senderId,
        ride_id: rideId,
      });
    }

    return reply.status(201).send({ message });
  });

  // GET /api/chat/quick-messages — Quick message templates
  fastify.get('/api/chat/quick-messages', {
    onRequest: [fastify.authenticate],
  }, async (_request, reply) => {
    return reply.send({ quick_messages: QUICK_MESSAGES });
  });
}
