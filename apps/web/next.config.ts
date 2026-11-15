import type { NextConfig } from 'next';

/** §9 Clickjacking: only /embed may be framed by other sites. */
export const FRAME_HEADERS = [
  {
    source: '/:path*',
    headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'self'" }],
  },
  // Must stay last: for the same key on the same path, the last rule wins.
  {
    source: '/embed',
    headers: [{ key: 'Content-Security-Policy', value: 'frame-ancestors *' }],
  },
];

/**
 * /widget.js has no hash in its URL, so a short cache and no `immutable`:
 * a new build reaches customer sites within minutes.
 */
export const WIDGET_SCRIPT_HEADERS = [
  {
    source: '/widget.js',
    headers: [{ key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' }],
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ['@askwell/shared'],
  async headers() {
    // FRAME_HEADERS last: its /embed rule must stay the final CSP rule.
    return [...WIDGET_SCRIPT_HEADERS, ...FRAME_HEADERS];
  },
};

export default nextConfig;
