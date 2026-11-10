'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import { useRouter } from 'next/navigation';

interface BanDetails {
  isBanned: boolean;
  phone?: string;
  name?: string;
  reason?: string;
  penaltyAmountPaise?: number;
  penaltyAmountRupees?: number;
}

export default function CustomerBanLockModal() {
  const router = useRouter();
  const [banDetails, setBanDetails] = useState<BanDetails | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'CARD'>('UPI');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS'>('IDLE');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check customer ban status
  const checkStatus = useCallback(async () => {
    try {
      const storedPhone = typeof window !== 'undefined' ? localStorage.getItem('jr_customer_phone') : null;
      if (!storedPhone) {
        setIsOpen(false);
        return;
      }
      const res = await api.checkCustomerBanStatus(storedPhone);
      if (res.isBanned) {
        setBanDetails(res);
        setIsOpen(true);
      } else {
        setIsOpen(false);
        setBanDetails(null);
      }
    } catch {
      // Ignore network hiccup
    }
  }, []);

  useEffect(() => {
    checkStatus();

    const handleStorageChange = () => checkStatus();
    const handleAuthChange = () => checkStatus();
    const handleExplicitBanEvent = (e: any) => {
      if (e.detail) {
        setBanDetails(e.detail);
        setIsOpen(true);
      } else {
        checkStatus();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('jr_auth_changed', handleAuthChange);
    window.addEventListener('jr_customer_banned', handleExplicitBanEvent);
    window.addEventListener('focus', handleStorageChange);

    // Light 10s polling to catch live ban / unban events from admin console
    const interval = setInterval(checkStatus, 10000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('jr_auth_changed', handleAuthChange);
      window.removeEventListener('jr_customer_banned', handleExplicitBanEvent);
      window.removeEventListener('focus', handleStorageChange);
      clearInterval(interval);
    };
  }, [checkStatus]);

  // Handle Pay Penalty & Instant Unban
  const handlePayAndUnban = async () => {
    if (!banDetails?.phone) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setPaymentStep('PROCESSING');

    try {
      // Realistic simulated payment delay for UX verification
      await new Promise((r) => setTimeout(r, 1200));

      const txnRef = `TXN_UNBAN_${Date.now().toString(36).toUpperCase()}`;
      const res = await api.payUnbanPenalty(banDetails.phone, paymentMethod, txnRef);

      setPaymentStep('SUCCESS');
      setSuccessMsg(res.message || 'Payment verified! Account has been unlocked.');

      // Broadcast to admin console that unban penalty was paid
      try {
        const ordersBroadcast = new BroadcastChannel('jankirasoi_orders_channel');
        ordersBroadcast.postMessage({
          type: 'CUSTOMER_UNBANNED_PAYMENT',
          phone: banDetails.phone,
          name: banDetails.name,
          amount: penaltyRupees,
          paymentMethod: paymentMethod,
        });
        ordersBroadcast.close();
      } catch {}

      // Play success chime
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
      } catch {}

      // Auto close after 1.8 seconds and notify app
      setTimeout(() => {
        setIsOpen(false);
        setPaymentStep('IDLE');
        setIsProcessing(false);
        setBanDetails(null);
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('jr_auth_changed'));
        window.dispatchEvent(new Event('jr_address_changed'));
      }, 1800);
    } catch (err: any) {
      setPaymentStep('IDLE');
      setIsProcessing(false);
      setErrorMsg(err.message || 'Payment failed. Please try again.');
    }
  };

  // Handle Logout / Switch Account
  const handleLogoutAndSwitch = async () => {
    try {
      await api.logout('CUSTOMER');
    } catch {}

    if (typeof window !== 'undefined') {
      localStorage.removeItem('jr_customer_phone');
      localStorage.removeItem('jr_customer_name');
      localStorage.removeItem('jr_customer_address');
      localStorage.removeItem('jr_session_token');
      localStorage.removeItem('jr_user_profile');
    }

    setIsOpen(false);
    setBanDetails(null);
    setPaymentStep('IDLE');
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('jr_auth_changed'));

    // Redirect to login page to allow entering another phone number
    router.push('/login');
  };

  if (!isOpen || !banDetails) return null;

  const penaltyRupees = banDetails.penaltyAmountRupees ?? 250;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-red-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Top Restricted Warning Banner */}
        <div className="bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 p-5 text-white flex flex-col items-center text-center relative">
          <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white mb-2 shadow-inner border border-white/30">
            <span className="material-symbols-outlined text-3xl animate-bounce">lock</span>
          </div>
          <span className="text-[11px] font-extrabold uppercase tracking-widest bg-black/25 px-3 py-0.5 rounded-full mb-1">
            Account Restricted
          </span>
          <h2 className="text-xl font-black font-headline tracking-tight">Account Restricted / Ban Hai</h2>
          <p className="text-xs text-rose-100 mt-1 font-mono">
            +91 {banDetails.phone} {banDetails.name ? `• ${banDetails.name}` : ''}
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 flex flex-col gap-4">
          {paymentStep === 'SUCCESS' ? (
            <div className="py-8 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl">check_circle</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Payment Successful!</h3>
              <p className="text-xs text-gray-600 max-w-xs">{successMsg}</p>
              <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-3 py-1 rounded-full">
                Unlocking Janki Rasoi Kitchen...
              </span>
            </div>
          ) : (
            <>
              {/* Ban Explanation Notice */}
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200/80 flex flex-col gap-2 text-xs text-gray-800">
                <div className="flex items-center gap-1.5 font-bold text-rose-800">
                  <span className="material-symbols-outlined text-base">info</span>
                  <span>Ban Hone Ka Kaaran (Reason):</span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/90 border border-rose-200 text-gray-900 font-semibold leading-relaxed">
                  &ldquo;{banDetails.reason || 'Customer phone unreachable / did not answer call on COD delivery'}&rdquo;
                </div>

                {/* Statutory Indian Law Citation */}
                <div className="pt-2 border-t border-rose-200/60 flex flex-col gap-1 text-[11px] text-gray-700">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900">
                    <span className="material-symbols-outlined text-sm">gavel</span>
                    <span>Indian Law Compliance &amp; Legal Right:</span>
                  </div>
                  <p className="text-gray-600 leading-relaxed pl-5">
                    Action taken under <strong>Indian Contract Act, 1872 (Section 73 — Breach of Perishable Food Order)</strong> &amp; <strong>Consumer Protection (E-Commerce) Rules, 2020</strong>. Cooked food cannot be restocked; delivery non-acceptance causes direct preparation &amp; rider logistics loss.
                  </p>
                  <div className="pl-5 mt-0.5">
                    <Link
                      href="/privacy"
                      target="_blank"
                      className="text-[#008744] hover:text-emerald-900 font-bold underline inline-flex items-center gap-0.5"
                    >
                      <span>Janki Rasoi Privacy Policy &amp; Legal Rules Padhein</span>
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Outstanding Penalty Amount Card */}
              <div className="p-4 rounded-2xl bg-[#FFFDF9] border border-stone-200 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Outstanding Unban Penalty
                  </span>
                  <div className="text-xs font-semibold text-gray-700">Kitchen Recovery Fee</div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-black text-2xl text-emerald-800">₹{penaltyRupees}</span>
                  <span className="text-[10px] text-gray-400 block font-medium">Instant Online Recovery</span>
                </div>
              </div>

              {/* Payment Mode Selection */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider">
                  Select Payment Option:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('UPI')}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                      paymentMethod === 'UPI'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="material-symbols-outlined text-emerald-700 text-lg">bolt</span>
                    <div className="min-w-0">
                      <div className="text-xs leading-none">Instant UPI</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">GPay / PhonePe / Paytm</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CARD')}
                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
                      paymentMethod === 'CARD'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span className="material-symbols-outlined text-blue-700 text-lg">credit_card</span>
                    <div className="min-w-0">
                      <div className="text-xs leading-none">Card / NetBanking</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">Debit / Credit / Bank</div>
                    </div>
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">error</span>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Primary Pay & Unban Button */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={handlePayAndUnban}
                className="w-full py-3.5 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/20 transition-all cursor-pointer disabled:opacity-60"
              >
                {isProcessing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>Verifying Payment (₹{penaltyRupees})...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">lock_open</span>
                    <span>Pay ₹{penaltyRupees} &amp; Unban Account</span>
                  </>
                )}
              </button>

              {/* Contact Us / Kitchen Dispute & Support */}
              <div className="p-3 rounded-2xl bg-[#FFFDF9] border border-stone-200/90 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-800 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#38754A] text-base">support_agent</span>
                    <span>Contact Us / Kitchen Helpdesk</span>
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">9 AM - 11 PM</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <a
                    href="tel:+919755554774"
                    className="py-2 px-2.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-gray-800 font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[#38754A] text-[16px]">call</span>
                    <span>Call Kitchen</span>
                  </a>
                  <a
                    href={`https://wa.me/919755554774?text=${encodeURIComponent(
                      `Hello Janki Rasoi Support, mera account (+91 ${banDetails.phone}) restricted hai. Help chahiye.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2 px-2.5 rounded-xl border border-emerald-200 bg-[#EAF4ED] hover:bg-[#d8edd6] text-[#38754A] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">chat</span>
                    <span>WhatsApp Support</span>
                  </a>
                </div>
              </div>

              {/* Secondary Option: Switch Account / Logout */}
              <div className="pt-2 border-t border-gray-100 flex flex-col gap-2 text-center">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleLogoutAndSwitch}
                  className="w-full py-2.5 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 active:scale-[0.99] text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-base text-gray-500">switch_account</span>
                  <span>Logout / Switch to Another Account (Doosre Number se Login)</span>
                </button>
                <p className="text-[10px] text-gray-400">
                  Kisi aur mobile number se naya order karne ke liye Switch Account par click karein.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

