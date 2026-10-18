import { appendFile, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { ProjectSnapshot } from '@pm-tool/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { capturingLogConfig, captureLogs } from './helpers.js';

const FEATURES_TEXT = [
  '# FEATURES.md',
  '',
  '## Features',
  '',
  '### F01 Projects',
  'Priority: Must · Status: In Progress · Branch: feature/F01 · Estimate: 35 min',
  '',
  'Tasks:',
  '- [x] F01.1 Build it',
  '- [ ] F01.2 Test it',
].join('\n');

const LOG_TEXT = ['## Log', '09:00 · START · — · Begin'].join('\n');

const WAIT_TIMEOUT_MS = 6000;
const QUIET_PERIOD_MS = 1200;
const UNDER_ONE_SECOND_MS = 1000;
const CLOSE_TIME_LIMIT_MS = 3000;

interface StreamClient {
  readonly status: number;
  readonly headers: Headers;
  readonly snapshots: ProjectSnapshot[];
  readonly retryMs: () => number | undefined;
  readonly isEnded: () => boolean;
  readonly close: () => void;
}

let workFolder: string;
let projectsFile: string;
let featuresPath: string;
let logPath: string;
let logs: ReturnType<typeof captureLogs>;
let app: FastifyInstance;
let baseUrl: string;
const clients: StreamClient[] = [];

beforeEach(async () => {
  workFolder = await mkdtemp(join(tmpdir(), 'pm-tool-events-'));
  projectsFile = join(workFolder, 'projects.json');
  featuresPath = join(workFolder, 'FEATURES.md');
  logPath = join(workFolder, 'PROCESS-LOG.md');
  await writeFile(featuresPath, FEATURES_TEXT);
  await writeFile(logPath, LOG_TEXT);
  logs = captureLogs();
  app = await buildApp(
    { ...capturingLogConfig, PROJECTS_FILE: projectsFile },
    { logDestination: logs.stream },
  );
  baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await app.close();
  await rm(workFolder, { recursive: true, force: true });
});

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + WAIT_TIMEOUT_MS;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('Timed out waiting');
    await sleep(10);
  }
}

async function addProject(path = featuresPath): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/projects',
    payload: { name: 'Sample', featuresPath: path },
  });
  return response.json<{ id: string }>().id;
}

async function openStream(projectId: string): Promise<StreamClient> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/projects/${projectId}/events`, {
    signal: controller.signal,
  });
  const snapshots: ProjectSnapshot[] = [];
  let retryMs: number | undefined;
  let ended = false;

  function handleBlock(block: string): void {
    for (const line of block.split('\n')) {
      if (line.startsWith('retry: ')) retryMs = Number(line.slice('retry: '.length));
      if (line.startsWith('data: ')) {
        snapshots.push(JSON.parse(line.slice('data: '.length)) as ProjectSnapshot);
      }
    }
  }

  async function readUntilEnd(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          handleBlock(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // The test aborted the request, which is how a browser tab going away looks.
    }
  }

  const client: StreamClient = {
    status: response.status,
    headers: response.headers,
    snapshots,
    retryMs: () => retryMs,
    isEnded: () => ended,
    close: () => {
      controller.abort();
    },
  };
  clients.push(client);
  if (response.body) {
    void readUntilEnd(response.body).finally(() => {
      ended = true;
    });
  }
  return client;
}

function logMessages(message: string) {
  return logs.entries().filter((entry) => entry.msg === message);
}

function ticked(snapshot: ProjectSnapshot | undefined): boolean[] {
  return snapshot?.features.features[0]?.tasks.map((task) => task.ticked) ?? [];
}

describe('GET /projects/:id/events', () => {
  it('answers an unknown project with a 404 problem and opens no stream', async () => {
    const response = await fetch(`${baseUrl}/projects/nope/events`);

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(logMessages('stream opened')).toEqual([]);
  });

  it('opens an event stream that starts with the current snapshot', async () => {
    const stream = await openStream(await addProject());

    await waitFor(() => stream.snapshots.length > 0);

    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    expect(stream.headers.get('x-correlation-id')).toBeTruthy();
    expect(stream.retryMs()).toBe(2000);
    expect(stream.snapshots[0]).toMatchObject({ featuresFile: 'ok', logFile: 'ok' });
    expect(ticked(stream.snapshots[0])).toEqual([true, false]);
  });

  it('pushes a ticked task in under a second with the default timings', async () => {
    const stream = await openStream(await addProject());
    await waitFor(() => stream.snapshots.length === 1);

    const startedAt = performance.now();
    await writeFile(featuresPath, FEATURES_TEXT.replace('- [ ] F01.2', '- [x] F01.2'));
    await waitFor(() => stream.snapshots.length === 2);

    expect(performance.now() - startedAt).toBeLessThan(UNDER_ONE_SECOND_MS);
    expect(ticked(stream.snapshots[1])).toEqual([true, true]);
  });

  it('pushes a snapshot when PROCESS-LOG.md changes', async () => {
    const stream = await openStream(await addProject());
    await waitFor(() => stream.snapshots.length === 1);

    await appendFile(logPath, '\n09:10 · TASK · F01.1 · Built it');
    await waitFor(() => stream.snapshots.length === 2);

    expect(stream.snapshots[1]?.events.map((event) => event.type)).toEqual(['START', 'TASK']);
  });

  it('turns a burst of writes into one push', async () => {
    const stream = await openStream(await addProject());
    await waitFor(() => stream.snapshots.length === 1);

    for (let save = 1; save <= 8; save++) {
      await writeFile(
        featuresPath,
        `${FEATURES_TEXT}\n- [ ] F01.${String(save + 2)} Save ${String(save)}`,
      );
    }
    await waitFor(() => stream.snapshots.length >= 2);
    await sleep(QUIET_PERIOD_MS);

    expect(stream.snapshots).toHaveLength(2);
    expect(stream.snapshots[1]?.features.features[0]?.tasks.at(-1)?.text).toBe('Save 8');
  });

  it('never pushes a half-written file', async () => {
    const stream = await openStream(await addProject());
    await waitFor(() => stream.snapshots.length === 1);

    for (let line = 3; line <= 6; line++) {
      await appendFile(featuresPath, `\n- [ ] F01.${String(line)} Added line ${String(line)}`);
      await sleep(120);
    }
    await waitFor(() => stream.snapshots.length >= 2);
    await sleep(QUIET_PERIOD_MS);

    expect(stream.snapshots.slice(1).map((snapshot) => ticked(snapshot).length)).toEqual([6]);
  });

  it('keeps the last good snapshot with a warning when the file is emptied, then recovers', async () => {
    const projectId = await addProject();
    const stream = await openStream(projectId);
    await waitFor(() => stream.snapshots.length === 1);

    await writeFile(featuresPath, '');
    await waitFor(() => stream.snapshots.length === 2);

    const kept = stream.snapshots[1];
    expect(kept?.features).toEqual(stream.snapshots[0]?.features);
    expect(kept?.warnings).toContainEqual({
      section: 'file',
      line: 1,
      message: 'The features file has no features, showing the last good version',
    });
    const read = await app.inject({ method: 'GET', url: `/projects/${projectId}/snapshot` });
    expect(read.json<ProjectSnapshot>()).toEqual(kept);

    await writeFile(featuresPath, FEATURES_TEXT.replace('- [ ] F01.2', '- [x] F01.2'));
    await waitFor(() => stream.snapshots.length === 3);

    expect(ticked(stream.snapshots[2])).toEqual([true, true]);
    expect(stream.snapshots[2]?.warnings.some((warning) => warning.section === 'file')).toBe(false);
  });

  it('shows a deleted file as missing and continues after it is recreated', async () => {
    const stream = await openStream(await addProject());
    await waitFor(() => stream.snapshots.length === 1);

    await unlink(featuresPath);
    await waitFor(() => stream.snapshots.at(-1)?.featuresFile === 'missing');
    await writeFile(featuresPath, FEATURES_TEXT);
    await waitFor(() => stream.snapshots.at(-1)?.featuresFile === 'ok');

    expect(stream.snapshots.at(-1)?.features.features).toHaveLength(1);
  });

  it('treats a missing PROCESS-LOG.md as a state, not an error', async () => {
    await unlink(logPath);

    const stream = await openStream(await addProject());
    await waitFor(() => stream.snapshots.length === 1);

    expect(stream.snapshots[0]).toMatchObject({ logFile: 'missing', events: [] });
    expect(logs.entries().filter((entry) => entry.level >= 50)).toEqual([]);
  });

  it('ends the stream after the missing snapshot when the folder does not exist (A40)', async () => {
    const goneFolder = join(workFolder, 'gone');
    await mkdir(goneFolder);
    await writeFile(join(goneFolder, 'FEATURES.md'), FEATURES_TEXT);
    const projectId = await addProject(join(goneFolder, 'FEATURES.md'));
    await rm(goneFolder, { recursive: true });

    const stream = await openStream(projectId);
    await waitFor(() => stream.isEnded());

    expect(stream.snapshots).toHaveLength(1);
    expect(stream.snapshots[0]).toMatchObject({ featuresFile: 'missing', logFile: 'missing' });
    expect(logMessages('cannot watch folder')).toHaveLength(1);
    expect(logMessages('watching project')).toEqual([]);
  });
});

describe('watcher lifetime (A39)', () => {
  it('shares one watcher between streams and stops it with the last one', async () => {
    const projectId = await addProject();
    const first = await openStream(projectId);
    const second = await openStream(projectId);
    await waitFor(() => first.snapshots.length === 1 && second.snapshots.length === 1);

    await writeFile(featuresPath, FEATURES_TEXT.replace('- [ ] F01.2', '- [x] F01.2'));
    await waitFor(() => first.snapshots.length === 2 && second.snapshots.length === 2);
    expect(logMessages('watching project')).toHaveLength(1);

    first.close();
    await waitFor(() => logMessages('stream closed').length === 1);
    expect(logMessages('stopped watching project')).toEqual([]);

    second.close();
    await waitFor(() => logMessages('stopped watching project').length === 1);
  });

  it('starts a fresh watcher when a stream opens after the last one closed', async () => {
    const projectId = await addProject();
    const first = await openStream(projectId);
    await waitFor(() => first.snapshots.length === 1);
    first.close();
    await waitFor(() => logMessages('stopped watching project').length === 1);

    const second = await openStream(projectId);
    await waitFor(() => second.snapshots.length === 1);
    await writeFile(featuresPath, FEATURES_TEXT.replace('- [ ] F01.2', '- [x] F01.2'));
    await waitFor(() => second.snapshots.length === 2);

    expect(logMessages('watching project')).toHaveLength(2);
  });

  it('stops the previous project watcher when the client switches projects', async () => {
    const otherFolder = join(workFolder, 'other');
    await mkdir(otherFolder);
    const otherFeatures = join(otherFolder, 'FEATURES.md');
    await writeFile(otherFeatures, FEATURES_TEXT);
    const firstId = await addProject();
    const secondId = await addProject(otherFeatures);
    const first = await openStream(firstId);
    const second = await openStream(secondId);
    await waitFor(() => first.snapshots.length === 1 && second.snapshots.length === 1);

    first.close();
    await waitFor(() => logMessages('stopped watching project').length === 1);
    await writeFile(otherFeatures, FEATURES_TEXT.replace('- [ ] F01.2', '- [x] F01.2'));
    await waitFor(() => second.snapshots.length === 2);

    expect(logMessages('stopped watching project')[0]).toMatchObject({ projectId: firstId });
    expect(ticked(second.snapshots[1])).toEqual([true, true]);
  });

  it('ends open streams and stops every watcher when the app closes', async () => {
    const stream = await openStream(await addProject());
    await waitFor(() => stream.snapshots.length === 1);

    const startedAt = performance.now();
    await app.close();

    expect(performance.now() - startedAt).toBeLessThan(CLOSE_TIME_LIMIT_MS);
    await waitFor(() => stream.isEnded());
    expect(logMessages('stopped watching project')).toHaveLength(1);
  });
});
