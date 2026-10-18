import { projectSnapshotSchema, type ProjectSnapshot } from '@pm-tool/shared';

interface ProblemBody {
  readonly title?: string;
  readonly detail?: string;
}

function projectUrl(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function eventsUrl(projectId: string): string {
  return `${projectUrl(projectId)}/events`;
}

export async function fetchSnapshot(projectId: string): Promise<ProjectSnapshot> {
  const response = await fetch(`${projectUrl(projectId)}/snapshot`);
  if (!response.ok) {
    const problem = (await response.json().catch(() => ({}))) as ProblemBody;
    throw new Error(
      problem.detail ?? problem.title ?? `Request failed with status ${String(response.status)}`,
    );
  }
  return projectSnapshotSchema.parse(await response.json());
}

/** Reads the data of a `snapshot` event, or undefined when it is not a valid snapshot. */
export function parseSnapshotEvent(data: unknown): ProjectSnapshot | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    const result = projectSnapshotSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : undefined;
  } catch {
    // Text that is not JSON is handled the same as JSON of the wrong shape.
    return undefined;
  }
}
