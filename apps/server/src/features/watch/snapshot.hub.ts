import type { FastifyBaseLogger } from 'fastify';
import { buildSnapshot, type ProjectSnapshot } from '@pm-tool/shared';
import type { Project } from '../projects/projects.schemas.js';
import {
  readProjectFiles,
  watchProjectFiles,
  WatchFolderMissingError,
  type ProjectFileWatcher,
} from './file-watcher.js';

export type SnapshotListener = (snapshot: ProjectSnapshot) => void;

export interface Subscription {
  readonly snapshot: ProjectSnapshot;
  /** False when the project's folder cannot be watched, so no updates will follow (A40). */
  readonly isWatched: boolean;
  unsubscribe(): Promise<void>;
}

export interface SnapshotHub {
  subscribe(project: Project, listener: SnapshotListener): Promise<Subscription>;
  /** The latest snapshot of a project that is being watched right now. */
  currentSnapshot(projectId: string): ProjectSnapshot | undefined;
  close(): Promise<void>;
}

interface ActiveWatch {
  readonly listeners: Set<SnapshotListener>;
  current(): ProjectSnapshot;
  close(): Promise<void>;
}

// A39: a project is watched while at least one stream is open for it.
export function createSnapshotHub(log: FastifyBaseLogger): SnapshotHub {
  const starting = new Map<string, Promise<ActiveWatch | undefined>>();
  const running = new Map<string, ActiveWatch>();

  async function startWatch(project: Project): Promise<ActiveWatch | undefined> {
    const listeners = new Set<SnapshotListener>();
    let snapshot: ProjectSnapshot | undefined;

    function publish(next: ProjectSnapshot): void {
      snapshot = next;
      log.info(
        {
          projectId: project.id,
          subscribers: listeners.size,
          features: next.features.features.length,
          warnings: next.warnings.length,
        },
        'snapshot published',
      );
      for (const listener of listeners) {
        try {
          listener(next);
        } catch (error) {
          log.warn({ projectId: project.id, err: error }, 'dropping a stream that failed');
          listeners.delete(listener);
        }
      }
    }

    let watcher: ProjectFileWatcher;
    try {
      watcher = await watchProjectFiles({
        featuresPath: project.featuresPath,
        logger: log,
        onChange: (texts) => {
          publish(buildSnapshot(texts, snapshot));
        },
        onError: (error) => {
          log.warn({ projectId: project.id, err: error }, 'watching a project failed');
        },
      });
    } catch (error) {
      if (!(error instanceof WatchFolderMissingError)) throw error;
      log.warn(
        { projectId: project.id, featuresPath: project.featuresPath },
        'cannot watch folder',
      );
      return undefined;
    }

    let initial: ProjectSnapshot;
    try {
      initial = buildSnapshot(await readProjectFiles(project.featuresPath));
    } catch (error) {
      await watcher.close();
      throw error;
    }
    // A change that arrived while the first read was running is newer, so it wins.
    snapshot ??= initial;
    log.info({ projectId: project.id, featuresPath: project.featuresPath }, 'watching project');
    return {
      listeners,
      current: () => snapshot ?? initial,
      close: () => watcher.close(),
    };
  }

  async function acquire(project: Project): Promise<ActiveWatch | undefined> {
    const existing = running.get(project.id);
    if (existing) return existing;
    let pending = starting.get(project.id);
    if (!pending) {
      pending = startWatch(project);
      starting.set(project.id, pending);
    }
    try {
      const watch = await pending;
      if (watch) running.set(project.id, watch);
      return watch;
    } finally {
      if (starting.get(project.id) === pending) starting.delete(project.id);
    }
  }

  async function release(projectId: string, watch: ActiveWatch): Promise<void> {
    if (watch.listeners.size > 0 || running.get(projectId) !== watch) return;
    running.delete(projectId);
    await watch.close();
    log.info({ projectId }, 'stopped watching project');
  }

  return {
    async subscribe(project, listener) {
      const watch = await acquire(project);
      if (!watch) {
        const snapshot = buildSnapshot(await readProjectFiles(project.featuresPath));
        return { snapshot, isWatched: false, unsubscribe: () => Promise.resolve() };
      }
      watch.listeners.add(listener);
      return {
        snapshot: watch.current(),
        isWatched: true,
        async unsubscribe() {
          if (!watch.listeners.delete(listener)) return;
          await release(project.id, watch);
        },
      };
    },

    currentSnapshot: (projectId) => running.get(projectId)?.current(),

    async close() {
      const watches = [...running.entries()];
      running.clear();
      await Promise.all(
        watches.map(async ([projectId, watch]) => {
          watch.listeners.clear();
          await watch.close();
          log.info({ projectId }, 'stopped watching project');
        }),
      );
    },
  };
}
