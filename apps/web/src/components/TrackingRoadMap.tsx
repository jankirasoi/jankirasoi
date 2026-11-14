'use client';

import React from 'react';

interface TrackingRoadMapProps {
  status: string;
  className?: string;
  riderName?: string;
}

export default function TrackingRoadMap({
  status,
  className = '',
  riderName,
}: TrackingRoadMapProps) {
  const isOutForDelivery = status === 'OUT_FOR_DELIVERY';
  const isReady = status === 'READY_FOR_PICKUP';
  const hasRider = Boolean(riderName);

  return (
    <div
      className={`relative w-full h-64 sm:h-80 bg-[#E8EFF6] rounded-2xl overflow-hidden border border-slate-200 shadow-sm select-none ${className}`}
      aria-label="Live Delivery Map"
    >
      {/* ── Street & City SVG Map Background (Matching Reference Image 2) ── */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 600 400"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* River / Water Pattern */}
          <linearGradient id="waterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C9E1F5" />
            <stop offset="100%" stopColor="#B4D5F0" />
          </linearGradient>

          {/* Park / Greenery */}
          <linearGradient id="parkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#D9EBD7" />
            <stop offset="100%" stopColor="#CBE2C8" />
          </linearGradient>

          {/* Route Gradient */}
          <linearGradient id="routeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>

        {/* Base Landmass */}
        <rect width="600" height="400" fill="#E8F0F7" />

        {/* Parks / Vegetation blocks */}
        <path d="M 80 140 Q 110 130 130 150 Q 140 180 110 190 Q 70 185 80 140 Z" fill="url(#parkGrad)" />
        <path d="M 330 200 Q 360 190 380 220 Q 370 250 330 240 Z" fill="url(#parkGrad)" />
        <path d="M 20 280 Q 70 270 90 310 Q 50 340 10 320 Z" fill="url(#parkGrad)" opacity="0.6" />

        {/* Khan River / Waterway */}
        <path
          d="M 520 400 Q 540 300 560 220 T 590 100 T 600 0"
          stroke="url(#waterGrad)"
          strokeWidth="32"
          fill="none"
          strokeLinecap="round"
        />
        <text x="545" y="320" fill="#7FA9CE" fontSize="10" fontWeight="bold" transform="rotate(-75 545 320)">
          Khan River
        </text>

        {/* Secondary Minor Roads Grid */}
        <g stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
          <path d="M 0 50 L 600 65" />
          <path d="M 0 110 L 600 120" />
          <path d="M 0 180 L 600 170" />
          <path d="M 0 250 L 600 245" />
          <path d="M 0 310 L 600 320" />
          <path d="M 0 360 L 600 355" />

          <path d="M 60 0 L 70 400" />
          <path d="M 120 0 L 140 400" />
          <path d="M 190 0 L 180 400" />
          <path d="M 270 0 L 290 400" />
          <path d="M 360 0 L 350 400" />
          <path d="M 430 0 L 450 400" />
          <path d="M 500 0 L 510 400" />

          {/* Diagonals */}
          <path d="M 140 0 L 290 190 L 480 380" />
          <path d="M 30 190 L 160 380" />
          <path d="M 280 80 L 420 200" />
        </g>

        {/* Major Arterial Roads (wider white streets with light gray outlines) */}
        <g stroke="#D4DFEA" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Main Road 10 / MR-10 */}
          <path d="M 120 120 L 250 125 L 360 170 L 470 260 L 520 380" />
          {/* Cross Avenue */}
          <path d="M 360 0 L 360 170 L 320 400" />
          {/* West Arterial */}
          <path d="M 0 250 L 280 250 L 470 260" />
        </g>
        <g stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M 120 120 L 250 125 L 360 170 L 470 260 L 520 380" />
          <path d="M 360 0 L 360 170 L 320 400" />
          <path d="M 0 250 L 280 250 L 470 260" />
        </g>

        {/* Street Name Labels (Matching Image 2) */}
        <text x="145" y="115" fill="#6B7280" fontSize="9" fontWeight="600">Ravidas Nagar Rd</text>
        <text x="430" y="240" fill="#6B7280" fontSize="10" fontWeight="700">MR 10</text>
        <text x="500" y="300" fill="#6B7280" fontSize="9" fontWeight="600">MR 9</text>
        <text x="210" y="270" fill="#6B7280" fontSize="8" fontWeight="500">Prime City Rd</text>
        <text x="20" y="245" fill="#6B7280" fontSize="8" fontWeight="500">Main Rd</text>
        <text x="320" y="225" fill="#6B7280" fontSize="7" fontWeight="500">Overhead Water Tank</text>

        {/* Highway 27 Badge */}
        <g transform="translate(240, 60)">
          <rect width="24" height="18" rx="4" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="1.2" />
          <text x="12" y="13" textAnchor="middle" fill="#334155" fontSize="9" fontWeight="bold">27</text>
        </g>

        {/* Metro Stations [M] */}
        <g transform="translate(180, 50)">
          <circle cx="9" cy="9" r="8" fill="#1D4ED8" />
          <text x="9" y="12.5" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold">M</text>
        </g>
        <g transform="translate(370, 115)">
          <circle cx="9" cy="9" r="8" fill="#1D4ED8" />
          <text x="9" y="12.5" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold">M</text>
        </g>
        <g transform="translate(515, 270)">
          <circle cx="9" cy="9" r="8" fill="#1D4ED8" />
          <text x="9" y="12.5" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontWeight="bold">M</text>
        </g>

        {/* ── Active Blue Navigation Delivery Route (Exact Path from Store to User Home) ── */}
        <path
          id="deliveryRoutePath"
          d="M 470 260 L 360 170 L 250 125 L 140 120 L 140 145"
          stroke="url(#routeGrad)"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Route Outer Glow / Halo */}
        <path
          d="M 470 260 L 360 170 L 250 125 L 140 120 L 140 145"
          stroke="#93C5FD"
          strokeWidth="8"
          strokeOpacity="0.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* ── Destination Pin (Home Marker with House Symbol) ── */}
      <div
        className="absolute z-10 flex flex-col items-center pointer-events-none"
        style={{ left: '23%', top: '34%', transform: 'translate(-50%, -100%)' }}
      >
        {/* Home Pin Badge */}
        <div className="relative flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-white border-2 border-[#1E40AF] shadow-md flex items-center justify-center">
            {/* House Icon */}
            <span className="text-[#F59E0B] text-base leading-none">🏠</span>
          </div>
          {/* Blue pin stem pointer */}
          <div className="absolute -bottom-1.5 w-2 h-2 bg-[#1E40AF] rotate-45 rounded-2xs" />
        </div>
        {/* Soft ground drop shadow */}
        <div className="w-4 h-1.5 bg-black/20 rounded-full blur-[1px] mt-1" />
      </div>

      {/* ── Delivery Partner Rider (only shown when assigned) ── */}
      {hasRider && (
        <div
          className={`absolute z-20 flex flex-col items-center pointer-events-none transition-all duration-1000 ${
            isOutForDelivery ? 'animate-pulse' : ''
          }`}
          style={{
            right: isOutForDelivery ? '26%' : isReady ? '28%' : '24%',
            top: isOutForDelivery ? '52%' : isReady ? '58%' : '62%',
            transform: 'translate(50%, -50%)',
          }}
        >
          {/* Pulsing Radar Wave on Rider */}
          <div className="absolute -inset-3 rounded-full bg-emerald-500/25 animate-ping" />
          <div className="absolute -inset-1.5 rounded-full bg-emerald-500/35" />

          {/* Rider Badge (Matching 2nd image: rider with green helmet, bag, motorcycle) */}
          <div className="relative w-11 h-11 rounded-full bg-[#18181B] border-2 border-white shadow-xl flex items-center justify-center">
            <svg viewBox="0 0 36 36" className="w-8 h-8" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Scooter / Bike Body */}
              <path d="M9 25 C10 21, 14 20, 19 20 L23 20 L27 25" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
              <circle cx="10" cy="25" r="3" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.2" />
              <circle cx="26" cy="25" r="3" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1.2" />

              {/* Rider Body & Yellow Shirt */}
              <path d="M14 17 L17 12 L20 17" stroke="#EAB308" strokeWidth="3" strokeLinecap="round" />
              {/* Delivery Box (Green Blinkit style bag) */}
              <rect x="10" y="12" width="5" height="6" rx="1" fill="#16A34A" />

              {/* Helmet (Green Safety Helmet) */}
              <circle cx="18" cy="9" r="4" fill="#16A34A" />
              {/* Visor */}
              <path d="M19 8 L22 9.5 L19 11" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>

          {/* Rider Name Tag */}
          <div className="mt-1 bg-white/95 backdrop-blur-xs px-2 py-0.5 rounded-full border border-slate-200 shadow-xs flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-[10px] font-extrabold text-slate-800 tracking-tight whitespace-nowrap">
              {riderName} &bull; 🛵
            </span>
          </div>
        </div>
      )}

      {/* ── Map Status Pill ── */}
      <div className="absolute top-2.5 right-3 z-10">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xs text-[11px] font-bold text-slate-800">
          <span className="w-2 h-2 rounded-full bg-[#15803d] animate-pulse" />
          <span>{isOutForDelivery && hasRider ? (riderName ? `${riderName} on the way` : 'Out for delivery') : 'Kitchen Dispatching'}</span>
        </div>
      </div>
    </div>
  );
}

