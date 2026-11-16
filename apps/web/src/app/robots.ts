import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jankirasoi.vercel.app';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/menu', '/cart', '/privacy', '/terms'],
        disallow: ['/admin', '/rider', '/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
