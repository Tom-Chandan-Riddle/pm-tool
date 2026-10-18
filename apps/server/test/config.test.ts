import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/shared/config.js';

describe('parseConfig', () => {
  it('rejects a port that is not a number before the server can listen', () => {
    expect(() => parseConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects a port outside the valid range', () => {
    expect(() => parseConfig({ PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects an unknown environment name', () => {
    expect(() => parseConfig({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('defaults to production so docs stay off when NODE_ENV is unset', () => {
    expect(parseConfig({})).toMatchObject({
      NODE_ENV: 'production',
      PORT: 3001,
      HOST: '127.0.0.1',
    });
  });
});
