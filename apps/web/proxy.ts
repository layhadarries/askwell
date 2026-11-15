import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Path prefixes that need a signed-in owner. Each one matches itself and
 * anything below it (`/dashboard`, `/dashboard/x`), never a sibling that only
 * shares the text (`/dashboardx`).
 */
const PROTECTED_PAGE_PREFIXES = ['/dashboard'] as const;
const PROTECTED_API_PREFIXES = ['/api/projects', '/api/knowledge', '/api/conversations'] as const;

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

// Same URLs as ClerkProvider in app/layout.tsx. The server needs them too, or
// redirectToSignIn sends visitors to Clerk's hosted sign-in page.
const AUTH_URLS = { signInUrl: '/sign-in', signUpUrl: '/sign-up' };

export default clerkMiddleware(async (auth, req) => {
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

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes, so `auth()` has the session there.
    '/(api|trpc)(.*)',
  ],
};
