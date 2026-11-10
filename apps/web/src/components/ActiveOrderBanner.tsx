'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, TrackOrderResponse } from '../lib/api';
import { getActiveTrackingIdentifier, clearActiveTrackingIdentifier } from '../lib/orderStorage';
import LakhanAvatar from './LakhanAvatar';

interface ActiveOrderBannerProps {
  className?: string;
}

export default function ActiveOrderBanner({ className = '' }: ActiveOrderBannerProps) {
  const [order, setOrder] = useState<TrackOrderResponse | null>(null);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const syncOrder = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const identifier = getActiveTrackingIdentifier();
    if (!identifier) {
      setOrder(null);
      setTrackingId(null);
      return;
    }

    try {
      const data = await api.trackOrder(identifier);
      if (data && data.status !== 'DELIVERED' && data.status !== 'CANCELLED') {
        setOrder(data);
        setTrackingId(identifier);
      } else {
        setOrder(null);
      }
    } catch (err: any) {
      // If 404 (order not found / deleted / stale), clear from localStorage to stop polling spam
      if (err?.status === 404 || err?.message?.toLowerCase().includes('not found')) {
        clearActiveTrackingIdentifier(identifier);
        setOrder(null);
        setTrackingId(null);
      }
    }
  }, []);

  useEffect(() => {
    syncOrder();

    // Listen to global order placed / update events
    const handleOrderEvent = () => syncOrder();
    window.addEventListener('jr_order_placed', handleOrderEvent);
    window.addEventListener('storage', handleOrderEvent);
    window.addEventListener('focus', handleOrderEvent);

    const interval = setInterval(syncOrder, 8000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('jr_order_placed', handleOrderEvent);
      window.removeEventListener('storage', handleOrderEvent);
      window.removeEventListener('focus', handleOrderEvent);
    };
  }, [syncOrder]);

  if (!order || !trackingId || dismissed) return null;

  // Status mapping matching Image 2 reference styling
  const isOutForDelivery = order.status === 'OUT_FOR_DELIVERY';
  const isReady = order.status === 'READY_FOR_PICKUP';
  const isPreparing = order.status === 'PREPARING';

  let statusSubtitle = 'Order Received & Confirmed';
  let etaHeadline = 'Arriving in 15–20 mins';
  let partnerMessage = 'Chef is preparing your fresh homestyle ingredients 🍳';

  if (isOutForDelivery) {
    statusSubtitle = 'Order is on the way';
    etaHeadline = 'Arriving in 6 minutes';
    partnerMessage = 'I have picked up your order, and I am on the way 🛵';
  } else if (isReady) {
    statusSubtitle = 'Packed & Ready for Rider';
    etaHeadline = 'Arriving in 8–10 minutes';
    partnerMessage = 'Insulated tiffin packed, rider arriving at kitchen 🍱';
  } else if (isPreparing) {
    statusSubtitle = 'Cooking on Fresh Tawa';
    etaHeadline = 'Arriving in 12–15 minutes';
    partnerMessage = 'Homestyle rotis & vegetables being prepared fresh 🔥';
  }

  const riderDisplayName = order.riderName || 'Lakhan';
  const firstItem = order.items?.[0]?.name || 'Homestyle Pure Veg Meal';
  const totalItemCount = order.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 1;
  const moreItemsCount = totalItemCount - 1;

  return (
    <aside
      aria-label="Active order tracking preview"
      className={`w-full transition-all duration-300 ${className}`}
    >
      <div className="relative group bg-white rounded-2xl border-2 border-[#15803d]/30 shadow-md hover:shadow-lg transition-all overflow-hidden p-3.5 sm:p-4">
        {/* Top Decorative Emerald Stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#15803d] via-[#22c55e] to-[#15803d]" />

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDismissed(true);
          }}
          className="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors text-xs z-10"
          title="Minimize banner"
          aria-label="Minimize banner"
        >
          ✕
        </button>

        {/* Clickable Area Leading to 2nd Image Live Tracking */}
        <Link
          href={`/track?token=${encodeURIComponent(trackingId)}`}
          className="block select-none"
        >
          {/* Top Row: Live Indicator + Status + Order Number */}
          <div className="flex items-center justify-between gap-2 pr-6 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#15803d] animate-ping" />
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#15803d]">
                Live Order Tracking
              </span>
            </div>
            <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
              #{order.orderNumber}
            </span>
          </div>

          {/* Headline Matching Image 2 */}
          <div className="mb-3">
            <div className="text-xs font-semibold text-slate-700">
              {statusSubtitle}
            </div>
            <div className="text-xl sm:text-2xl font-black text-[#15803d] tracking-tight flex items-center gap-2">
              <span>{etaHeadline}</span>
              <span className="text-base sm:text-lg animate-bounce">🛵</span>
            </div>
          </div>

          {/* Delivery Partner Lakhan Card Preview (Matching Image 2) */}
          <div className="bg-[#F8FAF8] rounded-xl p-2.5 border border-[#15803d]/15 flex items-center gap-3 mb-3">
            <LakhanAvatar size={44} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-extrabold text-slate-900 truncate">
                I&apos;m {riderDisplayName}, your delivery partner
              </div>
              {/* Light Green Chat Bubble */}
              <div className="inline-block mt-1 bg-[#DCFCE7]/70 border border-[#86EFAC]/40 text-[#166534] text-[11px] font-medium px-2 py-0.5 rounded-lg truncate max-w-full">
                &ldquo;{partnerMessage}&rdquo;
              </div>
            </div>
          </div>

          {/* Bottom Action Row: Items Summary + Track Live Button */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="text-[11px] text-slate-500 truncate flex-1 min-w-0">
              <span className="font-bold text-slate-800">{firstItem}</span>
              {moreItemsCount > 0 && <span> +{moreItemsCount} more</span>}
              <span className="text-slate-400"> &bull; </span>
              <span className="text-slate-600">{order.deliverySlot}</span>
            </div>

            <div className="shrink-0 flex items-center gap-1 bg-[#15803d] hover:bg-[#166534] text-white px-3 py-1.5 rounded-full text-xs font-extrabold shadow-xs transition-colors">
              <span>Live Map</span>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Link>
      </div>
    </aside>
  );
}
