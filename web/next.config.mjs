const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const apiOrigin = new URL(API).origin;
const wsOrigin = apiOrigin.replace(/^http/, 'ws');
const dev = process.env.NODE_ENV !== 'production';

// Strict security headers. Razorpay Checkout is the only third-party script and frame allowed.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${dev ? "'unsafe-eval'" : ''} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin}`,
  `media-src 'self' blob: ${apiOrigin}`,
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin} ${wsOrigin} https://lumberjack.razorpay.com`,
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
