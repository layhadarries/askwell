interface HeadersLike {
  get(name: string): string | null;
}

/** A bare host with an optional port. Anything else (paths, quotes, spaces) is refused. */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;
/** A public key as the server generates it: `pk_` plus base64url. */
const KEY = /^pk_[A-Za-z0-9_-]{1,125}$/;

function firstValue(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim();
  return first ? first : null;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * The app's origin for the install tag. Taken from the request (so each Vercel
 * preview gives a working snippet), else from `fallbackUrl` (NEXT_PUBLIC_APP_URL).
 */
export function appOrigin(headers: HeadersLike, fallbackUrl?: string): string | null {
  const host = firstValue(headers.get('x-forwarded-host')) ?? firstValue(headers.get('host'));
  if (host && HOST.test(host)) {
    const forwarded = firstValue(headers.get('x-forwarded-proto'))?.toLowerCase();
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
    const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : local ? 'http' : 'https';
    // The regex can't catch everything (e.g. port 70000), so the URL parser has the last word.
    const fromRequest = originOf(`${proto}://${host.toLowerCase()}`);
    if (fromRequest) return fromRequest;
  }
  return originOf(fallbackUrl);
}

/** The install tag, or null for a bad origin or key. Shown as text, never as HTML. */
export function buildSnippet(origin: string, publicKey: string): string | null {
  const o = originOf(origin);
  if (!o || !KEY.test(publicKey)) return null;
  return `<script src="${o}/widget.js" data-key="${publicKey}"></script>`;
}

/** The ?project= value, or null when absent or repeated. */
export function projectParam(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
