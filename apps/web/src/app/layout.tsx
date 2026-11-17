import type { Metadata, Viewport } from 'next';
import './globals.css';
import { CartProvider } from '../context/CartContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import BottomNav from '../components/BottomNav';
import CustomerBanLockModal from '../components/CustomerBanLockModal';
import CookieConsentBanner from '../components/CookieConsentBanner';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#38754A',
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jankirasoi.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Janki Rasoi™ | Official Website - Best Tiffin Center & Kitchen in Sagore',
    template: '%s | Janki Rasoi',
  },
  description:
    'Official website of Janki Rasoi Sagore - Best pure vegetarian tiffin center and home kitchen in Sagore & Pithampur. Order nutritious daily lunch & dinner tiffins, executive thalis, and homestyle meals with express delivery.',
  keywords: [
    'janki rasoi',
    'janki rasoi official website',
    'jankirasoi',
    'janki rasoi sagore',
    'sagore tiffin center',
    'sagore tiffine center',
    'tiffin center sagore',
    'best tiffin center sagore',
    'tiffin service in sagore',
    'best tiffin service sagore',
    'best kichen service sagore',
    'best kitchen service sagore',
    'janki rasoi tiffin center',
    'pure veg tiffin sagore',
    'daily tiffin sagore pithampur',
    'ghar jaisa khana sagore',
    'sagore food delivery',
    'janki rasoi menu',
  ],
  authors: [{ name: 'Janki Rasoi Sagore', url: siteUrl }],
  creator: 'Janki Rasoi Sagore',
  publisher: 'Janki Rasoi',
  formatDetection: {
    telephone: true,
    address: true,
    email: true,
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Janki Rasoi™ | Best Tiffin Center & Kitchen Service in Sagore',
    description:
      'Pure vegetarian homestyle tiffin center and kitchen in Sagore & Pithampur. Authentic taste, hygienically cooked daily tiffins, and hot doorstep delivery.',
    url: siteUrl,
    siteName: 'Janki Rasoi Sagore',
    locale: 'en_IN',
    type: 'website',
    images: [
      {
        url: '/images/hero-thali.jpg',
        width: 1200,
        height: 630,
        alt: 'Janki Rasoi Sagore - Best Tiffin Center and Kitchen Service',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Janki Rasoi™ | Best Tiffin Center & Kitchen Service in Sagore',
    description:
      'Order delicious pure vegetarian daily lunch & dinner tiffins in Sagore & Pithampur from Janki Rasoi Tiffin Center.',
    images: ['/images/hero-thali.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: [
      'exd8uIz1JksQzk6F4ERwkbgqG0nXmQg4UOIy36qaGKY',
      'YaZ4S2I5I3-WgqvlPtgTKhLKSm3P2dXQhZsXmcOxyBw',
    ],
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Janki Rasoi Sagore',
  },
  other: {
    'geo.region': 'IN-MP',
    'geo.placename': 'Sagore, Pithampur, Dhar',
    'geo.position': '22.6186;75.6429',
    'ICBM': '22.6186, 75.6429',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: 'Janki Rasoi',
      alternateName: ['Janki Rasoi Sagore', 'JankiRasoi', 'Sagore Tiffin Center', 'jankirasoi.com'],
      description: 'Official Website of Janki Rasoi - Pure Veg Tiffin Center & Kitchen Service Sagore',
      publisher: { '@id': `${siteUrl}/#organization` },
      inLanguage: 'en-IN',
    },
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'Janki Rasoi',
      legalName: 'Janki Rasoi Tiffin Center',
      url: siteUrl,
      logo: `${siteUrl}/images/logo-avatar.png`,
      sameAs: [
        'https://jankirasoi.com',
      ],
      contactPoint: {
        '@type': 'ContactPoint',
        telephone: '+91-8319014108',
        contactType: 'customer service',
        areaServed: 'IN',
        availableLanguage: ['Hindi', 'English'],
      },
    },
    {
      '@type': ['Restaurant', 'FoodEstablishment'],
      '@id': `${siteUrl}/#restaurant`,
      name: 'Janki Rasoi - Tiffin Center & Pure Veg Kitchen',
      alternateName: [
        'Janki Rasoi Sagore',
        'Sagore Tiffin Center',
        'Janki Rasoi Tiffin Service',
        'Best Tiffin Center Sagore',
        'Best Kitchen Service Sagore',
        'Janki Rasoi Pithampur',
      ],
      url: siteUrl,
      logo: `${siteUrl}/images/logo-avatar.png`,
      image: `${siteUrl}/images/hero-thali.jpg`,
      description:
        'Janki Rasoi is the premier pure vegetarian tiffin center and homestyle kitchen in Sagore & Pithampur. We deliver 100% pure vegetarian homestyle thalis, daily office & student tiffins, and nutritious home-cooked meals.',
      servesCuisine: ['North Indian', 'Pure Vegetarian', 'Tiffin', 'Thali', 'Home Cooked'],
      priceRange: '₹₹',
      telephone: '+91 83190 14108',
      email: 'care@jankirasoi.com',
      parentOrganization: { '@id': `${siteUrl}/#organization` },
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Sagore - Pithampur Road, near Sagore Police Station',
        addressLocality: 'Sagore, Pithampur',
        addressRegion: 'Madhya Pradesh',
        postalCode: '454774',
        addressCountry: 'IN',
      },
      geo: {
        '@type': 'GeoCoordinates',
        latitude: 22.6186,
        longitude: 75.6429,
      },
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
          opens: '11:00',
          closes: '23:00',
        },
      ],
      hasMenu: `${siteUrl}/menu`,
      acceptsReservations: 'True',
      areaServed: [
        { '@type': 'City', name: 'Sagore' },
        { '@type': 'City', name: 'Pithampur' },
        { '@type': 'AdministrativeArea', name: 'Dhar' },
        { '@type': 'AdministrativeArea', name: 'Indore' },
      ],
      potentialAction: {
        '@type': 'OrderAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${siteUrl}/menu`,
          inLanguage: 'en-IN',
          actionPlatform: [
            'http://schema.org/DesktopWebPlatform',
            'http://schema.org/MobileWebPlatform',
          ],
        },
        deliveryMethod: 'http://purl.org/goodrelations/v1#DeliveryModeOwnFleet',
      },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="google-site-verification"
          content="exd8uIz1JksQzk6F4ERwkbgqG0nXmQg4UOIy36qaGKY"
        />
        <meta
          name="google-site-verification"
          content="YaZ4S2I5I3-WgqvlPtgTKhLKSm3P2dXQhZsXmcOxyBw"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="theme-color" content="#38754A" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" />
        <link rel="preconnect" href="https://images.unsplash.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        {/* High priority preload for Material Symbols icon font to eliminate ligature text leak */}
        <link
          rel="preload"
          href="https://fonts.gstatic.com/s/materialsymbolsoutlined/v382/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsI.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap"
        />
        {/* Google Schema Structured Data (JSON-LD) for Local SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  if ('fonts' in document && !document.fonts.check('24px "Material Symbols Outlined"')) {
                    document.documentElement.classList.add('icons-loading');
                    document.fonts.load('24px "Material Symbols Outlined"').then(function() {
                      document.documentElement.classList.remove('icons-loading');
                    }).catch(function() {
                      document.documentElement.classList.remove('icons-loading');
                    });
                    setTimeout(function() {
                      document.documentElement.classList.remove('icons-loading');
                    }, 1200);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="bg-[#FFF9F0] font-body text-[#292D26] flex flex-col min-h-screen">
        <CartProvider>
          <Header />
          <CustomerBanLockModal />
          <div className="flex-1 flex flex-col">{children}</div>
          <Footer />
          <BottomNav />
          <CookieConsentBanner />
        </CartProvider>
      </body>
    </html>
  );
}
