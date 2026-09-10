import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';

interface RegisterBody {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'embarcador' | 'motorista';
  cpf_cnpj?: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface RefreshBody {
  refresh_token: string;
}

const SALT_ROUNDS = 10;
const REFRESH_EXPIRES_IN = '30d';

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /api/auth/register
  fastify.post('/api/auth/register', async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
    const { name, email, phone, password, role, cpf_cnpj } = request.body;

    if (!name || !email || !phone || !password || !role) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Campos obrigatorios: name, email, phone, password, role',
      });
    }

    if (!['embarcador', 'motorista'].includes(role)) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Role deve ser embarcador ou motorista',
      });
    }

    // Check existing user
    const existing = await fastify.db.query(
      'SELECT id FROM users WHERE email = $1 OR phone = $2',
      [email, phone]
    );

    if (existing.rows.length > 0) {
      return reply.status(409).send({
        statusCode: 409,
        error: 'Conflict',
        message: 'Email ou telefone ja cadastrado',
      });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const status = role === 'embarcador' ? 'active' : 'pending';

    const result = await fastify.db.query(
      `INSERT INTO users (name, email, phone, password_hash, role, status, cpf_cnpj)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, phone, role, status, created_at`,
      [name, email, phone, passwordHash, role, status, cpf_cnpj || null]
    );

    const user = result.rows[0];

    const accessToken = fastify.jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
    );

    const refreshToken = fastify.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: REFRESH_EXPIRES_IN },
    );

    return reply.status(201).send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  });

  // POST /api/auth/login
  fastify.post('/api/auth/login', async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Email e senha sao obrigatorios',
      });
    }

    const result = await fastify.db.query(
      'SELECT id, name, email, phone, password_hash, role, status FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Credenciais invalidas',
      });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Credenciais invalidas',
      });
    }

    if (user.status === 'blocked' || user.status === 'suspended') {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Conta bloqueada ou suspensa',
      });
    }

    const accessToken = fastify.jwt.sign(
      { sub: user.id, role: user.role, email: user.email },
    );

    const refreshToken = fastify.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: REFRESH_EXPIRES_IN },
    );

    return reply.send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  });

  // POST /api/auth/refresh
  fastify.post('/api/auth/refresh', async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
    const { refresh_token } = request.body;

    if (!refresh_token) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'refresh_token obrigatorio',
      });
    }

    try {
      const decoded = fastify.jwt.verify<{ sub: string; type: string }>(refresh_token);

      if (decoded.type !== 'refresh') {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Token invalido',
        });
      }

      const result = await fastify.db.query(
        'SELECT id, name, email, phone, role, status FROM users WHERE id = $1',
        [decoded.sub]
      );

      if (result.rows.length === 0) {
        return reply.status(401).send({
          statusCode: 401,
          error: 'Unauthorized',
          message: 'Usuario nao encontrado',
        });
      }

      const user = result.rows[0];

      const accessToken = fastify.jwt.sign(
        { sub: user.id, role: user.role, email: user.email },
      );

      const newRefreshToken = fastify.jwt.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: REFRESH_EXPIRES_IN },
      );

      return reply.send({
        access_token: accessToken,
        refresh_token: newRefreshToken,
      });
    } catch {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Refresh token invalido ou expirado',
      });
    }
  });

  // GET /api/auth/me (protected)
  fastify.get('/api/auth/me', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user.sub;

    const result = await fastify.db.query(
      `SELECT id, name, email, phone, role, status, avatar_url, rating_avg, rating_count, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Usuario nao encontrado',
      });
    }

    return reply.send({ user: result.rows[0] });
  });
}
