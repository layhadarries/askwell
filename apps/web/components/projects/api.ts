import {
  apiErrorSchema,
  createProjectResponseSchema,
  deleteProjectResponseSchema,
  MAX_PROJECT_NAME_LENGTH,
  type Project,
  updateProjectResponseSchema,
} from '@askwell/shared';

/** The result of an API call: the data, or a message to show the owner. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface Parser<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

/** The trimmed name, or null if it's empty or too long. Plan limits are the server's job. */
export function cleanProjectName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_PROJECT_NAME_LENGTH ? trimmed : null;
}

/** Where a project's row links to. */
export function installHref(projectId: string): string {
  return `/dashboard/install?project=${encodeURIComponent(projectId)}`;
}

async function call<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  schema: Parser<T>,
  fallback: string,
): Promise<ApiResult<T>> {
  let res: Response;
  let body: unknown;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    return { ok: false, message: `${fallback} Check your connection and try again.` };
  }
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    // Show the server's message as is (e.g. the plan limit), never a client-side guess.
    const err = apiErrorSchema.safeParse(body);
    return { ok: false, message: err.success ? err.data.error.message : `${fallback} Try again.` };
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, message: `${fallback} Try again.` };
}

export async function createProject(
  name: string,
  fetchImpl: FetchLike = fetch,
): Promise<ApiResult<Project>> {
  const result = await call(
    fetchImpl,
    '/api/projects',
    { method: 'POST', body: JSON.stringify({ name }) },
    createProjectResponseSchema,
    'Could not create the project.',
  );
  return result.ok ? { ok: true, data: result.data.project } : result;
}

export async function renameProject(
  id: string,
  name: string,
  fetchImpl: FetchLike = fetch,
): Promise<ApiResult<Project>> {
  const result = await call(
    fetchImpl,
    `/api/projects/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ name }) },
    updateProjectResponseSchema,
    'Could not rename the project.',
  );
  return result.ok ? { ok: true, data: result.data.project } : result;
}

export async function deleteProject(
  id: string,
  fetchImpl: FetchLike = fetch,
): Promise<ApiResult<true>> {
  const result = await call(
    fetchImpl,
    `/api/projects/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    deleteProjectResponseSchema,
    'Could not delete the project.',
  );
  return result.ok ? { ok: true, data: true } : result;
}
