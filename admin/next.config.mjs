/** API wiring: see web/next.config.mjs. Hosted: NEXT_PUBLIC_API_URL=/api and API_PROXY_TARGET=https://<backend-host>. */
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const PROXY = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');
const dev = process.env.NODE_ENV !== 'production';

const origin = (u) => (u && /^https?:\/\//.test(u) ? new URL(u).origin : null);
const backends = [...new Set([origin(API), origin(PROXY)].filter(Boolean))];

// The admin console loads no third-party code at all.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${backends.join(' ')}`,
  `media-src 'self' ${backends.join(' ')}`,
  "font-src 'self'",
  `connect-src 'self' ${backends.join(' ')}`,
  `frame-src 'self' ${backends.join(' ')}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@karvia/shared'],
  async rewrites() {
    return PROXY ? [{ source: '/api/:path*', destination: `${PROXY}/api/:path*` }] : [];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
