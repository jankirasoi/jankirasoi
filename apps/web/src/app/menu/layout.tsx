import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Today's Fresh Menu & Tiffin Plans | Janki Rasoi Sagore",
  description:
    "Explore today's freshly prepared pure vegetarian menu and daily tiffin center service at Janki Rasoi Sagore. Special North Indian thalis, parathas, sabzi bowls, and daily lunch/dinner tiffins in Sagore & Pithampur.",
  keywords: [
    'janki rasoi menu',
    'janki rasoi sagore menu',
    'sagore tiffin center',
    'sagore tiffine center',
    'tiffin center sagore',
    'best tiffin service sagore',
    'best kichen service sagore thali',
    'veg food sagore pithampur',
    'tiffin menu sagore',
  ],
  alternates: {
    canonical: '/menu',
  },
  openGraph: {
    title: "Today's Fresh Menu & Tiffin Plans | Janki Rasoi Sagore",
    description:
      'Daily freshly prepared pure vegetarian North Indian thalis, homestyle meals, and daily tiffin center service in Sagore & Pithampur.',
    url: 'https://jankirasoi.com/menu',
  },
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
