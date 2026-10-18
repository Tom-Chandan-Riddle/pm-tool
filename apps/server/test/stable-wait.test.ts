import { describe, expect, it } from 'vitest';
import { waitUntilStable } from '../src/features/watch/stable-wait.js';

const SHORT_WAIT_MS = 5;

function waitWith(
  readSignature: () => Promise<string>,
  overrides: { isCurrent?: () => boolean } = {},
) {
  return waitUntilStable({
    readSignature,
    stableMs: SHORT_WAIT_MS,
    maxWaitMs: SHORT_WAIT_MS * 4,
    isCurrent: overrides.isCurrent ?? (() => true),
    signal: new AbortController().signal,
  });
}

describe('waitUntilStable', () => {
  it('gives up with a timeout when the signature keeps changing', async () => {
    let reads = 0;

    const result = await waitWith(() => Promise.resolve(String(reads++)));

    expect(result).toBe('timeout');
    expect(reads).toBe(5);
  });

  it('is stable once two reads in a row match', async () => {
    const signatures = ['10', '20', '30', '30'];
    let reads = 0;

    const result = await waitWith(() => Promise.resolve(signatures[reads++] ?? '30'));

    expect(result).toBe('stable');
    expect(reads).toBe(4);
  });

  it('is stable after one wait when nothing changes', async () => {
    let reads = 0;

    const result = await waitWith(() => {
      reads++;
      return Promise.resolve('same');
    });

    expect(result).toBe('stable');
    expect(reads).toBe(2);
  });

  it('stops as superseded when a newer change has arrived', async () => {
    let reads = 0;

    const result = await waitWith(() => Promise.resolve(String(reads++)), {
      isCurrent: () => false,
    });

    expect(result).toBe('superseded');
    expect(reads).toBe(1);
  });

  it('rejects when its signal is aborted during a wait', async () => {
    const abort = new AbortController();

    const waiting = waitUntilStable({
      readSignature: () => Promise.resolve('same'),
      stableMs: 10_000,
      maxWaitMs: 10_000,
      isCurrent: () => true,
      signal: abort.signal,
    });
    abort.abort();

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });
});
