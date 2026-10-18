import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectSnapshot } from '@pm-tool/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { testConfig } from './helpers.js';

const FEATURES_TEXT = [
  '# FEATURES.md',
  '',
  '## Features',
  '',
  '### F01 Projects',
  'Priority: Must · Status: In Progress · Branch: feature/F01 · Estimate: 35 min',
  '',
  'Acceptance criteria:',
  '- [x] It lists',
  '',
  'Tasks:',
  '- [x] F01.1 Build it',
  '- [ ] F01.2 Test it',
].join('\n');

const LOG_TEXT = [
  '# PROCESS-LOG.md',
  '',
  '## Log',
  '09:00 · START · — · Begin',
  '09:10 · TASK · F01.1 · Built it',
].join('\n');

let workFolder: string;
let projectsFile: string;
let featuresPath: string;
let logPath: string;
const apps: FastifyInstance[] = [];

beforeEach(async () => {
  workFolder = await mkdtemp(join(tmpdir(), 'pm-tool-snapshot-'));
  projectsFile = join(workFolder, 'projects.json');
  featuresPath = join(workFolder, 'FEATURES.md');
  logPath = join(workFolder, 'PROCESS-LOG.md');
  await writeFile(featuresPath, FEATURES_TEXT);
  await writeFile(logPath, LOG_TEXT);
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await rm(workFolder, { recursive: true, force: true });
});

async function startApp(): Promise<FastifyInstance> {
  const app = await buildApp({ ...testConfig, PROJECTS_FILE: projectsFile });
  apps.push(app);
  return app;
}

async function addProject(app: FastifyInstance, path = featuresPath): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/projects',
    payload: { name: 'Sample', featuresPath: path },
  });
  return response.json<{ id: string }>().id;
}

async function getSnapshot(app: FastifyInstance, id: string) {
  return app.inject({ method: 'GET', url: `/projects/${id}/snapshot` });
}

describe('GET /projects/:id/snapshot', () => {
  it('returns 404 problem+json with the correlation ID for an unknown project', async () => {
    const app = await startApp();

    const response = await app.inject({
      method: 'GET',
      url: '/projects/nope/snapshot',
      headers: { 'x-correlation-id': 'trace-42' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 404, correlationId: 'trace-42' });
  });

  it('returns the parsed features and log events of a project', async () => {
    const app = await startApp();
    const id = await addProject(app);

    const response = await getSnapshot(app, id);
    const snapshot = response.json<ProjectSnapshot>();

    expect(response.statusCode).toBe(200);
    expect(snapshot.featuresFile).toBe('ok');
    expect(snapshot.logFile).toBe('ok');
    expect(snapshot.features.features).toHaveLength(1);
    expect(snapshot.features.features[0]).toMatchObject({
      id: 'F01',
      status: 'In Progress',
      estimateMinutes: 35,
    });
    expect(snapshot.features.features[0]?.tasks.map((task) => task.ticked)).toEqual([true, false]);
    expect(snapshot.events.map((event) => event.type)).toEqual(['START', 'TASK']);
  });

  it('reports a missing features file as a state, not an error', async () => {
    const app = await startApp();
    const id = await addProject(app);
    await rm(featuresPath);

    const response = await getSnapshot(app, id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      featuresFile: 'missing',
      features: { features: [] },
      logFile: 'ok',
    });
  });

  it('reports a project whose folder no longer exists as missing', async () => {
    const app = await startApp();
    const gone = join(workFolder, 'gone');
    await mkdir(gone);
    await writeFile(join(gone, 'FEATURES.md'), FEATURES_TEXT);
    const id = await addProject(app, join(gone, 'FEATURES.md'));
    await rm(gone, { recursive: true });

    const response = await getSnapshot(app, id);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ featuresFile: 'missing', logFile: 'missing' });
  });

  it('treats a missing PROCESS-LOG.md as missing with no events and no warning', async () => {
    const app = await startApp();
    const id = await addProject(app);
    await rm(logPath);

    const snapshot = (await getSnapshot(app, id)).json<ProjectSnapshot>();

    expect(snapshot.logFile).toBe('missing');
    expect(snapshot.events).toEqual([]);
    expect(snapshot.warnings.some((warning) => warning.section === 'log')).toBe(false);
  });

  it('includes parse warnings and still returns the rest', async () => {
    const app = await startApp();
    const id = await addProject(app);
    await writeFile(logPath, `${LOG_TEXT}\n09:20 · NOTE · F01 · Unknown type`);

    const snapshot = (await getSnapshot(app, id)).json<ProjectSnapshot>();

    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.warnings).toContainEqual({
      section: 'log',
      line: 6,
      message: 'Unknown entry type "NOTE"',
    });
  });

  it('shows a change to the files on the next request', async () => {
    const app = await startApp();
    const id = await addProject(app);
    await getSnapshot(app, id);

    await writeFile(featuresPath, FEATURES_TEXT.replace('- [ ] F01.2', '- [x] F01.2'));
    const snapshot = (await getSnapshot(app, id)).json<ProjectSnapshot>();

    expect(snapshot.features.features[0]?.tasks.map((task) => task.ticked)).toEqual([true, true]);
  });

  it('parses a file with Windows line endings and a byte order mark', async () => {
    const app = await startApp();
    const id = await addProject(app);
    await writeFile(
      featuresPath,
      String.fromCodePoint(0xfeff) + FEATURES_TEXT.replaceAll('\n', '\r\n'),
    );

    const snapshot = (await getSnapshot(app, id)).json<ProjectSnapshot>();

    expect(snapshot.features.features[0]?.name).toBe('Projects');
    expect(snapshot.warnings.filter((warning) => warning.section === 'features')).toEqual([]);
  });

  it('answers a features path that became a folder with a 500 problem and no stack trace', async () => {
    const app = await startApp();
    const id = await addProject(app);
    await rm(featuresPath);
    await mkdir(featuresPath);

    const response = await getSnapshot(app, id);

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).not.toContain('EISDIR');
    expect(response.body).not.toContain('at ');
  });
});
