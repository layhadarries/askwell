import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.fn((..._args: unknown[]) => ({ from: vi.fn() }));
const getToken = vi.fn<() => Promise<string | null>>();

vi.mock('@supabase/supabase-js', () => ({ createClient }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ getToken })) }));
vi.mock('server-only', () => ({}));

const { createOwnerClient, getOwnedProject } = await import('./owner');
const { createServiceClient } = await import('./service');

// Built from parts so this file doesn't itself contain the variable name.
const SECRET_NAME = ['SUPABASE', 'SECRET', 'KEY'].join('_');
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  [SECRET_NAME]: 'sb_secret_test',
};

beforeEach(() => {
  createClient.mockClear();
  getToken.mockReset();
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type AccessToken = () => Promise<string | null>;

describe('createOwnerClient', () => {
  it('uses the publishable key, never the secret key', () => {
    createOwnerClient();
    const [url, key] = createClient.mock.calls[0]!;
    expect(url).toBe(ENV.NEXT_PUBLIC_SUPABASE_URL);
    expect(key).toBe(ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(JSON.stringify(createClient.mock.calls[0])).not.toContain(ENV[SECRET_NAME]);
  });

  it("sends the signed-in owner's Clerk session token", async () => {
    getToken.mockResolvedValue('clerk-session-jwt');
    createOwnerClient();
    const options = createClient.mock.calls[0]![2] as { accessToken: AccessToken };
    await expect(options.accessToken()).resolves.toBe('clerk-session-jwt');
    expect(getToken).toHaveBeenCalledWith();
  });

  it('sends no token when signed out', async () => {
    getToken.mockResolvedValue(null);
    createOwnerClient();
    const options = createClient.mock.calls[0]![2] as { accessToken: AccessToken };
    await expect(options.accessToken()).resolves.toBeNull();
  });

  it('fails clearly when an env var is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect(() => createOwnerClient()).toThrow(
      /Missing environment variable NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });
});

describe('createServiceClient', () => {
  it('uses the secret key and keeps no session', () => {
    createServiceClient();
    const [url, key, options] = createClient.mock.calls[0]!;
    expect(url).toBe(ENV.NEXT_PUBLIC_SUPABASE_URL);
    expect(key).toBe(ENV[SECRET_NAME]);
    expect(options).toMatchObject({ auth: { persistSession: false, autoRefreshToken: false } });
  });

  it('fails clearly when the secret key is missing', () => {
    vi.stubEnv(SECRET_NAME, '');
    expect(() => createServiceClient()).toThrow(new RegExp(`Missing environment variable ${SECRET_NAME}`));
  });
});

describe('getOwnedProject', () => {
  function fakeClient(result: { data: unknown; error: unknown }) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => result),
    };
    const client = { from: vi.fn(() => query) };
    return { client: client as unknown as Parameters<typeof getOwnedProject>[1], query, from: client.from };
  }

  const ID = '00000000-0000-4000-8000-000000000001';

  it('looks the project up with the owner client and returns it', async () => {
    const project = { id: ID, owner_id: 'user_a' };
    const { client, query, from } = fakeClient({ data: project, error: null });
    await expect(getOwnedProject(ID, client)).resolves.toEqual(project);
    expect(from).toHaveBeenCalledWith('projects');
    expect(query.eq).toHaveBeenCalledWith('id', ID);
  });

  it("returns null when RLS hides the row (not the owner's, or missing)", async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(getOwnedProject(ID, client)).resolves.toBeNull();
  });

  it('returns null for an ID that is not a UUID, without a query', async () => {
    const { client, from } = fakeClient({ data: null, error: null });
    await expect(getOwnedProject('not-a-uuid', client)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('returns null for a malformed ID before creating a default client', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    await expect(getOwnedProject('not-a-uuid')).resolves.toBeNull();
    expect(createClient).not.toHaveBeenCalled();
  });

  it('creates the owner client itself when none is passed', async () => {
    const project = { id: ID, owner_id: 'user_a' };
    const { client } = fakeClient({ data: project, error: null });
    createClient.mockReturnValueOnce(client as unknown as ReturnType<typeof createClient>);
    await expect(getOwnedProject(ID)).resolves.toEqual(project);
    expect(createClient.mock.calls[0]![1]).toBe(ENV.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  });

  it('throws on a database error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(getOwnedProject(ID, client)).rejects.toThrow(/getOwnedProject failed: boom/);
  });
});

/** Source files under `dir`, skipping dependencies and build output. */
async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'dist', '.git', '.vercel'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.(c|m)?(t|j)sx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe('secret key containment', () => {
  it('service.ts starts with the server-only guard', async () => {
    const src = await readFile(join(WEB_ROOT, 'lib/supabase/service.ts'), 'utf8');
    expect(src.split('\n')[0]).toBe("import 'server-only';");
  });

  it('the secret key name appears in code only in lib/supabase/service.ts', async () => {
    const hits: string[] = [];
    for (const root of ['apps', 'packages']) {
      for (const file of await sourceFiles(join(REPO_ROOT, root))) {
        if ((await readFile(file, 'utf8')).includes(SECRET_NAME)) hits.push(relative(REPO_ROOT, file));
      }
    }
    expect(hits).toEqual(['apps/web/lib/supabase/service.ts']);
  });

  it('no NEXT_PUBLIC_ variable is named like a secret', async () => {
    const hits: string[] = [];
    for (const file of await sourceFiles(join(REPO_ROOT, 'apps'))) {
      const src = await readFile(file, 'utf8');
      for (const match of src.matchAll(/NEXT_PUBLIC_[A-Z0-9_]*SECRET[A-Z0-9_]*/g)) hits.push(match[0]);
    }
    expect(hits).toEqual([]);
  });

  it('no client component imports the service client', async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles(WEB_ROOT)) {
      const src = await readFile(file, 'utf8');
      const isClient = /^\s*['"]use client['"]/.test(src);
      if (isClient && /from\s+['"][^'"]*lib\/supabase\/service['"]/.test(src)) {
        offenders.push(relative(WEB_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
