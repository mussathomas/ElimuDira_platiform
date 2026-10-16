import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep dev artifacts separate so a local build/start cannot invalidate a running dev server.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  outputFileTracingRoot: projectRoot,
  async redirects() {
    return [
      { source: '/dashboard/finance/reports', destination: '/dashboard/finance', permanent: false },
    ];
  },
  images: {
    remotePatterns: [
      ...new Set([
        process.env.NEXT_PUBLIC_R2_PUBLIC_HOSTNAME,
        '**.r2.dev',
        '**.r2.cloudflarestorage.com',
      ].filter(Boolean)),
    ].map((hostname) => ({ protocol: 'https', hostname })),
  },
  experimental: {
    useWasmBinary: true,
    serverActions: {
      bodySizeLimit: '10mb', // school logos / document uploads pass through server actions as base64/form-data
    },
  },
};

export default nextConfig;
