import type { FastifyBaseLogger } from 'fastify';
import { buildSnapshot, type ProjectSnapshot } from '@pm-tool/shared';
import { ProjectNotFoundError } from '../projects/projects.errors.js';
import type { Project } from '../projects/projects.schemas.js';
import type { ProjectStore } from '../projects/projects.store.js';
import { readProjectFiles } from './file-watcher.js';
import type { SnapshotHub, SnapshotListener, Subscription } from './snapshot.hub.js';

export interface SnapshotService {
  findProject(projectId: string): Promise<Project>;
  getSnapshot(projectId: string): Promise<ProjectSnapshot>;
  subscribe(project: Project, listener: SnapshotListener): Promise<Subscription>;
}

export function createSnapshotService(
  store: ProjectStore,
  hub: SnapshotHub,
  log: FastifyBaseLogger,
): SnapshotService {
  async function findProject(projectId: string): Promise<Project> {
    const projects = await store.list();
    const project = projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new ProjectNotFoundError(projectId);
    return project;
  }

  return {
    findProject,

    // While a project is being watched, the cached snapshot is what the stream sends too.
    async getSnapshot(projectId) {
      const project = await findProject(projectId);
      const snapshot =
        hub.currentSnapshot(projectId) ??
        buildSnapshot(await readProjectFiles(project.featuresPath));
      log.debug(
        {
          projectId,
          featuresFile: snapshot.featuresFile,
          logFile: snapshot.logFile,
          features: snapshot.features.features.length,
          warnings: snapshot.warnings.length,
        },
        'snapshot read',
      );
      return snapshot;
    },

    subscribe: (project, listener) => hub.subscribe(project, listener),
  };
}
