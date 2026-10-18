import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../src/app.js';
import { ProblemError } from '../src/shared/errors.js';
import { testConfig } from './helpers.js';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp(testConfig);
  app.get('/boom', () => {
    throw new Error('database password is hunter2');
  });
  app.get('/missing', () => {
    throw new ProblemError(404, 'Not Found', 'project p1 does not exist');
  });
  app
    .withTypeProvider<ZodTypeProvider>()
    .get(
      '/echo',
      { schema: { querystring: z.object({ count: z.coerce.number().int() }) } },
      (request) => ({ count: request.query.count }),
    );
});

afterEach(async () => {
  await app.close();
});

describe('error handling', () => {
  it('returns a 500 problem with the correlation id and no internals for an unexpected error', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/boom',
      headers: { 'x-correlation-id': 'abc-1' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      correlationId: 'abc-1',
    });
    expect(response.body).not.toContain('hunter2');
  });

  it('maps an expected failure to its status with problem+json', async () => {
    const response = await app.inject({ method: 'GET', url: '/missing' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      title: 'Not Found',
      detail: 'project p1 does not exist',
    });
  });

  it('returns 400 with field errors when validation fails', async () => {
    const response = await app.inject({ method: 'GET', url: '/echo?count=abc' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ errors: { field: string }[] }>().errors[0]?.field).toBe('count');
  });

  it('returns a 404 problem for an unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});

describe('correlation id', () => {
  it('echoes the id the caller sent', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': 'from-client' },
    });
    expect(response.headers['x-correlation-id']).toBe('from-client');
  });

  it('generates an id when the caller sends none', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
