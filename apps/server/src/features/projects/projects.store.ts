import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';
import { projectSchema, type Project } from './projects.schemas.js';

const projectListSchema = z.array(projectSchema);

export interface ProjectChange<T> {
  readonly projects: readonly Project[];
  readonly result: T;
}

export interface ProjectStore {
  list(): Promise<readonly Project[]>;
  /** Applies a change to the stored list. Calls run one at a time so edits never overwrite each other. */
  update<T>(change: (projects: readonly Project[]) => ProjectChange<T>): Promise<T>;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function createProjectStore(filePath: string, log: FastifyBaseLogger): ProjectStore {
  let queue: Promise<unknown> = Promise.resolve();

  // A1: a missing or empty file is an empty list. A12: a corrupt one is logged and left as it is
  // until the next successful write replaces it.
  async function read(): Promise<readonly Project[]> {
    let text: string;
    try {
      text = await readFile(filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
    if (text.trim() === '') return [];
    try {
      return projectListSchema.parse(JSON.parse(text));
    } catch (error) {
      log.error({ err: error, filePath }, 'projects file is corrupt, using an empty list');
      return [];
    }
  }

  // A2: the one file the server writes. Write then rename, so a crash never leaves half a file.
  async function write(projects: readonly Project[]): Promise<void> {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(projects, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
  }

  return {
    list: read,
    update(change) {
      const run = async () => {
        const { projects, result } = change(await read());
        await write(projects);
        return result;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
