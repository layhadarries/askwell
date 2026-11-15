import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  appOrigin,
  buildSnippet,
  copyText,
  InstallView,
  projectParam,
  resolveInstallState,
  STEPS,
  type InstallLoader,
} from '../../components/install';

const KEY = 'pk_AbC-12_xyzAbC-12_xyzAbC-12_xyzAb';
const ORIGIN = 'https://askwell-git-x-team.vercel.app';
const hdrs = (h: Record<string, string>) => new Headers(h);

describe('buildSnippet', () => {
  it('builds the exact install tag', () => {
    expect(buildSnippet(ORIGIN, KEY)).toBe(
      `<script src="${ORIGIN}/widget.js" data-key="${KEY}"></script>`,
    );
  });
  it('uses only the origin of the URL', () => {
    expect(buildSnippet(`${ORIGIN}/dashboard?x=1`, KEY)).toContain(`src="${ORIGIN}/widget.js"`);
  });
  it('refuses a key that is not a pk_ key or could break out of the attribute', () => {
    expect(buildSnippet(ORIGIN, 'sk_secret')).toBeNull();
    expect(buildSnippet(ORIGIN, 'pk_a"><script>alert(1)</script>')).toBeNull();
    expect(buildSnippet(ORIGIN, 'pk_')).toBeNull();
  });
  it('refuses a non-http origin', () => {
    expect(buildSnippet('javascript:alert(1)', KEY)).toBeNull();
    expect(buildSnippet('not a url', KEY)).toBeNull();
  });
});

describe('appOrigin', () => {
  it('uses the forwarded host and proto (Vercel)', () => {
    expect(
      appOrigin(hdrs({ 'x-forwarded-host': 'askwell-git-x-team.vercel.app', 'x-forwarded-proto': 'https', host: 'internal' })),
    ).toBe(ORIGIN);
  });
  it('falls back to the Host header, https by default, http on localhost', () => {
    expect(appOrigin(hdrs({ host: 'app.example.com' }))).toBe('https://app.example.com');
    expect(appOrigin(hdrs({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });
  it('takes the first value of a list', () => {
    expect(appOrigin(hdrs({ 'x-forwarded-host': 'a.example.com, b.example.com', 'x-forwarded-proto': 'https,http' }))).toBe(
      'https://a.example.com',
    );
  });
  it('ignores a malformed host and uses NEXT_PUBLIC_APP_URL', () => {
    expect(appOrigin(hdrs({ host: 'evil.com/"><x' }), 'https://askwell.app/')).toBe('https://askwell.app');
  });
  it('is null with no usable host or fallback', () => {
    expect(appOrigin(hdrs({}))).toBeNull();
    expect(appOrigin(hdrs({}), 'ftp://x')).toBeNull();
  });
});

describe('projectParam', () => {
  it('accepts a single value only', () => {
    expect(projectParam('abc')).toBe('abc');
    expect(projectParam(undefined)).toBeNull();
    expect(projectParam('')).toBeNull();
    expect(projectParam(['a', 'b'])).toBeNull();
  });
});

describe('copyText', () => {
  it('writes the exact text and reports copied', async () => {
    const writeText = vi.fn(async () => {});
    const tag = buildSnippet(ORIGIN, KEY)!;
    expect(await copyText(tag, { writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(tag);
  });
  it('reports failed when the clipboard refuses or is missing', async () => {
    expect(await copyText('x', { writeText: async () => Promise.reject(new Error('denied')) })).toBe('failed');
    expect(await copyText('x', undefined)).toBe('failed');
  });
});

describe('resolveInstallState', () => {
  const store = { name: 'Store', public_key: KEY };
  const loader = (owned: Record<string, typeof store>, first: typeof store | null): InstallLoader => ({
    ownedProject: vi.fn(async (id: string) => owned[id] ?? null),
    firstProject: vi.fn(async () => first),
  });

  it('shows the requested project with its key and the origin', async () => {
    const l = loader({ p1: store }, null);
    const state = await resolveInstallState('p1', ORIGIN, l);
    expect(state).toEqual({ kind: 'ready', projectName: 'Store', snippet: buildSnippet(ORIGIN, KEY) });
    expect(l.firstProject).not.toHaveBeenCalled();
  });

  it("shows not-found for another owner's (or a missing) project, never falling back", async () => {
    const l = loader({}, store);
    expect(await resolveInstallState('someone-elses', ORIGIN, l)).toEqual({ kind: 'not-found' });
    expect(l.firstProject).not.toHaveBeenCalled();
  });

  it('uses the first project with no param', async () => {
    expect(await resolveInstallState(null, ORIGIN, loader({}, store))).toMatchObject({ kind: 'ready' });
  });

  it('shows no-projects with no param and no projects', async () => {
    expect(await resolveInstallState(null, ORIGIN, loader({}, null))).toEqual({ kind: 'no-projects' });
  });

  it('shows no-origin when the tag cannot be built', async () => {
    expect(await resolveInstallState(null, null, loader({}, store))).toEqual({ kind: 'no-origin' });
  });
});

describe('InstallView', () => {
  const snippet = buildSnippet(ORIGIN, KEY)!;

  it('renders the snippet as text, a copy button and the 3 steps', () => {
    const html = renderToStaticMarkup(<InstallView state={{ kind: 'ready', projectName: 'Store', snippet }} />);
    expect(html).toContain('&lt;script src=&quot;');
    expect(html).not.toContain('<script');
    expect(html).toContain(KEY);
    expect(html).toContain('>Copy<');
    expect(html.match(/<li>/g)).toHaveLength(STEPS.length);
    expect(html).toContain('&lt;/body&gt;');
  });

  it('renders the project name as text', () => {
    const html = renderToStaticMarkup(
      <InstallView state={{ kind: 'ready', projectName: '<b>x</b>', snippet }} />,
    );
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('no projects: "Create a project first" links to /dashboard', () => {
    const html = renderToStaticMarkup(<InstallView state={{ kind: 'no-projects' }} />);
    expect(html).toContain('data-state="empty"');
    expect(html).toMatch(/<a[^>]*href="\/dashboard"[^>]*>Create a project first<\/a>/);
  });

  it('not found: empty state with a link to /dashboard and no key', () => {
    const html = renderToStaticMarkup(<InstallView state={{ kind: 'not-found' }} />);
    expect(html).toContain('data-state="empty"');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('pk_');
  });

  it('no origin: error state', () => {
    expect(renderToStaticMarkup(<InstallView state={{ kind: 'no-origin' }} />)).toContain('data-state="error"');
  });
});

describe('/dashboard/install page', () => {
  const src = readFileSync(new URL('../../app/dashboard/install/page.tsx', import.meta.url), 'utf8');
  it('uses the owner client, never the service client', () => {
    expect(src).toContain('createOwnerClient()');
    expect(src).not.toMatch(/createServiceClient|supabase\/service/);
  });
});
