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

const nextConfig: NextConfig = {
  transpilePackages: ['@askwell/shared'],
  async headers() {
    return FRAME_HEADERS;
  },
};

export default nextConfig;
