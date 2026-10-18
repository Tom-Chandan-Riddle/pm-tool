import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { FastifyBaseLogger } from 'fastify';
import { ProjectsFileUnreadableError } from './projects.errors.js';
import { projectSchema, type Project } from './projects.schemas.js';

export interface ProjectChange<T> {
  readonly projects: readonly Project[];
  readonly result: T;
}

export interface ProjectStore {
  /** Whatever can be read. Entries that cannot be understood are left out. */
  list(): Promise<readonly Project[]>;
  /** Like list, but throws when the file has content that a later write would lose. */
  listForChange(): Promise<readonly Project[]>;
  /** Applies a change to the stored list. Calls run one at a time so edits never overwrite each other. */
  update<T>(change: (projects: readonly Project[]) => ProjectChange<T>): Promise<T>;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

interface StoredProjects {
  readonly projects: readonly Project[];
  /** False when the file could not be fully understood, so writing would lose data. */
  readonly isIntact: boolean;
}

const INTACT_EMPTY: StoredProjects = { projects: [], isIntact: true };

export function createProjectStore(filePath: string, log: FastifyBaseLogger): ProjectStore {
  let queue: Promise<unknown> = Promise.resolve();
  // The web refetches often, so a bad file is logged once per distinct content, not once per read.
  let reportedContent: string | null = null;

  function reportOnce(content: string, logProblem: () => void): void {
    if (content === reportedContent) return;
    reportedContent = content;
    logProblem();
  }

  function unreadable(content: string, logProblem: () => void): StoredProjects {
    reportOnce(content, logProblem);
    return { projects: [], isIntact: false };
  }

  // A1: a missing or empty file is an empty list. A17: anything the server cannot fully read is
  // reported, and update() refuses to write over it.
  async function read(): Promise<StoredProjects> {
    let text: string;
    try {
      text = await readFile(filePath, 'utf8');
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      reportedContent = null;
      return INTACT_EMPTY;
    }
    const content = text.replace(BYTE_ORDER_MARK, '').trim();
    if (content === '') {
      reportedContent = null;
      return INTACT_EMPTY;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      return unreadable(content, () => {
        log.error({ err: error, filePath }, 'projects file is not valid JSON');
      });
    }
    if (!Array.isArray(parsed)) {
      return unreadable(content, () => {
        log.error({ filePath }, 'projects file is not a list');
      });
    }

    const projects: Project[] = [];
    const skipped: { index: number; reason: string }[] = [];
    parsed.forEach((entry: unknown, index) => {
      const result = projectSchema.safeParse(entry);
      if (result.success) projects.push(result.data);
      else skipped.push({ index, reason: result.error.message });
    });
    if (skipped.length === 0) {
      reportedContent = null;
      return { projects, isIntact: true };
    }
    reportOnce(content, () => {
      for (const { index, reason } of skipped) {
        log.warn({ filePath, index, reason }, 'skipping invalid project');
      }
    });
    return { projects, isIntact: false };
  }

  // A2: the one file the server writes. Write then rename, so a crash never leaves half a file.
  async function write(projects: readonly Project[]): Promise<void> {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(
        temporaryPath,
        `${JSON.stringify(projects, null, 2)}
`,
        'utf8',
      );
      await rename(temporaryPath, filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch((cleanupError: unknown) => {
        log.warn({ err: cleanupError, temporaryPath }, 'could not remove temporary file');
      });
      throw error;
    }
  }

  return {
    async list() {
      return (await read()).projects;
    },
    async listForChange() {
      const stored = await read();
      if (!stored.isIntact) throw new ProjectsFileUnreadableError();
      return stored.projects;
    },
    update(change) {
      const run = async () => {
        const stored = await read();
        if (!stored.isIntact) throw new ProjectsFileUnreadableError();
        const { projects, result } = change(stored.projects);
        await write(projects);
        return result;
      };
      const next = queue.then(run, run);
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
