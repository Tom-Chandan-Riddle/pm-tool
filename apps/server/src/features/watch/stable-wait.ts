import { setTimeout as sleep } from 'node:timers/promises';

export type StableResult = 'stable' | 'superseded' | 'timeout';

export interface StableWaitOptions {
  /** A string that changes whenever the watched files change, such as their sizes and times. */
  readonly readSignature: () => Promise<string>;
  readonly stableMs: number;
  readonly maxWaitMs: number;
  /** False once a newer change has arrived, so this wait is no longer needed. */
  readonly isCurrent: () => boolean;
  readonly signal: AbortSignal;
}

// A36: a writer that keeps changing the files for longer than maxWaitMs is given up on.
export async function waitUntilStable(options: StableWaitOptions): Promise<StableResult> {
  const { readSignature, stableMs, maxWaitMs, isCurrent, signal } = options;
  const maxChecks = Math.max(1, Math.ceil(maxWaitMs / stableMs));
  let previous = await readSignature();
  for (let check = 0; check < maxChecks; check++) {
    await sleep(stableMs, undefined, { signal });
    if (!isCurrent()) return 'superseded';
    const current = await readSignature();
    if (current === previous) return 'stable';
    previous = current;
  }
  return 'timeout';
}
