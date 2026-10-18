import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { testConfig } from './helpers.js';

let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

describe('health', () => {
  it('reports liveness', async () => {
    app = await buildApp(testConfig);
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('reports readiness', async () => {
    app = await buildApp(testConfig);
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(response.statusCode).toBe(200);
  });
});

describe('api docs', () => {
  it('serves Scalar in development', async () => {
    app = await buildApp({ ...testConfig, NODE_ENV: 'development' });
    const response = await app.inject({ method: 'GET', url: '/docs/' });
    expect(response.statusCode).toBe(200);
  });

  it('does not serve Scalar outside development', async () => {
    app = await buildApp({ ...testConfig, NODE_ENV: 'production' });
    const response = await app.inject({ method: 'GET', url: '/docs/' });
    expect(response.statusCode).toBe(404);
  });
});
