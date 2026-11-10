import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Janki Rasoi',
  description: 'Learn how Janki Rasoi securely handles customer contact information, delivery addresses, and payment data.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className="flex flex-col relative w-full pt-20 pb-28 bg-[#FFF9F0] min-h-screen">
      <div className="w-full max-w-3xl mx-auto px-4 sm:px-6">
        {/* Header Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-[#77786F] mb-4">
          <Link href="/" className="hover:text-[#38754A]">Home</Link>
          <span>/</span>
          <span className="text-[#292D26] font-semibold">Privacy Policy</span>
        </div>

        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-[#EEE7DC] flex flex-col gap-6">
          <div className="border-b border-[#EEE7DC] pb-4">
            <span className="text-xs uppercase tracking-wider text-[#38754A] font-bold">Legal &amp; Data Transparency</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#292D26] font-headline mt-1">
              Privacy Policy
            </h1>
            <p className="text-xs text-[#77786F] mt-1">
              Last updated: October 2026 | Effective for all Janki Rasoi orders
            </p>
          </div>

          {/* Section 1 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              1. Information We Collect
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              When you order a homestyle meal or subscribe to our daily lunch/dinner service, we collect only the essential details needed for fresh meal dispatch and handover:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#77786F] space-y-1">
              <li><strong className="text-[#292D26]">Contact Information:</strong> Your name, phone number, and optional email for order confirmations and OTP verification.</li>
              <li><strong className="text-[#292D26]">Delivery Address:</strong> Flat/house number, building name, street, nearby landmarks, and South Delhi postal pincode.</li>
              <li><strong className="text-[#292D26]">Order Preferences:</strong> Meal selections, portion sizes, spice level notes, and optional instructions for our kitchen or delivery riders.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              2. How Your Information Is Used
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              We never sell, rent, or trade your personal data. Your information is used strictly to:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#77786F] space-y-1">
              <li>Process and prepare your meal batches fresh before delivery windows.</li>
              <li>Dispatch the delivery rider to your specified address and generate the secure 6-digit delivery verification OTP.</li>
              <li>Send critical transactional updates via SMS/WhatsApp regarding meal preparation and rider arrival.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              3. Payment Security &amp; No Stored Card Data
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              We support both Cash on Delivery (COD) and secure UPI/Online payments. Online payments are processed directly through certified RBI-compliant payment gateways with 256-bit SSL encryption. Janki Rasoi never stores your bank account numbers, UPI PINs, or credit/debit card numbers.
            </p>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              4. Zero Marketing Spam Policy
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              We respect your peace of mind. We do not bombard customers with unsolicited marketing robocalls, third-party promotional SMS, or spam emails.
            </p>
          </section>

          {/* Section 5: Legal Protection under Indian Law (Contract Act 1872 & Consumer Protection 2020) */}
          <section className="flex flex-col gap-2 p-4 sm:p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm sm:text-base">
              <span className="material-symbols-outlined text-lg text-amber-800">gavel</span>
              <h2>5. Cash on Delivery (COD) Contract, Non-Delivery Penalty &amp; Account Suspension (Indian Law Compliance)</h2>
            </div>
            <p className="text-xs sm:text-sm text-[#444] leading-relaxed">
              Under the <strong>Indian Contract Act, 1872 (Section 73 &amp; Section 75 — Compensation for Loss or Damage Caused by Breach of Contract)</strong> and the <strong>Consumer Protection (E-Commerce) Rules, 2020 (Rule 4 &amp; Rule 6 — Prevention of Unfair Trade Practices and Frivolous Orders)</strong>:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#555] space-y-1.5 leading-relaxed">
              <li>
                <strong className="text-[#292D26]">Perishable Fresh Meal Commitment:</strong> Every meal ordered from Janki Rasoi is prepared fresh on-demand upon customer confirmation. Cooked vegetarian food is perishable and cannot be restocked, re-chilled, or resold.
              </li>
              <li>
                <strong className="text-[#292D26]">Legally Binding Order Confirmation:</strong> When an order is placed via Cash on Delivery (COD) or Online Payment, it forms a valid commercial contract. The customer is obligated to provide an accurate delivery address, remain reachable by phone during the dispatch window, and complete the verbal OTP handover payment.
              </li>
              <li>
                <strong className="text-[#292D26]">Breach of Contract &amp; Direct Losses:</strong> If a customer provides a fictitious address, refuses to receive the dispatched meal, or remains persistently unreachable / does not answer phone calls when the delivery rider arrives at their location, Janki Rasoi reserves the statutory right to immediately suspend/ban the customer account and associated mobile number.
              </li>
              <li>
                <strong className="text-[#292D26]">Settlement of Preparation &amp; Transit Losses:</strong> To deter fraudulent and frivolous ordering and protect our delivery fleet, suspended accounts may only be reinstated upon settlement of the incurred kitchen preparation and logistic dispatch loss penalty (default ₹250 or actual order value) via the self-service online payment window.
              </li>
            </ul>
          </section>

          {/* Section 6: Cookies & Consent under Digital Personal Data Protection Act (DPDP Act, 2023) */}
          <section className="flex flex-col gap-2 p-4 sm:p-5 rounded-2xl bg-emerald-50/50 border border-emerald-200/70">
            <div className="flex items-center gap-2 text-emerald-950 font-bold text-sm sm:text-base">
              <span className="material-symbols-outlined text-lg text-emerald-800">cookie</span>
              <h2>6. Cookie Policy &amp; Consent (Digital Personal Data Protection Act, 2023)</h2>
            </div>
            <p className="text-xs sm:text-sm text-[#444] leading-relaxed">
              In strict adherence to the <strong>Digital Personal Data Protection Act, 2023 (DPDP Act 2023, Section 7 — Certain Legitimate Uses)</strong>:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#555] space-y-1.5 leading-relaxed">
              <li>
                <strong className="text-[#292D26]">Strictly Necessary &amp; Security Cookies:</strong> We utilize first-party secure HTTP session cookies (<code className="bg-stone-100 px-1 py-0.5 rounded text-[11px] font-mono">customer_session_token</code>, <code className="bg-stone-100 px-1 py-0.5 rounded text-[11px] font-mono">session_token</code>, <code className="bg-stone-100 px-1 py-0.5 rounded text-[11px] font-mono">jr_cookie_consent</code>) solely for authentication, session continuity, active cart persistence, and fraud prevention.
              </li>
              <li>
                <strong className="text-[#292D26]">No Third-Party Tracking or Profiling:</strong> We do not deploy third-party advertising cookies, cross-site trackers, or data-broker surveillance pixels.
              </li>
              <li>
                <strong className="text-[#292D26]">User Choice &amp; Revocation:</strong> You can choose to accept cookies via our cookie consent banner or manage cookie preferences directly in your browser settings at any time.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="flex flex-col gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#292D26]">
              7. Contact Kitchen Administration &amp; Grievance Redressal
            </h2>
            <p className="text-xs sm:text-sm text-[#77786F] leading-relaxed">
              If you have any questions, wish to dispute an account suspension, or request data deletion under DPDP Act 2023, please reach out to our designated Grievance Officer:
            </p>
            <div className="p-3.5 bg-[#FFF9F0] rounded-xl border border-[#EEE7DC] flex flex-col gap-1 text-xs">
              <span className="font-bold text-[#292D26]">Janki Rasoi Legal &amp; Customer Grievance Desk</span>
              <span className="text-[#77786F]">Sagore Main Road, Pithampur / Betma, Madhya Pradesh — 454774</span>
              <span className="text-[#77786F]">Phone: <a href="tel:+919755554774" className="text-[#38754A] font-semibold">+91 97555 54774</a></span>
              <span className="text-[#77786F]">Email: <a href="mailto:care@jankirasoi.in" className="text-[#38754A] font-semibold">care@jankirasoi.in</a></span>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
