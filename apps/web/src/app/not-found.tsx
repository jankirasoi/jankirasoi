import React from 'react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[70vh] pt-20 pb-28 px-4 bg-[#FFF9F0] text-[#292D26]">
      <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-[#EEE7DC] max-w-md w-full text-center flex flex-col items-center gap-4">
        {/* Pot / Plate icon */}
        <div className="w-16 h-16 rounded-full bg-[#FFF1DC] text-[#E99A32] flex items-center justify-center">
          <span className="material-symbols-outlined text-[36px]">soup_kitchen</span>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-[#38754A]">
            Page Not Found &bull; 404
          </span>
          <h1 className="text-xl sm:text-2xl font-bold font-headline text-[#292D26]">
            This Meal Isn't on the Stove
          </h1>
          <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed mt-1">
            The page or dish you're searching for might have been moved or doesn't exist. Explore today's freshly prepared specials instead.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full mt-2">
          <Link
            href="/menu"
            className="w-full sm:w-1/2 h-11 rounded-xl bg-[#38754A] hover:bg-[#285C38] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
            <span>Today's Menu</span>
          </Link>

          <Link
            href="/"
            className="w-full sm:w-1/2 h-11 rounded-xl bg-[#FFF9F0] hover:bg-[#EEE7DC] text-[#292D26] border border-[#EEE7DC] text-xs sm:text-sm font-semibold flex items-center justify-center gap-1 transition-colors"
          >
            <span>Back to Home</span>
          </Link>
        </div>

        <div className="pt-2 text-xs text-[#77786F]">
          Need help? <a href="tel:+919755554774" className="text-[#38754A] font-bold underline">Call Kitchen Desk: +91 97555 54774</a>
        </div>
      </div>
    </main>
  );
}
