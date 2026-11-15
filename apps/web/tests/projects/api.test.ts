import { MAX_PROJECT_NAME_LENGTH, type Project } from '@askwell/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  addProject,
  cleanProjectName,
  createProject,
  deleteProject,
  installHref,
  removeProject,
  renameProject,
  replaceProject,
} from '../../components/projects';

const project = (id: string, name = `P ${id}`): Project => ({
  id,
  name,
  publicKey: `pk_${id}`,
  messagesUsed: 0,
  messageLimit: 100,
  periodStart: '2026-11-01T00:00:00+00:00',
  createdAt: '2026-11-15T10:00:00+00:00',
});

const ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('cleanProjectName', () => {
  it('trims and accepts 1–80 characters', () => {
    expect(cleanProjectName('  Store  ')).toBe('Store');
    expect(cleanProjectName('x'.repeat(MAX_PROJECT_NAME_LENGTH))).toHaveLength(MAX_PROJECT_NAME_LENGTH);
  });
  it('rejects empty and too-long names', () => {
    expect(cleanProjectName('   ')).toBeNull();
    expect(cleanProjectName('x'.repeat(MAX_PROJECT_NAME_LENGTH + 1))).toBeNull();
  });
});

describe('installHref', () => {
  it('links to the install page for the project', () => {
    expect(installHref(ID)).toBe(`/dashboard/install?project=${ID}`);
  });
  it('encodes the ID', () => {
    expect(installHref('a&b=c')).toBe('/dashboard/install?project=a%26b%3Dc');
  });
});

describe('createProject', () => {
  it('POSTs the name and returns the project', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { project: project(ID, 'Store') }));
    const result = await createProject('Store', fetchMock);
    expect(result).toEqual({ ok: true, data: project(ID, 'Store') });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Store' }) }),
    );
  });

  it("shows the server's plan limit message", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(403, {
        error: { code: 'limit_reached', message: 'Your Free plan allows 1 project' },
      }),
    );
    expect(await createProject('Second', fetchMock)).toEqual({
      ok: false,
      message: 'Your Free plan allows 1 project',
    });
  });

  it('falls back to a generic message for a non-JSON error', async () => {
    const fetchMock = vi.fn(async () => new Response('Bad gateway', { status: 502 }));
    const result = await createProject('Store', fetchMock);
    expect(result).toEqual({ ok: false, message: 'Could not create the project. Try again.' });
  });

  it('handles a network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await createProject('Store', fetchMock);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Check your connection');
  });

  it('rejects a 2xx body that is not a project', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { nope: true }));
    expect((await createProject('Store', fetchMock)).ok).toBe(false);
  });
});

describe('renameProject', () => {
  it('PATCHes /api/projects/:id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { project: project(ID, 'New') }));
    const result = await renameProject(ID, 'New', fetchMock);
    expect(result).toEqual({ ok: true, data: project(ID, 'New') });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${ID}`,
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'New' }) }),
    );
  });

  it("shows the server's 404 message", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(404, { error: { code: 'not_found', message: 'Project not found' } }),
    );
    expect(await renameProject(ID, 'New', fetchMock)).toEqual({
      ok: false,
      message: 'Project not found',
    });
  });
});

describe('deleteProject', () => {
  it('DELETEs /api/projects/:id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    expect(await deleteProject(ID, fetchMock)).toEqual({ ok: true, data: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${ID}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('returns the error message on failure', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(500, { error: { code: 'internal_error', message: 'Could not delete the project' } }),
    );
    expect(await deleteProject(ID, fetchMock)).toEqual({
      ok: false,
      message: 'Could not delete the project',
    });
  });
});

describe('list helpers', () => {
  const a = project('a');
  const b = project('b');

  it('addProject appends, without duplicates', () => {
    expect(addProject([a], b)).toEqual([a, b]);
    expect(addProject([a, b], a)).toEqual([b, a]);
  });
  it('replaceProject keeps the position', () => {
    const renamed = { ...a, name: 'Renamed' };
    expect(replaceProject([a, b], renamed)).toEqual([renamed, b]);
  });
  it('removeProject drops the row', () => {
    expect(removeProject([a, b], 'a')).toEqual([b]);
  });
});
