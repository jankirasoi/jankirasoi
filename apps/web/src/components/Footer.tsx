'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Footer() {
  const pathname = usePathname();

  // Only show footer (and Privacy Policy) on the home page
  if (pathname !== '/') return null;

  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-[#EEE7DC] text-[#292D26] pb-24 md:pb-12 mt-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {/* 1. Brand & Kitchen Assurance */}
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#38754A] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                JR
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-[#292D26] leading-tight font-headline">
                  Janki Rasoi
                </span>
                <span className="text-[11px] text-[#77786F] font-medium">
                  Ghar Jaisa Khana, Har Din
                </span>
              </div>
            </Link>

            <p className="text-xs text-[#77786F] leading-relaxed mt-1">
              Pure vegetarian homestyle kitchen serving nutritious, daily cooked thalis and tiffins in South Delhi. Freshly prepared with cold-pressed mustard &amp; sunflower oil.
            </p>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#EAF4ED] text-[#38754A] text-xs font-semibold w-fit border border-[#38754A]/20">
              <span className="w-2 h-2 rounded-full bg-[#38754A]"></span>
              <span>100% Pure Vegetarian Kitchen</span>
            </div>
          </div>

          {/* 2. Quick Navigation */}
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#77786F]">
              Quick Links
            </span>
            <ul className="flex flex-col gap-2 text-xs font-medium">
              <li>
                <Link href="/" className="hover:text-[#38754A] transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/menu" className="hover:text-[#38754A] transition-colors">
                  Today's Fresh Menu
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-[#38754A] transition-colors">
                  Review Tray &amp; Checkout
                </Link>
              </li>
              <li>
                <Link href="/track" className="hover:text-[#38754A] transition-colors">
                  Live Kitchen Order Tracking
                </Link>
              </li>
              <li>
                <Link
                  href="/admin"
                  className="hover:text-[#38754A] transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px] text-amber-600">admin_panel_settings</span>
                  <span>Kitchen Admin &amp; Staff KDS</span>
                </Link>
              </li>
              <li>
                <Link href="/rider" className="hover:text-[#38754A] transition-colors flex items-center gap-1">
                  <span>🛵</span>
                  <span>Rider Partner App</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* 3. Kitchen Hours & Area */}
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#77786F]">
              Delivery Hours
            </span>
            <div className="flex flex-col gap-2 text-xs text-[#77786F]">
              <div>
                <span className="font-semibold text-[#292D26] block">Lunch Batch</span>
                <span>12:00 PM - 02:30 PM (Orders cut off at 12:30 PM)</span>
              </div>
              <div>
                <span className="font-semibold text-[#292D26] block">Dinner Batch</span>
                <span>07:30 PM - 10:00 PM (Orders cut off at 06:30 PM)</span>
              </div>
              <div className="pt-1 text-[11px]">
                <span className="text-[#38754A] font-semibold">Service Zone:</span> South Delhi (Malviya Nagar, Saket, Hauz Khas, Greater Kailash, Outer Ring Road)
              </div>
            </div>
          </div>

          {/* 4. Contact & Support */}
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#77786F]">
              Kitchen Contact
            </span>
            <ul className="flex flex-col gap-2 text-xs">
              <li>
                <a
                  href="tel:+919876543210"
                  className="flex items-center gap-1.5 text-[#292D26] hover:text-[#38754A] transition-colors font-medium"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#38754A]">call</span>
                  <span>+91 98765 43210</span>
                </a>
              </li>
              <li>
                <a
                  href="mailto:care@jankirasoi.com"
                  className="flex items-center gap-1.5 text-[#292D26] hover:text-[#38754A] transition-colors font-medium"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#38754A]">mail</span>
                  <span>care@jankirasoi.com</span>
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/919876543210?text=Hi%20Janki%20Rasoi,%20I%20have%20an%20order%20query"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF4ED] text-[#38754A] font-semibold hover:bg-[#d8edd6] transition-colors mt-1"
                >
                  <span className="material-symbols-outlined text-[16px]">chat</span>
                  <span>WhatsApp Kitchen Desk</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Legal */}
        <div className="mt-8 pt-6 border-t border-[#EEE7DC] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#77786F]">
          <p>
            &copy; {currentYear} Janki Rasoi. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-[#38754A] transition-colors">
              Privacy Policy
            </Link>
            <span>&bull;</span>
            <Link href="/terms" className="hover:text-[#38754A] transition-colors">
              Terms &amp; Conditions
            </Link>
            <span>&bull;</span>
            <Link href="/track" className="hover:text-[#38754A] transition-colors">
              Order Status
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
