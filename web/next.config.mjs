/**
 * API wiring:
 *  - Local dev:   NEXT_PUBLIC_API_URL=http://localhost:4000/api (direct).
 *  - Hosted:      NEXT_PUBLIC_API_URL=/api and API_PROXY_TARGET=https://<backend-host>.
 *                 The site calls its own /api, which is forwarded to the backend, so the login cookie
 *                 stays first-party even when the backend is on another domain.
 *  - Live updates: NEXT_PUBLIC_SOCKET_URL=https://<backend-host> (WebSockets connect to the backend directly).
 */
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const PROXY = process.env.API_PROXY_TARGET?.replace(/\/+$/, '');
const SOCKET = process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/+$/, '');
const dev = process.env.NODE_ENV !== 'production';

const origin = (u) => (u && /^https?:\/\//.test(u) ? new URL(u).origin : null);
const backends = [...new Set([origin(API), origin(PROXY), origin(SOCKET)].filter(Boolean))];
const sockets = backends.map((o) => o.replace(/^http/, 'ws'));

// Strict security headers. Razorpay Checkout is the only third-party script and frame allowed.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval'" : ''} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${backends.join(' ')}`,
  `media-src 'self' blob: ${backends.join(' ')}`,
  "font-src 'self'",
  `connect-src 'self' ${[...backends, ...sockets].join(' ')} https://lumberjack.razorpay.com`,
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
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
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self), payment=(self "https://api.razorpay.com")' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
