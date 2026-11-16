'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api, TrackOrderResponse } from '../lib/api';
import { getActiveTrackingIdentifier, clearActiveTrackingIdentifier } from '../lib/orderStorage';

interface ActiveOrderBannerProps {
  className?: string;
}

import { calculateDynamicDeliveryTiming } from '../lib/deliveryTiming';

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
      if (err?.status === 404 || err?.message?.toLowerCase().includes('not found')) {
        clearActiveTrackingIdentifier(identifier);
        setOrder(null);
        setTrackingId(null);
      }
    }
  }, []);

  useEffect(() => {
    syncOrder();

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

  // Compute dynamic distance & ETA using physics-based urban transit model
  const timingInfo = useMemo(() => {
    if (!order) {
      return {
        etaHeadline: 'Arriving in ~15-20 mins',
        statusSubtitle: 'Order Confirmed',
        distanceKm: 2.5,
        bubbleText: '',
        isNearby: false,
        etaMins: 15,
      };
    }

    return calculateDynamicDeliveryTiming({
      status: order.status,
      createdAt: order.createdAt,
      destCoordinates: order.coordinates,
      riderLocation: order.rider?.location,
      kitchenCoordinates: order.kitchenCoordinates,
      pincode: order.deliveryAddress?.pincode,
      riderName: order.riderName,
    });
  }, [order]);

  if (!order || !trackingId || dismissed) return null;

  const isOutForDelivery = order.status === 'OUT_FOR_DELIVERY';

  // Format clean order summary (e.g. "Special Thali" or "Gud Ki Chai + 1 item")
  const itemsList = order.items || [];
  let orderNameText = 'Fresh Pure Veg Meal';
  if (itemsList.length === 1) {
    orderNameText = itemsList[0].name;
  } else if (itemsList.length > 1) {
    const extraCount = itemsList.slice(1).reduce((sum, it) => sum + (it.quantity || 1), 0);
    orderNameText = `${itemsList[0].name} +${extraCount} more`;
  }

  return (
    <aside
      aria-label="Active order tracking preview"
      className={`w-full transition-all duration-300 ${className}`}
    >
      <div className="relative group bg-white hover:bg-[#FAFDF9] rounded-2xl border border-[#38754A]/30 shadow-md hover:shadow-lg transition-all overflow-hidden">
        {/* Top Emerald Accent Stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-[#38754A] via-[#4BB368] to-[#38754A]" />

        <div className="relative p-3.5 sm:p-4 flex items-center justify-between gap-3">
          {/* Entire Card Content Links to Track Order Page */}
          <Link
            href={`/track?token=${encodeURIComponent(trackingId)}`}
            className="flex items-center gap-3.5 min-w-0 flex-1 group select-none"
          >
            {/* Animated Status Icon */}
            <div className="relative w-11 h-11 rounded-xl bg-[#EAF4ED] text-[#38754A] flex items-center justify-center shrink-0 border border-[#38754A]/15 shadow-2xs">
              <span className="material-symbols-outlined text-[24px]">
                {isOutForDelivery ? 'two_wheeler' : 'skillet'}
              </span>
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#38754A] ring-2 ring-white animate-ping" />
            </div>

            {/* Timing Headline & Order Summary */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm sm:text-base font-extrabold text-[#292D26] tracking-tight truncate">
                  {timingInfo.etaHeadline}
                </span>
                <span className="text-xs">🛵</span>
              </div>
              <div className="text-xs text-[#77786F] truncate mt-0.5 font-medium flex items-center gap-1.5">
                <span className="font-bold text-[#38754A] truncate">{orderNameText}</span>
                <span className="text-slate-300">•</span>
                <span className="truncate">{timingInfo.statusSubtitle}</span>
              </div>
            </div>

            {/* Clean Track Action Chip */}
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#EAF4ED] group-hover:bg-[#38754A] text-[#38754A] group-hover:text-white font-bold text-xs transition-all shrink-0 ml-1">
              <span>Track</span>
              <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">
                arrow_forward
              </span>
            </div>
          </Link>

          {/* Dismiss Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDismissed(true);
            }}
            className="w-7 h-7 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors text-xs shrink-0 cursor-pointer"
            title="Hide banner"
            aria-label="Hide banner"
          >
            ✕
          </button>
        </div>
      </div>
    </aside>
  );
}
