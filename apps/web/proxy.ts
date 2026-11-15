import { clerkMiddleware } from '@clerk/nextjs/server';
import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server';

/**
 * Path prefixes that need a signed-in owner. Each one matches itself and
 * anything below it (`/dashboard`, `/dashboard/x`), never a sibling that only
 * shares the text (`/dashboardx`).
 */
const PROTECTED_PAGE_PREFIXES = ['/dashboard'] as const;
const PROTECTED_API_PREFIXES = ['/api/projects', '/api/knowledge', '/api/conversations'] as const;

/**
 * Path prefixes Clerk never runs on. The widget panel (/embed) lives in a
 * cross-origin iframe and its API is called from customer sites: neither ever
 * needs auth. On a dev Clerk instance, clerkMiddleware would send a visitor
 * with no Clerk cookie through a handshake redirect, which can fail or loop in
 * a third-party iframe with cookies blocked.
 */
const CLERK_FREE_PREFIXES = ['/embed', '/api/widget'] as const;

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export type RouteKind = 'public' | 'owner-page' | 'owner-api';

/**
 * Classifies a request path. Everything not listed above is public, including
 * `/`, `/embed`, `/sign-in`, `/sign-up`, `/api/widget/*` and `/api/clerk/webhook`.
 *
 * This only gives signed-out visitors an early redirect or 401. It is not the
 * security boundary: every owner page and route handler must still call
 * `await auth.protect()` (or check `auth()`) itself.
 */
export function classifyRoute(pathname: string): RouteKind {
  if (PROTECTED_PAGE_PREFIXES.some((p) => underPrefix(pathname, p))) return 'owner-page';
  if (PROTECTED_API_PREFIXES.some((p) => underPrefix(pathname, p))) return 'owner-api';
  return 'public';
}

/** True when Clerk must not run for this path at all. */
export function skipsClerk(pathname: string): boolean {
  return CLERK_FREE_PREFIXES.some((p) => underPrefix(pathname, p));
}

// Same URLs as ClerkProvider in app/layout.tsx. The server needs them too, or
// redirectToSignIn sends visitors to Clerk's hosted sign-in page.
const AUTH_URLS = { signInUrl: '/sign-in', signUpUrl: '/sign-up' };

const withClerk = clerkMiddleware(async (auth, req) => {
  const kind = classifyRoute(req.nextUrl.pathname);
  if (kind === 'public') return;

  const { isAuthenticated, redirectToSignIn } = await auth();
  if (isAuthenticated) return;

  if (kind === 'owner-api') {
    return NextResponse.json(
      { error: { code: 'unauthorized', message: 'Sign in required' } },
      { status: 401 },
    );
  }
  return redirectToSignIn({ returnBackUrl: req.url });
}, AUTH_URLS);

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  // Short-circuit before Clerk: no handshake, no auth headers, no cookies.
  if (skipsClerk(req.nextUrl.pathname)) return NextResponse.next();
  return withClerk(req, event);
}

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes, so `auth()` has the session there.
    '/(api|trpc)(.*)',
    // Clerk's Frontend API proxy (auto-enabled on production keys served from
    // hosts like *.vercel.app). The `.js` exclusion above would skip its scripts.
    '/__clerk/(.*)',
  ],
};
