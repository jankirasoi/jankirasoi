'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { DEFAULT_FOOD_IMAGE, FALLBACK_CATALOG } from '../lib/api';

export interface DeliveryStatusPillProps {
  orderNumber: string;
  token?: string;
  status: string;
  createdAt?: string;
  imageUrl?: string;
  itemName?: string;
  deliveryAddress?: {
    flat?: string;
    street?: string;
    landmark?: string;
    pincode?: string;
    latitude?: number;
    longitude?: number;
  };
  onClick?: () => void;
  className?: string;
}

// Sagore Central Kitchen Coordinates
const SAGORE_KITCHEN_LAT = 22.6288;
const SAGORE_KITCHEN_LNG = 75.5684;

/**
 * Calculates dynamic delivery estimate based on:
 * - Kitchen prep status (Cooking, Queued, Packed)
 * - Rider travel time & distance from Sagore Kitchen
 * - Elapsed minutes since order creation
 */
export function calculateDynamicDeliveryEstimate(
  status: string,
  createdAt?: string,
  address?: { pincode?: string; latitude?: number; longitude?: number }
): {
  displayText: string;
  subText: string;
  remainingMinutes: number;
} {
  const normStatus = (status || '').toUpperCase();

  if (normStatus === 'DELIVERED') {
    return { displayText: 'Delivered', subText: 'Order completed', remainingMinutes: 0 };
  }
  if (normStatus === 'CANCELLED') {
    return { displayText: 'Cancelled', subText: 'Order cancelled', remainingMinutes: 0 };
  }

  // 1. Distance Calculation from Kitchen (Haversine or Pincode)
  let distanceKm = 2.5; // default Sagore area distance
  if (address?.latitude && address?.longitude) {
    const lat1 = (SAGORE_KITCHEN_LAT * Math.PI) / 180;
    const lat2 = (address.latitude * Math.PI) / 180;
    const dLat = ((address.latitude - SAGORE_KITCHEN_LAT) * Math.PI) / 180;
    const dLng = ((address.longitude - SAGORE_KITCHEN_LNG) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    distanceKm = Math.min(15, Math.max(0.5, 6371 * c));
  } else if (address?.pincode) {
    if (address.pincode === '454774') distanceKm = 2.0;
    else if (address.pincode === '454775') distanceKm = 7.5;
    else if (address.pincode === '453331') distanceKm = 12.0;
    else if (address.pincode === '453001') distanceKm = 14.0;
  }

  // 2. Rider Travel Time (~2.5 mins per km + 3 mins dispatch/arrival buffer)
  const riderTravelTime = Math.round(distanceKm * 2.5 + 3);

  // 3. Elapsed Time since order was placed
  let elapsedMinutes = 0;
  if (createdAt) {
    const createdTs = new Date(createdAt).getTime();
    if (!isNaN(createdTs)) {
      elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdTs) / 60000));
    }
  }

  let remainingMinutes = 15;
  let subText = 'Cooking fresh';

  switch (normStatus) {
    case 'OUT_FOR_DELIVERY': {
      // Rider on the way to delivery address
      const transitDeduction = Math.min(riderTravelTime - 2, Math.floor(elapsedMinutes * 0.4));
      remainingMinutes = Math.max(3, riderTravelTime - transitDeduction);
      subText = 'Rider on the way';
      break;
    }
    case 'READY_FOR_PICKUP': {
      // Meal cooked and packed warm in trays; rider pickup + travel
      remainingMinutes = Math.max(5, riderTravelTime + 2);
      subText = 'Packed & waiting pickup';
      break;
    }
    case 'PREPARING': {
      // Fresh rotis on tawa and dal simmering
      const remainingCooking = Math.max(4, 16 - elapsedMinutes);
      remainingMinutes = remainingCooking + riderTravelTime;
      subText = 'Cooking in kitchen';
      break;
    }
    case 'ACCEPTED':
    case 'PLACED':
    default: {
      // Queued at chef station
      const remainingQueue = Math.max(6, 20 - elapsedMinutes);
      remainingMinutes = remainingQueue + riderTravelTime;
      subText = 'Order confirmed';
      break;
    }
  }

  return {
    displayText: `Delivering in ${remainingMinutes} min`,
    subText,
    remainingMinutes,
  };
}

/**
 * Resolves the food thumbnail image for an order item using catalog fallback
 */
export function resolveOrderFoodImage(itemName?: string, fallbackUrl?: string): string {
  if (fallbackUrl && fallbackUrl !== DEFAULT_FOOD_IMAGE) {
    return fallbackUrl;
  }

  if (!itemName) return DEFAULT_FOOD_IMAGE;
  const lower = itemName.toLowerCase();

  // Search catalog items
  for (const cat of FALLBACK_CATALOG.categories) {
    for (const itm of cat.items) {
      if (
        itm.name.toLowerCase().includes(lower) ||
        lower.includes(itm.name.toLowerCase())
      ) {
        if (itm.imageUrl) return itm.imageUrl;
      }
    }
  }

  // Common homestyle dish category images
  if (lower.includes('thali') || lower.includes('special')) {
    return 'https://lh3.googleusercontent.com/aida-public/AB6AXuDS9UZxeQL2XEwyu0K3PCfLt6xcAGFdQTQk0Ms6V2E_dNfemHxFYbIONpeD6RzRRoWWDyO18R_xwGBdtSE7xBHjmyObtY6kkODeMHHLUBjBohji3E4P1D7CsA6o0vz6TtyD5iFo0-ftcqqVkGA5aPZ6gqonSl0tiLeWavjPSF7RoRAjy-R35op1kvBkcA6DHoxU8eSbBL0OcSYbkU4Gi0pIkUstEckNKwAK8RsxyMFSxFnUKcwd2Fok';
  }
  if (lower.includes('khichdi') || lower.includes('bowl')) {
    return 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80';
  }
  if (lower.includes('phulka') || lower.includes('roti') || lower.includes('paratha')) {
    return 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&w=800&q=80';
  }

  return DEFAULT_FOOD_IMAGE;
}

export default function DeliveryStatusPill({
  orderNumber,
  token,
  status,
  createdAt,
  imageUrl,
  itemName,
  deliveryAddress,
  onClick,
  className = '',
}: DeliveryStatusPillProps) {
  // Real-time ticking estimate updater
  const [, setTick] = useState(0);

  useEffect(() => {
    // Re-evaluate dynamic time every 15 seconds
    const timer = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, []);

  const estimate = useMemo(() => {
    return calculateDynamicDeliveryEstimate(status, createdAt, deliveryAddress);
  }, [status, createdAt, deliveryAddress]);

  const foodImage = useMemo(() => {
    return resolveOrderFoodImage(itemName, imageUrl);
  }, [itemName, imageUrl]);

  const [imgSrc, setImgSrc] = useState(foodImage);
  useEffect(() => {
    setImgSrc(foodImage);
  }, [foodImage]);

  const targetUrl = `/track?token=${encodeURIComponent(token || orderNumber)}`;

  return (
    <Link
      href={targetUrl}
      onClick={onClick}
      className={`inline-flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-xl bg-white hover:bg-[#FFF9F0] border border-[#EEE7DC] text-[#292D26] shadow-2xs hover:border-[#38754A]/30 transition-all group shrink-0 ${className}`}
      aria-label={`Order status: ${estimate.displayText}`}
    >
      {/* 1. Small Order Thumbnail on the Left */}
      <div className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden bg-[#FFF9F0] border border-[#EEE7DC]/80 shrink-0">
        <img
          src={imgSrc}
          alt={itemName || 'Order meal'}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
          onError={() => setImgSrc(DEFAULT_FOOD_IMAGE)}
        />
      </div>

      {/* 2. Delivery Information on the Right */}
      <div className="flex flex-col text-left leading-tight min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#38754A] shrink-0"></span>
          <span className="text-[11px] sm:text-xs font-bold text-[#292D26] tracking-tight whitespace-nowrap">
            {estimate.displayText}
          </span>
        </div>
        <span className="text-[9px] sm:text-[10px] text-[#77786F] font-medium truncate max-w-[110px] sm:max-w-[130px]">
          {estimate.subText}
        </span>
      </div>

      {/* 3. Subtle chevron arrow */}
      <span className="material-symbols-outlined text-[14px] text-[#77786F] group-hover:text-[#38754A] group-hover:translate-x-0.5 transition-all ml-0.5 shrink-0">
        chevron_right
      </span>
    </Link>
  );
}
