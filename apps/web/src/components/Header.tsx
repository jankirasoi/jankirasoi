'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api, UserProfile } from '../lib/api';
import CustomerAuthModal from './CustomerAuthModal';
import { useCart } from '../context/CartContext';
import DeliveryStatusPill from './DeliveryStatusPill';
import LocationMapModal, { LocationData } from './LocationMapModal';

export default function Header() {
  const pathname = usePathname();
  const { totalCount } = useCart();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'PROFILE' | 'ORDERS' | 'EDIT'>('PROFILE');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [locationName, setLocationName] = useState('Sagore, Pithampur');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync session on mount and listen to storage events
  useEffect(() => {
    api.getCurrentUser().then((user) => {
      if (user && user.role === 'CUSTOMER') {
        setCurrentUser(user);
      } else {
        setCurrentUser(null);
      }
    });

    const handleStorage = () => {
      api.getCurrentUser().then((user) => {
        if (user && user.role === 'CUSTOMER') setCurrentUser(user);
        else setCurrentUser(null);
      });
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setIsDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleProfileClick = () => {
    if (currentUser) {
      setIsDropdownOpen((prev) => !prev);
    } else {
      setAuthModalTab('PROFILE');
      setIsAuthOpen(true);
    }
  };

  const openProfileModal = (tab: 'PROFILE' | 'ORDERS' | 'EDIT') => {
    setIsDropdownOpen(false);
    setAuthModalTab(tab);
    setIsAuthOpen(true);
  };

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    await api.logout();
    setCurrentUser(null);
    window.dispatchEvent(new Event('storage'));
  };

  // Don't show customer header on admin console, rider portal, or cart page
  if (pathname === '/cart' || pathname.startsWith('/rider') || pathname.startsWith('/admin')) return null;

  const latestOrder = currentUser?.recentOrders && currentUser.recentOrders.length > 0
    ? currentUser.recentOrders[0]
    : null;

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 bg-surface/90 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-surface-container-high/60">
        <div className="max-w-4xl mx-auto h-16 px-margin flex items-center justify-between gap-space-sm">
          {/* Brand Logo & Live Status */}
          <Link href="/" className="flex items-center gap-space-sm min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
              JR
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-space-xs">
                <span className="font-title-md text-title-md text-on-surface truncate font-bold font-headline">
                  Janki Rasoi
                </span>
                <span className="hidden xs:inline-block font-label-sm text-label-sm px-1.5 py-0.5 rounded-full bg-[#EAF4ED] text-[#38754A] uppercase shrink-0 font-bold border border-[#38754A]/20">
                  Ghar Ka Swad
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#38754A] animate-pulse shrink-0"></span>
                <span className="font-label-sm text-label-sm text-[#38754A] font-semibold truncate">
                  Lunch Serving Now
                </span>
              </div>
            </div>
          </Link>



          {/* Delivery Location Selector Pill */}
          <button
            type="button"
            onClick={() => setIsLocationModalOpen(true)}
            className="flex items-center gap-1.5 py-1 px-2.5 sm:px-3 rounded-full bg-[#FFF9F0] hover:bg-[#F5ECE0] border border-[#EEE7DC] text-left transition-all shrink-0 max-w-[150px] xs:max-w-[210px] sm:max-w-[260px] group"
            title="Change delivery location"
          >
            <span className="material-symbols-outlined text-[#E25822] text-[18px] shrink-0 group-hover:scale-110 transition-transform">
              location_on
            </span>
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] uppercase font-extrabold text-[#77786F] leading-none">
                DELIVER TO
              </span>
              <div className="flex items-center gap-0.5 min-w-0">
                <span className="text-xs font-bold text-[#292D26] truncate">
                  {locationName}
                </span>
                <span className="material-symbols-outlined text-[15px] text-[#77786F] shrink-0">
                  expand_more
                </span>
              </div>
            </div>
          </button>

          {/* Cart Icon & Profile Container */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link
              href="/cart"
              aria-label="View Cart"
              className="relative w-10 h-10 flex items-center justify-center rounded-full text-on-surface hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[24px]">shopping_bag</span>
              {totalCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 bg-secondary text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs">
                  {totalCount}
                </span>
              )}
            </Link>

            {/* Profile Button & Dropdown Container */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={handleProfileClick}
                aria-expanded={isDropdownOpen}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors border border-surface-container-high/80"
                title={currentUser ? currentUser.name : 'Login / Register'}
              >
                {currentUser ? (
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <span className="material-symbols-outlined text-[22px] text-on-surface-variant">
                    account_circle
                  </span>
                )}
              </button>

            {/* THEME-BASED PROFILE DROPDOWN */}
            {isDropdownOpen && currentUser && (
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white rounded-3xl shadow-2xl border border-stone-200/90 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                {/* 1. Header User Card (Tap to view profile details) */}
                <button
                  type="button"
                  onClick={() => openProfileModal('PROFILE')}
                  className="w-full text-left p-4 bg-gradient-to-r from-emerald-900 via-primary to-emerald-950 text-white flex items-center gap-3 hover:opacity-95 transition-opacity"
                >
                  <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg border border-white/20 shrink-0">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate leading-tight flex items-center justify-between">
                      <span>{currentUser.name}</span>
                      <span className="material-symbols-outlined text-sm text-emerald-300">edit</span>
                    </div>
                    <div className="text-xs text-emerald-200 font-mono mt-0.5">+91 {currentUser.phone}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="px-2 py-0.2 rounded-full bg-white/20 text-[10px] font-bold text-emerald-100">
                        {currentUser.orderCount || 0} Tiffins Ordered
                      </span>
                    </div>
                  </div>
                </button>

                {/* 2. Ongoing / Recent Order Quick Card (if exists) */}
                {latestOrder && (
                  <div className="p-3 bg-emerald-50/70 border-b border-emerald-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="material-symbols-outlined text-primary text-[20px] shrink-0">
                        skillet
                      </span>
                      <div className="truncate text-xs">
                        <div className="font-bold text-stone-900 truncate">
                          Order #{latestOrder.orderNumber}
                        </div>
                        <div className="text-[11px] text-stone-500">
                          ₹{(latestOrder.totalAmountPaise / 100).toFixed(0)} • {latestOrder.status.replace(/_/g, ' ')}
                        </div>
                      </div>
                    </div>
                    <DeliveryStatusPill
                      orderNumber={latestOrder.orderNumber}
                      token={latestOrder.trackingToken}
                      status={latestOrder.status}
                      onClick={() => setIsDropdownOpen(false)}
                    />
                  </div>
                )}

                {/* 3. Action Menu Items */}
                <div className="p-2 flex flex-col gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => openProfileModal('ORDERS')}
                    className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-stone-100/80 transition-colors text-stone-800 font-semibold text-left"
                  >
                    <span className="w-8 h-8 rounded-xl bg-emerald-50 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                    </span>
                    <div className="flex-1">
                      <div className="leading-tight font-bold">My Orders &amp; Live Tracking</div>
                      <div className="text-[11px] text-stone-500 font-normal">Check status of today's tiffins</div>
                    </div>
                    <span className="material-symbols-outlined text-sm text-stone-400">chevron_right</span>
                  </button>

                  {/* Saved Address & Profile Edit */}
                  <button
                    type="button"
                    onClick={() => openProfileModal('EDIT')}
                    className="w-full flex items-start gap-3 p-2.5 rounded-2xl hover:bg-stone-100/80 transition-colors text-stone-800 text-left"
                  >
                    <span className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">home_pin</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="leading-tight font-bold flex items-center justify-between">
                        <span>Edit Delivery Address</span>
                        <span className="text-[11px] font-bold text-[#38754A]">Edit</span>
                      </div>
                      <div className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                        {currentUser.savedAddress
                          ? `${currentUser.savedAddress.flat || ''} ${currentUser.savedAddress.street || ''} (${currentUser.savedAddress.pincode || ''})`
                          : 'Add your home or office address'}
                      </div>
                    </div>
                  </button>

                  {/* WhatsApp Kitchen Support */}
                  <a
                    href="https://wa.me/919812345678?text=Hi%20Janki%20Rasoi,%20I%20have%20a%20query%20about%20my%20tiffin%20order"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-stone-100/80 transition-colors text-stone-800 font-semibold"
                  >
                    <span className="w-8 h-8 rounded-xl bg-green-50 text-green-700 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">chat</span>
                    </span>
                    <div className="flex-1">
                      <div className="leading-tight font-bold">Kitchen Support &amp; WhatsApp</div>
                      <div className="text-[11px] text-stone-500 font-normal">Chat directly with kitchen station</div>
                    </div>
                    <span className="material-symbols-outlined text-sm text-stone-400">arrow_outward</span>
                  </a>
                </div>

                {/* 4. Footer Logout Action */}
                <div className="p-2 border-t border-stone-200/80 bg-stone-50/70">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 p-2 rounded-xl text-rose-700 hover:bg-rose-100/60 font-bold text-xs transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </header>

      {/* Login & Profile Management Modal */}
      <CustomerAuthModal
        isOpen={isAuthOpen}
        initialTab={authModalTab}
        onClose={() => {
          setIsAuthOpen(false);
          api.getCurrentUser().then((user) => {
            if (user && user.role === 'CUSTOMER') setCurrentUser(user);
          });
        }}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          setIsAuthOpen(false);
        }}
      />

      {/* Delivery Location Selector Modal */}
      <LocationMapModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        onConfirm={(loc: LocationData) => {
          setLocationName(loc.street.split(',')[0] || loc.city);
          setIsLocationModalOpen(false);
        }}
      />
    </>
  );
}
