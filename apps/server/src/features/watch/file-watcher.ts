import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { watch, type FSWatcher } from 'chokidar';
import { waitUntilStable } from './stable-wait.js';

export const LOG_FILE_NAME = 'PROCESS-LOG.md';

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_STABLE_MS = 200;
const DEFAULT_MAX_STABLE_WAIT_MS = 5000;
const RELEVANT_EVENTS = new Set(['add', 'change', 'unlink']);
const MISSING_FILE_SIGNATURE = 'missing';

/** `null` means the file does not exist (A37). */
export interface ProjectTexts {
  readonly featuresText: string | null;
  readonly logText: string | null;
}

export interface WatchLogger {
  debug(fields: object, message: string): void;
  warn(fields: object, message: string): void;
}

export interface WatchOptions {
  readonly featuresPath: string;
  readonly onChange: (texts: ProjectTexts) => void | Promise<void>;
  readonly onError: (error: unknown) => void;
  readonly logger: WatchLogger;
  readonly debounceMs?: number;
  readonly stableMs?: number;
  readonly maxStableWaitMs?: number;
}

export interface ProjectFileWatcher {
  close(): Promise<void>;
}

export class WatchFolderMissingError extends Error {
  constructor(folder: string) {
    super(`No folder at ${folder}`);
    this.name = 'WatchFolderMissingError';
  }
}

export async function readProjectFiles(featuresPath: string): Promise<ProjectTexts> {
  const [featuresText, logText] = await Promise.all([
    readTextOrNull(featuresPath),
    readTextOrNull(logPathFor(featuresPath)),
  ]);
  return { featuresText, logText };
}

export async function watchProjectFiles(options: WatchOptions): Promise<ProjectFileWatcher> {
  const { featuresPath, onChange, onError, logger } = options;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const stableMs = options.stableMs ?? DEFAULT_STABLE_MS;
  const maxWaitMs = options.maxStableWaitMs ?? DEFAULT_MAX_STABLE_WAIT_MS;
  const folder = dirname(featuresPath);
  const watchedNames = new Set([basename(featuresPath), LOG_FILE_NAME].map(toComparableName));
  const watchedPaths = [featuresPath, logPathFor(featuresPath)];

  await assertFolderExists(folder);

  const abort = new AbortController();
  const runningCycles = new Set<Promise<void>>();
  let debounceTimer: NodeJS.Timeout | undefined;
  let latestCycle = 0;
  let closePromise: Promise<void> | undefined;

  const isClosed = () => closePromise !== undefined;

  async function runCycle(cycle: number): Promise<void> {
    const isCurrent = () => cycle === latestCycle && !isClosed();
    try {
      const result = await waitUntilStable({
        readSignature: () => readSignature(watchedPaths),
        stableMs,
        maxWaitMs,
        isCurrent,
        signal: abort.signal,
      });
      if (result === 'timeout') {
        logger.warn({ featuresPath, maxWaitMs }, 'files kept changing, skipping this update');
        return;
      }
      if (result === 'superseded') return;
      const texts = await readProjectFiles(featuresPath);
      if (isCurrent()) await onChange(texts);
    } catch (error) {
      if (!isClosed()) onError(error);
    }
  }

  function scheduleCycle(): void {
    clearTimeout(debounceTimer);
    latestCycle += 1;
    const cycle = latestCycle;
    debounceTimer = setTimeout(() => {
      const running = runCycle(cycle).finally(() => runningCycles.delete(running));
      runningCycles.add(running);
    }, debounceMs);
  }

  const watcher = watch(folder, { ignoreInitial: true, depth: 0 });
  watcher.on('all', (eventName, changedPath) => {
    if (!RELEVANT_EVENTS.has(eventName)) return;
    if (!watchedNames.has(toComparableName(basename(changedPath)))) return;
    logger.debug({ eventName, changedPath }, 'watched file event');
    scheduleCycle();
  });

  await waitUntilReady(watcher, onError);

  return {
    close() {
      closePromise ??= closeEverything();
      return closePromise;
    },
  };

  async function closeEverything(): Promise<void> {
    clearTimeout(debounceTimer);
    abort.abort();
    await watcher.close();
    await Promise.all(runningCycles);
  }
}

// Resolves when chokidar has scanned the folder. After that, errors go to onError.
async function waitUntilReady(
  watcher: FSWatcher,
  onError: (error: unknown) => void,
): Promise<void> {
  let isReady = false;
  try {
    await new Promise<void>((resolve, reject) => {
      watcher.once('ready', () => {
        isReady = true;
        resolve();
      });
      watcher.on('error', (error) => {
        if (isReady) onError(error);
        else reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  } catch (error) {
    await watcher.close();
    throw error;
  }
}

async function assertFolderExists(folder: string): Promise<void> {
  try {
    const folderStats = await stat(folder);
    if (folderStats.isDirectory()) return;
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  throw new WatchFolderMissingError(folder);
}

async function readSignature(paths: readonly string[]): Promise<string> {
  const signatures = await Promise.all(paths.map(readFileSignature));
  return signatures.join('|');
}

async function readFileSignature(path: string): Promise<string> {
  try {
    const fileStats = await stat(path);
    return `${String(fileStats.size)}:${String(fileStats.mtimeMs)}`;
  } catch (error) {
    if (isMissingFile(error)) return MISSING_FILE_SIGNATURE;
    throw error;
  }
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function logPathFor(featuresPath: string): string {
  return join(dirname(featuresPath), LOG_FILE_NAME);
}

// Windows file names are not case sensitive.
function toComparableName(fileName: string): string {
  return fileName.toLowerCase();
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
