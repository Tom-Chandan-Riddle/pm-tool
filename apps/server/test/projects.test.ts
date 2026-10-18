import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { capturingLogConfig, captureLogs, PINO_LEVEL, testConfig } from './helpers.js';

interface ProjectBody {
  readonly id: string;
  readonly name: string;
  readonly featuresPath: string;
  readonly fileStatus?: string;
}

const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff);

let workFolder: string;
let projectsFile: string;
let featuresPath: string;
const apps: FastifyInstance[] = [];

async function startApp(overrides: Parameters<typeof buildApp>[1] = {}, logging = false) {
  const base = logging ? capturingLogConfig : testConfig;
  const app = await buildApp({ ...base, PROJECTS_FILE: projectsFile }, overrides);
  apps.push(app);
  return app;
}

async function addProject(app: FastifyInstance, name: string, path: string) {
  return app.inject({ method: 'POST', url: '/projects', payload: { name, featuresPath: path } });
}

async function listProjects(app: FastifyInstance) {
  const response = await app.inject({ method: 'GET', url: '/projects' });
  return response.json<ProjectBody[]>();
}

beforeEach(async () => {
  workFolder = await mkdtemp(join(tmpdir(), 'pm-tool-projects-'));
  projectsFile = join(workFolder, 'projects.json');
  featuresPath = join(workFolder, 'FEATURES.md');
  await writeFile(featuresPath, '# FEATURES.md\n\n### F01 Projects\n');
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await rm(workFolder, { recursive: true, force: true });
});

describe('adding a project', () => {
  it('returns 201 and keeps the project after a restart', async () => {
    const app = await startApp();
    const response = await addProject(app, 'PM Tool', featuresPath);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'PM Tool', featuresPath });

    const restarted = await startApp();
    expect(await listProjects(restarted)).toEqual([
      { ...response.json<ProjectBody>(), fileStatus: 'ok' },
    ]);
  });

  it('rejects a path that does not exist with 422', async () => {
    const app = await startApp();
    const response = await addProject(app, 'Ghost', join(workFolder, 'missing.md'));
    expect(response.statusCode).toBe(422);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json<{ detail: string }>().detail).toContain('No file at');
  });

  it('rejects a folder with 422', async () => {
    const folder = join(workFolder, 'folder.md');
    await mkdir(folder);
    const response = await addProject(await startApp(), 'Folder', folder);
    expect(response.statusCode).toBe(422);
    expect(response.json<{ detail: string }>().detail).toContain('is a folder');
  });

  it('rejects a relative path with a field error', async () => {
    const response = await addProject(await startApp(), 'Relative', 'FEATURES.md');
    expect(response.statusCode).toBe(400);
    expect(response.json<{ errors: unknown[] }>().errors).toEqual([
      { field: 'featuresPath', message: 'Must be an absolute path' },
    ]);
  });

  it('rejects a readable file that is not markdown without reading it', async () => {
    const notes = join(workFolder, 'notes.txt');
    await writeFile(notes, '### F01 Looks like features');
    const response = await addProject(await startApp(), 'Text', notes);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ errors: unknown[] }>().errors).toEqual([
      { field: 'featuresPath', message: 'Must be a .md file' },
    ]);
  });

  it('accepts an upper-case .MD extension', async () => {
    const upper = join(workFolder, 'FEATURES.MD');
    await writeFile(upper, '### F01 Shouting\n');
    expect((await addProject(await startApp(), 'Upper', upper)).statusCode).toBe(201);
  });

  it('rejects a name or path over the length limit', async () => {
    const longPath = join(workFolder, `${'a'.repeat(1100)}.md`);
    const response = await addProject(await startApp(), 'n'.repeat(201), longPath);
    expect(response.statusCode).toBe(400);
    const fields = response.json<{ errors: { field: string }[] }>().errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'featuresPath']));
  });

  it('rejects a path containing a null byte with 422', async () => {
    const response = await addProject(await startApp(), 'Null', join(workFolder, 'a\0b.md'));
    expect(response.statusCode).toBe(422);
  });

  // chmod does not block reads on Windows, so this can only run elsewhere.
  it.skipIf(process.platform === 'win32')(
    'says permission was denied for a file the server cannot read',
    async () => {
      await chmod(featuresPath, 0o000);
      const response = await addProject(await startApp(), 'Locked', featuresPath);
      expect(response.statusCode).toBe(422);
      expect(response.json<{ detail: string }>().detail).toContain('No permission');
    },
  );

  it('rejects a file with no feature heading with 422', async () => {
    const notes = join(workFolder, 'notes.md');
    await writeFile(notes, '# Notes\n\nNothing here.\n');
    const response = await addProject(await startApp(), 'Notes', notes);
    expect(response.statusCode).toBe(422);
    expect(response.json<{ detail: string }>().detail).toContain('no "### F" feature heading');
  });

  it('rejects an empty name and an empty path with field errors', async () => {
    const response = await addProject(await startApp(), '  ', '');
    expect(response.statusCode).toBe(400);
    const fields = response.json<{ errors: { field: string }[] }>().errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'featuresPath']));
  });

  it('writes nothing when the path is rejected', async () => {
    await addProject(await startApp(), 'Ghost', join(workFolder, 'missing.md'));
    await expect(readFile(projectsFile, 'utf8')).rejects.toThrow();
  });

  it('keeps every project when two are added at once', async () => {
    const app = await startApp();
    await Promise.all([addProject(app, 'One', featuresPath), addProject(app, 'Two', featuresPath)]);
    expect(await listProjects(app)).toHaveLength(2);
  });
});

describe('editing a project', () => {
  it('renames a project and keeps its id', async () => {
    const app = await startApp();
    const created = (await addProject(app, 'Old', featuresPath)).json<ProjectBody>();
    const response = await app.inject({
      method: 'PUT',
      url: `/projects/${created.id}`,
      payload: { name: 'New', featuresPath },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: created.id, name: 'New', featuresPath });
    expect((await listProjects(app)).map((project) => project.name)).toEqual(['New']);
  });

  it('rejects a new path that is not a features file with 422', async () => {
    const app = await startApp();
    const created = (await addProject(app, 'Old', featuresPath)).json<ProjectBody>();
    const response = await app.inject({
      method: 'PUT',
      url: `/projects/${created.id}`,
      payload: { name: 'Old', featuresPath: join(workFolder, 'missing.md') },
    });
    expect(response.statusCode).toBe(422);
  });

  it('rejects a relative new path with 400', async () => {
    const app = await startApp();
    const created = (await addProject(app, 'Old', featuresPath)).json<ProjectBody>();
    const response = await app.inject({
      method: 'PUT',
      url: `/projects/${created.id}`,
      payload: { name: 'Old', featuresPath: 'FEATURES.md' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('allows a rename while the file is missing', async () => {
    const app = await startApp();
    const created = (await addProject(app, 'Old', featuresPath)).json<ProjectBody>();
    await rm(featuresPath);
    const response = await app.inject({
      method: 'PUT',
      url: `/projects/${created.id}`,
      payload: { name: 'Renamed', featuresPath },
    });
    expect(response.statusCode).toBe(200);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await (
      await startApp()
    ).inject({
      method: 'PUT',
      url: '/projects/nope',
      payload: { name: 'X', featuresPath },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('removing a project', () => {
  it('removes it and returns 204', async () => {
    const app = await startApp();
    const created = (await addProject(app, 'Gone', featuresPath)).json<ProjectBody>();
    const response = await app.inject({ method: 'DELETE', url: `/projects/${created.id}` });
    expect(response.statusCode).toBe(204);
    expect(await listProjects(app)).toEqual([]);
  });

  it('returns 404 for an unknown id', async () => {
    const response = await (await startApp()).inject({ method: 'DELETE', url: '/projects/nope' });
    expect(response.statusCode).toBe(404);
  });
});

describe('the projects file', () => {
  it('lists nothing when the file does not exist', async () => {
    expect(await listProjects(await startApp())).toEqual([]);
  });

  it('lists nothing when the file is empty', async () => {
    await writeFile(projectsFile, '');
    expect(await listProjects(await startApp())).toEqual([]);
  });

  it('loads a hand-edited file', async () => {
    await writeFile(
      projectsFile,
      JSON.stringify([{ id: 'hand', name: 'By hand', featuresPath }], null, 4),
    );
    expect(await listProjects(await startApp())).toEqual([
      { id: 'hand', name: 'By hand', featuresPath, fileStatus: 'ok' },
    ]);
  });

  it('logs an error, lists nothing and leaves a corrupt file untouched', async () => {
    await writeFile(projectsFile, '{ not json');
    const logs = captureLogs();
    const app = await startApp({ logDestination: logs.stream }, true);

    expect(await listProjects(app)).toEqual([]);
    expect(logs.entries().some((entry) => entry.level === PINO_LEVEL.error)).toBe(true);
    expect(await readFile(projectsFile, 'utf8')).toBe('{ not json');
  });

  it('keeps listing a hand-edited entry whose path is relative', async () => {
    const entry = { id: 'rel', name: 'Relative', featuresPath: 'FEATURES.md' };
    await writeFile(projectsFile, JSON.stringify([entry]));
    const listed = await listProjects(await startApp());
    expect(listed.map((project) => project.id)).toEqual(['rel']);
  });

  it('loads a file that starts with a byte order mark', async () => {
    const entry = { id: 'bom', name: 'Windows editor', featuresPath };
    await writeFile(projectsFile, `${BYTE_ORDER_MARK}${JSON.stringify([entry])}`);
    expect(await listProjects(await startApp())).toEqual([{ ...entry, fileStatus: 'ok' }]);
  });

  it('lists the valid entries and warns about an invalid one', async () => {
    const good = { id: 'good', name: 'Good', featuresPath };
    await writeFile(projectsFile, JSON.stringify([good, { name: 'No id', featuresPath }]));
    const logs = captureLogs();
    const app = await startApp({ logDestination: logs.stream }, true);

    expect(await listProjects(app)).toEqual([{ ...good, fileStatus: 'ok' }]);
    const warning = logs.entries().find((entry) => entry.msg === 'skipping invalid project');
    expect(warning).toMatchObject({ level: PINO_LEVEL.warn, index: 1 });
  });

  it.each([
    ['a trailing comma', '[{ "id": "a", "name": "A", "featuresPath": "x" },]'],
    ['an object instead of a list', '{ "projects": [] }'],
    ['an entry with no id', '[{ "name": "No id", "featuresPath": "x" }]'],
  ])('refuses to change a file with %s and leaves it untouched', async (_label, content) => {
    await writeFile(projectsFile, content);
    const app = await startApp();
    const payload = { name: 'Fresh', featuresPath };

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/projects', payload }),
      app.inject({ method: 'PUT', url: '/projects/a', payload }),
      app.inject({ method: 'DELETE', url: '/projects/a' }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([409, 409, 409]);
    expect(responses[0].headers['content-type']).toContain('application/problem+json');
    expect(await readFile(projectsFile, 'utf8')).toBe(content);
  });

  it('accepts changes again once the file is fixed by hand', async () => {
    await writeFile(projectsFile, '{ not json');
    const app = await startApp();
    expect((await addProject(app, 'Blocked', featuresPath)).statusCode).toBe(409);

    await writeFile(projectsFile, '[]');
    expect((await addProject(app, 'Fresh', featuresPath)).statusCode).toBe(201);
  });

  it('marks a project whose features file is gone as missing instead of failing', async () => {
    const app = await startApp();
    await addProject(app, 'Soon gone', featuresPath);
    await rm(featuresPath);
    const response = await app.inject({ method: 'GET', url: '/projects' });
    expect(response.statusCode).toBe(200);
    expect(response.json<ProjectBody[]>()[0]?.fileStatus).toBe('missing');
  });
});

describe('logging', () => {
  it('logs a rejected path at warn and a new project at info with its id', async () => {
    const logs = captureLogs();
    const app = await startApp({ logDestination: logs.stream }, true);
    await addProject(app, 'Ghost', join(workFolder, 'missing.md'));
    const created = (await addProject(app, 'Real', featuresPath)).json<ProjectBody>();

    const entries = logs.entries();
    expect(entries.some((entry) => entry.level === PINO_LEVEL.warn)).toBe(true);
    expect(entries.find((entry) => entry.msg === 'project added')).toMatchObject({
      projectId: created.id,
    });
  });
});
