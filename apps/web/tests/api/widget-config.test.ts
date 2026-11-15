import {
  apiErrorSchema,
  DEFAULT_WIDGET_CONFIG,
  widgetConfigResponseSchema,
} from '@askwell/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PROJECT_ID = '0b6f9a51-3c1e-4b8a-9d2f-6a7e5c4b3a21';
const OWNER_ID = 'user_owner_secret';
const FREE_KEY = 'pk_free0000000000000000000000000000';
const PRO_KEY = 'pk_pro00000000000000000000000000000';

const PRO_STORED = {
  button_color: '#ff5500',
  position: 'top-left',
  label: 'Need help?',
  animation: 'slide',
  header_text: 'Hi from Acme',
  show_badge: false,
};

type Row = {
  id: string;
  owner_id: string;
  public_key: string;
  messages_used: number;
  accounts: { plan: string } | null;
  widget_configs: typeof PRO_STORED | null;
};

/** In-memory projects with their account and config, as PostgREST embeds them. */
let rows: Row[] = [];
let failWith: { message: string } | null = null;

const eq = vi.fn((_col: string, value: string) => ({
  maybeSingle: async () => {
    if (failWith) return { data: null, error: failWith };
    const row = rows.find((r) => r.public_key === value);
    // Return the whole row, internal fields included, to prove the route drops them.
    return { data: row ?? null, error: null };
  },
}));
const select = vi.fn((_columns: string) => ({ eq }));
const from = vi.fn((_table: string) => ({ select }));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/supabase/service', () => ({ createServiceClient: () => ({ from }) }));

const { GET, OPTIONS } = await import('../../app/api/widget/config/route');

function get(query: string) {
  return GET(
    new Request(`https://app.test/api/widget/config${query}`, {
      headers: { origin: 'https://customer.example' },
    }),
  );
}

function expectCors(res: Response) {
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
  expect(res.headers.get('access-control-allow-credentials')).toBeNull();
}

async function expectNotFound(res: Response) {
  expect(res.status).toBe(404);
  expect(apiErrorSchema.parse(await res.json()).error.code).toBe('not_found');
  expectCors(res);
}

beforeEach(() => {
  failWith = null;
  vi.clearAllMocks();
  rows = [
    {
      id: PROJECT_ID,
      owner_id: OWNER_ID,
      public_key: FREE_KEY,
      messages_used: 42,
      accounts: { plan: 'free' },
      widget_configs: PRO_STORED,
    },
    {
      id: '1c7a0b62-4d2f-4c9b-8e3a-7b8f6d5c4b32',
      owner_id: 'user_pro',
      public_key: PRO_KEY,
      messages_used: 7,
      accounts: { plan: 'pro' },
      widget_configs: PRO_STORED,
    },
  ];
});

describe('GET /api/widget/config', () => {
  it('looks the project up by public_key only, through the service client', async () => {
    await get(`?key=${PRO_KEY}`);
    expect(from).toHaveBeenCalledWith('projects');
    expect(eq).toHaveBeenCalledWith('public_key', PRO_KEY);
    expect(select.mock.calls[0]![0]).not.toMatch(/\bid\b|owner_id|messages_used/);
  });

  it('Pro → the stored values', async () => {
    const res = await get(`?key=${PRO_KEY}`);
    expect(res.status).toBe(200);
    expect(widgetConfigResponseSchema.parse(await res.json())).toEqual({
      buttonColor: '#ff5500',
      position: 'top-left',
      label: 'Need help?',
      animation: 'slide',
      headerText: 'Hi from Acme',
      showBadge: false,
    });
  });

  it('Free → the defaults plus the badge, whatever is stored', async () => {
    const res = await get(`?key=${FREE_KEY}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(body.showBadge).toBe(true);
  });

  it('no account row reads as Free', async () => {
    rows[1]!.accounts = null;
    expect(await (await get(`?key=${PRO_KEY}`)).json()).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it('Pro with a missing or invalid stored config → the defaults', async () => {
    rows[1]!.widget_configs = null;
    expect(await (await get(`?key=${PRO_KEY}`)).json()).toEqual(DEFAULT_WIDGET_CONFIG);
    rows[1]!.widget_configs = { ...PRO_STORED, position: 'middle' };
    expect(await (await get(`?key=${PRO_KEY}`)).json()).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it.each([FREE_KEY, PRO_KEY])('returns widget fields only, no internal IDs or usage (%s)', async (key) => {
    const res = await get(`?key=${key}`);
    const text = await res.clone().text();
    expect(Object.keys(await res.json()).sort()).toEqual(
      ['animation', 'buttonColor', 'headerText', 'label', 'position', 'showBadge'],
    );
    for (const secret of [PROJECT_ID, OWNER_ID, 'user_pro', key, 'messages', 'owner', '"id"', 'plan']) {
      expect(text).not.toContain(secret);
    }
  });

  it('sends CORS for any origin, without credentials, and a short public cache', async () => {
    const res = await get(`?key=${PRO_KEY}`);
    expectCors(res);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
  });

  it('unknown key → 404 with the error shape, not cached', async () => {
    const res = await get('?key=pk_doesnotexist000000000000000000000');
    await expectNotFound(res);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['no key', ''],
    ['an empty key', '?key='],
    ['no pk_ prefix', '?key=sk_live_abc'],
    ['a too-long key', `?key=pk_${'a'.repeat(200)}`],
  ])('malformed key (%s) → 404 without a database call', async (_label, query) => {
    await expectNotFound(await get(query));
    expect(from).not.toHaveBeenCalled();
  });

  it('database failure → 500 internal_error with CORS, no detail leaked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    failWith = { message: 'connection reset: secret detail' };
    const res = await get(`?key=${PRO_KEY}`);
    expect(res.status).toBe(500);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('secret detail');
    expectCors(res);
  });
});

describe('OPTIONS /api/widget/config', () => {
  it('answers the preflight with 204 and CORS headers', async () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expectCors(res);
    expect(res.headers.get('access-control-allow-methods')).toContain('GET');
    expect(res.headers.get('access-control-allow-headers')).toContain('Content-Type');
  });
});
