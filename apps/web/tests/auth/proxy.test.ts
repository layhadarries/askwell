import { type NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stand-in for clerkMiddleware: records each call and behaves like a signed-out
 * visitor on a dev instance would see, minus the network.
 */
const clerkCalls = vi.hoisted(() => [] as string[]);
vi.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware:
    (
      handler: (auth: () => Promise<unknown>, req: NextRequest) => Promise<Response | undefined>,
      opts: { signInUrl: string },
    ) =>
    async (req: NextRequest) => {
      clerkCalls.push(req.nextUrl.pathname);
      const auth = async () => ({
        isAuthenticated: false,
        redirectToSignIn: ({ returnBackUrl }: { returnBackUrl: string }) =>
          NextResponse.redirect(
            new URL(`${opts.signInUrl}?redirect_url=${encodeURIComponent(returnBackUrl)}`, req.url),
          ),
      });
      return (await handler(auth, req)) ?? NextResponse.next();
    },
}));

const { default: proxy, skipsClerk, classifyRoute, config } = await import('../../proxy');

const BASE = 'https://app.example.com';
async function run(path: string): Promise<Response> {
  const req = new NextRequest(`${BASE}${path}`);
  // The wrapper only forwards the event to Clerk; the mock ignores it.
  const res = await proxy(req, {} as NextFetchEvent);
  if (!res) throw new Error(`proxy returned nothing for ${path}`);
  return res;
}

beforeEach(() => {
  clerkCalls.length = 0;
});

describe('widget routes skip Clerk', () => {
  it.each([
    '/embed',
    '/embed?key=pk_test_123',
    '/embed/anything',
    '/api/widget/config',
    '/api/widget/config?key=pk_test_123',
    '/api/widget/chat',
  ])('%s: Clerk never runs, request passes through', async (path) => {
    const res = await run(path);
    expect(clerkCalls).toEqual([]);
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.status).toBe(200);
    res.headers.forEach((_value, name) => expect(name).not.toMatch(/^x-clerk/));
  });

  it.each(['/embedx', '/embed-preview', '/api/widgets', '/api/widgetx/config', '/', '/sign-in'])(
    '%s is not skipped',
    (path) => {
      expect(skipsClerk(path)).toBe(false);
    },
  );
});

describe('every other route still goes through Clerk', () => {
  it('signed out: /dashboard redirects to /sign-in', async () => {
    const res = await run('/dashboard');
    expect(clerkCalls).toEqual(['/dashboard']);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/sign-in');
  });

  it('signed out: /api/projects returns 401 with the error shape', async () => {
    const res = await run('/api/projects');
    expect(clerkCalls).toEqual(['/api/projects']);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: 'unauthorized', message: 'Sign in required' } });
  });

  it('public non-widget pages still run Clerk (so auth() works there)', async () => {
    await run('/');
    await run('/sign-in');
    expect(clerkCalls).toEqual(['/', '/sign-in']);
  });
});


describe('classifyRoute', () => {
  it.each([
    '/dashboard',
    '/dashboard/',
    '/dashboard/projects',
    '/dashboard/projects/abc/knowledge',
  ])('protects the owner page %s', (path) => {
    expect(classifyRoute(path)).toBe('owner-page');
  });

  it.each([
    '/api/projects',
    '/api/projects/abc',
    '/api/projects/abc/knowledge',
    '/api/projects/abc/knowledge/upload-url',
    '/api/projects/abc/knowledge/finalize',
    '/api/projects/abc/conversations',
    '/api/projects/abc/config',
    '/api/knowledge/abc',
    '/api/conversations/abc',
  ])('protects the owner API route %s', (path) => {
    expect(classifyRoute(path)).toBe('owner-api');
  });

  it.each([
    '/',
    '/embed',
    '/embed/abc',
    '/sign-in',
    '/sign-in/factor-one',
    '/sign-up',
    '/sign-up/verify-email-address',
    '/api/widget/config',
    '/api/widget/chat',
    '/api/clerk/webhook',
    '/api/posthog-config',
    '/__clerk/v1/client',
    '/__clerk/npm/@clerk/clerk-js@6/dist/clerk.browser.js',
    // Share the text of a protected prefix but are not under it.
    '/dashboardx',
    '/api/projectsx',
    '/api/knowledge-base',
    '/api/conversationsx',
  ])('leaves %s public', (path) => {
    expect(classifyRoute(path)).toBe('public');
  });
});

describe('proxy matcher', () => {
  it("runs on Clerk's /__clerk proxy paths, including scripts", () => {
    expect(config.matcher).toContain('/__clerk/(.*)');
  });
});
