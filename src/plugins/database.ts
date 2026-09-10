import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Pool, type PoolClient } from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
  }
}

async function databasePlugin(fastify: FastifyInstance): Promise<void> {
  const pool = new Pool({
    connectionString: fastify.config.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Serverless pooler (Supavisor, transaction mode) ignores `options=-csearch_path`
  // in DATABASE_URL, so pin the schema on every physical connection instead.
  pool.on('connect', (client) => {
    client.query('SET search_path TO freteja, public, extensions').catch(() => undefined);
  });

  // Test connection
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as now, PostGIS_Version() as postgis');
    fastify.log.info(
      `Database connected. Time: ${result.rows[0].now}, PostGIS: ${result.rows[0].postgis}`
    );
  } catch (err) {
    fastify.log.error(`Failed to connect to database: ${err instanceof Error ? err.message : 'Unknown error'}`);
    throw err;
  } finally {
    if (client) client.release();
  }

  fastify.decorate('db', pool);

  fastify.addHook('onClose', async () => {
    await pool.end();
    fastify.log.info('Database pool closed');
  });
}

export default fp(databasePlugin, {
  name: 'database',
  dependencies: [],
});
