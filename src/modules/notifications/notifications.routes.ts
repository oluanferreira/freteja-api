import { type FastifyInstance } from 'fastify';

interface RegisterTokenBody {
  token: string;
  platform: string;
}

// In-memory notification queue (replace with FCM/OneSignal in production)
const pushTokens = new Map<string, { token: string; platform: string }>();

export default async function notificationsRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/notifications/register — Register push token
  fastify.post<{ Body: RegisterTokenBody }>('/api/notifications/register', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const { token, platform } = request.body;

    if (!token || !platform) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'token e platform sao obrigatorios',
      });
    }

    pushTokens.set(userId, { token, platform });

    return reply.status(200).send({ registered: true });
  });

  // GET /api/notifications — List user notifications
  fastify.get('/api/notifications', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;

    const result = await fastify.db.query(
      `SELECT id, type, title, body, data, read, created_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    return reply.send({ notifications: result.rows });
  });

  // PATCH /api/notifications/:id/read — Mark notification as read
  fastify.patch<{ Params: { id: string } }>('/api/notifications/:id/read', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;
    const notificationId = request.params.id;

    await fastify.db.query(
      'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );

    return reply.status(200).send({ success: true });
  });

  // POST /api/notifications/read-all — Mark all as read
  fastify.post('/api/notifications/read-all', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.sub;

    await fastify.db.query(
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
      [userId]
    );

    return reply.status(200).send({ success: true });
  });
}
