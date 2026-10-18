import { QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { vi } from 'vitest';
import { createQueryClient } from '../src/shared/queryClient';

interface FakeProject {
  id: string;
  name: string;
  featuresPath: string;
  fileStatus: 'ok' | 'missing';
}

type Handler = (request: { method: string; url: string; body: unknown }) => Response | undefined;

export function problem(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ status, ...body }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/**
 * Stands in for the server at the network boundary. Keeps projects in memory, and a test can
 * override any request with `handler` to simulate a failure.
 */
export function stubProjectsApi(initial: FakeProject[], handler: Handler = () => undefined) {
  const projects = [...initial];
  let nextId = 1;
  const fetchStub = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const override = handler({ method, url, body });
    if (override) return Promise.resolve(override);

    const id = url.split('/')[2];
    const input_ = body as { name: string; featuresPath: string } | undefined;
    if (method === 'GET') return Promise.resolve(json(projects));
    if (method === 'POST' && input_) {
      const created: FakeProject = { id: `new-${String(nextId++)}`, ...input_, fileStatus: 'ok' };
      projects.push(created);
      return Promise.resolve(json(created, 201));
    }
    const index = projects.findIndex((project) => project.id === id);
    const existing = projects[index];
    if (!existing) return Promise.resolve(problem(404, { title: 'Project not found' }));
    if (method === 'PUT' && input_) {
      const updated: FakeProject = { ...existing, ...input_ };
      projects[index] = updated;
      return Promise.resolve(json(updated));
    }
    projects.splice(index, 1);
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

export function withQueryClient(children: ReactNode) {
  return createElement(QueryClientProvider, { client: createQueryClient() }, children);
}
