'use client';

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
  Suspense,
} from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api, TrackOrderResponse } from '../../lib/api';
import { getActiveTrackingIdentifier, clearActiveTrackingIdentifier } from '../../lib/orderStorage';
import LakhanAvatar from '../../components/LakhanAvatar';

const LiveDeliveryMap = dynamic(() => import('../../components/LiveDeliveryMap'), { ssr: false });

// ── Delivery timeline steps ─────────────────────────────────────────────────
const TIMELINE_STEPS = [
  { key: 'PLACED',            label: 'Order Placed',        icon: 'receipt_long' },
  { key: 'ACCEPTED',          label: 'Order Confirmed',      icon: 'check_circle' },
  { key: 'PREPARING',         label: 'Food Being Prepared',  icon: 'skillet' },
  { key: 'READY_FOR_PICKUP',  label: 'Ready for Pickup',     icon: 'inventory_2' },
  { key: 'OUT_FOR_DELIVERY',  label: 'Out for Delivery',     icon: 'moped' },
  { key: 'DELIVERED',         label: 'Delivered',            icon: 'task_alt' },
] as const;

type TimelineKey = typeof TIMELINE_STEPS[number]['key'];

const STATUS_ORDER: TimelineKey[] = [
  'PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED',
];

function getTimelineIndex(status: string): number {
  const idx = STATUS_ORDER.indexOf(status as TimelineKey);
  return idx === -1 ? 0 : idx;
}

// ── Blinkit Reference 2nd Image Styling Helpers ─────────────────────────────
function getBlinkitStatus(status: string) {
  if (status === 'DELIVERED') {
    return {
      subtitle: 'Order delivered safely',
      headline: 'Delivered to your doorstep 🎉',
      bubble: 'Enjoy your hot homestyle pure veg meal!',
    };
  }
  if (status === 'OUT_FOR_DELIVERY') {
    return {
      subtitle: 'Order is on the way',
      headline: 'Arriving in 6 minutes',
      bubble: 'I have picked up your order, and I am on the way',
    };
  }
  if (status === 'READY_FOR_PICKUP') {
    return {
      subtitle: 'Order is packed & ready',
      headline: 'Arriving in 10 minutes',
      bubble: 'Insulated cask packed at kitchen, rider arriving for pickup',
    };
  }
  if (status === 'PREPARING') {
    return {
      subtitle: 'Cooking on fresh tawa 🔥',
      headline: 'Arriving in 15 minutes',
      bubble: 'Chef is cooking fresh rotis & packaging homestyle vegetables',
    };
  }
  if (status === 'ACCEPTED') {
    return {
      subtitle: 'Order confirmed by chef',
      headline: 'Arriving in 20 minutes',
      bubble: 'Kitchen has accepted your batch. Preparing fresh ingredients',
    };
  }
  return {
    subtitle: 'Order received & confirmed',
    headline: 'Arriving in 25 minutes',
    bubble: 'Order registered at Janki Rasoi kitchen station',
  };
}

// ── Delivery Partner Card (Lakhan) matching Image 2 ─────────────────────────
function PartnerCard({
  order,
  bubbleText,
}: {
  order: TrackOrderResponse;
  bubbleText: string;
}) {
  const riderName = order.riderName ?? null;
  const riderPhone = order.riderPhone ?? null;
  const [selectedTip, setSelectedTip] = useState<number | null>(null);
  const [tipSuccess, setTipSuccess] = useState(false);

  const handleTipClick = (amount: number) => {
    setSelectedTip(amount);
    setTipSuccess(true);
    setTimeout(() => setTipSuccess(false), 3000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4 flex flex-col gap-3.5">
      {/* Top Row: Lakhan Avatar + Name + Phone Call */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <LakhanAvatar size={50} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-slate-900 leading-snug">
              I&apos;m {riderName || 'your delivery partner'}, ready with your order
            </h2>
          </div>
        </div>

        {/* Call Icon Button – only show real number */}
        {riderPhone ? (
          <a
            href={`tel:${riderPhone}`}
            className="shrink-0 w-10 h-10 rounded-full border border-emerald-600/40 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center transition-colors active:scale-95 shadow-2xs"
            aria-label={`Call ${riderName || 'delivery partner'}`}
            title={`Call ${riderName || 'delivery partner'}`}
          >
            <svg className="w-5 h-5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
          </a>
        ) : (
          <div className="shrink-0 w-10 h-10 rounded-full border border-slate-200 bg-slate-100 text-slate-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
        )}
      </div>

      {/* Speech Bubble (Exact Match to Image 2: Light Green with Pointer) */}
      <div className="relative bg-[#F0FDF4] border border-[#DCFCE7] rounded-xl px-3.5 py-2 text-xs text-[#166534] font-medium leading-relaxed">
        {/* Pointer Triangle */}
        <div className="absolute -top-1.5 left-6 w-3 h-3 bg-[#F0FDF4] border-t border-l border-[#DCFCE7] rotate-45" />
        <span>{bubbleText}</span>
      </div>

      {/* Tip Section: A little kindness can make their day */}
      <div className="pt-1 flex flex-col gap-1.5">
        <div className="text-sm font-bold text-slate-900 leading-tight">
          A little kindness can make their day
        </div>
        <div className="text-xs text-slate-500">
          Add a tip for your delivery partner
        </div>

        {/* Tip selection pills */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {[10, 20, 30, 50].map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => handleTipClick(amount)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                selectedTip === amount
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              ₹{amount}
            </button>
          ))}
          {tipSuccess && (
            <span className="text-[11px] font-bold text-emerald-700 animate-fade-in flex items-center gap-1">
              ✓ ₹{selectedTip} tip added! {riderName ? `${riderName} says` : 'They say'} thank you ❤️
            </span>
          )}
        </div>
      </div>

      {/* Partner Safety Row matching Image 2 */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
            </svg>
          </span>
          <span className="truncate">
            Freshly prepared at Janki Rasoi kitchen • Handled with utmost safety
          </span>
        </div>
        <svg className="w-4 h-4 text-slate-400 shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

// ── Delivery Details Card matching Image 2 ──────────────────────────────────
function DeliveryDetailsCard({ order }: { order: TrackOrderResponse }) {
  const [showItems, setShowItems] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);

  const handleCopyPin = () => {
    if (order.deliveryOtp && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(order.deliveryOtp);
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    }
  };

  const hasAddress =
    order.deliveryAddress &&
    (order.deliveryAddress.flat || order.deliveryAddress.street || order.deliveryAddress.pincode);

  const formattedAddress = hasAddress
    ? [
        order.deliveryAddress!.flat,
        order.deliveryAddress!.street,
        order.deliveryAddress!.landmark,
        order.deliveryAddress!.pincode ? `PIN: ${order.deliveryAddress!.pincode}` : '',
      ]
        .filter(Boolean)
        .join(', ')
    : 'Address not available';

  const customerName = order.customerName || 'Customer';
  const customerPhone = order.maskedPhone || '—';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-xs p-4 flex flex-col gap-4">
      {/* Header: Scooter Icon + Your delivery details */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-700">
          <span className="material-symbols-outlined text-[20px]">moped</span>
        </div>
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
            Your delivery details
          </h3>
          <p className="text-xs text-slate-500 leading-tight mt-0.5">
            Details of your current order #{order.orderNumber}
          </p>
        </div>
      </div>

      {/* Address Row: Location Pin + Delivery at Home + Address text */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5 text-slate-600">
          <span className="material-symbols-outlined text-[18px]">location_on</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-slate-900 leading-tight mb-1">
            Delivery at Home
          </div>
          <p className="text-xs text-slate-600 leading-relaxed break-words">
            {formattedAddress}
          </p>
          <div className="mt-1">
            <span className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer inline-flex items-center gap-0.5">
              Change address
              <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* Contact Person: Customer Name & Phone */}
      <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
          <span className="material-symbols-outlined text-[18px]">person</span>
        </div>
        <div className="text-xs font-bold text-slate-800">
          {customerName}, {customerPhone}
        </div>
      </div>

      {/* Verbal Handover PIN (When OUT_FOR_DELIVERY) */}
      {order.deliveryOtp && order.status === 'OUT_FOR_DELIVERY' && (
        <div className="bg-[#FFF8EE] border border-[#FDE68A] rounded-xl p-3 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-[#92400E] block leading-tight">
              Verbal Handover PIN
            </span>
            <span className="text-xs text-[#78350F] leading-tight">
              Share code with {order.riderName || 'your delivery partner'} on delivery
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyPin}
            className="flex items-center gap-1.5 bg-white border border-[#F59E0B]/40 px-3 py-1.5 rounded-lg shadow-2xs hover:bg-[#FFFBEB] transition-colors"
          >
            <span className="font-mono font-black text-sm text-slate-900 tracking-wider">
              {order.deliveryOtp}
            </span>
            <span className="material-symbols-outlined text-[14px] text-amber-700">
              {copiedPin ? 'check' : 'content_copy'}
            </span>
          </button>
        </div>
      )}

      {/* Items Accordion */}
      <div className="border-t border-slate-100 pt-2">
        <button
          type="button"
          onClick={() => setShowItems(!showItems)}
          className="w-full py-1 flex items-center justify-between text-xs font-bold text-slate-800 hover:text-black cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-emerald-700">receipt_long</span>
            <span>View Ordered Items ({order.items?.length || 0})</span>
          </div>
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${showItems ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showItems && (
          <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-slate-100">
            {order.items?.map((it, idx) => {
              const itemTotal = (it.totalPricePaise ?? (it.unitPricePaise ? it.unitPricePaise * it.quantity : 0)) / 100;
              return (
                <div key={idx} className="flex items-center justify-between text-xs py-1">
                  <span className="font-semibold text-slate-800">
                    {it.quantity}x {it.name}
                    {it.variant && <span className="text-slate-500 text-[11px] ml-1">({it.variant})</span>}
                  </span>
                  {itemTotal > 0 && <span className="font-mono font-bold text-slate-900">₹{itemTotal.toFixed(0)}</span>}
                </div>
              );
            })}
            <div className="flex flex-col gap-1 pt-2 border-t border-slate-100 text-xs">
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Items Subtotal</span>
                <span>₹{((order.subtotalPaise ?? (order.totalAmountPaise - (order.taxPaise || 0))) / 100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>GST (5%)</span>
                <span className="text-emerald-700 font-semibold">+₹{((order.taxPaise ?? Math.round(order.totalAmountPaise * 0.05 / 1.05)) / 100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-xs font-black text-slate-900 pt-1 border-t border-slate-100">
                <span>Total with GST</span>
                <span className="text-emerald-700">₹{(order.totalAmountPaise / 100).toFixed(0)}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Payment mode: {order.paymentMethod === 'COD' ? '💵 Cash on Delivery' : '💳 Online Payment'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Tracking View (Exact Match to Image 2) ─────────────────────────────
function MainTrackingView({
  order,
  orders,
  selectedOrderIndex,
  setSelectedOrderIndex,
}: {
  order: TrackOrderResponse;
  orders: TrackOrderResponse[];
  selectedOrderIndex: number;
  setSelectedOrderIndex: (i: number) => void;
}) {
  const blinkit = getBlinkitStatus(order.status);

  return (
    <main className="flex flex-col relative w-full min-h-screen bg-[#F6F8F6]">
      {/* ── Top Header Matching Reference 2nd Image ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 pt-3 pb-3 shadow-2xs">
        <div className="max-w-md mx-auto flex items-center justify-between">
          {/* Back button ← */}
          <Link
            href="/"
            aria-label="Back to Home"
            className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-slate-800 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>

          {/* Centered Headline matching 2nd Image */}
          <div className="flex-1 text-center pr-8">
            <div className="text-xs sm:text-sm font-semibold text-slate-800 leading-tight">
              {blinkit.subtitle}
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#15803d] tracking-tight leading-snug mt-0.5">
              {blinkit.headline}
            </h1>
          </div>
        </div>

        {/* Multi-Order Tabs (If multiple active orders exist) */}
        {orders.length > 1 && (
          <div className="max-w-md mx-auto flex items-center gap-1.5 pt-2 overflow-x-auto no-scrollbar">
            {orders.map((ord, idx) => (
              <button
                key={ord.orderNumber}
                type="button"
                onClick={() => setSelectedOrderIndex(idx)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                  idx === selectedOrderIndex
                    ? 'bg-[#15803d] text-white border-[#15803d]'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                #{ord.orderNumber}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* ── Scrollable Body Area ── */}
      <div className="flex-1 w-full max-w-md mx-auto px-3.5 py-3 flex flex-col gap-3.5 pb-24">
        {/* 1. Real-time Interactive Route & Live Driver Map */}
        <div className="w-full shrink-0">
          <LiveDeliveryMap
            driverLocation={
              order.status === 'OUT_FOR_DELIVERY' && order.rider?.location
                ? {
                    latitude: order.rider.location.latitude,
                    longitude: order.rider.location.longitude,
                    heading: order.rider.location.heading,
                  }
                : null
            }
            customerLocation={{
              latitude: order.coordinates?.latitude || 22.6288,
              longitude: order.coordinates?.longitude || 75.5684,
              address: [order.deliveryAddress?.flat, order.deliveryAddress?.street, order.deliveryAddress?.pincode].filter(Boolean).join(', '),
              name: order.customerName,
            }}
            kitchenLocation={
              order.kitchenCoordinates || {
                latitude: 22.6288,
                longitude: 75.5684,
                name: 'Janki Rasoi Cloud Kitchen',
              }
            }
            orderNumber={order.orderNumber}
            status={order.status}
            riderName={order.riderName || undefined}
            riderVehicle={order.rider?.vehicleNumber || undefined}
            height="260px"
            isRiderView={false}
          />
        </div>

        {/* 2. Delivery Partner Card – only shown when a real rider is assigned */}
        {order.riderName && (
          <PartnerCard order={order} bubbleText={blinkit.bubble} />
        )}

        {/* 3. Delivery Details Card matching Image 2 */}
        <DeliveryDetailsCard order={order} />

        {/* 4. Kitchen WhatsApp Support Card */}
        <div className="grid grid-cols-2 gap-2 mt-1">
          <a
            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
              `Tracking my Janki Rasoi order #${order.orderNumber}. PIN: ${order.deliveryOtp || 'On dispatch'}. Link: https://jankirasoi.in/track?token=${order.orderNumber}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-3 rounded-xl bg-white text-[#15803d] font-bold text-xs flex items-center justify-center gap-1.5 border border-[#15803d]/30 hover:bg-[#F0FDF4] transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-[16px]">share</span>
            <span>Share Order</span>
          </a>
          <a
            href="https://wa.me/919755554774?text=Hi%20Janki%20Rasoi%2C%20I%20need%20help%20with%20my%20order."
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-3 rounded-xl bg-white text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-200 hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-[16px] text-emerald-700">chat</span>
            <span>Kitchen Help</span>
          </a>
        </div>
      </div>
    </main>
  );
}

// ── Root Order Tracker with State Sync ───────────────────────────────────────
function OrderTrackingContent() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token');

  const [orders, setOrders] = useState<TrackOrderResponse[]>([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadOrders = useCallback(async (isSilent = false) => {
    if (typeof window === 'undefined') return;
    if (!isSilent) setLoading(true);

    try {
      const tokensToFetch: string[] = [];

      if (urlToken && urlToken.trim()) tokensToFetch.push(urlToken.trim());

      const activeIdentifier = getActiveTrackingIdentifier();
      if (activeIdentifier && !tokensToFetch.includes(activeIdentifier)) {
        tokensToFetch.push(activeIdentifier);
      }

      if (tokensToFetch.length === 0) {
        setOrders([]);
        if (!isSilent) setLoading(false);
        return;
      }

      const results = await Promise.allSettled(
        tokensToFetch.map((t) => api.trackOrder(t))
      );

      const fetchedOrders: TrackOrderResponse[] = [];
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value?.orderNumber) {
          if (!fetchedOrders.some((o) => o.orderNumber === res.value.orderNumber)) {
            fetchedOrders.push(res.value);
          }
        } else if (res.status === 'rejected') {
          const rejectedToken = tokensToFetch[idx];
          const err = res.reason;
          if (err?.status === 404 || err?.message?.toLowerCase().includes('not found')) {
            clearActiveTrackingIdentifier(rejectedToken);
          }
        }
      });

      // Strict newest-first sorting for customer multi-order tracking
      fetchedOrders.sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
      setOrders(fetchedOrders);
      setError(null);
    } catch (err: any) {
      if (!isSilent) setError(err.message || 'Unable to fetch order status');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [urlToken]);

  useEffect(() => {
    loadOrders(false);

    // Only run recurring polling interval if there is an active token to track
    const interval = setInterval(() => {
      if (!urlToken && !getActiveTrackingIdentifier()) return;
      loadOrders(true);
    }, 5000);

    const handleSync = () => loadOrders(true);

    window.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
    window.addEventListener('jr_order_placed', handleSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('jr_order_placed', handleSync);
    };
  }, [loadOrders, urlToken]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.trackOrder(query);
      if (data?.orderNumber) {
        setOrders((prev) => {
          const filtered = prev.filter((o) => o.orderNumber !== data.orderNumber);
          return [data, ...filtered];
        });
        setSelectedOrderIndex(0);
        setSearchQuery('');
      }
    } catch (err: any) {
      setError(err.message || 'Order not found for given number or token.');
    } finally {
      setLoading(false);
    }
  };

  // ── Loading state ──
  if (loading && orders.length === 0) {
    return (
      <main className="flex flex-col relative w-full pt-16 min-h-screen bg-[#F6F8F6]">
        <div className="w-full max-w-md mx-auto px-4 pt-4 flex flex-col gap-4">
          <div className="h-14 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="h-32 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          <div className="h-44 rounded-2xl bg-white border border-slate-200 animate-pulse" />
        </div>
      </main>
    );
  }

  // ── Empty state (No orders found) ──
  if (!loading && orders.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-[75vh] px-4 bg-[#F6F8F6]">
        <div className="bg-white p-7 rounded-3xl shadow-sm border border-slate-200 max-w-sm w-full text-center flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">moped</span>
          </div>
          <div>
            <h2 className="font-extrabold text-lg text-slate-900 font-headline">
              No Active Order Found
            </h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Enter your Order ID (e.g. JR-20261031-0002) to track live status.
            </p>
          </div>

          <form onSubmit={handleSearchSubmit} className="w-full flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. JR-20261031-0002"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-600"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors cursor-pointer"
            >
              Track
            </button>
          </form>

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <Link
            href="/menu"
            className="w-full h-11 rounded-full bg-[#15803d] hover:bg-[#166534] text-white text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
          >
            <span>Order Fresh Meal</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>
      </main>
    );
  }

  const currentOrder = orders[selectedOrderIndex] || orders[0];

  return (
    <MainTrackingView
      order={currentOrder}
      orders={orders}
      selectedOrderIndex={selectedOrderIndex}
      setSelectedOrderIndex={setSelectedOrderIndex}
    />
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-[#F6F8F6]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center animate-pulse">
              <span className="material-symbols-outlined text-[24px]">moped</span>
            </div>
            <span className="text-xs font-bold text-slate-600">Loading live order tracking…</span>
          </div>
        </div>
      }
    >
      <OrderTrackingContent />
    </Suspense>
  );
}
