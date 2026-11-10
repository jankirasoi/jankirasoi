'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '../context/CartContext';
import { api, TrackOrderResponse } from '../lib/api';
import { getActiveTrackingIdentifier, clearActiveTrackingIdentifier } from '../lib/orderStorage';

export default function BottomNav() {
  const pathname = usePathname();
  const { totalCount, totalPricePaise } = useCart();
  const [activeOrder, setActiveOrder] = useState<{
    token: string;
    orderNumber: string;
    status: string;
  } | null>(null);


  // Poll / check for active customer orders
  useEffect(() => {
    let isMounted = true;

    async function checkActiveOrder() {
      if (typeof window === 'undefined') return;
      try {
        const lastToken = getActiveTrackingIdentifier();
        if (!lastToken) {
          if (isMounted) setActiveOrder(null);
          return;
        }

        const data: TrackOrderResponse = await api.trackOrder(lastToken);
        if (!isMounted) return;

        // If the order is still ongoing (not yet delivered or cancelled)
        if (data.status !== 'DELIVERED' && data.status !== 'CANCELLED') {
          let punchyLine = 'Preparing your wholesome homestyle meal';
          if (data.status === 'OUT_FOR_DELIVERY') {
            punchyLine = 'Rider is on the way with your meal tray';
          } else if (data.status === 'READY_FOR_PICKUP' || data.status === 'PREPARING') {
            punchyLine = 'Piping hot wholesome meal being prepared';
          } else if (data.status === 'ACCEPTED') {
            punchyLine = 'Kitchen confirmed your meal batch';
          } else if (data.status === 'PLACED') {
            punchyLine = 'Order received by kitchen station';
          }

          setActiveOrder({
            token: lastToken,
            orderNumber: data.orderNumber,
            status: data.status,
          });
        } else {
          setActiveOrder(null);
        }
      } catch (err: any) {
        if (err?.status === 404 || err?.message?.toLowerCase().includes('not found')) {
          const lastToken = getActiveTrackingIdentifier();
          if (lastToken) clearActiveTrackingIdentifier(lastToken);
        }
        if (isMounted) setActiveOrder(null);
      }
    }

    checkActiveOrder();
    const interval = setInterval(checkActiveOrder, 12000); // Check every 12s
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pathname]);

  // Don't show floating bar on rider interface, admin dashboard, or cart checkout page
  if (pathname === '/cart' || pathname.startsWith('/rider') || pathname.startsWith('/admin')) return null;

  const showCartPill = totalCount > 0 && pathname !== '/cart';

  return (
    <>
      {/* Floating Cart & Billing Action Bar (When items are in cart) */}
      {showCartPill && (
        <aside
          aria-label="Floating Cart Tray Bar"
          className="fixed bottom-20 md:bottom-6 inset-x-3 sm:inset-x-4 max-w-lg mx-auto z-50 pointer-events-none animate-fadeIn"
        >
          <Link
            href="/cart"
            className="pointer-events-auto bg-[#38754A] hover:bg-[#285C38] text-white p-3.5 rounded-2xl shadow-2xl shadow-[#38754A]/30 border border-[#38754A]/20 flex items-center justify-between hover:opacity-95 transition-all group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative w-10 h-10 rounded-xl bg-white/20 text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                <span className="material-symbols-outlined text-[22px]">shopping_bag</span>
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E99A32] text-white text-[10px] font-black flex items-center justify-center shadow-xs">
                  {totalCount}
                </span>
              </div>
              <div className="truncate">
                <div className="text-sm font-bold text-white leading-tight">
                  ₹{(totalPricePaise / 100).toFixed(0)} • {totalCount} {totalCount === 1 ? 'Meal' : 'Meals'} in Tray
                </div>
                <div className="text-[11px] text-[#EAF4ED] truncate mt-0.5 font-medium">
                  Free delivery applied • Tap to view bill &amp; order
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#38754A] font-bold text-xs shadow-xs group-hover:scale-102 transition-transform shrink-0 ml-2">
              <span>View Cart</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                arrow_forward
              </span>
            </div>
          </Link>
        </aside>
      )}

      {/* Stitch Fixed Bottom Navigation Bar (Mobile only) */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 pb-safe bg-surface/95 backdrop-blur-xl shadow-[0_-2px_12px_rgba(0,0,0,0.05)] border-t border-[#EEE7DC] md:hidden"
        aria-label="Main Navigation"
      >
        <div className="flex justify-around items-center h-16 px-4 max-w-xs mx-auto">
          {/* 1. Home */}
          <Link
            href="/"
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[72px] h-14 transition-colors ${
              pathname === '/'
                ? 'text-[#38754A] font-bold'
                : 'text-[#77786F] hover:text-[#292D26]'
            }`}
          >
            <span
              className="material-symbols-outlined text-[26px]"
              style={pathname === '/' ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              home
            </span>
            <span className="text-xs font-semibold">Home</span>
          </Link>

          {/* 2. Orders */}
          <Link
            href="/orders"
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[72px] h-14 transition-colors ${
              pathname === '/orders' || pathname === '/track'
                ? 'text-[#38754A] font-bold'
                : 'text-[#77786F] hover:text-[#292D26]'
            }`}
          >
            <span
              className="material-symbols-outlined text-[26px]"
              style={pathname === '/orders' || pathname === '/track' ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              receipt_long
            </span>
            <span className="text-xs font-semibold">Orders</span>
          </Link>
        </div>
      </nav>
    </>
  );
}

