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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://jankirasoi.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Janki Rasoi | Best Kitchen Service & Catering Service in Sagore',
    template: '%s | Janki Rasoi Sagore',
  },
  description:
    'Janki Rasoi Sagore - Best kitchen service & catering service in Sagore and Pithampur. Order pure vegetarian homestyle thalis, daily tiffins, and event catering with fresh ingredients and express delivery.',
  keywords: [
    'janki rasoi',
    'janki rasoi sagore',
    'sagore catreen sevice',
    'sagore catering service',
    'best kichen service sagore',
    'best kitchen service sagore',
    'caterers in sagore',
    'sagore tiffin service',
    'sagore food delivery',
    'pure veg food sagore',
    'janki rasoi pithampur',
    'catering service in sagore pithampur',
    'best veg thali sagore',
    'ghar jaisa khana sagore',
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
    title: 'Janki Rasoi Sagore | Best Kitchen Service & Catering Service in Sagore',
    description:
      'Pure vegetarian homestyle kitchen and catering service in Sagore & Pithampur. Authentic taste, hygienically cooked, and delivered hot to your doorstep.',
    url: siteUrl,
    siteName: 'Janki Rasoi Sagore',
    locale: 'en_IN',
    type: 'website',
    images: [
      {
        url: '/images/hero-thali.jpg',
        width: 1200,
        height: 630,
        alt: 'Janki Rasoi Sagore - Best Kitchen Service & Catering in Sagore',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Janki Rasoi Sagore | Best Kitchen Service & Catering in Sagore',
    description:
      'Order delicious pure vegetarian thalis, tiffins, and bulk catering service in Sagore & Pithampur from Janki Rasoi.',
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
  '@type': ['Restaurant', 'CateringService', 'FoodEstablishment'],
  '@id': `${siteUrl}/#restaurant`,
  name: 'Janki Rasoi',
  alternateName: [
    'Janki Rasoi Sagore',
    'Sagore Catering Service',
    'Best Kitchen Service Sagore',
    'Janki Rasoi Pithampur',
    'Sagore Catreen Sevice',
  ],
  url: siteUrl,
  logo: `${siteUrl}/images/logo-avatar.png`,
  image: `${siteUrl}/images/hero-thali.jpg`,
  description:
    'Janki Rasoi is the best kitchen service and catering service in Sagore & Pithampur. We deliver 100% pure vegetarian homestyle thalis, daily office tiffins, and handle full catering for parties, weddings, and corporate events.',
  servesCuisine: ['North Indian', 'Pure Vegetarian', 'Thali', 'Home Cooked'],
  priceRange: '₹₹',
  telephone: '+91 98765 43210',
  email: 'care@jankirasoi.com',
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
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
