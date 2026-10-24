'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '../context/CartContext';
import { api, TrackOrderResponse } from '../lib/api';
import DeliveryStatusPill, { resolveOrderFoodImage } from './DeliveryStatusPill';

export default function BottomNav() {
  const pathname = usePathname();
  const { totalCount, totalPricePaise } = useCart();
  const [activeOrder, setActiveOrder] = useState<{
    token: string;
    orderNumber: string;
    status: string;
    punchyLine: string;
    firstItemName: string;
    totalItems: number;
    imageUrl?: string;
    createdAt?: string;
    deliveryAddress?: {
      flat?: string;
      street?: string;
      landmark?: string;
      pincode?: string;
      latitude?: number;
      longitude?: number;
    };
  } | null>(null);

  const [dismissedOrderId, setDismissedOrderId] = useState<string | null>(null);

  // Poll / check for active customer orders
  useEffect(() => {
    let isMounted = true;

    async function checkActiveOrder() {
      if (typeof window === 'undefined') return;
      try {
        const lastToken = window.localStorage.getItem('jr_last_tracking_token');
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

          const firstItem = data.items && data.items.length > 0 ? data.items[0].name : 'Homestyle Thali';
          const totalQty = data.items ? data.items.reduce((acc, i) => acc + (i.quantity || 1), 0) : 1;
          const resolvedImg = resolveOrderFoodImage(firstItem);

          setActiveOrder({
            token: lastToken,
            orderNumber: data.orderNumber,
            status: data.status,
            punchyLine,
            firstItemName: firstItem,
            totalItems: totalQty,
            imageUrl: resolvedImg,
            createdAt: data.createdAt,
            deliveryAddress: data.deliveryAddress,
          });
        } else {
          setActiveOrder(null);
        }
      } catch (err) {
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
  const showActiveOrderPill =
    activeOrder !== null &&
    pathname !== '/track' &&
    dismissedOrderId !== activeOrder.orderNumber;

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

      {/* Floating Active Order Status Bar if order is live and cart is empty */}
      {!showCartPill && showActiveOrderPill && activeOrder && pathname !== '/track' && (
        <aside
          aria-label="Active Order Status"
          className="fixed bottom-20 md:bottom-6 inset-x-3 sm:inset-x-auto sm:right-6 max-w-sm sm:max-w-md w-full mx-auto z-50 pointer-events-none animate-fadeIn"
        >
          <div className="pointer-events-auto bg-white/95 backdrop-blur-md text-[#292D26] p-2.5 sm:p-3 rounded-2xl shadow-xl shadow-black/5 border border-[#EEE7DC] flex items-center justify-between gap-2.5">
            <Link
              href={`/track?token=${encodeURIComponent(activeOrder.token)}`}
              className="flex items-center gap-2 min-w-0 flex-1 group"
            >
              <div className="truncate">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38754A] animate-pulse shrink-0"></span>
                  <span className="text-xs font-bold text-[#292D26] truncate group-hover:text-[#38754A] transition-colors">
                    Order #{activeOrder.orderNumber}
                  </span>
                </div>
                <div className="text-[11px] text-[#77786F] truncate mt-0.5">
                  {activeOrder.firstItemName}
                </div>
              </div>
            </Link>

            {/* Positioned at bottom-right of the order card: Minimalistic delivery status pill */}
            <div className="flex items-center gap-1 shrink-0">
              <DeliveryStatusPill
                orderNumber={activeOrder.orderNumber}
                token={activeOrder.token}
                status={activeOrder.status}
                createdAt={activeOrder.createdAt}
                imageUrl={activeOrder.imageUrl}
                itemName={activeOrder.firstItemName}
                deliveryAddress={activeOrder.deliveryAddress}
              />
              <button
                onClick={() => setDismissedOrderId(activeOrder.orderNumber)}
                className="w-6 h-6 rounded-full hover:bg-[#EEE7DC] text-[#77786F] flex items-center justify-center text-xs ml-0.5 shrink-0 transition-colors"
                title="Dismiss"
                aria-label="Dismiss order status"
              >
                <span className="material-symbols-outlined text-[15px]">close</span>
              </button>
            </div>
          </div>
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

          {/* 2. Orders (Live Track) */}
          <Link
            href="/track"
            className={`flex flex-col items-center justify-center gap-0.5 min-w-[72px] h-14 transition-colors ${
              pathname === '/track'
                ? 'text-[#38754A] font-bold'
                : 'text-[#77786F] hover:text-[#292D26]'
            }`}
          >
            <span
              className="material-symbols-outlined text-[26px]"
              style={pathname === '/track' ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              moped
            </span>
            <span className="text-xs font-semibold">Orders</span>
          </Link>
        </div>
      </nav>
    </>
  );
}

