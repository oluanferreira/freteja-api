import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

describe('Health check endpoint', () => {
  it('should return status ok with expected fields', async () => {
    const server = Fastify();

    server.get('/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: 'test',
    }));

    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    assert.equal(response.statusCode, 200);

    const body = JSON.parse(response.payload);
    assert.equal(body.status, 'ok');
    assert.equal(body.env, 'test');
    assert.ok(body.timestamp);
    assert.equal(typeof body.uptime, 'number');

    await server.close();
  });

  it('should return 404 for unknown routes', async () => {
    const server = Fastify();

    server.get('/health', async () => ({ status: 'ok' }));

    const response = await server.inject({
      method: 'GET',
      url: '/unknown',
    });

    assert.equal(response.statusCode, 404);

    await server.close();
  });
});
