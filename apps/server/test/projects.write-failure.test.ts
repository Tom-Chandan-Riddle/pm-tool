import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { capturingLogConfig, captureLogs, PINO_LEVEL } from './helpers.js';

// A write can only fail after the temporary file exists if the rename fails, and that cannot be
// provoked on a real disk portably. Everything else in the store runs for real.
const renameFailure = vi.hoisted(() => ({ shouldFail: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: (...args: Parameters<typeof actual.rename>) =>
      renameFailure.shouldFail
        ? Promise.reject(new Error('rename failed'))
        : actual.rename(...args),
  };
});

let workFolder: string;
let projectsFile: string;
let featuresPath: string;
let app: FastifyInstance;

beforeEach(async () => {
  workFolder = await mkdtemp(join(tmpdir(), 'pm-tool-write-failure-'));
  projectsFile = join(workFolder, 'projects.json');
  featuresPath = join(workFolder, 'FEATURES.md');
  await writeFile(featuresPath, '### F01 Projects\n');
  renameFailure.shouldFail = false;
});

afterEach(async () => {
  renameFailure.shouldFail = false;
  await app.close();
  await rm(workFolder, { recursive: true, force: true });
});

describe('a write that fails', () => {
  it('answers 500, removes the temporary file and keeps the existing projects', async () => {
    const existing = JSON.stringify([{ id: 'kept', name: 'Kept', featuresPath }]);
    await writeFile(projectsFile, existing);
    const logs = captureLogs();
    app = await buildApp(
      { ...capturingLogConfig, PROJECTS_FILE: projectsFile },
      { logDestination: logs.stream },
    );

    renameFailure.shouldFail = true;
    const response = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { name: 'Doomed', featuresPath },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(await readFile(projectsFile, 'utf8')).toBe(existing);
    expect((await readdir(workFolder)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    const errors = logs.entries().filter((entry) => entry.level === PINO_LEVEL.error);
    expect(errors).toHaveLength(1);
  });
});
