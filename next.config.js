/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { 
    remotePatterns: [{ protocol: 'https', hostname: 'storage.googleapis.com' }],
    unoptimized: true,
  },
  experimental: { serverComponentsExternalPackages: ['sharp'] }
};

module.exports = nextConfig;
