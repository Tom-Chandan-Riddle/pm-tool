import { appendFile, mkdir, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readProjectFiles,
  watchProjectFiles,
  WatchFolderMissingError,
  type ProjectFileWatcher,
  type ProjectTexts,
} from '../src/features/watch/file-watcher.js';

const FAST = { debounceMs: 60, stableMs: 60, maxStableWaitMs: 1000 } as const;
const QUIET_PERIOD_MS = 500;
const WAIT_TIMEOUT_MS = 4000;
const UNDER_ONE_SECOND_MS = 1000;

let folder: string;
let featuresPath: string;
let logPath: string;
let watchers: ProjectFileWatcher[];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'pm-watch-'));
  featuresPath = join(folder, 'FEATURES.md');
  logPath = join(folder, 'PROCESS-LOG.md');
  watchers = [];
});

afterEach(async () => {
  await Promise.all(watchers.map((watcher) => watcher.close()));
  await rm(folder, { recursive: true, force: true });
});

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + WAIT_TIMEOUT_MS;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('Timed out waiting for the watcher');
    await sleep(10);
  }
}

async function startWatching(
  options: Partial<Parameters<typeof watchProjectFiles>[0]> = {},
  timings: object = FAST,
) {
  const changes: ProjectTexts[] = [];
  const errors: unknown[] = [];
  const logger = { debug: vi.fn(), warn: vi.fn() };
  const watcher = await watchProjectFiles({
    featuresPath,
    onChange: (texts) => {
      changes.push(texts);
    },
    onError: (error) => errors.push(error),
    logger,
    ...timings,
    ...options,
  });
  watchers.push(watcher);
  return { changes, errors, logger, watcher };
}

describe('watchProjectFiles', () => {
  it('rejects when the folder does not exist', async () => {
    featuresPath = join(folder, 'missing-folder', 'FEATURES.md');

    await expect(startWatching()).rejects.toBeInstanceOf(WatchFolderMissingError);
  });

  it('rejects when the folder path is really a file', async () => {
    const notAFolder = join(folder, 'plain.txt');
    await writeFile(notAFolder, 'x');
    featuresPath = join(notAFolder, 'FEATURES.md');

    await expect(startWatching()).rejects.toThrow(/No folder at/);
  });

  it('never emits a half-written file, only the finished one', async () => {
    await writeFile(featuresPath, 'start');
    const { changes } = await startWatching({ debounceMs: 40, stableMs: 200 });

    const chunks = ['one ', 'two ', 'three ', 'four ', 'five ', 'six'];
    for (const chunk of chunks) {
      await appendFile(featuresPath, chunk);
      await sleep(120);
    }
    await waitFor(() => changes.length > 0);
    await sleep(QUIET_PERIOD_MS);

    expect(changes.map((change) => change.featuresText)).toEqual([`start${chunks.join('')}`]);
  });

  it('delivers an in-place write in under a second with the default timings', async () => {
    await writeFile(featuresPath, 'before');
    const { changes } = await startWatching({}, {});

    const startedAt = performance.now();
    await writeFile(featuresPath, 'after');
    await waitFor(() => changes.length > 0);

    expect(performance.now() - startedAt).toBeLessThan(UNDER_ONE_SECOND_MS);
    expect(changes[0]?.featuresText).toBe('after');
  });

  it('turns a burst of ten writes into one update', async () => {
    await writeFile(featuresPath, 'start');
    const { changes } = await startWatching();

    for (let save = 1; save <= 10; save++) await writeFile(featuresPath, `save ${String(save)}`);
    await waitFor(() => changes.length > 0);
    await sleep(QUIET_PERIOD_MS);

    expect(changes).toHaveLength(1);
    expect(changes[0]?.featuresText).toBe('save 10');
  });

  it('ends on the last content after ten saves spread over two seconds', async () => {
    await writeFile(featuresPath, 'start');
    const { changes } = await startWatching({ debounceMs: 300, stableMs: 100 });

    for (let save = 1; save <= 10; save++) {
      await writeFile(featuresPath, `save ${String(save)}`);
      await sleep(200);
    }
    await waitFor(() => changes.at(-1)?.featuresText === 'save 10');

    expect(changes.at(-1)?.featuresText).toBe('save 10');
  });

  it('picks up a temp-file-and-rename save', async () => {
    await writeFile(featuresPath, 'old');
    const { changes } = await startWatching();

    const tempPath = join(folder, 'FEATURES.md.tmp');
    await writeFile(tempPath, 'new');
    await rename(tempPath, featuresPath);
    await waitFor(() => changes.at(-1)?.featuresText === 'new');

    expect(changes.at(-1)?.featuresText).toBe('new');
  });

  it('reports a deleted features file as missing', async () => {
    await writeFile(featuresPath, 'here');
    const { changes } = await startWatching();

    await unlink(featuresPath);
    await waitFor(() => changes.length > 0);

    expect(changes.at(-1)).toEqual({ featuresText: null, logText: null });
  });

  it('keeps going after the file is deleted and recreated, without a restart', async () => {
    await writeFile(featuresPath, 'first');
    const { changes } = await startWatching();

    await unlink(featuresPath);
    await waitFor(() => changes.at(-1)?.featuresText === null);
    await writeFile(featuresPath, 'recreated');
    await waitFor(() => changes.at(-1)?.featuresText === 'recreated');
    await writeFile(featuresPath, 'edited again');
    await waitFor(() => changes.at(-1)?.featuresText === 'edited again');

    expect(changes.at(-1)?.featuresText).toBe('edited again');
  });

  it('ends on the new content when the file is deleted and recreated quickly', async () => {
    await writeFile(featuresPath, 'first');
    const { changes } = await startWatching({ debounceMs: 200 });

    await unlink(featuresPath);
    await writeFile(featuresPath, 'recreated');
    await waitFor(() => changes.length > 0);
    await sleep(QUIET_PERIOD_MS);

    expect(changes.at(-1)?.featuresText).toBe('recreated');
  });

  it('treats a missing PROCESS-LOG.md as null, not an error', async () => {
    await writeFile(featuresPath, 'start');
    const { changes, errors } = await startWatching();

    await writeFile(featuresPath, 'changed');
    await waitFor(() => changes.length > 0);

    expect(changes[0]).toEqual({ featuresText: 'changed', logText: null });
    expect(errors).toEqual([]);
  });

  it('updates when PROCESS-LOG.md changes', async () => {
    await writeFile(featuresPath, 'features');
    const { changes } = await startWatching();

    await writeFile(logPath, 'log entry');
    await waitFor(() => changes.length > 0);

    expect(changes[0]).toEqual({ featuresText: 'features', logText: 'log entry' });
  });

  it('matches the file names without regard to case', async () => {
    await writeFile(featuresPath, 'features');
    const { changes } = await startWatching();

    await writeFile(join(folder, 'process-log.md'), 'lower case log');
    await waitFor(() => changes.length > 0);

    expect(changes[0]?.logText).toBe('lower case log');
  });

  it('ignores other files in the folder', async () => {
    await writeFile(featuresPath, 'features');
    const { changes } = await startWatching();

    await writeFile(join(folder, 'notes.md'), 'unrelated');
    await mkdir(join(folder, 'subfolder'));
    await writeFile(join(folder, 'subfolder', 'FEATURES.md'), 'nested');
    await sleep(QUIET_PERIOD_MS);

    expect(changes).toEqual([]);
  });

  it('does not deliver a pending update after close', async () => {
    await writeFile(featuresPath, 'start');
    const { changes, watcher } = await startWatching({ debounceMs: 200 });

    await writeFile(featuresPath, 'changed');
    await sleep(80);
    await watcher.close();
    await sleep(QUIET_PERIOD_MS);

    expect(changes).toEqual([]);
  });

  it('can be closed twice and ignores writes after it is closed', async () => {
    await writeFile(featuresPath, 'start');
    const { changes, watcher } = await startWatching();

    await watcher.close();
    await watcher.close();
    await writeFile(featuresPath, 'after close');
    await sleep(QUIET_PERIOD_MS);

    expect(changes).toEqual([]);
  });

  it('reports an error from the change callback and keeps watching', async () => {
    await writeFile(featuresPath, 'start');
    const errors: unknown[] = [];
    const received: string[] = [];
    const watcher = await watchProjectFiles({
      featuresPath,
      onChange: (texts) => {
        received.push(texts.featuresText ?? '');
        if (received.length === 1) throw new Error('consumer failed');
      },
      onError: (error) => errors.push(error),
      logger: { debug: vi.fn(), warn: vi.fn() },
      ...FAST,
    });
    watchers.push(watcher);

    await writeFile(featuresPath, 'one');
    await waitFor(() => errors.length > 0);
    await writeFile(featuresPath, 'two');
    await waitFor(() => received.includes('two'));

    expect(errors).toHaveLength(1);
  });
});

describe('readProjectFiles', () => {
  it('reads both files and gives null for a missing one', async () => {
    await writeFile(featuresPath, 'features text');

    expect(await readProjectFiles(featuresPath)).toEqual({
      featuresText: 'features text',
      logText: null,
    });
  });

  it('gives null for both when neither file exists', async () => {
    expect(await readProjectFiles(featuresPath)).toEqual({ featuresText: null, logText: null });
  });

  it('rejects when the features path is a folder', async () => {
    await mkdir(featuresPath);

    await expect(readProjectFiles(featuresPath)).rejects.toMatchObject({ code: 'EISDIR' });
  });
});
