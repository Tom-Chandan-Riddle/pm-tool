import { buildSnapshot, type ProjectSnapshot } from '@pm-tool/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { LiveFeature } from '../src/features/live/LiveFeature';
import { FakeEventSource } from './fakeEventSource';
import { problem, stubProjectsApi, withQueryClient } from './fakeProjectsApi';

function featuresText(
  tickedTasks: number,
  totalTasks = 2,
  extraFeatureLines: string[] = [],
): string {
  const tasks = Array.from({ length: totalTasks }, (_, index) => {
    const mark = index < tickedTasks ? 'x' : ' ';
    return `- [${mark}] F01.${String(index + 1)} Task ${String(index + 1)}`;
  });
  return [
    '# FEATURES.md',
    'Base commit: abc1234 · Repo state: greenfield · Model: test',
    '## Solution outline',
    'Outline.',
    '## Assumptions',
    '| ID | Assumption | Reason | Approved |',
    '|---|---|---|---|',
    '| A1 | One | Because | 19 Oct |',
    '## Decisions',
    '| ID | Decision | Alternatives | Reason |',
    '|---|---|---|---|',
    '| D1 | One | None | Because |',
    '## Features',
    '### F01 Projects',
    'Priority: Must · Status: In Progress · Branch: feature/F01 · Estimate: 35 min',
    'Tasks:',
    ...tasks,
    ...extraFeatureLines,
    '## Change log',
    '| Time | Change | Source |',
    '|---|---|---|',
    '| 19 Oct | Created | /kickoff |',
  ].join('\n');
}

function snapshotOf(tickedTasks: number, totalTasks = 2): ProjectSnapshot {
  return buildSnapshot({ featuresText: featuresText(tickedTasks, totalTasks), logText: null });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

/** Answers the first-load request for a project's snapshot. */
function stubSnapshotFetch(snapshot: ProjectSnapshot = snapshotOf(1)) {
  const fetchStub = vi.fn(() => Promise.resolve(jsonResponse(snapshot)));
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

function onlyStream(): FakeEventSource {
  const [stream] = FakeEventSource.instances;
  if (!stream || FakeEventSource.instances.length !== 1) {
    throw new Error(`Expected one stream, got ${String(FakeEventSource.instances.length)}`);
  }
  return stream;
}

function renderLive(projectId: string | null) {
  return render(withQueryClient(<LiveFeature projectId={projectId} />));
}

beforeEach(() => {
  FakeEventSource.reset();
  vi.stubGlobal('EventSource', FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the live view of a project', () => {
  it('shows nothing and opens no stream when no project is selected', () => {
    stubSnapshotFetch();
    const { container } = renderLive(null);

    expect(container).toBeEmptyDOMElement();
    expect(FakeEventSource.instances).toEqual([]);
  });

  it('shows Connecting, then Live once the stream opens', async () => {
    stubSnapshotFetch();
    renderLive('p1');
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');

    onlyStream().open();

    expect(await screen.findByText('Live')).toBeInTheDocument();
  });

  it('shows a loading message until the first snapshot arrives', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    renderLive('p1');

    expect(screen.getByText('Loading snapshot…')).toBeInTheDocument();
    onlyStream().sendSnapshot(JSON.stringify(snapshotOf(1)));

    expect(await screen.findByText(/1 feature · 1 of 2 tasks done/)).toBeInTheDocument();
  });

  it('summarises the snapshot that loads first', async () => {
    stubSnapshotFetch(snapshotOf(1));
    renderLive('p1');

    expect(await screen.findByText('1 feature · 1 of 2 tasks done')).toBeInTheDocument();
  });

  it('shows a ticked task from a pushed update without a reload', async () => {
    const fetchStub = stubSnapshotFetch(snapshotOf(1));
    renderLive('p1');
    await screen.findByText('1 feature · 1 of 2 tasks done');

    onlyStream().sendSnapshot(JSON.stringify(snapshotOf(2)));

    expect(await screen.findByText('1 feature · 2 of 2 tasks done')).toBeInTheDocument();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('counts the warnings of a snapshot', async () => {
    const withWarning = buildSnapshot({
      featuresText: featuresText(1, 2, ['### Stray heading']),
      logText: null,
    });
    stubSnapshotFetch(withWarning);
    renderLive('p1');

    expect(await screen.findByText(/1 warning$/)).toBeInTheDocument();
  });

  it('shows a missing features file as its own state', async () => {
    stubSnapshotFetch(buildSnapshot({ featuresText: null, logText: null }));
    renderLive('p1');

    expect(await screen.findByText(/FEATURES.md was not found/)).toBeInTheDocument();
  });
});

describe('the connection state', () => {
  it('shows Reconnecting when the stream errors, then Live and fresh data after it returns', async () => {
    stubSnapshotFetch(snapshotOf(1));
    renderLive('p1');
    await screen.findByText('1 feature · 1 of 2 tasks done');
    const stream = onlyStream();
    stream.open();
    expect(await screen.findByText('Live')).toBeInTheDocument();

    stream.fail();
    expect(await screen.findByText('Reconnecting…')).toBeInTheDocument();

    stream.open();
    stream.sendSnapshot(JSON.stringify(snapshotOf(2)));

    expect(await screen.findByText('Live')).toBeInTheDocument();
    expect(await screen.findByText('1 feature · 2 of 2 tasks done')).toBeInTheDocument();
  });

  it('shows Offline when the browser gives up on the stream', async () => {
    stubSnapshotFetch();
    renderLive('p1');

    onlyStream().fail(true);

    expect(await screen.findByText('Offline')).toBeInTheDocument();
  });

  it('shows Unreadable, closes the stream and keeps the last good data for a bad update', async () => {
    stubSnapshotFetch(snapshotOf(1));
    renderLive('p1');
    await screen.findByText('1 feature · 1 of 2 tasks done');
    const stream = onlyStream();

    stream.sendSnapshot('{"featuresFile":"ok"}');

    expect(await screen.findByText('Live updates unreadable')).toBeInTheDocument();
    expect(stream.readyState).toBe(FakeEventSource.CLOSED);
    expect(screen.getByText('1 feature · 1 of 2 tasks done')).toBeInTheDocument();
  });

  it('treats an update that is not JSON as unreadable', async () => {
    stubSnapshotFetch();
    renderLive('p1');

    onlyStream().sendSnapshot('not json');

    expect(await screen.findByText('Live updates unreadable')).toBeInTheDocument();
  });
});

describe('loading failures', () => {
  it('shows the server problem with a Try again button that recovers', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    vi.stubGlobal('fetch', () => {
      attempts++;
      return Promise.resolve(
        attempts <= 2
          ? problem(500, { title: 'Internal Server Error', detail: 'The file could not be read' })
          : jsonResponse(snapshotOf(1)),
      );
    });
    renderLive('p1');

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'The file could not be read',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('1 feature · 1 of 2 tasks done')).toBeInTheDocument();
  });

  it('falls back to a status message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('oops', { status: 502 })));
    renderLive('p1');

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('status 502');
  });

  it('treats a snapshot of the wrong shape as a load failure', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ featuresFile: 'ok' })));
    renderLive('p1');

    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(
      'Could not load the snapshot',
    );
  });
});

describe('the stream lifetime', () => {
  it('closes the stream when the view goes away', () => {
    stubSnapshotFetch();
    const { unmount } = renderLive('p1');

    unmount();

    expect(FakeEventSource.openStreams).toEqual([]);
  });

  it('closes the old stream and starts a new one when another project is chosen', async () => {
    stubSnapshotFetch();
    const { rerender } = renderLive('p1');
    onlyStream().open();
    await screen.findByText('Live');

    rerender(withQueryClient(<LiveFeature projectId="p2" />));

    expect(FakeEventSource.instances.map((source) => source.url)).toEqual([
      '/projects/p1/events',
      '/projects/p2/events',
    ]);
    expect(FakeEventSource.openStreams.map((source) => source.url)).toEqual([
      '/projects/p2/events',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('Connecting');
  });

  it('stops the stream when the selection is cleared', () => {
    stubSnapshotFetch();
    const { rerender } = renderLive('p1');

    rerender(withQueryClient(<LiveFeature projectId={null} />));

    expect(FakeEventSource.openStreams).toEqual([]);
  });

  it('leaves exactly one open stream under StrictMode double effects', () => {
    stubSnapshotFetch();

    render(<StrictMode>{withQueryClient(<LiveFeature projectId="p1" />)}</StrictMode>);

    expect(FakeEventSource.openStreams).toHaveLength(1);
  });

  it('ignores an event that arrives after the stream was closed', async () => {
    stubSnapshotFetch(snapshotOf(1));
    const { rerender } = renderLive('p1');
    await screen.findByText('1 feature · 1 of 2 tasks done');
    const first = onlyStream();

    rerender(withQueryClient(<LiveFeature projectId={null} />));
    first.sendSnapshot(JSON.stringify(snapshotOf(2)));

    expect(screen.queryByText(/tasks done/)).not.toBeInTheDocument();
  });

  it('encodes a project id with special characters in the stream URL', () => {
    stubSnapshotFetch();

    renderLive('a b/c?d');

    expect(onlyStream().url).toBe('/projects/a%20b%2Fc%3Fd/events');
  });
});

describe('in the whole app', () => {
  const project = {
    id: 'p1',
    name: 'PM Tool',
    featuresPath: 'C:/work/pm-tool/FEATURES.md',
    fileStatus: 'ok',
  } as const;

  beforeEach(() => {
    localStorage.clear();
  });

  function stubApp() {
    stubProjectsApi([project], ({ url }) =>
      url === '/projects/p1/snapshot' ? jsonResponse(snapshotOf(1)) : undefined,
    );
  }

  it('opens a stream for the selected project only', async () => {
    const user = userEvent.setup();
    stubApp();
    render(withQueryClient(<App />));
    await screen.findByRole('combobox', { name: 'Project' });
    expect(FakeEventSource.instances).toEqual([]);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), 'p1');

    expect(await screen.findByText('1 feature · 1 of 2 tasks done')).toBeInTheDocument();
    expect(FakeEventSource.openStreams.map((source) => source.url)).toEqual([
      '/projects/p1/events',
    ]);
  });

  it('closes the stream when the project is deselected', async () => {
    const user = userEvent.setup();
    localStorage.setItem('pm-tool.selectedProjectId', 'p1');
    stubApp();
    render(withQueryClient(<App />));
    await screen.findByText('1 feature · 1 of 2 tasks done');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), '');

    expect(FakeEventSource.openStreams).toEqual([]);
  });
});
