import type { Config } from '../src/shared/config.js';

export const testConfig = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: 3001,
  LOG_LEVEL: 'silent',
} as const satisfies Config;
