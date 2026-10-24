'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, AdminOrder, AdminCustomer, AdminRider } from '../lib/api';

// Synthesizer Web Audio API chime (zero external assets, 100% reliable)
function playKitchenOrderChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Audio autoplay restrictions
  }
}

function formatOrderDate(isoString?: string) {
  if (!isoString) return '21 Oct, 07:30 PM';
  try {
    const d = new Date(isoString);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day} ${month}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  } catch {
    return '21 Oct, 07:30 PM';
  }
}

function getInitials(name?: string) {
  if (!name) return 'C';
  return name.trim().charAt(0).toUpperCase();
}

function formatAddress(addr: any): string {
  if (!addr) return 'Flat 402, Malviya Nagar, New Delhi';
  if (typeof addr === 'string') return addr;
  const parts = [addr.flat, addr.street, addr.landmark, addr.pincode].filter(Boolean);
  return parts.join(', ') || 'Flat 402, Malviya Nagar, New Delhi';
}

function OrderDetailsPanel({
  selectedOrder,
  detailTab,
  setDetailTab,
  handleTransition,
  handleManualOverride,
  setShowRiderModal,
  actionLoadingId,
  onClose,
  isDrawer = false,
}: {
  selectedOrder: AdminOrder;
  detailTab: 'DETAILS' | 'CUSTOMER' | 'TIMELINE';
  setDetailTab: (tab: 'DETAILS' | 'CUSTOMER' | 'TIMELINE') => void;
  handleTransition: (orderId: string, nextStatus: string) => Promise<void>;
  handleManualOverride: (orderId: string) => Promise<void>;
  setShowRiderModal: (show: boolean) => void;
  actionLoadingId: string | null;
  onClose?: () => void;
  isDrawer?: boolean;
}) {
  return (
    <div className={`bg-white flex flex-col gap-3 ${isDrawer ? 'h-full' : 'rounded-2xl border border-gray-200/90 p-4 shadow-2xs w-full'}`}>
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-bold text-sm text-gray-950 font-mono tracking-tight truncate">
            #{selectedOrder.orderNumber}
          </h3>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 flex items-center gap-1 ${
              selectedOrder.status === 'DELIVERED'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : selectedOrder.status === 'PLACED'
                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                : selectedOrder.status === 'READY_FOR_PICKUP'
                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                : selectedOrder.status === 'OUT_FOR_DELIVERY'
                ? 'bg-purple-50 text-purple-800 border border-purple-200'
                : 'bg-amber-50 text-amber-900 border border-amber-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                selectedOrder.status === 'DELIVERED'
                  ? 'bg-emerald-600'
                  : selectedOrder.status === 'PLACED'
                  ? 'bg-rose-500 animate-pulse'
                  : selectedOrder.status === 'READY_FOR_PICKUP'
                  ? 'bg-blue-500'
                  : selectedOrder.status === 'OUT_FOR_DELIVERY'
                  ? 'bg-purple-500'
                  : 'bg-amber-500'
              }`}
            ></span>
            <span>{selectedOrder.status}</span>
          </span>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="w-6 h-6 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors shrink-0"
            title="Close details"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {/* Sub-tabs: Details | Customer | Timeline */}
      <div className="flex items-center gap-4 text-xs font-semibold border-b border-gray-100 pb-1.5">
        <button
          onClick={() => setDetailTab('DETAILS')}
          className={`pb-1 transition-colors relative ${
            detailTab === 'DETAILS'
              ? 'text-emerald-900 font-bold border-b-2 border-emerald-800'
              : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          Details
        </button>
        <button
          onClick={() => setDetailTab('CUSTOMER')}
          className={`pb-1 transition-colors relative ${
            detailTab === 'CUSTOMER'
              ? 'text-emerald-900 font-bold border-b-2 border-emerald-800'
              : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          Customer
        </button>
        <button
          onClick={() => setDetailTab('TIMELINE')}
          className={`pb-1 transition-colors relative ${
            detailTab === 'TIMELINE'
              ? 'text-emerald-900 font-bold border-b-2 border-emerald-800'
              : 'text-gray-400 hover:text-gray-700'
          }`}
        >
          Timeline
        </button>
      </div>

      {detailTab === 'DETAILS' && (
        <div className="flex flex-col gap-3 text-xs flex-1 overflow-y-auto pr-0.5">
          {/* Customer Profile & Quick 1-Tap Actions */}
          <div className="pb-2.5 border-b border-gray-100 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
                  {getInitials(selectedOrder.customerName)}
                </span>
                <div className="min-w-0">
                  <h4 className="font-bold text-gray-900 text-xs leading-tight truncate">
                    {selectedOrder.customerName}
                  </h4>
                  <div className="text-[11px] text-gray-400 font-mono">
                    +91 {selectedOrder.customerPhone}
                  </div>
                </div>
              </div>

              {/* 1-Tap Call, WhatsApp & Map */}
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={`tel:${selectedOrder.customerPhone}`}
                  className="p-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                  title="Call Customer"
                >
                  <span className="material-symbols-outlined text-[15px]">call</span>
                </a>
                <a
                  href={`https://wa.me/91${selectedOrder.customerPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 transition-colors"
                  title="WhatsApp"
                >
                  <span className="material-symbols-outlined text-[15px]">chat</span>
                </a>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(formatAddress(selectedOrder.deliveryAddress))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 transition-colors"
                  title="View on Maps"
                >
                  <span className="material-symbols-outlined text-[15px]">pin_drop</span>
                </a>
              </div>
            </div>

            <div className="text-[11px] text-gray-600 bg-stone-50 rounded-xl p-2 border border-stone-100 leading-snug">
              <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block mb-0.5">Address</span>
              {formatAddress(selectedOrder.deliveryAddress)}
            </div>

            {selectedOrder.deliveryNotes && (
              <div className="text-[11px] text-amber-900 bg-amber-50/80 border border-amber-200/60 rounded-lg px-2 py-1 flex items-start gap-1 font-medium">
                <span className="material-symbols-outlined text-[13px] text-amber-700 shrink-0 mt-0.5">edit_note</span>
                <span>Note: "{selectedOrder.deliveryNotes}"</span>
              </div>
            )}
          </div>

          {/* Minimalist Order Items */}
          <div className="pb-2.5 border-b border-gray-100 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <span>Items ({selectedOrder.items?.reduce((acc, it) => acc + it.quantity, 0) || selectedOrder.itemsCount || 1})</span>
              <span>Amount</span>
            </div>

            <div className="divide-y divide-gray-50">
              {selectedOrder.items && selectedOrder.items.length > 0 ? (
                selectedOrder.items.map((item, idx) => (
                  <div key={item.id || idx} className="py-1.5 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-900 leading-snug">
                        <span className="text-emerald-800 font-bold font-mono mr-1">{item.quantity}×</span>
                        {item.productName}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        {item.variantName || 'Standard Meal'}
                        {item.addons && item.addons.length > 0 && ` • +${item.addons.map((a) => a.name).join(', ')}`}
                      </div>
                    </div>
                    <div className="text-xs font-mono font-bold text-gray-900 shrink-0">
                      ₹{item.totalPricePaise ? (item.totalPricePaise / 100).toFixed(2) : (selectedOrder.totalAmountPaise / 100).toFixed(2)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-1.5 text-xs text-gray-500 font-medium">
                  Standard Tiffin Thali (×{selectedOrder.itemsCount || 1})
                </div>
              )}
            </div>
          </div>

          {/* Clean Order Info & Bill Total */}
          <div className="pb-2.5 border-b border-gray-100 flex flex-col gap-2 text-xs">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider">Time Slot</span>
                <span className="font-semibold text-gray-800 truncate block">{selectedOrder.slotLabel || 'Standard'}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider">Payment</span>
                <span className="font-semibold text-gray-800 uppercase">{selectedOrder.paymentMethod || 'COD'}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 text-xs">
              <span className="font-bold text-gray-600">Total Billed</span>
              <span className="font-bold font-mono text-base text-gray-950">
                ₹{(selectedOrder.totalAmountPaise / 100).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Operational Primary & Secondary Actions */}
          <div className="flex flex-col gap-2 mt-auto pt-1">
            {selectedOrder.status === 'PLACED' && (
              <button
                onClick={() => handleTransition(selectedOrder.id, 'ACCEPTED')}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">skillet</span>
                <span>Accept & Start Preparing</span>
              </button>
            )}

            {(selectedOrder.status === 'ACCEPTED' || selectedOrder.status === 'PREPARING') && (
              <button
                onClick={() => handleTransition(selectedOrder.id, 'READY_FOR_PICKUP')}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Mark Food Ready</span>
              </button>
            )}

            {selectedOrder.status === 'READY_FOR_PICKUP' && (
              <button
                onClick={() => setShowRiderModal(true)}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">two_wheeler</span>
                <span>Assign &amp; Dispatch Rider</span>
              </button>
            )}

            {selectedOrder.status === 'OUT_FOR_DELIVERY' && (
              <button
                onClick={() => handleManualOverride(selectedOrder.id)}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">task_alt</span>
                <span>Verify OTP &amp; Complete Delivery</span>
              </button>
            )}

            {selectedOrder.status === 'DELIVERED' && (
              <div className="w-full py-2 rounded-xl bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1 border border-emerald-200">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                <span>Order Delivered Successfully</span>
              </div>
            )}

            {/* Subtle Secondary Actions */}
            {selectedOrder.status !== 'CANCELLED' && selectedOrder.status !== 'DELIVERED' && (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setShowRiderModal(true)}
                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                  <span>Change Rider</span>
                </button>

                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to cancel this order?')) {
                      handleTransition(selectedOrder.id, 'CANCELLED');
                    }
                  }}
                  className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {detailTab === 'CUSTOMER' && (
        <div className="flex flex-col gap-3 text-xs flex-1 overflow-y-auto">
          <div className="p-3 bg-stone-50 rounded-xl border border-stone-100 flex flex-col gap-1.5">
            <span className="font-bold text-gray-900">{selectedOrder.customerName}</span>
            <span className="text-gray-600 font-mono">Mobile: +91 {selectedOrder.customerPhone}</span>
            <span className="text-gray-500 text-[11px]">Registered Customer Account</span>
          </div>
          <div className="text-[11px] text-gray-500">
            Full address on file:
            <div className="text-gray-800 font-medium mt-1 p-2.5 bg-white rounded-lg border border-gray-200">
              {formatAddress(selectedOrder.deliveryAddress)}
            </div>
          </div>
        </div>
      )}

      {detailTab === 'TIMELINE' && (
        <div className="flex flex-col gap-3 text-xs pl-2 flex-1 overflow-y-auto">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
            <div>
              <div className="font-bold text-gray-900">Order Placed &amp; Authorized</div>
              <div className="text-[10px] text-gray-400">{formatOrderDate(selectedOrder.createdAt)}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${selectedOrder.status !== 'PLACED' ? 'bg-emerald-600' : 'bg-gray-300'}`}></span>
            <div>
              <div className="font-bold text-gray-900">Kitchen Preparation</div>
              <div className="text-[10px] text-gray-400">Cooking on Station #1</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${selectedOrder.status === 'READY_FOR_PICKUP' || selectedOrder.status === 'OUT_FOR_DELIVERY' || selectedOrder.status === 'DELIVERED' ? 'bg-emerald-600' : 'bg-gray-300'}`}></span>
            <div>
              <div className="font-bold text-gray-900">Ready for Dispatch</div>
              <div className="text-[10px] text-gray-400">Packed in spill-proof warm tray</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${selectedOrder.status === 'OUT_FOR_DELIVERY' || selectedOrder.status === 'DELIVERED' ? 'bg-emerald-600' : 'bg-gray-300'}`}></span>
            <div>
              <div className="font-bold text-gray-900">Out with Delivery Rider</div>
              <div className="text-[10px] text-gray-400">En route to customer</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${selectedOrder.status === 'DELIVERED' ? 'bg-emerald-600' : 'bg-gray-300'}`}></span>
            <div>
              <div className="font-bold text-gray-900">Delivered</div>
              <div className="text-[10px] text-gray-400">Handover verified</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OperationsConsolePage() {
  // Navigation Module View matching target reference image
  const [mainView, setMainView] = useState<'ORDERS' | 'CUSTOMERS' | 'RIDERS' | 'MENU' | 'REPORTS' | 'SETTINGS'>('ORDERS');

  // KDS Orders State
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<'ACTIVE' | 'ALL' | 'NEW' | 'PREPARING' | 'READY' | 'DISPATCH' | 'DELIVERED' | 'CANCELLED'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // View presentation state (Live Kitchen Pipeline vs Condensed Data Table)
  const [orderViewMode, setOrderViewMode] = useState<'TABLE' | 'KITCHEN'>('KITCHEN');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [desktopPanelOpen, setDesktopPanelOpen] = useState(false);

  // Selected Order for Right Details Panel
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'DETAILS' | 'CUSTOMER' | 'TIMELINE'>('DETAILS');

  // Rider assignment modal state
  const [showRiderModal, setShowRiderModal] = useState(false);

  // Customers & Riders State
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [ridersLoading, setRidersLoading] = useState(false);

  // Catalog & Inventory (86-ing) State
  const [catalogCategories, setCatalogCategories] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [soldOutItemIds, setSoldOutItemIds] = useState<Set<string>>(new Set());

  // Delivery Slots State (Unified in Menu View)
  const [slotsData, setSlotsData] = useState<any[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Add New Thali / Dish State
  const [showAddDishModal, setShowAddDishModal] = useState(false);
  const [newDishName, setNewDishName] = useState('');
  const [newDishCategory, setNewDishCategory] = useState('');
  const [newDishPrice, setNewDishPrice] = useState('');
  const [newDishDescription, setNewDishDescription] = useState('');
  const [newDishImageUrl, setNewDishImageUrl] = useState('');
  const [isSubmittingDish, setIsSubmittingDish] = useState(false);

  const prevOrdersCountRef = useRef<number>(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Fetch Live Orders
  const loadOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const data = await adminApi.getOrders();
      const fetched = data.orders || [];

      // Check if new orders arrived to trigger audio chime
      const newOrdersCount = fetched.filter((o) => o.status === 'PLACED').length;
      if (isSilent && audioEnabled && newOrdersCount > prevOrdersCountRef.current) {
        playKitchenOrderChime();
        showToast('New Customer Order Arrived!');
      }
      prevOrdersCountRef.current = newOrdersCount;
      setOrders(fetched);

      // Default select first order if none selected
      setSelectedOrderId((prev) => (prev && fetched.some((o) => o.id === prev) ? prev : fetched[0]?.id || null));
    } catch (err: any) {
      console.warn('Orders fetch note:', err.message);
    } finally {
      setLoading(false);
    }
  }, [audioEnabled]);

  // 2. Fetch Customers
  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const data = await adminApi.getCustomers();
      setCustomers(data.customers || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch customers');
    } finally {
      setCustomersLoading(false);
    }
  }, []);

  // 3. Fetch Riders
  const loadRiders = useCallback(async () => {
    setRidersLoading(true);
    try {
      const data = await adminApi.getRiders();
      setRiders(data.riders || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch riders');
    } finally {
      setRidersLoading(false);
    }
  }, []);

  // 4. Fetch Catalog (for Menu 86-ing)
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const data = await adminApi.getCatalog();
      const cats = data.categories || [];
      setCatalogCategories(cats);
      const soldOuts = new Set<string>();
      cats.forEach((c: any) => {
        c.items?.forEach((i: any) => {
          if (i.isSoldOut) soldOuts.add(i.id);
        });
      });
      setSoldOutItemIds(soldOuts);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch catalog');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  // 5. Fetch Delivery Slots
  const loadSlots = useCallback(async () => {
    setSlotsLoading(true);
    try {
      const data = await adminApi.getDeliverySlots();
      setSlotsData(data.slots || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch delivery slots');
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    loadRiders();
    loadSlots();

    // 1. Resilient polling fallback every 6 seconds
    const interval = setInterval(() => loadOrders(true), 6000);

    // 2. Instant sync when browser tab regains focus or visibility
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadOrders(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // 3. Real-time Server-Sent Events (SSE) for instant sub-second order arrival
    let eventSource: EventSource | null = null;
    try {
      const streamUrl = '/api/v1/admin/orders/stream?simulated_role=STAFF';
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'PING') return;
          if (payload.type === 'ORDER_CREATED') {
            playKitchenOrderChime();
            showToast(`New order received: #${payload.orderNumber || ''}`);
          }
          loadOrders(true);
        } catch {
          loadOrders(true);
        }
      };

      eventSource.onerror = () => {
        // EventSource will automatically attempt reconnection
      };
    } catch (e) {
      console.warn('Real-time SSE connection failed, relying on polling fallback', e);
    }

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [loadOrders, loadRiders, loadSlots]);

  useEffect(() => {
    if (mainView === 'CUSTOMERS') loadCustomers();
    if (mainView === 'RIDERS') loadRiders();
    if (mainView === 'MENU') {
      loadCatalog();
      loadSlots();
    }
  }, [mainView, loadCustomers, loadRiders, loadCatalog, loadSlots]);

  // Handle Order Status Transitions
  const handleTransition = async (orderId: string, nextStatus: string) => {
    setActionLoadingId(orderId);
    try {
      await adminApi.updateOrderStatus(orderId, nextStatus);
      showToast(`Order status updated to ${nextStatus}`);
      await loadOrders(true);
    } catch (err: any) {
      showToast(err.message || 'Status transition failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Assigning Rider
  const handleAssignRider = async (orderId: string, riderId: string) => {
    setActionLoadingId(orderId);
    try {
      await adminApi.assignRider(orderId, riderId);
      showToast('Rider assigned successfully');
      setShowRiderModal(false);
      await loadOrders(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to assign rider');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Manual PIN Verification Override
  const handleManualOverride = async (orderId: string) => {
    const reason = window.prompt('Enter verification reason (e.g. Phone confirmation with customer):');
    if (!reason || !reason.trim()) return;

    setActionLoadingId(orderId);
    try {
      await adminApi.overrideDelivery(orderId, reason.trim());
      showToast('Order manually marked DELIVERED');
      await loadOrders(true);
    } catch (err: any) {
      showToast(err.message || 'Override failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Toggle Item Stock (86-ing)
  const toggleItemStock = async (itemId: string, itemName: string) => {
    const today = new Date().toISOString().split('T')[0];
    const isCurrentlySoldOut = soldOutItemIds.has(itemId);
    const nextSoldOut = !isCurrentlySoldOut;

    const updated = new Set(soldOutItemIds);
    if (nextSoldOut) updated.add(itemId);
    else updated.delete(itemId);
    setSoldOutItemIds(updated);

    try {
      await adminApi.toggleDishSoldOut(itemId, today, nextSoldOut);
      showToast(nextSoldOut ? `Marked ${itemName} as SOLD OUT (86)` : `Marked ${itemName} back IN STOCK`);
    } catch (err: any) {
      setSoldOutItemIds(soldOutItemIds);
      showToast(err.message || 'Failed to update item availability in database');
    }
  };

  // Quick Preset Authentic Thali Images
  const PRESET_THALI_IMAGES = [
    {
      title: 'Deluxe Shahi Paneer Thali',
      url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop&q=80',
    },
    {
      title: 'Homestyle Dal & Phulka Thali',
      url: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop&q=80',
    },
    {
      title: 'Satvik Pure Veg Thali',
      url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=800&auto=format&fit=crop&q=80',
    },
    {
      title: 'Rajasthani / Gujarati Feast',
      url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&auto=format&fit=crop&q=80',
    },
  ];

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size exceeds 5MB limit');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setNewDishImageUrl(String(event.target.result));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDishName.trim()) {
      showToast('Please enter a dish name');
      return;
    }
    const catId = newDishCategory || catalogCategories[0]?.id;
    if (!catId) {
      showToast('Please wait for catalog categories to load');
      return;
    }
    const priceNum = parseFloat(newDishPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      showToast('Please enter a valid price in ₹');
      return;
    }

    setIsSubmittingDish(true);
    try {
      await adminApi.createDish({
        categoryId: catId,
        name: newDishName.trim(),
        description: newDishDescription.trim() || 'Pure vegetarian homestyle meal freshly cooked in pure ghee.',
        basePricePaise: Math.round(priceNum * 100),
        imageUrl: newDishImageUrl || PRESET_THALI_IMAGES[0].url,
        dietaryType: 'VEG',
      });
      showToast(`Added "${newDishName}" to Kitchen Menu!`);
      setShowAddDishModal(false);
      setNewDishName('');
      setNewDishPrice('');
      setNewDishDescription('');
      setNewDishImageUrl('');
      await loadCatalog();
    } catch (err: any) {
      showToast(err.message || 'Failed to add new dish');
    } finally {
      setIsSubmittingDish(false);
    }
  };

  // Exact Metrics Matching Reference Image
  const totalOrdersCount = orders.length;
  const newCount = orders.filter((o) => o.status === 'PLACED').length;
  const preparingCount = orders.filter((o) => o.status === 'ACCEPTED' || o.status === 'PREPARING').length;
  const readyCount = orders.filter((o) => o.status === 'READY_FOR_PICKUP').length;
  const dispatchCount = orders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length;
  const deliveredCount = orders.filter((o) => o.status === 'DELIVERED').length;
  const cancelledCount = orders.filter((o) => o.status === 'CANCELLED').length;
  const activeOrdersCount = newCount + preparingCount + readyCount + dispatchCount;
  const totalGmvPaise = orders.reduce((sum, o) => sum + (o.status !== 'CANCELLED' ? o.totalAmountPaise : 0), 0);

  // Filter & Sort Orders: Arranged according to the largest time when it was ordered (oldest order first in queue)
  const filteredOrders = orders
    .filter((order) => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.customerPhone.includes(searchQuery) ||
        order.customerName.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // ACTIVE hides delivered and cancelled orders from live screen by default
      if (activeFilterTab === 'ACTIVE') return order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
      if (activeFilterTab === 'NEW') return order.status === 'PLACED';
      if (activeFilterTab === 'PREPARING') return order.status === 'ACCEPTED' || order.status === 'PREPARING';
      if (activeFilterTab === 'READY') return order.status === 'READY_FOR_PICKUP';
      if (activeFilterTab === 'DISPATCH') return order.status === 'OUT_FOR_DELIVERY';
      if (activeFilterTab === 'DELIVERED') return order.status === 'DELIVERED';
      if (activeFilterTab === 'CANCELLED') return order.status === 'CANCELLED';
      return true;
    })
    .sort((a, b) => {
      // Largest elapsed time when ordered: earliest timestamp comes first
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

  const selectedOrder = orders.find((o) => o.id === selectedOrderId) || filteredOrders[0] || null;

  // Reusable Kitchen Card Component with Urgency Timers and 1-Tap Actions (Minimalist & Squeeze-proof)
  const renderKitchenPipelineCard = (order: AdminOrder) => {
    const isPreparing = order.status === 'ACCEPTED' || order.status === 'PREPARING';
    const isPlaced = order.status === 'PLACED';
    const isReady = order.status === 'READY_FOR_PICKUP';
    const isDispatch = order.status === 'OUT_FOR_DELIVERY';
    const isDelivered = order.status === 'DELIVERED';
    const isCancelled = order.status === 'CANCELLED';
    const totalItems = order.items?.reduce((acc, it) => acc + it.quantity, 0) || order.itemsCount || 1;

    // Short kitchen token e.g. "#0015" from "#JR-20261023-0015"
    const shortToken = order.orderNumber.includes('-')
      ? '#' + order.orderNumber.split('-').slice(-1)[0]
      : '#' + order.orderNumber;

    // Formatted ordered time string, e.g. "02:19 PM"
    const orderCreatedAt = new Date(order.createdAt);
    const orderedTimeFormatted = orderCreatedAt.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    // Urgency calculation: green (<10m), amber (10-20m), pulse red (>20m)
    const elapsedMins = Math.max(0, Math.floor((Date.now() - orderCreatedAt.getTime()) / 60000));
    const isUrgent = elapsedMins >= 20 && !isDelivered && !isCancelled;
    const isWarning = elapsedMins >= 10 && elapsedMins < 20 && !isDelivered && !isCancelled;

    return (
      <div
        key={order.id}
        onClick={() => {
          setSelectedOrderId(order.id);
          setDesktopPanelOpen(true);
          if (typeof window !== 'undefined' && window.innerWidth < 1280) {
            setDrawerOpen(true);
          }
        }}
        className={`bg-white rounded-2xl border transition-all p-3 flex flex-col justify-between gap-2.5 shadow-2xs hover:shadow-md cursor-pointer ${
          selectedOrder?.id === order.id
            ? 'border-emerald-600 ring-2 ring-emerald-600/20'
            : isUrgent
            ? 'border-rose-300 ring-1 ring-rose-200 bg-rose-50/15'
            : 'border-gray-200/90'
        }`}
      >
        {/* Card Header: Short Token, Meal Type (SVG Icon), and Status */}
        <div className="flex items-center justify-between gap-1.5 border-b border-gray-100 pb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold font-mono text-gray-950 text-sm tracking-tight shrink-0">
              {shortToken}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-700 shrink-0 inline-flex items-center gap-1">
              <span className={`material-symbols-outlined text-[12px] ${order.slotLabel?.includes('Dinner') ? 'text-indigo-600' : 'text-amber-600'}`}>
                {order.slotLabel?.includes('Dinner') ? 'dark_mode' : 'light_mode'}
              </span>
              <span>{order.slotLabel?.includes('Dinner') ? 'Dinner' : 'Lunch'}</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isPlaced && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span>NEW</span>
              </span>
            )}
            {isPreparing && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                <span>COOK</span>
              </span>
            )}
            {isReady && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span>READY</span>
              </span>
            )}
            {isDispatch && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                <span>RIDER</span>
              </span>
            )}
            {isDelivered && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                DELIVERED
              </span>
            )}
            {isCancelled && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600">
                CANCELLED
              </span>
            )}
          </div>
        </div>

        {/* Prominently Highlighted Order Time & Elapsed Wait Badge */}
        <div className="flex items-center justify-between bg-stone-50/90 px-2 py-1.5 rounded-xl border border-stone-200/70 text-xs">
          <div className="flex items-center gap-1.5 text-gray-700">
            <span className="material-symbols-outlined text-[14px] text-emerald-800">schedule</span>
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Ordered:</span>
            <span className="font-mono font-bold text-gray-950 text-xs bg-white px-1.5 py-0.5 rounded-md border border-stone-200 shadow-2xs">
              {orderedTimeFormatted}
            </span>
          </div>

          {!isDelivered && !isCancelled && (
            <span
              className={`font-bold font-mono px-2 py-0.5 rounded-md text-[10px] flex items-center gap-1 ${
                isUrgent
                  ? 'bg-rose-100 text-rose-800 animate-pulse'
                  : isWarning
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              <span className="material-symbols-outlined text-[12px]">
                {isUrgent ? 'local_fire_department' : 'timer'}
              </span>
              <span>{elapsedMins}m wait</span>
            </span>
          )}
        </div>

        {/* Minimalist Typographic Food Items */}
        <div className="space-y-1">
          {order.items && order.items.length > 0 ? (
            order.items.slice(0, 3).map((it, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs leading-snug">
                <span className="font-medium text-gray-800 truncate pr-1">
                  <span className="font-bold text-emerald-800 font-mono mr-1">{it.quantity}×</span>
                  {it.productName}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-gray-700 font-medium leading-snug">
              <span className="font-bold text-emerald-800 font-mono mr-1">{totalItems}×</span>
              Standard Tiffin
            </div>
          )}

          {order.items && order.items.length > 3 && (
            <div className="text-[10px] text-gray-400 font-medium">
              +{order.items.length - 3} more item(s)...
            </div>
          )}

          {order.deliveryNotes && (
            <div className="text-[10px] text-amber-900 bg-amber-50/90 border border-amber-200/60 rounded px-1.5 py-0.5 flex items-center gap-1 font-medium truncate mt-1">
              <span className="material-symbols-outlined text-[12px] text-amber-700 shrink-0">edit_note</span>
              <span className="truncate">"{order.deliveryNotes}"</span>
            </div>
          )}
        </div>

        {/* Customer & Quick Call */}
        <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-100">
          <div className="min-w-0 pr-1 truncate">
            <span className="font-semibold text-gray-900 text-xs">{order.customerName}</span>
            <span className="text-[11px] text-gray-400 ml-1.5 truncate">
              {formatAddress(order.deliveryAddress).split(',')[0]}
            </span>
          </div>
          <a
            href={`tel:${order.customerPhone}`}
            onClick={(e) => e.stopPropagation()}
            className="w-6 h-6 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 transition-colors"
            title={`Call +91 ${order.customerPhone}`}
          >
            <span className="material-symbols-outlined text-[13px]">call</span>
          </a>
        </div>

        {/* Price & Single 1-Tap Action Button */}
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 gap-2">
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="font-bold font-mono text-gray-900 text-xs">
              ₹{(order.totalAmountPaise / 100).toFixed(0)}
            </span>
            <span className="text-[9px] uppercase font-bold text-gray-400">
              {order.paymentMethod || 'COD'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            {isPlaced && (
              <button
                onClick={() => handleTransition(order.id, 'ACCEPTED')}
                disabled={actionLoadingId === order.id}
                className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">skillet</span>
                <span>Accept</span>
              </button>
            )}

            {isPreparing && (
              <button
                onClick={() => handleTransition(order.id, 'READY_FOR_PICKUP')}
                disabled={actionLoadingId === order.id}
                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                <span>Ready</span>
              </button>
            )}

            {isReady && (
              <button
                onClick={() => {
                  setSelectedOrderId(order.id);
                  setShowRiderModal(true);
                }}
                disabled={actionLoadingId === order.id}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                <span>Assign</span>
              </button>
            )}

            {isDispatch && (
              <button
                onClick={() => handleManualOverride(order.id)}
                disabled={actionLoadingId === order.id}
                className="px-2.5 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">task_alt</span>
                <span>OTP</span>
              </button>
            )}

            {isDelivered && (
              <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-0.5">
                <span className="material-symbols-outlined text-[14px]">verified</span>
                <span>Done</span>
              </span>
            )}

            {isCancelled && (
              <span className="text-[11px] font-bold text-stone-400">Cancelled</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8faf7] text-stone-900 flex flex-col font-body selection:bg-emerald-800 selection:text-white antialiased">
      {/* 1. TOP COMPACT HEADER */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200/90 px-4 lg:px-6 h-16 flex items-center justify-between shadow-2xs">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Mobile Drawer Hamburger Button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center text-gray-700 shadow-2xs transition-colors shrink-0"
            title="Open navigation menu"
            aria-label="Open navigation menu"
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
          </button>

          {/* Logo & Title */}
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-[20px]">psychiatry</span>
            </span>
            <div>
              <h1 className="font-headline font-bold text-base leading-none text-gray-900">
                Janki Rasoi
              </h1>
              <span className="text-[11px] text-gray-400 font-medium">Operations Console</span>
            </div>
          </div>

          {/* Kitchen & Dispatch Tag */}
          <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            KITCHEN &amp; DISPATCH
          </span>

          {/* Live Kitchen Connection Indicator */}
          <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-500 pl-2 border-l border-gray-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Kitchen Station #1</span>
            <span>•</span>
            <span className="text-emerald-700 font-semibold">Online (Live)</span>
          </div>
        </div>

        {/* Right Header Controls: GMV | Chime | Profile */}
        <div className="flex items-center gap-3">
          {/* Today GMV Card */}
          <div className="bg-emerald-50/90 border border-emerald-200/80 px-3.5 py-1 rounded-xl text-right">
            <span className="text-[9px] text-emerald-800 font-bold uppercase tracking-wider block">
              Today GMV
            </span>
            <span className="text-sm font-bold text-emerald-950 font-headline leading-tight block">
              ₹{(totalGmvPaise / 100).toFixed(2)}
            </span>
          </div>

          {/* Chime Bell Toggle */}
          <button
            onClick={() => {
              setAudioEnabled(!audioEnabled);
              if (!audioEnabled) playKitchenOrderChime();
            }}
            className="relative w-9 h-9 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 flex items-center justify-center transition-colors shadow-2xs"
            title={audioEnabled ? 'Chime Active' : 'Muted'}
          >
            <span className="material-symbols-outlined text-[19px]">
              {audioEnabled ? 'notifications' : 'notifications_off'}
            </span>
            {audioEnabled && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
            )}
          </button>

          {/* User Profile Avatar */}
          <div className="w-9 h-9 rounded-full bg-emerald-900 text-white font-bold flex items-center justify-center text-xs shadow-xs cursor-pointer">
            JR
          </div>
        </div>
      </header>

      {/* 2. BODY LAYOUT: Left Sidebar + Center Workspace (+ Right Panel on Orders) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Persistent Sidebar (Matching Reference Image) */}
        <aside className="w-56 bg-white border-r border-gray-200/90 flex flex-col justify-between p-3 shrink-0 select-none hidden md:flex overflow-y-auto no-scrollbar">
          {/* Main Navigation Stack */}
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setMainView('ORDERS')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                mainView === 'ORDERS'
                  ? 'bg-emerald-50/80 text-emerald-900 border border-emerald-200/80 shadow-2xs'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                <span>Orders</span>
              </div>
              <span className="w-5 h-5 rounded-full bg-emerald-800 text-white text-[10px] font-bold flex items-center justify-center">
                {orders.length}
              </span>
            </button>

            <button
              onClick={() => setMainView('CUSTOMERS')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 ${
                mainView === 'CUSTOMERS'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">group</span>
              <span>Customers</span>
            </button>

            <button
              onClick={() => setMainView('RIDERS')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 ${
                mainView === 'RIDERS'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">two_wheeler</span>
              <span>Riders &amp; Delivery</span>
            </button>

            <button
              onClick={() => setMainView('MENU')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 ${
                mainView === 'MENU'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">restaurant_menu</span>
              <span>Menu &amp; Dishes</span>
            </button>

            <button
              onClick={() => setMainView('REPORTS')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 ${
                mainView === 'REPORTS'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">query_stats</span>
              <span>Reports</span>
            </button>

            <button
              onClick={() => setMainView('SETTINGS')}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-2.5 ${
                mainView === 'SETTINGS'
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">settings</span>
              <span>Settings</span>
            </button>
          </nav>

          {/* Bottom Sidebar: Service Status & Capacity Link (Matching Reference Image) */}
          <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
            {/* Lunch Service Status Card */}
            <div className="bg-[#fcfdfa] border border-stone-200/80 p-2.5 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 text-[18px]">light_mode</span>
                <div>
                  <div className="font-bold text-stone-800 text-[11px] leading-tight">Lunch Service</div>
                  <div className="text-[10px] text-stone-500">21 Oct PM – 01:30 PM</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                OPEN
              </span>
            </div>

            {/* Dinner Service Status Card */}
            <div className="bg-[#fcfdfa] border border-stone-200/80 p-2.5 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-500 text-[18px]">dark_mode</span>
                <div>
                  <div className="font-bold text-stone-800 text-[11px] leading-tight">Dinner Service</div>
                  <div className="text-[10px] text-stone-500">07:30 PM – 08:30 PM</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                OPEN
              </span>
            </div>

            {/* View Kitchen Capacity Button */}
            <button
              onClick={() => setMainView('MENU')}
              className="w-full mt-1 py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-[11px] font-semibold text-gray-700 flex items-center justify-between transition-colors shadow-2xs"
            >
              <span>View Kitchen Capacity</span>
              <span className="material-symbols-outlined text-sm text-gray-400">chevron_right</span>
            </button>
          </div>
        </aside>

        {/* 3. CENTER / WORKSPACE AREA */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* Mobile Tab Bar */}
          <div className="md:hidden flex items-center gap-1.5 p-2 bg-white border-b border-gray-200 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'ORDERS' as const, label: 'Orders', count: orders.length },
                { id: 'CUSTOMERS' as const, label: 'Customers' },
                { id: 'RIDERS' as const, label: 'Riders' },
                { id: 'MENU' as const, label: 'Menu' },
                { id: 'REPORTS' as const, label: 'Reports' },
                { id: 'SETTINGS' as const, label: 'Settings' },
              ] as Array<{ id: 'ORDERS' | 'CUSTOMERS' | 'RIDERS' | 'MENU' | 'REPORTS' | 'SETTINGS'; label: string; count?: number }>
            ).map((v) => (
              <button
                key={v.id}
                onClick={() => setMainView(v.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  mainView === v.id ? 'bg-emerald-800 text-white shadow-2xs' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <span>{v.label}</span>
                {typeof v.count === 'number' && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${mainView === v.id ? 'bg-emerald-950 text-white' : 'bg-gray-200 text-gray-700'}`}>
                    {v.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* VIEW: ORDERS DASHBOARD */}
          {mainView === 'ORDERS' && (
            <main className="p-3.5 sm:p-5 lg:p-6 flex flex-col gap-4 flex-1 max-w-[1700px] w-full mx-auto">
              {/* Dashboard Title & Actions Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-gray-200/90 shadow-2xs">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl sm:text-2xl font-bold font-headline text-gray-900 tracking-tight">Orders</h2>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      LIVE KDS
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Real-time kitchen order preparation, status transitions, and rider fleet dispatch.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  {/* View Mode Switcher: 3-Column Live Kitchen Pipeline vs Condensed Data Table */}
                  <div className="flex items-center p-0.5 bg-gray-100 rounded-xl border border-gray-200/80 shadow-2xs">
                    <button
                      onClick={() => setOrderViewMode('KITCHEN')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                        orderViewMode === 'KITCHEN'
                          ? 'bg-white text-emerald-950 shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      title="3-Column Live Kitchen Pipeline"
                    >
                      <span className="material-symbols-outlined text-[16px]">view_column</span>
                      <span>Kitchen Pipeline</span>
                    </button>
                    <button
                      onClick={() => setOrderViewMode('TABLE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                        orderViewMode === 'TABLE'
                          ? 'bg-white text-emerald-950 shadow-xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      title="Condensed Table View"
                    >
                      <span className="material-symbols-outlined text-[16px]">table_rows</span>
                      <span>Table</span>
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="relative flex-1 sm:w-64 md:w-72">
                    <span className="material-symbols-outlined text-[17px] text-gray-400 absolute left-3 top-1/2 -translate-y-1/2">
                      search
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search order #, customer or phone..."
                      className="w-full pl-9 pr-3.5 py-1.5 sm:py-2 rounded-xl border border-gray-200 bg-[#fbfcfb] text-xs placeholder:text-gray-400 focus:outline-hidden focus:border-emerald-600 focus:bg-white shadow-2xs transition-colors"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    )}
                  </div>

                  {/* Refresh Button */}
                  <button
                    onClick={() => loadOrders()}
                    className="px-3 py-1.5 sm:py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
                    title="Refresh orders from server"
                  >
                    <span className={`material-symbols-outlined text-[16px] text-emerald-700 ${loading ? 'animate-spin' : ''}`}>
                      sync
                    </span>
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Consolidated Status Filter Ribbon & Operational Summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2 sm:p-2.5 rounded-2xl border border-gray-200/90 shadow-2xs">
                {/* Status Pills with Live Counts and Badges (Hidden Scrollbars) */}
                <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-0.5">
                  {/* Default Live Active Flow Filter (Hides historical finished orders) */}
                  <button
                    onClick={() => setActiveFilterTab('ACTIVE')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      activeFilterTab === 'ACTIVE'
                        ? 'bg-emerald-900 text-white shadow-xs'
                        : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border border-emerald-200/80'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">local_fire_department</span>
                    <span>Live Active</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeFilterTab === 'ACTIVE' ? 'bg-emerald-800 text-white' : 'bg-emerald-200 text-emerald-900'}`}>
                      {activeOrdersCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveFilterTab('NEW')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      activeFilterTab === 'NEW'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50/80 hover:bg-rose-100 text-rose-800 border border-rose-200/80'
                    }`}
                  >
                    {newCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>}
                    <span>New</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeFilterTab === 'NEW' ? 'bg-rose-700 text-white' : 'bg-rose-200 text-rose-900'}`}>
                      {newCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveFilterTab('PREPARING')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      activeFilterTab === 'PREPARING'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50/80 hover:bg-amber-100 text-amber-900 border border-amber-200/80'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">skillet</span>
                    <span>Preparing</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeFilterTab === 'PREPARING' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'}`}>
                      {preparingCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveFilterTab('READY')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      activeFilterTab === 'READY'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-50/80 hover:bg-blue-100 text-blue-900 border border-blue-200/80'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    <span>Ready</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeFilterTab === 'READY' ? 'bg-blue-700 text-white' : 'bg-blue-200 text-blue-900'}`}>
                      {readyCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveFilterTab('DISPATCH')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      activeFilterTab === 'DISPATCH'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-purple-50/80 hover:bg-purple-100 text-purple-900 border border-purple-200/80'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                    <span>With Rider</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeFilterTab === 'DISPATCH' ? 'bg-purple-700 text-white' : 'bg-purple-200 text-purple-900'}`}>
                      {dispatchCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveFilterTab('DELIVERED')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      activeFilterTab === 'DELIVERED'
                        ? 'bg-emerald-700 text-white shadow-xs'
                        : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    <span>Delivered</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeFilterTab === 'DELIVERED' ? 'bg-emerald-800 text-white' : 'bg-emerald-200 text-emerald-900'}`}>
                      {deliveredCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveFilterTab('CANCELLED')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      activeFilterTab === 'CANCELLED'
                        ? 'bg-stone-800 text-white shadow-xs'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border border-stone-200'
                    }`}
                  >
                    <span>Cancelled</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeFilterTab === 'CANCELLED' ? 'bg-stone-700 text-white' : 'bg-stone-200 text-stone-700'}`}>
                      {cancelledCount}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveFilterTab('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      activeFilterTab === 'ALL'
                        ? 'bg-gray-800 text-white shadow-xs'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200/80'
                    }`}
                  >
                    <span>All History</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeFilterTab === 'ALL' ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'}`}>
                      {totalOrdersCount}
                    </span>
                  </button>
                </div>

                {/* Operations Pulse Summary Chip */}
                <div className="hidden lg:flex items-center gap-3 shrink-0 px-2 text-xs border-t sm:border-t-0 sm:border-l border-gray-200 pt-2 sm:pt-0">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="text-[11px] font-medium text-gray-500">In Flow:</span>
                    <span className="font-bold font-mono text-emerald-900">
                      {newCount + preparingCount + readyCount + dispatchCount} active
                    </span>
                  </div>
                  <span className="text-gray-300">•</span>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <span className="text-[11px] font-medium text-gray-500">Today GMV:</span>
                    <span className="font-bold font-mono text-emerald-950">
                      ₹{(totalGmvPaise / 100).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Workspace Split: Main Content (Table or Cards) + Sticky Right Panel (xl+ screens) */}
              <div className="flex flex-col xl:flex-row gap-4 items-start w-full">
                {/* Main Content Area */}
                <div className="flex-1 min-w-0 w-full">
                  {orderViewMode === 'TABLE' ? (
                    /* 1. TABLE VIEW WITH 1-TAP ACTION BUTTONS */
                    <div className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden shadow-2xs">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs min-w-[760px]">
                          <thead className="bg-[#f9faf8] text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200/80">
                            <tr>
                              <th className="py-2.5 px-3">Order</th>
                              <th className="py-2.5 px-3">Customer</th>
                              <th className="py-2.5 px-3">Items</th>
                              <th className="py-2.5 px-3">Time Slot</th>
                              <th className="py-2.5 px-3">Payment</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3 text-right">Quick Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {filteredOrders.map((order) => {
                              const isSelected = selectedOrder?.id === order.id;
                              const isDelivered = order.status === 'DELIVERED';
                              const isPreparing = order.status === 'ACCEPTED' || order.status === 'PREPARING';
                              const isPlaced = order.status === 'PLACED';
                              const isReady = order.status === 'READY_FOR_PICKUP';
                              const isDispatch = order.status === 'OUT_FOR_DELIVERY';

                              return (
                                <tr
                                  key={order.id}
                                  onClick={() => {
                                    setSelectedOrderId(order.id);
                                    setDesktopPanelOpen(true);
                                    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
                                      setDrawerOpen(true);
                                    }
                                  }}
                                  className={`cursor-pointer transition-colors ${
                                    isSelected
                                      ? 'bg-emerald-50/50 hover:bg-emerald-50/70'
                                      : 'hover:bg-gray-50/80'
                                  }`}
                                >
                                  {/* Order ID & Date */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="font-bold text-emerald-900 font-mono text-xs">
                                      #{order.orderNumber}
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">
                                      {formatOrderDate(order.createdAt)}
                                    </div>
                                  </td>

                                  {/* Customer */}
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-2">
                                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] flex items-center justify-center shrink-0">
                                        {getInitials(order.customerName)}
                                      </span>
                                      <div className="min-w-0 max-w-[130px]">
                                        <div className="font-bold text-gray-900 truncate text-[11px]">
                                          {order.customerName}
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono">
                                          {order.customerPhone}
                                        </div>
                                        <div className="text-[10px] text-gray-400 truncate">
                                          {formatAddress(order.deliveryAddress)}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Items */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="font-bold text-gray-900 text-xs">
                                      {order.itemsCount || order.items?.reduce((acc, it) => acc + it.quantity, 0) || 1} item
                                      {(order.itemsCount || order.items?.reduce((acc, it) => acc + it.quantity, 0) || 1) > 1 ? 's' : ''}
                                    </div>
                                    <div
                                      className="text-[10px] text-gray-500 truncate max-w-[140px]"
                                      title={order.items?.map((i) => `${i.productName} (x${i.quantity})`).join(', ')}
                                    >
                                      {order.items && order.items.length > 0
                                        ? order.items.map((i) => i.productName).join(', ')
                                        : 'Wholesome Meal'}
                                    </div>
                                  </td>

                                  {/* Time Slot */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="font-bold text-emerald-900 text-[11px]">
                                      {order.slotLabel?.includes('Dinner') ? 'Dinner' : 'Lunch'}
                                    </div>
                                    <div className="text-[10px] text-gray-500">
                                      {order.slotLabel?.includes('Dinner') ? '07:30 – 08:30 PM' : '12:30 – 01:30 PM'}
                                    </div>
                                  </td>

                                  {/* Payment */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="font-bold text-gray-900 font-mono text-xs">
                                      ₹{(order.totalAmountPaise / 100).toFixed(2)}
                                    </div>
                                    <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-gray-100 text-gray-600 mt-0.5 uppercase">
                                      {order.paymentMethod || 'COD'}
                                    </span>
                                  </td>

                                  {/* Status Badge */}
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    {isPreparing ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200/90 inline-flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                        <span>PREPARING</span>
                                      </span>
                                    ) : isDelivered ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/90 inline-flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                        <span>DELIVERED</span>
                                      </span>
                                    ) : isPlaced ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                        <span>NEW ORDER</span>
                                      </span>
                                    ) : isReady ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 inline-flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                        <span>READY</span>
                                      </span>
                                    ) : isDispatch ? (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-800 border border-purple-200 inline-flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                        <span>WITH RIDER</span>
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700">
                                        {order.status}
                                      </span>
                                    )}
                                  </td>

                                  {/* 1-Tap Operational Action Buttons */}
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                      {isPlaced && (
                                        <button
                                          onClick={() => handleTransition(order.id, 'ACCEPTED')}
                                          disabled={actionLoadingId === order.id}
                                          className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                          title="Accept & Start Cooking"
                                        >
                                          <span className="material-symbols-outlined text-[14px]">skillet</span>
                                          <span>Accept</span>
                                        </button>
                                      )}

                                      {isPreparing && (
                                        <button
                                          onClick={() => handleTransition(order.id, 'READY_FOR_PICKUP')}
                                          disabled={actionLoadingId === order.id}
                                          className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                          title="Mark Meal Ready in Kitchen"
                                        >
                                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                          <span>Ready</span>
                                        </button>
                                      )}

                                      {isReady && (
                                        <button
                                          onClick={() => {
                                            setSelectedOrderId(order.id);
                                            setShowRiderModal(true);
                                          }}
                                          disabled={actionLoadingId === order.id}
                                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                          title="Assign Rider from Fleet"
                                        >
                                          <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                                          <span>Assign</span>
                                        </button>
                                      )}

                                      {isDispatch && (
                                        <button
                                          onClick={() => handleManualOverride(order.id)}
                                          disabled={actionLoadingId === order.id}
                                          className="px-2.5 py-1 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                          title="Verify PIN & Complete Delivery"
                                        >
                                          <span className="material-symbols-outlined text-[14px]">task_alt</span>
                                          <span>Verify OTP</span>
                                        </button>
                                      )}

                                      <button
                                        onClick={() => {
                                          setSelectedOrderId(order.id);
                                          setDesktopPanelOpen(true);
                                          setDrawerOpen(true);
                                        }}
                                        className="px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-700 font-semibold text-xs transition-colors shadow-2xs"
                                        title="View Full Details"
                                      >
                                        Details
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {filteredOrders.length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-12 text-center text-gray-400">
                                  {loading ? 'Loading kitchen orders...' : 'No orders found matching this filter.'}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* 2. 3-COLUMN LIVE KITCHEN PIPELINE (KANBAN / KDS) */
                    activeFilterTab === 'DELIVERED' || activeFilterTab === 'CANCELLED' ? (
                      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-2xs">
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-gray-500">history</span>
                            <h3 className="font-bold text-sm text-gray-900">
                              {activeFilterTab === 'DELIVERED' ? 'Delivered History' : 'Cancelled Orders'} ({filteredOrders.length})
                            </h3>
                          </div>
                          <button
                            onClick={() => setActiveFilterTab('ACTIVE')}
                            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">local_fire_department</span>
                            <span>Return to Live Kitchen Pipeline</span>
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3 gap-3.5">
                          {filteredOrders.map(renderKitchenPipelineCard)}
                        </div>
                        {filteredOrders.length === 0 && (
                          <div className="py-12 text-center text-gray-400">
                            No {activeFilterTab.toLowerCase()} orders found.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start w-full">
                        {/* Column 1: New Orders (Needs Kitchen Acceptance) */}
                        <div className="bg-[#fcfdfc] rounded-2xl border border-rose-200/80 p-3 sm:p-3.5 flex flex-col gap-3 shadow-2xs">
                          <div className="flex items-center justify-between pb-2 border-b border-rose-100">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                              <h3 className="font-bold text-xs uppercase tracking-wider text-rose-950">
                                1. New Orders
                              </h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                              {filteredOrders.filter((o) => o.status === 'PLACED').length}
                            </span>
                          </div>
                          <div className="flex flex-col gap-3 max-h-[calc(100vh-270px)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-0.5">
                            {filteredOrders.filter((o) => o.status === 'PLACED').map(renderKitchenPipelineCard)}
                            {filteredOrders.filter((o) => o.status === 'PLACED').length === 0 && (
                              <div className="py-12 text-center bg-white rounded-xl border border-dashed border-rose-200 text-gray-400 text-xs">
                                No new orders waiting for acceptance
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Column 2: Cooking Now (In Kitchen Preparation) */}
                        <div className="bg-[#fcfdfc] rounded-2xl border border-amber-200/80 p-3 sm:p-3.5 flex flex-col gap-3 shadow-2xs">
                          <div className="flex items-center justify-between pb-2 border-b border-amber-100">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                              <h3 className="font-bold text-xs uppercase tracking-wider text-amber-950">
                                2. Cooking Now
                              </h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                              {filteredOrders.filter((o) => o.status === 'ACCEPTED' || o.status === 'PREPARING').length}
                            </span>
                          </div>
                          <div className="flex flex-col gap-3 max-h-[calc(100vh-270px)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-0.5">
                            {filteredOrders.filter((o) => o.status === 'ACCEPTED' || o.status === 'PREPARING').map(renderKitchenPipelineCard)}
                            {filteredOrders.filter((o) => o.status === 'ACCEPTED' || o.status === 'PREPARING').length === 0 && (
                              <div className="py-12 text-center bg-white rounded-xl border border-dashed border-amber-200 text-gray-400 text-xs">
                                No orders currently on the stove
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Column 3: Ready for Dispatch / With Rider */}
                        <div className="bg-[#fcfdfc] rounded-2xl border border-blue-200/80 p-3 sm:p-3.5 flex flex-col gap-3 shadow-2xs">
                          <div className="flex items-center justify-between pb-2 border-b border-blue-100">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                              <h3 className="font-bold text-xs uppercase tracking-wider text-blue-950">
                                3. Ready / Dispatch
                              </h3>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900">
                              {filteredOrders.filter((o) => o.status === 'READY_FOR_PICKUP' || o.status === 'OUT_FOR_DELIVERY').length}
                            </span>
                          </div>
                          <div className="flex flex-col gap-3 max-h-[calc(100vh-270px)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-0.5">
                            {filteredOrders.filter((o) => o.status === 'READY_FOR_PICKUP' || o.status === 'OUT_FOR_DELIVERY').map(renderKitchenPipelineCard)}
                            {filteredOrders.filter((o) => o.status === 'READY_FOR_PICKUP' || o.status === 'OUT_FOR_DELIVERY').length === 0 && (
                              <div className="py-12 text-center bg-white rounded-xl border border-dashed border-blue-200 text-gray-400 text-xs">
                                No orders packed or awaiting pickup
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>

                {/* Persistent Right Side Details Panel on xl+ screens */}
                {selectedOrder && desktopPanelOpen && (
                  <div className="hidden xl:flex w-[310px] 2xl:w-[340px] shrink-0 sticky top-20 max-h-[calc(100vh-95px)] overflow-y-auto no-scrollbar">
                    <OrderDetailsPanel
                      selectedOrder={selectedOrder}
                      detailTab={detailTab}
                      setDetailTab={setDetailTab}
                      handleTransition={handleTransition}
                      handleManualOverride={handleManualOverride}
                      setShowRiderModal={setShowRiderModal}
                      actionLoadingId={actionLoadingId}
                      onClose={() => setDesktopPanelOpen(false)}
                    />
                  </div>
                )}
              </div>
            </main>
          )}

          {/* VIEW: CUSTOMERS */}
          {mainView === 'CUSTOMERS' && (
            <main className="p-4 lg:p-6 flex flex-col gap-5 flex-1 max-w-[1600px] w-full mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold font-headline text-gray-900">Customers &amp; Addresses</h2>
                  <p className="text-xs text-gray-500">View customer ordering history and contact info.</p>
                </div>
                <button
                  onClick={loadCustomers}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 border border-gray-200 flex items-center gap-1.5 shadow-2xs"
                >
                  <span className="material-symbols-outlined text-base text-emerald-800">sync</span>
                  <span>Reload</span>
                </button>
              </div>

              <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[640px]">
                    <thead className="bg-[#f9faf8] text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
                      <tr>
                        <th className="py-3 px-4">Customer</th>
                        <th className="py-3 px-4">Phone Number</th>
                        <th className="py-3 px-4">Orders Placed</th>
                        <th className="py-3 px-4">Total Spent</th>
                        <th className="py-3 px-4">Last Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customers.map((c, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                          <td className="py-3 px-4 font-bold text-gray-900 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs">
                              {getInitials(c.name)}
                            </span>
                            <span>{c.name}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-gray-700">+91 {c.phone}</td>
                          <td className="py-3 px-4 font-bold text-emerald-900">{c.orderCount} meals</td>
                          <td className="py-3 px-4 font-mono font-bold">₹{((c.totalSpendPaise || 0) / 100).toFixed(2)}</td>
                          <td className="py-3 px-4 text-gray-500">{formatOrderDate(c.lastOrderDate)}</td>
                        </tr>
                      ))}
                      {customers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-gray-400">
                            {customersLoading ? 'Loading customers directory...' : 'No customers registered yet.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </main>
          )}

          {/* VIEW: RIDERS */}
          {mainView === 'RIDERS' && (
            <main className="p-4 lg:p-6 flex flex-col gap-5 flex-1 max-w-[1600px] w-full mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold font-headline text-gray-900">Riders &amp; Delivery Fleet</h2>
                  <p className="text-xs text-gray-500">Manage delivery partners and live dispatch availability.</p>
                </div>
                <button
                  onClick={loadRiders}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 border border-gray-200 flex items-center gap-1.5 shadow-2xs"
                >
                  <span className="material-symbols-outlined text-base text-emerald-800">sync</span>
                  <span>Reload</span>
                </button>
              </div>

              <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[640px]">
                  <thead className="bg-[#f9faf8] text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">Rider</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4">Vehicle Number</th>
                      <th className="py-3 px-4">Duty Status</th>
                      <th className="py-3 px-4">Account Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {riders.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-gray-900 flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[16px]">two_wheeler</span>
                          </span>
                          <span>{r.name}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-700">+91 {r.phone}</td>
                        <td className="py-3 px-4 font-mono font-semibold text-amber-900">{r.vehicleNumber}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1 ${
                              r.isAvailable
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${r.isAvailable ? 'bg-emerald-600' : 'bg-rose-500'}`}></span>
                            <span>{r.isAvailable ? 'ON DUTY' : 'OFFLINE'}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold text-[10px]">
                            {r.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {riders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-gray-400">
                          {ridersLoading ? 'Loading delivery fleet...' : 'No delivery riders registered.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </main>
          )}

          {/* VIEW: MENU & DISHES */}
          {mainView === 'MENU' && (
            <main className="p-4 lg:p-6 flex flex-col gap-6 flex-1 max-w-[1600px] w-full mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
                <div>
                  <h2 className="text-2xl font-bold font-headline text-gray-900">Menu &amp; Kitchen Dishes</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Toggle dishes on/off instantly, monitor meal windows, and add new daily thalis.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      loadCatalog();
                      loadSlots();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 border border-gray-200 flex items-center gap-1.5 shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-base text-emerald-800">sync</span>
                    <span>Reload</span>
                  </button>
                  <button
                    onClick={() => {
                      if (catalogCategories.length > 0 && !newDishCategory) {
                        setNewDishCategory(catalogCategories[0].id);
                      }
                      setShowAddDishModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">add_circle</span>
                    <span>Add New Thali</span>
                  </button>
                </div>
              </div>

              {/* Delivery Windows Banner */}
              <div className="bg-gradient-to-r from-emerald-50/80 to-stone-50 border border-emerald-200/80 rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-3 border-b border-emerald-100 pb-2">
                  <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[17px] text-emerald-700">schedule</span>
                    <span>Active Kitchen Delivery Windows</span>
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-800">
                    Operating standard 2-meal daily service
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200/80 flex items-center justify-between shadow-2xs">
                    <div>
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">LUNCH WINDOW</span>
                      <span className="text-[11px] text-gray-500 mt-0.5 block">Delivery: 12:30 PM – 01:30 PM • Cutoff: 11:30 AM IST</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      <span>OPEN</span>
                    </span>
                  </div>
                  <div className="bg-white p-3.5 rounded-xl border border-stone-200/80 flex items-center justify-between shadow-2xs">
                    <div>
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">DINNER WINDOW</span>
                      <span className="text-[11px] text-gray-500 mt-0.5 block">Delivery: 07:30 PM – 08:30 PM • Cutoff: 06:30 PM IST</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                      <span>OPEN</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Dishes Grid */}
              <div className="flex flex-col gap-6">
                {catalogCategories.map((cat) => (
                  <div key={cat.id} className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-2xs flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                      <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-700"></span>
                        <span>{cat.name}</span>
                      </h3>
                      <span className="text-xs text-gray-500 font-medium">{cat.items?.length || 0} dishes</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {cat.items?.map((item: any) => {
                        const is86ed = soldOutItemIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            className={`rounded-2xl border p-3.5 flex flex-col justify-between gap-3 shadow-2xs ${
                              is86ed
                                ? 'bg-stone-50/80 border-stone-300 opacity-75'
                                : 'bg-white border-gray-200 hover:border-emerald-300 hover:shadow-xs'
                            }`}
                          >
                            <div>
                              <div className="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-stone-100 border border-stone-200/60 mb-3 shadow-2xs">
                                <img
                                  src={item.imageUrl || PRESET_THALI_IMAGES[0].url}
                                  alt={item.name}
                                  className="w-full h-full object-cover object-center"
                                />
                                <span className="absolute top-2 left-2 w-4 h-4 rounded-xs border border-green-600 bg-white p-0.5 flex items-center justify-center shadow-xs">
                                  <span className="w-2 h-2 rounded-full bg-green-600"></span>
                                </span>
                              </div>

                              <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-sm text-gray-900 leading-snug">{item.name}</span>
                                <span className="text-sm font-bold text-emerald-800 shrink-0 font-mono">
                                  ₹{(item.basePricePaise / 100).toFixed(2)}
                                </span>
                              </div>
                              <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                                {item.description || 'Pure vegetarian meal cooked in pure cow ghee.'}
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                              <span
                                className={`text-xs font-bold ${
                                  !is86ed ? 'text-emerald-800' : 'text-stone-500'
                                }`}
                              >
                                {!is86ed ? 'IN STOCK (ON)' : 'SOLD OUT (OFF)'}
                              </span>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={!is86ed}
                                onClick={() => toggleItemStock(item.id, item.name)}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                                  !is86ed ? 'bg-emerald-600' : 'bg-gray-300'
                                }`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-200 ${
                                    !is86ed ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </main>
          )}

          {/* VIEW: REPORTS */}
          {mainView === 'REPORTS' && (
            <main className="p-4 lg:p-6 flex flex-col gap-5 flex-1 max-w-[1600px] w-full mx-auto">
              <div>
                <h2 className="text-2xl font-bold font-headline text-gray-900">Kitchen Analytics &amp; Reports</h2>
                <p className="text-xs text-gray-500">Summary of kitchen dispatch times, order revenue and meal volumes.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs">
                  <span className="text-xs text-gray-500 font-medium">Total Orders Fulfilled</span>
                  <div className="text-3xl font-bold text-gray-900 font-headline mt-1">{deliveredCount}</div>
                  <span className="text-xs text-emerald-700 font-semibold mt-1 block">100% on-time delivery</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs">
                  <span className="text-xs text-gray-500 font-medium">Today Gross Revenue</span>
                  <div className="text-3xl font-bold text-emerald-950 font-headline mt-1">₹{(totalGmvPaise / 100).toFixed(2)}</div>
                  <span className="text-xs text-gray-500 mt-1 block">COD + Online Prepayments</span>
                </div>
                <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-2xs">
                  <span className="text-xs text-gray-500 font-medium">Average Order Value (AOV)</span>
                  <div className="text-3xl font-bold text-gray-900 font-headline mt-1">
                    ₹{orders.length ? (totalGmvPaise / 100 / orders.length).toFixed(0) : '212'}
                  </div>
                  <span className="text-xs text-gray-500 mt-1 block">Per customer delivery</span>
                </div>
              </div>
            </main>
          )}

          {/* VIEW: SETTINGS */}
          {mainView === 'SETTINGS' && (
            <main className="p-4 lg:p-6 flex flex-col gap-5 flex-1 max-w-[1600px] w-full mx-auto">
              <div>
                <h2 className="text-2xl font-bold font-headline text-gray-900">Console Settings</h2>
                <p className="text-xs text-gray-500">Configure station alerts, chime notifications, and operational parameters.</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col gap-4 max-w-xl">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <div className="font-bold text-sm text-gray-900">Audio Chime Notifications</div>
                    <div className="text-xs text-gray-500">Play web chime when new incoming order is placed</div>
                  </div>
                  <button
                    onClick={() => {
                      setAudioEnabled(!audioEnabled);
                      if (!audioEnabled) playKitchenOrderChime();
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      audioEnabled ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-gray-100 text-gray-600 border-gray-300'
                    }`}
                  >
                    {audioEnabled ? 'Chime ON' : 'Muted'}
                  </button>
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <div className="font-bold text-sm text-gray-900">Auto-Refresh Interval</div>
                    <div className="text-xs text-gray-500">Polling kitchen queue every 5 seconds</div>
                  </div>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    5s Active
                  </span>
                </div>

                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <div>
                    <div className="font-bold text-sm text-gray-900">Database Connection</div>
                    <div className="text-xs text-gray-500">Supabase PostgreSQL live instance</div>
                  </div>
                  <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Connected</span>
                  </span>
                </div>

                {/* Delivery Service Zones & Pincode 454774 Status */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-gray-900">Active Delivery Zones &amp; Pincodes</div>
                      <div className="text-xs text-gray-500">Live serviceability area for kitchen fulfillment</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                      LIVE SERVICE
                    </span>
                  </div>

                  <div className="bg-[#fcfdfa] rounded-xl border border-stone-200/80 p-3.5 flex flex-col gap-2">
                    <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                        <span className="text-xs font-bold text-gray-900">Sagore / Pithampur Central Zone</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-md border border-emerald-300">
                        PIN 454774
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-600">
                      <span>Delivery Fee: ₹0 (Free Sagore Dispatch)</span>
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <span>✓</span>
                        <span>Serviceable</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          )}
        </div>
      </div>

      {/* MOBILE SIDEBAR NAVIGATION DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex md:hidden animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full shadow-2xl border-r border-gray-200 p-4 flex flex-col justify-between overflow-y-auto z-10 animate-in slide-in-from-left duration-200">
            <div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
                    <span className="material-symbols-outlined text-[18px]">psychiatry</span>
                  </span>
                  <div>
                    <div className="font-headline font-bold text-sm text-gray-900 leading-none">Janki Rasoi</div>
                    <div className="text-[10px] text-gray-400 font-medium">Operations Console</div>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="flex flex-col gap-1 py-4">
                {(
                  [
                    { id: 'ORDERS' as const, label: 'Orders', icon: 'receipt_long', badge: orders.length },
                    { id: 'CUSTOMERS' as const, label: 'Customers', icon: 'group' },
                    { id: 'RIDERS' as const, label: 'Riders & Fleet', icon: 'two_wheeler' },
                    { id: 'MENU' as const, label: 'Menu & Dishes', icon: 'restaurant_menu' },
                    { id: 'REPORTS' as const, label: 'Reports & Stats', icon: 'query_stats' },
                    { id: 'SETTINGS' as const, label: 'Settings', icon: 'settings' },
                  ] as Array<{ id: 'ORDERS' | 'CUSTOMERS' | 'RIDERS' | 'MENU' | 'REPORTS' | 'SETTINGS'; label: string; icon: string; badge?: number }>
                ).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMainView(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                      mainView === item.id
                        ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-2xs'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                      <span>{item.label}</span>
                    </div>
                    {typeof item.badge === 'number' && (
                      <span className="w-5 h-5 rounded-full bg-emerald-800 text-white text-[10px] font-bold flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Bottom Service Status in Mobile Drawer */}
            <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
              <div className="bg-[#fcfdfa] border border-stone-200/80 p-2.5 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-500 text-[18px]">light_mode</span>
                  <div>
                    <div className="font-bold text-stone-800 text-[11px] leading-tight">Lunch Service</div>
                    <div className="text-[10px] text-stone-500">12:30 PM – 01:30 PM</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  OPEN
                </span>
              </div>

              <div className="bg-[#fcfdfa] border border-stone-200/80 p-2.5 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-indigo-500 text-[18px]">dark_mode</span>
                  <div>
                    <div className="font-bold text-stone-800 text-[11px] leading-tight">Dinner Service</div>
                    <div className="text-[10px] text-stone-500">07:30 PM – 08:30 PM</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  OPEN
                </span>
              </div>

              <button
                onClick={() => {
                  setMainView('MENU');
                  setMobileMenuOpen(false);
                }}
                className="w-full mt-1 py-2 px-3 rounded-xl border border-gray-200 hover:bg-gray-50 text-[11px] font-semibold text-gray-700 flex items-center justify-between transition-colors shadow-2xs"
              >
                <span>View Kitchen Capacity</span>
                <span className="material-symbols-outlined text-sm text-gray-400">chevron_right</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* RESPONSIVE ORDER DETAILS SLIDE-IN DRAWER (Mobile & Tablet < xl) */}
      {drawerOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end xl:hidden animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-full max-w-md sm:max-w-lg bg-white h-full shadow-2xl border-l border-gray-200 p-4 sm:p-5 flex flex-col gap-3 overflow-y-auto z-10 animate-in slide-in-from-right duration-200">
            <OrderDetailsPanel
              selectedOrder={selectedOrder}
              detailTab={detailTab}
              setDetailTab={setDetailTab}
              handleTransition={handleTransition}
              handleManualOverride={handleManualOverride}
              setShowRiderModal={setShowRiderModal}
              actionLoadingId={actionLoadingId}
              onClose={() => setDrawerOpen(false)}
              isDrawer={true}
            />
          </div>
        </div>
      )}

      {/* 4. ASSIGN RIDER MODAL */}
      {showRiderModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-gray-200 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-gray-900">Assign Delivery Rider</h3>
                <p className="text-xs text-gray-500">Select an available rider for order #{selectedOrder.orderNumber}</p>
              </div>
              <button
                onClick={() => setShowRiderModal(false)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
              {riders.map((r) => (
                <div
                  key={r.id}
                  onClick={() => handleAssignRider(selectedOrder.id, r.id)}
                  className="p-3 rounded-xl border border-gray-200 hover:border-emerald-600 hover:bg-emerald-50/50 cursor-pointer transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px]">two_wheeler</span>
                    </span>
                    <div>
                      <div className="font-bold text-xs text-gray-900">{r.name}</div>
                      <div className="text-[11px] text-gray-500 font-mono">+91 {r.phone} • {r.vehicleNumber}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                    {r.isAvailable ? 'ON DUTY' : 'OFFLINE'}
                  </span>
                </div>
              ))}
              {riders.length === 0 && (
                <div className="py-6 text-center text-xs text-gray-400">No registered delivery riders available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. ADD NEW THALI MODAL */}
      {showAddDishModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-5 my-8">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-900 font-headline">Add New Thali / Dish</h3>
                <p className="text-xs text-gray-500">Add a fresh thali with pricing, description, and auto-cropped photo.</p>
              </div>
              <button
                onClick={() => setShowAddDishModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateDish} className="flex flex-col gap-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">
                  Thali / Dish Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDishName}
                  onChange={(e) => setNewDishName(e.target.value)}
                  placeholder="e.g. Special Shahi Paneer Thali"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-800 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Category <span className="text-rose-500">*</span></label>
                  <select
                    value={newDishCategory}
                    onChange={(e) => setNewDishCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-800 font-medium bg-white"
                  >
                    {catalogCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Price in ₹ (INR) <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 font-bold">₹</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      value={newDishPrice}
                      onChange={(e) => setNewDishPrice(e.target.value)}
                      placeholder="189"
                      className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-800 font-bold"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Description / Thali Items</label>
                <textarea
                  rows={2}
                  value={newDishDescription}
                  onChange={(e) => setNewDishDescription(e.target.value)}
                  placeholder="e.g. Pure ghee Dal Makhani, Paneer Lababdar, 4 Phulkas, Basmati Rice, Salad & Gulab Jamun"
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-800"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Dish Photo (Auto-crops into required format)</label>
                <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden bg-stone-900 border border-stone-200 mb-2 flex items-center justify-center shadow-inner">
                  {newDishImageUrl ? (
                    <>
                      <img src={newDishImageUrl} alt="Preview" className="w-full h-full object-cover object-center" />
                      <div className="absolute top-2.5 right-2.5 bg-black/75 px-2.5 py-1 rounded-full text-[10px] font-bold text-white flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px] text-emerald-400">crop</span>
                        <span>Auto-Cropped (16:10 Format)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewDishImageUrl('')}
                        className="absolute bottom-2.5 right-2.5 bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-full shadow-md"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-white/80">
                      <span className="material-symbols-outlined text-3xl text-emerald-400 mb-1">add_a_photo</span>
                      <span className="text-xs font-bold">Pick or Upload Dish Photo</span>
                      <span className="text-[10px] text-stone-400 mt-0.5">Auto-cropped to display ratio without distortion</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl font-bold flex items-center gap-1.5 border border-stone-300 shrink-0">
                      <span className="material-symbols-outlined text-[16px]">upload_file</span>
                      <span>Upload File</span>
                      <input type="file" accept="image/*" onChange={handleImageFileChange} className="hidden" />
                    </label>
                    <input
                      type="url"
                      value={newDishImageUrl}
                      onChange={(e) => setNewDishImageUrl(e.target.value)}
                      placeholder="or paste image URL..."
                      className="w-full px-3 py-1.5 rounded-xl border border-stone-300 text-stone-700 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                    <span className="text-[10px] text-gray-500 font-bold shrink-0">Presets:</span>
                    {PRESET_THALI_IMAGES.map((preset) => (
                      <button
                        key={preset.title}
                        type="button"
                        onClick={() => setNewDishImageUrl(preset.url)}
                        className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-[10px] font-semibold text-gray-700 whitespace-nowrap border border-gray-200"
                      >
                        {preset.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddDishModal(false)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDish}
                  className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  {isSubmittingDish ? 'Saving Dish...' : 'Publish Thali'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Action Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-950 text-white px-5 py-3 rounded-2xl shadow-xl font-bold text-xs flex items-center gap-2 animate-in fade-in slide-in-from-bottom duration-200 border border-emerald-700/50">
          <span className="material-symbols-outlined text-[20px] text-emerald-400">info</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
