import type { FastifyBaseLogger } from 'fastify';
import { buildSnapshot, type ProjectSnapshot } from '@pm-tool/shared';
import { ProjectNotFoundError } from '../projects/projects.errors.js';
import type { ProjectStore } from '../projects/projects.store.js';
import { readProjectFiles } from './file-watcher.js';

export interface SnapshotService {
  getSnapshot(projectId: string): Promise<ProjectSnapshot>;
}

export function createSnapshotService(
  store: ProjectStore,
  log: FastifyBaseLogger,
): SnapshotService {
  return {
    async getSnapshot(projectId) {
      const projects = await store.list();
      const project = projects.find((candidate) => candidate.id === projectId);
      if (!project) throw new ProjectNotFoundError(projectId);

      const snapshot = buildSnapshot(await readProjectFiles(project.featuresPath));
      log.debug(
        {
          projectId,
          featuresFile: snapshot.featuresFile,
          logFile: snapshot.logFile,
          features: snapshot.features.features.length,
          warnings: snapshot.warnings.length,
        },
        'snapshot built',
      );
      return snapshot;
    },
  };
}
