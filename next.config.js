/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['react-markdown', 'remark-gfm', 'remark-parse', 'unified', 'vfile', 'vfile-message', 'unist-util-visit', 'unist-util-is', 'mdast-util-from-markdown', 'mdast-util-to-string', 'micromark', 'rehype-raw', 'hast-util-raw', 'hast-util-from-parse5', 'hast-util-to-parse5', 'html-void-elements', 'mdast-util-to-hast', 'unist-util-position', 'web-namespaces', 'zwitch', '@ungap/structured-clone'],
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
