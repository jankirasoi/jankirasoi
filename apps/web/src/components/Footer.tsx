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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {/* 1. Brand & Kitchen Assurance */}
          <div className="flex flex-col gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#38754A] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                JR
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-base text-[#292D26] leading-tight font-headline">
                  Janki Rasoi Sagore
                </span>
                <span className="text-[11px] text-[#77786F] font-medium">
                  Best Tiffin Center &amp; Kitchen Service
                </span>
              </div>
            </Link>

            <p className="text-xs text-[#77786F] leading-relaxed mt-1">
              <strong>Janki Rasoi Sagore</strong> - The best pure vegetarian tiffin center &amp; kitchen service in Sagore &amp; Pithampur. Nutritious, daily freshly cooked home-style thalis and tiffins delivered hot.
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
            </ul>
          </div>

          {/* 3. Kitchen Hours & Area */}
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#77786F]">
              Tiffin &amp; Kitchen Hours
            </span>
            <div className="flex flex-col gap-2 text-xs text-[#77786F]">
              <div>
                <span className="font-semibold text-[#292D26] block">Kitchen Service</span>
                <span>11:00 AM - 11:00 PM (Daily Fresh Batch Deliveries)</span>
              </div>
              <div>
                <span className="font-semibold text-[#292D26] block">Sagore Tiffin Center</span>
                <span>Daily Fresh Lunch &amp; Dinner Tiffins</span>
              </div>
              <div className="pt-1 text-[11px]">
                <span className="text-[#38754A] font-semibold">Service Zone:</span> Sagore, Pithampur Industrial Area, Sector 1-3 &amp; Nearby Localities
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
                  href="tel:+919755554774"
                  className="flex items-center gap-1.5 text-[#292D26] hover:text-[#38754A] transition-colors font-medium"
                >
                  <span className="material-symbols-outlined text-[16px] text-[#38754A]">call</span>
                  <span>+91 97555 54774</span>
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
                  href="https://wa.me/919755554774?text=Hi%20Janki%20Rasoi,%20I%20have%20an%20order%20query"
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
