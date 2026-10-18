import { randomUUID } from 'node:crypto';
import { access, constants, readFile, stat } from 'node:fs/promises';
import type { FastifyBaseLogger } from 'fastify';
import { InvalidProjectFileError, ProjectNotFoundError } from './projects.errors.js';
import {
  FILE_STATUS,
  type Project,
  type ProjectInput,
  type ProjectView,
} from './projects.schemas.js';
import type { ProjectStore } from './projects.store.js';

const FEATURE_HEADING = /^### F/m;

export interface ProjectService {
  list(): Promise<ProjectView[]>;
  add(input: ProjectInput): Promise<Project>;
  edit(id: string, input: ProjectInput): Promise<Project>;
  remove(id: string): Promise<void>;
}

function describeUnreadable(featuresPath: string, code: unknown): string {
  switch (code) {
    case 'ENOENT':
      return `No file at ${featuresPath}`;
    case 'EACCES':
    case 'EPERM':
      return `No permission to read ${featuresPath}`;
    case 'EISDIR':
      return `${featuresPath} is a folder, not a file`;
    default:
      return `Cannot read ${featuresPath}`;
  }
}

// A10, A18: a readable file with at least one "### F" heading is accepted.
async function assertIsFeaturesFile(featuresPath: string, log: FastifyBaseLogger): Promise<void> {
  let text: string;
  try {
    text = await readFile(featuresPath, 'utf8');
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    log.warn({ featuresPath, code }, 'features file cannot be read');
    throw new InvalidProjectFileError(describeUnreadable(featuresPath, code));
  }
  if (!FEATURE_HEADING.test(text)) {
    throw new InvalidProjectFileError(`${featuresPath} has no "### F" feature heading`);
  }
}

// A11: the list reports a missing features file as a state, not an error.
async function fileStatusOf(featuresPath: string): Promise<ProjectView['fileStatus']> {
  try {
    if (!(await stat(featuresPath)).isFile()) return FILE_STATUS.missing;
    await access(featuresPath, constants.R_OK);
    return FILE_STATUS.ok;
  } catch {
    return FILE_STATUS.missing;
  }
}

function withProject(projects: readonly Project[], id: string): readonly Project[] {
  if (!projects.some((project) => project.id === id)) throw new ProjectNotFoundError(id);
  return projects;
}

export function createProjectService(store: ProjectStore, log: FastifyBaseLogger): ProjectService {
  return {
    async list() {
      const projects = await store.list();
      return Promise.all(
        projects.map(async (project) => ({
          ...project,
          fileStatus: await fileStatusOf(project.featuresPath),
        })),
      );
    },

    async add(input) {
      await assertIsFeaturesFile(input.featuresPath, log);
      const project: Project = { id: randomUUID(), ...input };
      await store.update((projects) => ({ projects: [...projects, project], result: undefined }));
      log.info({ projectId: project.id }, 'project added');
      return project;
    },

    async edit(id, input) {
      const existing = (await store.listForChange()).find((project) => project.id === id);
      if (!existing) throw new ProjectNotFoundError(id);
      // A14: only a changed path is checked again, so a rename works while the file is missing.
      if (existing.featuresPath !== input.featuresPath) {
        await assertIsFeaturesFile(input.featuresPath, log);
      }
      const updated: Project = { id, ...input };
      await store.update((projects) => ({
        projects: withProject(projects, id).map((project) =>
          project.id === id ? updated : project,
        ),
        result: undefined,
      }));
      log.info({ projectId: id }, 'project edited');
      return updated;
    },

    async remove(id) {
      await store.update((projects) => ({
        projects: withProject(projects, id).filter((project) => project.id !== id),
        result: undefined,
      }));
      log.info({ projectId: id }, 'project removed');
    },
  };
}
