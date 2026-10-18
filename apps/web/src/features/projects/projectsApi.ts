import type { FieldError, Project, ProjectInput, ProjectView } from './projects.types';

const PROJECTS_URL = '/projects';

/** A failed API call. Carries the problem+json detail and field errors when the server sent them. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: readonly FieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ProblemBody {
  readonly title?: string;
  readonly detail?: string;
  readonly errors?: readonly FieldError[];
}

async function toApiError(response: Response): Promise<ApiError> {
  const problem = (await response.json().catch(() => ({}))) as ProblemBody;
  const message =
    problem.detail ?? problem.title ?? `Request failed with status ${String(response.status)}`;
  return new ApiError(response.status, message, problem.errors ?? []);
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) throw await toApiError(response);
  return response;
}

function jsonBody(method: 'POST' | 'PUT', input: ProjectInput): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) };
}

export async function listProjects(): Promise<ProjectView[]> {
  const response = await request(PROJECTS_URL);
  return (await response.json()) as ProjectView[];
}

export async function addProject(input: ProjectInput): Promise<Project> {
  const response = await request(PROJECTS_URL, jsonBody('POST', input));
  return (await response.json()) as Project;
}

export async function editProject(id: string, input: ProjectInput): Promise<Project> {
  const response = await request(`${PROJECTS_URL}/${id}`, jsonBody('PUT', input));
  return (await response.json()) as Project;
}

export async function removeProject(id: string): Promise<void> {
  await request(`${PROJECTS_URL}/${id}`, { method: 'DELETE' });
}
