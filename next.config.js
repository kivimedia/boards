/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
};

module.exports = nextConfig;
