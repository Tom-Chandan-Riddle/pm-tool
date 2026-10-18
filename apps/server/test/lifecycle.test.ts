import { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { installProcessHandlers, SHUTDOWN_TIMEOUT_MS } from '../src/shared/lifecycle.js';
import { capturingLogConfig, captureLogs, PINO_LEVEL } from './helpers.js';

let app: FastifyInstance;
let logs: ReturnType<typeof captureLogs>;
let fakeProcess: EventEmitter;
let exit: ReturnType<typeof vi.fn<(code: number) => void>>;

beforeEach(async () => {
  logs = captureLogs();
  app = await buildApp(capturingLogConfig, { logDestination: logs.stream });
  fakeProcess = new EventEmitter();
  exit = vi.fn<(code: number) => void>();
  installProcessHandlers({ app, processEvents: fakeProcess, exit });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('shutdown', () => {
  it('closes the app once and exits 0 on a signal', async () => {
    const close = vi.spyOn(app, 'close');
    fakeProcess.emit('SIGINT');
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(0);
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ignores a second signal while shutting down and logs a warning', async () => {
    const close = vi.spyOn(app, 'close');
    fakeProcess.emit('SIGINT');
    fakeProcess.emit('SIGTERM');
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(0);
    });
    expect(close).toHaveBeenCalledTimes(1);
    const warnings = logs.entries().filter((entry) => entry.level === PINO_LEVEL.warn);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ signal: 'SIGTERM' });
  });

  it('exits 1 after the timeout when closing never finishes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(app, 'close').mockReturnValue(new Promise(() => undefined) as never);
    fakeProcess.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);
    expect(exit).toHaveBeenCalledWith(1);
    expect(logs.entries().some((entry) => entry.msg === 'shutdown timed out')).toBe(true);
  });

  it('exits 1 and logs an error when closing fails', async () => {
    vi.spyOn(app, 'close').mockRejectedValue(new Error('close failed'));
    fakeProcess.emit('SIGINT');
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
    expect(logs.entries().some((entry) => entry.level === PINO_LEVEL.error)).toBe(true);
  });
});

describe('fatal errors', () => {
  it('logs an unhandled rejection at fatal level and exits 1', () => {
    fakeProcess.emit('unhandledRejection', new Error('lost promise'));
    expect(exit).toHaveBeenCalledWith(1);
    expect(logs.entries().some((entry) => entry.msg === 'unhandled rejection')).toBe(true);
  });

  it('logs an uncaught exception at fatal level and exits 1', () => {
    fakeProcess.emit('uncaughtException', new Error('boom'));
    expect(exit).toHaveBeenCalledWith(1);
    expect(logs.entries().some((entry) => entry.msg === 'uncaught exception')).toBe(true);
  });
});
