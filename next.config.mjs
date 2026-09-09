import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
  webpack: (config, { dev }) => {
    if (dev) config.cache = false;
    return config;
  },
  images: {
    remotePatterns: [
      {
        // Cloudflare R2 public/custom domain used for logos, avatars, etc.
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_R2_PUBLIC_HOSTNAME || '**.r2.dev',
      },
    ],
  },
  experimental: {
    useWasmBinary: true,
    serverActions: {
      bodySizeLimit: '10mb', // school logos / document uploads pass through server actions as base64/form-data
    },
  },
};

export default nextConfig;
