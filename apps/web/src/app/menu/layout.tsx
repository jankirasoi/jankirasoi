import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Today's Fresh Menu & Catering | Janki Rasoi Sagore",
  description:
    "Explore today's freshly prepared pure vegetarian menu at Janki Rasoi Sagore. Special North Indian thalis, parathas, sabzi bowls, and bulk catering service orders in Sagore & Pithampur.",
  keywords: [
    'janki rasoi menu',
    'janki rasoi sagore menu',
    'sagore catreen sevice',
    'sagore catering menu',
    'best kichen service sagore thali',
    'veg food sagore pithampur',
    'tiffin menu sagore',
  ],
  alternates: {
    canonical: '/menu',
  },
  openGraph: {
    title: "Today's Fresh Menu & Catering | Janki Rasoi Sagore",
    description:
      'Daily freshly prepared pure vegetarian North Indian thalis, homestyle meals, and catering services in Sagore & Pithampur.',
    url: 'https://jankirasoi.com/menu',
  },
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
