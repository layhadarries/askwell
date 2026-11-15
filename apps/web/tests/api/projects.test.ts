import { randomUUID } from 'node:crypto';
import type { Tables } from '@askwell/db';
import {
  apiErrorSchema,
  createProjectResponseSchema,
  deleteProjectResponseSchema,
  listProjectsResponseSchema,
  PLAN_LIMITS,
  updateProjectResponseSchema,
} from '@askwell/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Tables<'projects'>;
type Result = { data: unknown; error: { code?: string; message: string } | null };

/**
 * In-memory database. The owner client sees only `signedInAs`'s rows, the way
 * RLS scopes them; the service client sees everything. `create_project`
 * mirrors the SQL function: it raises P0001 `limit_reached` at the limit.
 */
const db = {
  accounts: new Map<string, 'free' | 'pro'>(),
  projects: [] as Row[],
};
let signedInAs: string | null = null;

function ownerQuery(table: 'accounts' | 'projects') {
  const visible = () =>
    table === 'projects' ? db.projects.filter((p) => p.owner_id === signedInAs) : [];
  let op: 'select' | 'update' | 'delete' = 'select';
  let patch: Partial<Row> = {};
  let id: string | undefined;
  const run = (): Result => {
    if (table === 'accounts') {
      const plan = signedInAs ? db.accounts.get(signedInAs) : undefined;
      return { data: plan ? [{ plan }] : [], error: null };
    }
    const rows = visible().filter((p) => id === undefined || p.id === id);
    if (op === 'update') for (const row of rows) Object.assign(row, patch);
    if (op === 'delete') db.projects = db.projects.filter((p) => !rows.includes(p));
    return { data: rows.map((r) => ({ ...r })), error: null };
  };
  const builder = {
    select: () => builder,
    order: () => builder,
    update: (values: Partial<Row>) => ((op = 'update'), (patch = values), builder),
    delete: () => ((op = 'delete'), builder),
    eq: (_col: 'id', value: string) => ((id = value), builder),
    maybeSingle: async () => {
      const { data, error } = run();
      return { data: (data as unknown[])[0] ?? null, error };
    },
    then: (resolve: (r: Result) => unknown) => resolve(run()),
  };
  return builder;
}

const rpc = vi.fn(
  async (
    _fn: 'create_project',
    args: { p_owner_id: string; p_name: string; p_public_key: string; p_max_projects: number },
  ): Promise<Result> => {
    const count = db.projects.filter((p) => p.owner_id === args.p_owner_id).length;
    if (count >= args.p_max_projects) {
      return { data: null, error: { code: 'P0001', message: 'limit_reached' } };
    }
    const now = new Date().toISOString();
    const row: Row = {
      id: randomUUID(),
      owner_id: args.p_owner_id,
      name: args.p_name.trim(),
      public_key: args.p_public_key,
      messages_used: 0,
      period_start: now,
      created_at: now,
    };
    db.projects.push(row);
    return { data: { ...row }, error: null };
  },
);

const protect = vi.fn(async () => {
  if (!signedInAs) throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  return { userId: signedInAs };
});
const auth = Object.assign(
  vi.fn(async () => ({ userId: signedInAs })),
  { protect },
);
const ensureAccount = vi.fn(async (userId: string) => {
  if (!db.accounts.has(userId)) db.accounts.set(userId, 'free');
});

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth }));
vi.mock('../../lib/accounts', () => ({ ensureAccount }));
vi.mock('../../lib/supabase/owner', () => ({
  createOwnerClient: () => ({ from: ownerQuery }),
}));
vi.mock('../../lib/supabase/service', () => ({ createServiceClient: () => ({ rpc }) }));

const projectsRoute = await import('../../app/api/projects/route');
const projectRoute = await import('../../app/api/projects/[id]/route');
const { generatePublicKey, PUBLIC_KEY_BYTES } = await import('../../lib/projects');

const ALICE = 'user_alice';
const BOB = 'user_bob';

function post(body: unknown, raw?: string) {
  return projectsRoute.POST(
    new Request('http://test/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw ?? JSON.stringify(body),
    }),
  );
}
function patch(id: string, body: unknown) {
  return projectRoute.PATCH(
    new Request(`http://test/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
}
function del(id: string) {
  return projectRoute.DELETE(new Request(`http://test/api/projects/${id}`, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}
async function expectError(res: Response, status: number, code: string) {
  expect(res.status).toBe(status);
  const body = apiErrorSchema.parse(await res.json());
  expect(body.error.code).toBe(code);
  expect(body.error.message.length).toBeGreaterThan(0);
}
async function createAs(userId: string, name = 'Docs site') {
  signedInAs = userId;
  const res = await post({ name });
  return createProjectResponseSchema.parse(await res.json()).project;
}

beforeEach(() => {
  db.accounts.clear();
  db.projects = [];
  signedInAs = null;
  vi.clearAllMocks();
});

describe('signed out → 401', () => {
  const id = randomUUID();
  it.each([
    ['GET /api/projects', () => projectsRoute.GET()],
    ['POST /api/projects', () => post({ name: 'x' })],
    ['PATCH /api/projects/:id', () => patch(id, { name: 'x' })],
    ['DELETE /api/projects/:id', () => del(id)],
  ])('%s', async (_label, call) => {
    await expectError(await call(), 401, 'unauthorized');
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('every handler calls auth.protect() when signed in', () => {
  it('GET, POST, PATCH and DELETE', async () => {
    const project = await createAs(ALICE);
    await projectsRoute.GET();
    await patch(project.id, { name: 'New' });
    await del(project.id);
    expect(protect).toHaveBeenCalledTimes(4);
  });
});

describe('GET /api/projects', () => {
  it("lists only the signed-in owner's projects, with their plan", async () => {
    await createAs(ALICE, 'Alice site');
    await createAs(BOB, 'Bob site');
    signedInAs = ALICE;
    const res = await projectsRoute.GET();
    expect(res.status).toBe(200);
    const body = listProjectsResponseSchema.parse(await res.json());
    expect(body.plan).toBe('free');
    expect(body.projects.map((p) => p.name)).toEqual(['Alice site']);
    expect(body.projects[0]!.messageLimit).toBe(PLAN_LIMITS.free.messagesPerMonth);
  });

  it('returns an empty list for a new owner', async () => {
    signedInAs = ALICE;
    const body = listProjectsResponseSchema.parse(await (await projectsRoute.GET()).json());
    expect(body).toEqual({ plan: 'free', projects: [] });
  });
});

describe('POST /api/projects', () => {
  it('creates a project → 201, after ensuring the account', async () => {
    signedInAs = ALICE;
    const res = await post({ name: '  Docs site  ' });
    expect(res.status).toBe(201);
    const { project } = createProjectResponseSchema.parse(await res.json());
    expect(project.name).toBe('Docs site');
    expect(project.messagesUsed).toBe(0);
    expect(ensureAccount).toHaveBeenCalledWith(ALICE);
  });

  it.each([
    ['no body', undefined, ''],
    ['bad JSON', undefined, '{name:'],
    ['no name', {}, undefined],
    ['an empty name', { name: '   ' }, undefined],
    ['a long name', { name: 'x'.repeat(81) }, undefined],
    ['a non-string name', { name: 42 }, undefined],
  ])('bad input (%s) → 400 with the error shape', async (_label, body, raw) => {
    signedInAs = ALICE;
    await expectError(await post(body, raw), 400, 'invalid_input');
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses Free's second project with limit_reached", async () => {
    await createAs(ALICE);
    await expectError(await post({ name: 'Second' }), 403, 'limit_reached');
    expect(db.projects).toHaveLength(1);
  });

  it('passes the server-read plan limit, ignoring plan and owner in the body', async () => {
    signedInAs = ALICE;
    await post({ name: 'Site', plan: 'pro', ownerId: BOB, owner_id: BOB, maxProjects: 99 });
    expect(rpc).toHaveBeenCalledWith(
      'create_project',
      expect.objectContaining({ p_owner_id: ALICE, p_max_projects: PLAN_LIMITS.free.projects }),
    );
    await expectError(await post({ name: 'Two', plan: 'pro' }), 403, 'limit_reached');
  });

  it("uses Pro's limit for a Pro owner", async () => {
    db.accounts.set(ALICE, 'pro');
    signedInAs = ALICE;
    for (let i = 0; i < PLAN_LIMITS.pro.projects; i++) {
      expect((await post({ name: `Site ${i}` })).status).toBe(201);
    }
    await expectError(await post({ name: 'One more' }), 403, 'limit_reached');
  });

  it('sends a fresh pk_ public key each time', async () => {
    db.accounts.set(ALICE, 'pro');
    signedInAs = ALICE;
    await post({ name: 'A' });
    await post({ name: 'B' });
    const keys = rpc.mock.calls.map(([, args]) => args.p_public_key);
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) expect(key).toMatch(/^pk_[A-Za-z0-9_-]{32}$/);
  });
});

describe('PATCH /api/projects/:id', () => {
  it('renames the owner’s project', async () => {
    const project = await createAs(ALICE);
    const res = await patch(project.id, { name: ' Renamed ' });
    expect(res.status).toBe(200);
    const body = updateProjectResponseSchema.parse(await res.json());
    expect(body.project).toMatchObject({ id: project.id, name: 'Renamed' });
  });

  it("another owner's project → 404, unchanged", async () => {
    const project = await createAs(BOB, 'Bob site');
    signedInAs = ALICE;
    await expectError(await patch(project.id, { name: 'Hijacked' }), 404, 'not_found');
    expect(db.projects[0]!.name).toBe('Bob site');
  });

  it('a missing project → 404', async () => {
    signedInAs = ALICE;
    await expectError(await patch(randomUUID(), { name: 'x' }), 404, 'not_found');
  });

  it('sends only the name, whatever else the body holds', async () => {
    const project = await createAs(ALICE);
    await patch(project.id, { name: 'New', public_key: 'pk_mine', owner_id: BOB });
    expect(db.projects[0]).toMatchObject({ name: 'New', owner_id: ALICE, public_key: project.publicKey });
  });

  it.each([
    ['a non-UUID id', 'abc', { name: 'x' }],
    ['an empty name', randomUUID(), { name: '' }],
    ['no name', randomUUID(), {}],
  ])('bad input (%s) → 400', async (_label, id, body) => {
    signedInAs = ALICE;
    await expectError(await patch(id, body), 400, 'invalid_input');
  });
});

describe('DELETE /api/projects/:id', () => {
  it('deletes the owner’s project', async () => {
    const project = await createAs(ALICE);
    const res = await del(project.id);
    expect(res.status).toBe(200);
    expect(deleteProjectResponseSchema.parse(await res.json())).toEqual({ ok: true });
    expect(db.projects).toHaveLength(0);
  });

  it("another owner's project → 404, not deleted", async () => {
    const project = await createAs(BOB);
    signedInAs = ALICE;
    await expectError(await del(project.id), 404, 'not_found');
    expect(db.projects).toHaveLength(1);
  });

  it('a non-UUID id → 400', async () => {
    signedInAs = ALICE;
    await expectError(await del('abc'), 400, 'invalid_input');
  });
});

describe('generatePublicKey', () => {
  it('is pk_ plus 24 random bytes in base64url', () => {
    const key = generatePublicKey();
    expect(PUBLIC_KEY_BYTES).toBeGreaterThanOrEqual(24);
    expect(key).toMatch(/^pk_[A-Za-z0-9_-]+$/);
    expect(Buffer.from(key.slice(3), 'base64url')).toHaveLength(PUBLIC_KEY_BYTES);
  });

  it('never repeats', () => {
    const keys = new Set(Array.from({ length: 1000 }, generatePublicKey));
    expect(keys.size).toBe(1000);
  });
});
