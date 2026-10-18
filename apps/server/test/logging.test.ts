import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { capturingLogConfig, captureLogs, PINO_LEVEL } from './helpers.js';

const SECRET_TOKEN = 'sekret-token';
const SECRET_COOKIE = 'sekret-cookie';

let app: FastifyInstance;
let logs: ReturnType<typeof captureLogs>;

beforeEach(async () => {
  logs = captureLogs();
  app = await buildApp(capturingLogConfig, { logDestination: logs.stream });
  app.get('/boom', () => {
    throw new Error('database password is hunter2');
  });
  app.get('/debug-headers', (request) => {
    request.log.info({ headers: request.headers }, 'debugging request headers');
    return { ok: true };
  });
});

afterEach(async () => {
  await app.close();
});

describe('redaction', () => {
  it('keeps authorization and cookie values out of the logs when headers are logged', async () => {
    await app.inject({
      method: 'GET',
      url: '/debug-headers',
      headers: { authorization: `Bearer ${SECRET_TOKEN}`, cookie: `session=${SECRET_COOKIE}` },
    });
    const output = logs.rawOutput();
    expect(output).not.toContain(SECRET_TOKEN);
    expect(output).not.toContain(SECRET_COOKIE);
    expect(output).toContain('[Redacted]');
  });
});

describe('correlation id in logs', () => {
  it('puts the caller id on every log line of the request', async () => {
    await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-correlation-id': 'trace-42' },
    });
    const entries = logs.entries();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.every((entry) => entry.reqId === 'trace-42')).toBe(true);
  });

  it('puts one generated id on every log line when the caller sends none', async () => {
    await app.inject({ method: 'GET', url: '/health' });
    const ids = new Set(logs.entries().map((entry) => entry.reqId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('failure logging', () => {
  it('logs an unexpected error once at error level without leaking it to the client', async () => {
    const response = await app.inject({ method: 'GET', url: '/boom' });
    const errorEntries = logs.entries().filter((entry) => entry.level >= PINO_LEVEL.error);
    expect(errorEntries).toHaveLength(1);
    expect(errorEntries[0]).toMatchObject({ msg: 'unexpected error' });
    expect(response.body).not.toContain('hunter2');
  });

  it('logs an unknown route once at warn level with the method and url', async () => {
    await app.inject({
      method: 'GET',
      url: '/nope',
      headers: { 'x-correlation-id': 'lost-1' },
    });
    const warnEntries = logs.entries().filter((entry) => entry.level === PINO_LEVEL.warn);
    expect(warnEntries).toHaveLength(1);
    expect(warnEntries[0]).toMatchObject({
      msg: 'route not found',
      method: 'GET',
      url: '/nope',
      reqId: 'lost-1',
    });
  });
});
