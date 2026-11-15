import { beforeEach, describe, expect, it, vi } from 'vitest';

/** In-memory accounts table with Postgres upsert semantics. */
const rows = new Map<string, { clerk_user_id: string; plan: string }>();
const upsert = vi.fn(
  async (
    row: { clerk_user_id: string; plan: string },
    opts: { onConflict?: string; ignoreDuplicates?: boolean },
  ) => {
    const existing = rows.get(row.clerk_user_id);
    if (!existing || !opts.ignoreDuplicates) rows.set(row.clerk_user_id, { ...existing, ...row });
    return { error: null };
  },
);
const from = vi.fn(() => ({ upsert }));
const createServiceClient = vi.fn(() => ({ from }));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/service', () => ({ createServiceClient }));

const { ensureAccount } = await import('../../lib/accounts');

beforeEach(() => {
  rows.clear();
  vi.clearAllMocks();
});

describe('ensureAccount', () => {
  it('inserts a free account on first call', async () => {
    await ensureAccount('user_1');
    expect(from).toHaveBeenCalledWith('accounts');
    expect(rows.get('user_1')).toEqual({ clerk_user_id: 'user_1', plan: 'free' });
  });

  it('is insert-only: ON CONFLICT DO NOTHING on clerk_user_id', async () => {
    await ensureAccount('user_1');
    expect(upsert).toHaveBeenCalledWith(
      { clerk_user_id: 'user_1', plan: 'free' },
      { onConflict: 'clerk_user_id', ignoreDuplicates: true },
    );
  });

  it('a second call changes nothing and never resets a pro plan', async () => {
    rows.set('user_1', { clerk_user_id: 'user_1', plan: 'pro' });
    await ensureAccount('user_1');
    await ensureAccount('user_1');
    expect(rows.size).toBe(1);
    expect(rows.get('user_1')?.plan).toBe('pro');
  });

  it.each([null, undefined, ''])('does nothing for a missing user ID (%j)', async (id) => {
    await ensureAccount(id);
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(rows.size).toBe(0);
  });

  it('throws when the database returns an error', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'boom' } } as never);
    await expect(ensureAccount('user_1')).rejects.toThrow('ensureAccount failed: boom');
  });
});

describe('dashboard layout', () => {
  it('calls ensureAccount with the user ID from Clerk auth on the server', async () => {
    vi.resetModules();
    const ensure = vi.fn(async () => {});
    const protect = vi.fn(async () => ({ userId: 'user_from_clerk' }));
    vi.doMock('@clerk/nextjs/server', () => ({ auth: { protect } }));
    vi.doMock('../../lib/accounts', () => ({ ensureAccount: ensure }));
    vi.doMock('../../components/dashboard', () => ({
      DashboardShell: ({ children }: { children: unknown }) => children,
    }));
    const { default: DashboardLayout } = await import('../../app/dashboard/layout');
    await DashboardLayout({ children: null });
    expect(protect).toHaveBeenCalledOnce();
    expect(ensure).toHaveBeenCalledWith('user_from_clerk');
    expect(protect.mock.invocationCallOrder[0]).toBeLessThan(ensure.mock.invocationCallOrder[0]!);
  });
});
