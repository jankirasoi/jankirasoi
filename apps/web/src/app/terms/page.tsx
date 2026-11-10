import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms & Conditions | Janki Rasoi',
  description: 'Terms of service, meal cut-off timings, pure vegetarian assurance, delivery slots, and cancellation policies for Janki Rasoi.',
};

export default function TermsPage() {
  return (
    <main className="flex flex-col relative w-full pt-20 pb-28 bg-[#FFF9F0] min-h-screen">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[#77786F] mb-4">
          <Link href="/" className="hover:text-[#38754A]">Home</Link>
          <span>/</span>
          <span className="text-[#292D26] font-semibold">Terms &amp; Conditions</span>
        </div>

        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-[#EEE7DC] flex flex-col gap-6">
          <div className="border-b border-[#EEE7DC] pb-4">
            <span className="text-xs uppercase tracking-wider text-[#38754A] font-bold">Operational Policies</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#292D26] font-headline mt-1">
              Terms &amp; Conditions
            </h1>
            <p className="text-xs text-[#77786F] mt-1">
              Last updated: October 2026 | Governing all orders through Janki Rasoi
            </p>
          </div>

          {/* Section 1 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              1. Pure Vegetarian Kitchen Commitment
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              Janki Rasoi operates a dedicated 100% pure vegetarian kitchen. We strictly prohibit any meat, eggs, seafood, or alcohol on our premises. All dishes are cooked in pure filtered sunflower and cold-pressed mustard oil with unadulterated spices.
            </p>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              2. Order Cut-Off Times &amp; Fresh Batch Preparation
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              Because our rotis are rolled on the tawa and vegetables are cooked fresh in small batches:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#77786F] space-y-1">
              <li><strong className="text-[#292D26]">Lunch Window (12:00 PM - 02:30 PM):</strong> Orders must be placed before the 12:30 PM batch lock to guarantee hot delivery.</li>
              <li><strong className="text-[#292D26]">Dinner Window (07:30 PM - 10:00 PM):</strong> Pre-orders must be locked by 06:30 PM for on-time night delivery.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              3. Secure Delivery Verification (6-Digit OTP)
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              For your safety and proof of delivery, our riders will request a 6-digit Delivery Handover OTP that appears on your order tracking screen. Please share this code only upon verifying that your insulated foil meal tray is intact and warm.
            </p>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              4. Cancellations &amp; Modifications
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              Orders may be cancelled free of charge before the kitchen begins cooking (status: PLACED). Once an order transitions to PREPARING, ingredients are already on the stove and cancellations cannot be accepted.
            </p>
          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              5. Customer Support &amp; Kitchen Queries
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              For immediate assistance with any ongoing dispatch or meal quality feedback:
            </p>
            <div className="p-3.5 bg-[#FFF9F0] rounded-xl border border-[#EEE7DC] flex flex-col gap-1 text-xs">
              <span className="font-bold text-[#292D26]">Janki Rasoi Operations</span>
              <span className="text-[#77786F]">Phone: <a href="tel:+919755554774" className="text-[#38754A] font-semibold">+91 97555 54774</a></span>
              <span className="text-[#77786F]">WhatsApp: <a href="https://wa.me/919755554774" target="_blank" rel="noreferrer" className="text-[#38754A] font-semibold">+91 97555 54774</a></span>
              <span className="text-[#77786F]">Email: <a href="mailto:care@jankirasoi.com" className="text-[#38754A] font-semibold">care@jankirasoi.com</a></span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
