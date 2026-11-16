'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Header from '../../components/Header';
import LocationMapModal, { LocationData } from '../../components/LocationMapModal';
import { api, UserProfile } from '../../lib/api';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/';

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 2-Step Flow: 'PHONE' first, then 'ADDRESS' only if new customer without address
  const [step, setStep] = useState<'PHONE' | 'ADDRESS'>('PHONE');

  // Form Fields
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [flat, setFlat] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('454774');

  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Check auth state on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const user = await api.getCurrentUser('CUSTOMER');
        if (user && user.role === 'CUSTOMER') {
          setCurrentUser(user);
        }
      } catch {
        // Not logged in
      } finally {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, []);

  const handleLocationSelected = (loc: LocationData) => {
    if (loc.flat) setFlat(loc.flat);
    setStreet(loc.street || loc.formattedAddress || '');
    if (loc.landmark) setLandmark(loc.landmark);
    if (loc.pincode) setPincode(loc.pincode);
    setIsMapModalOpen(false);
  };

  // STEP 1: Phone-only verification & instant auto-login for returning users
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      // 1. Authenticate phone number with backend
      const res = await api.loginCustomer(cleanPhone);

      // Check if user has an existing saved address on account
      const userAddr =
        res.user.savedAddress ||
        (res.user.savedAddresses && res.user.savedAddresses.length > 0
          ? res.user.savedAddresses[0]
          : null);
      let hasAddress = Boolean(userAddr && (userAddr.flat || userAddr.street));

      // Also check local storage for this device/phone
      let localAddr: any = null;
      if (!hasAddress && typeof window !== 'undefined') {
        try {
          const stored =
            localStorage.getItem('jr_customer_address') ||
            localStorage.getItem('jr_selected_address');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.flat || parsed.street) {
              localAddr = parsed;
              hasAddress = true;
            }
          }
        } catch {}
      }

      if (hasAddress) {
        // RETURNING USER: Address already exists -> Log in immediately!
        const chosenAddr = userAddr || localAddr;
        if (typeof window !== 'undefined') {
          localStorage.setItem('jr_session_token', res.sessionToken);
          localStorage.setItem('jr_user_profile', JSON.stringify(res.user));
          localStorage.setItem('jr_customer_phone', res.user.phone);
          if (res.user.name) localStorage.setItem('jr_customer_name', res.user.name);
          if (chosenAddr) {
            localStorage.setItem('jr_customer_address', JSON.stringify(chosenAddr));
            localStorage.setItem('jr_selected_address', JSON.stringify(chosenAddr));
          }
          window.dispatchEvent(new Event('storage'));
          window.dispatchEvent(new Event('jr_address_changed'));
          window.dispatchEvent(new Event('jr_auth_changed'));
        }

        const displayName =
          res.user.name && !res.user.name.startsWith('Customer ')
            ? `, ${res.user.name}`
            : '';
        setSuccessMsg(`Welcome back${displayName}! Logging you in...`);

        setTimeout(() => {
          router.push(redirectUrl);
        }, 500);
      } else {
        // NEW USER (or no address on file): Proceed to Step 2 to enter address
        if (typeof window !== 'undefined') {
          localStorage.setItem('jr_session_token', res.sessionToken);
          localStorage.setItem('jr_customer_phone', cleanPhone);
        }
        if (res.user.name && !res.user.name.startsWith('Customer ')) {
          setName(res.user.name);
        }
        setStep('ADDRESS');
        setSuccessMsg('Mobile verified! Please provide your delivery address.');
      }
    } catch (err: any) {
      if (
        err.message?.toLowerCase().includes('restricted') ||
        err.message?.toLowerCase().includes('blocked') ||
        err.message?.toLowerCase().includes('ban')
      ) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('jr_customer_phone', cleanPhone);
          window.dispatchEvent(new CustomEvent('jr_customer_banned'));
        }
      }
      setError(err.message || 'Login failed. Please check your phone number and try again.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Address submission for new customers
  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);

    if (!flat.trim() || !street.trim()) {
      setError('Please provide your Flat/House No. and Street/Area.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const savedAddress = {
        flat: flat.trim(),
        street: street.trim(),
        landmark: landmark.trim() || undefined,
        pincode: pincode.trim() || '454774',
        city: 'Sagore, Pithampur',
      };

      const res = await api.loginCustomer(
        cleanPhone,
        name.trim() || undefined,
        savedAddress,
      );

      if (typeof window !== 'undefined') {
        localStorage.setItem('jr_session_token', res.sessionToken);
        localStorage.setItem('jr_user_profile', JSON.stringify(res.user));
        localStorage.setItem('jr_customer_phone', res.user.phone);
        if (res.user.name) localStorage.setItem('jr_customer_name', res.user.name);
        localStorage.setItem('jr_customer_address', JSON.stringify(savedAddress));
        localStorage.setItem('jr_selected_address', JSON.stringify(savedAddress));
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('jr_address_changed'));
        window.dispatchEvent(new Event('jr_auth_changed'));
      }

      setSuccessMsg('Account setup complete! Redirecting...');
      setTimeout(() => {
        router.push(redirectUrl);
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to save address. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await api.logout('CUSTOMER');
      setCurrentUser(null);
      setStep('PHONE');
      setPhone('');
      setName('');
      setFlat('');
      setStreet('');
      setLandmark('');
      if (typeof window !== 'undefined') {
        localStorage.removeItem('jr_customer_phone');
        localStorage.removeItem('jr_customer_name');
        localStorage.removeItem('jr_customer_address');
        localStorage.removeItem('jr_selected_address');
        localStorage.removeItem('jr_session_token');
        localStorage.removeItem('jr_user_profile');
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('jr_address_changed'));
        window.dispatchEvent(new Event('jr_auth_changed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F0] text-[#292D26] font-body flex flex-col selection:bg-[#38754A] selection:text-white pb-20">
      <Header />

      <main className="max-w-md mx-auto w-full px-4 pt-20 sm:pt-24 flex-1 flex flex-col justify-center">
        {/* Navigation back */}
        <div className="py-2 mb-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#77786F] hover:text-[#292D26] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to Store</span>
          </Link>
        </div>

        {checkingAuth ? (
          <div className="bg-white rounded-3xl border border-[#EEE7DC] p-8 shadow-xs animate-pulse flex flex-col gap-4">
            <div className="w-12 h-12 bg-slate-100 rounded-full mx-auto"></div>
            <div className="h-6 bg-slate-100 rounded-lg w-2/3 mx-auto"></div>
            <div className="h-4 bg-slate-100 rounded-lg w-1/2 mx-auto"></div>
            <div className="h-12 bg-slate-100 rounded-xl mt-4"></div>
          </div>
        ) : currentUser ? (
          /* Already Logged In State */
          <div className="bg-white rounded-3xl border border-[#EEE7DC] p-6 sm:p-8 shadow-xs flex flex-col gap-5 text-center">
            <div className="w-16 h-16 rounded-full bg-[#EAF4ED] text-[#38754A] flex items-center justify-center mx-auto shadow-xs">
              <span className="material-symbols-outlined text-[32px]">account_circle</span>
            </div>

            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF4ED] text-[#38754A] border border-[#38754A]/20">
                ACTIVE SESSION
              </span>
              <h1 className="font-headline font-bold text-xl text-[#292D26] mt-2">
                Welcome back, {currentUser.name || 'Valued Customer'}!
              </h1>
              <p className="text-xs text-[#77786F] mt-1 font-mono">
                +91 {currentUser.phone}
              </p>
            </div>

            {/* Saved Address Preview */}
            <div className="bg-[#FFF9F0] border border-[#EEE7DC] rounded-2xl p-4 text-left text-xs">
              <div className="flex items-center gap-1.5 text-[#38754A] font-bold mb-1">
                <span className="material-symbols-outlined text-[16px]">location_on</span>
                <span>Delivery Address</span>
              </div>
              <p className="font-semibold text-slate-800">
                {currentUser.savedAddress?.flat || 'No flat specified'}
              </p>
              <p className="text-slate-600">
                {currentUser.savedAddress?.street || 'Sagore, Pithampur'}
              </p>
              {currentUser.savedAddress?.pincode && (
                <p className="text-[11px] text-[#77786F] mt-1 font-medium">
                  Pincode: {currentUser.savedAddress.pincode}
                </p>
              )}
            </div>

            {/* Navigation Actions */}
            <div className="flex flex-col gap-2.5 pt-2">
              <Link
                href={redirectUrl}
                className="w-full py-3.5 bg-[#38754A] hover:bg-[#285C38] text-white font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all active:scale-98 flex items-center justify-center gap-1.5"
              >
                <span>Continue to {redirectUrl === '/' ? 'Store' : 'Destination'}</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </Link>

              <Link
                href="/orders"
                className="w-full py-3 bg-[#FFF9F0] hover:bg-[#F3EADF] text-[#38754A] border border-[#EEE7DC] font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                <span>View My Orders &amp; Live Tracking</span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
                className="w-full py-2.5 text-xs text-rose-600 hover:text-rose-700 font-semibold hover:bg-rose-50 rounded-xl transition-colors"
              >
                {loading ? 'Signing out...' : 'Sign Out / Switch Phone Number'}
              </button>
            </div>
          </div>
        ) : step === 'PHONE' ? (
          /* STEP 1: Phone-only Sign In Form */
          <div className="bg-white rounded-3xl border border-[#EEE7DC] p-6 sm:p-8 shadow-xs flex flex-col gap-5">
            {/* Header / Intro */}
            <div className="text-center">
              <span className="w-12 h-12 rounded-2xl bg-[#EAF4ED] text-[#38754A] inline-flex items-center justify-center mb-3 shadow-2xs">
                <span className="material-symbols-outlined text-[26px]">restaurant</span>
              </span>
              <h1 className="font-headline font-black text-2xl text-[#292D26] tracking-tight">
                Customer Sign In
              </h1>
              <p className="text-xs text-[#77786F] mt-1.5 leading-relaxed">
                Enter your mobile number to sign in or get started. Existing users will be logged in automatically!
              </p>
            </div>

            {/* Error / Success Alerts */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-[#EAF4ED] border border-[#38754A]/30 text-[#38754A] text-xs rounded-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">check_circle</span>
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              {/* Phone Input */}
              <div>
                <label className="block text-xs font-bold text-[#292D26] uppercase tracking-wider mb-1.5">
                  Mobile Number *
                </label>
                <div className="flex items-center bg-[#FFF9F0] border border-[#EEE7DC] rounded-xl overflow-hidden focus-within:border-[#38754A] focus-within:bg-white transition-all shadow-2xs">
                  <span className="px-3 text-xs font-bold text-[#38754A] bg-[#EAF4ED] h-12 flex items-center border-r border-[#EEE7DC]">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    autoFocus
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    className="w-full px-3 py-3 text-sm font-semibold bg-transparent outline-none placeholder-[#77786F]"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || phone.replace(/\D/g, '').length < 10}
                className="w-full py-3.5 bg-[#38754A] hover:bg-[#285C38] active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Continue</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* STEP 2: Address Setup for New Users */
          <div className="bg-white rounded-3xl border border-[#EEE7DC] p-6 sm:p-8 shadow-xs flex flex-col gap-5 animate-in fade-in duration-200">
            {/* Header */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF4ED] text-[#38754A] border border-[#38754A]/20">
                  NEW CUSTOMER SETUP
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setStep('PHONE');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs font-bold text-[#38754A] hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                  <span>Change number</span>
                </button>
              </div>
              <h1 className="font-headline font-black text-xl text-[#292D26] tracking-tight">
                Delivery Address
              </h1>
              <p className="text-xs text-[#77786F] mt-1 leading-relaxed">
                Enter your name and delivery address so our riders can deliver your meals warm &amp; fresh.
              </p>
            </div>

            {/* Verified Phone Chip */}
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#FFF9F0] border border-[#EEE7DC] text-xs">
              <span className="text-[#77786F]">Signing in as:</span>
              <span className="font-bold text-[#292D26] flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px] text-[#38754A]">check_circle</span>
                <span>+91 {phone}</span>
              </span>
            </div>

            {/* Error / Success Alerts */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">error</span>
                <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 bg-[#EAF4ED] border border-[#38754A]/30 text-[#38754A] text-xs rounded-xl flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0">check_circle</span>
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddressSubmit} className="space-y-4">
              {/* Full Name Input */}
              <div>
                <label className="block text-xs font-bold text-[#292D26] uppercase tracking-wider mb-1.5">
                  Your Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Sharma"
                  className="w-full px-4 py-3 bg-[#FFF9F0] border border-[#EEE7DC] rounded-xl text-sm font-semibold text-[#292D26] placeholder-[#77786F] focus:border-[#38754A] focus:bg-white outline-none transition-all shadow-2xs"
                />
              </div>

              {/* Address Section */}
              <div className="pt-2 border-t border-slate-100 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#38754A] uppercase tracking-wider">
                    Delivery Location
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsMapModalOpen(true)}
                    className="text-xs font-bold text-[#E25822] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">map</span>
                    <span>Locate on Map</span>
                  </button>
                </div>

                <div>
                  <input
                    type="text"
                    required
                    value={flat}
                    onChange={(e) => setFlat(e.target.value)}
                    placeholder="Flat / House / Room No. *"
                    className="w-full px-3.5 py-2.5 bg-[#FFF9F0] border border-[#EEE7DC] rounded-xl text-xs font-semibold text-[#292D26] placeholder-[#77786F] focus:border-[#38754A] focus:bg-white outline-none"
                  />
                </div>

                <div>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Street / Locality (e.g. Sagore Kuti, Pithampur) *"
                    className="w-full px-3.5 py-2.5 bg-[#FFF9F0] border border-[#EEE7DC] rounded-xl text-xs font-semibold text-[#292D26] placeholder-[#77786F] focus:border-[#38754A] focus:bg-white outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="Landmark (Optional)"
                    className="w-full px-3 py-2 bg-[#FFF9F0] border border-[#EEE7DC] rounded-xl text-xs font-semibold text-[#292D26] placeholder-[#77786F] focus:border-[#38754A] focus:bg-white outline-none"
                  />
                  <input
                    type="text"
                    required
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Pincode (454774)"
                    className="w-full px-3 py-2 bg-[#FFF9F0] border border-[#EEE7DC] rounded-xl text-xs font-semibold text-[#292D26] placeholder-[#77786F] focus:border-[#38754A] focus:bg-white outline-none"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !flat.trim() || !street.trim()}
                className="w-full py-3.5 bg-[#38754A] hover:bg-[#285C38] active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 mt-4 cursor-pointer"
              >
                {loading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Save &amp; Start Ordering</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Map Location Modal */}
      {isMapModalOpen && (
        <LocationMapModal
          isOpen={isMapModalOpen}
          onClose={() => setIsMapModalOpen(false)}
          onConfirm={handleLocationSelected}
        />
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FFF9F0] flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-[#38754A] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
