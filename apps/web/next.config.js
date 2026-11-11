/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  swcMinify: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 604800,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
    ],
  },
  headers: async () => [
    {
      source: '/:all*(svg|jpg|png|webp|avif|woff2)',
      headers: [
        {
          key: 'Cache-Control',
          value: 'no-cache, must-revalidate',
        },
      ],
    },
  ],
  allowedDevOrigins: ['10.73.238.252:3001', '10.73.238.252', '10.103.206.252:3001', '10.103.206.252', 'localhost:3001'],
  webpack: (config, { dev }) => {
    if (dev) {
      // Use in-memory webpack cache during dev on Windows to prevent
      // corrupt/missing chunk errors (e.g. "Cannot find module './280.js'")
      config.cache = { type: 'memory' };
    }
    return config;
  },
  async rewrites() {
    const rawApiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3000';
    const cleanBase = rawApiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return [
      {
        source: '/api/v1/:path*',
        destination: `${cleanBase}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
