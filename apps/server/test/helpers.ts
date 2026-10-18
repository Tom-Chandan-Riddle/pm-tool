import { Writable } from 'node:stream';
import type { Config } from '../src/shared/config.js';

export const testConfig = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3001,
  LOG_LEVEL: 'silent',
} as const satisfies Config;

export const capturingLogConfig = { ...testConfig, LOG_LEVEL: 'info' } as const satisfies Config;

export interface LogEntry {
  readonly level: number;
  readonly msg: string;
  readonly reqId?: string;
  readonly [field: string]: unknown;
}

export const PINO_LEVEL = { warn: 40, error: 50 } as const;

/** A pino destination that keeps what was written, for asserting on log output. */
export function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return {
    stream,
    rawOutput: () => lines.join(''),
    entries: () => lines.map((line) => JSON.parse(line) as LogEntry),
  };
}
