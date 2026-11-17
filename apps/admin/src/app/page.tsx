'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { adminApi, AdminOrder, AdminCustomer, AdminRider, CustomerOrderHistoryItem } from '../lib/api';

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

function ClockwiseRefreshIcon({ className = "w-4 h-4", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg
      className={`${className} transition-transform ${spinning ? 'animate-spin-reverse' : ''}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
    </svg>
  );
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
  if (!addr) return 'Address not specified';
  if (typeof addr === 'string') return addr;
  const parts = [addr.flat, addr.street, addr.landmark, addr.pincode].filter(Boolean);
  return parts.join(', ') || 'Address not specified';
}

function OrderDetailsPanel({
  selectedOrder,
  detailTab,
  setDetailTab,
  handleTransition,
  handleManualOverride,
  setShowRiderModal,
  setOrderForRiderModal,
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
  setOrderForRiderModal?: (order: AdminOrder | null) => void;
  actionLoadingId: string | null;
  onClose?: () => void;
  isDrawer?: boolean;
}) {
  return (
    <div className={`bg-white flex flex-col gap-3.5 ${isDrawer ? "h-full p-4" : "rounded-2xl border border-gray-200/90 p-4 shadow-2xs w-full"}`}>
      {/* 1. Header */}
      <div className="flex items-start justify-between border-b border-gray-100 pb-3">
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Order ID</span>
          <h3 className="font-bold text-base text-gray-950 font-mono tracking-tight">
            #{selectedOrder.orderNumber}
          </h3>
          <div className="mt-1">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                selectedOrder.status === "DELIVERED"
                  ? "bg-emerald-100 text-emerald-800"
                  : selectedOrder.status === "OUT_FOR_DELIVERY"
                  ? "bg-emerald-100 text-emerald-800"
                  : selectedOrder.status === "READY_FOR_PICKUP"
                  ? "bg-blue-100 text-blue-800"
                  : selectedOrder.status === "PLACED"
                  ? "bg-rose-100 text-rose-800 animate-pulse"
                  : "bg-amber-100 text-amber-900"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  selectedOrder.status === "DELIVERED" || selectedOrder.status === "OUT_FOR_DELIVERY"
                    ? "bg-emerald-600"
                    : selectedOrder.status === "READY_FOR_PICKUP"
                    ? "bg-blue-600"
                    : selectedOrder.status === "PLACED"
                    ? "bg-rose-500"
                    : "bg-amber-600"
                }`}
              />
              <span>{selectedOrder.status.replace(/_/g, " ")}</span>
            </span>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex items-center justify-center transition-colors shrink-0"
            title="Close details"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* 2. Customer & Drop Location Card */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer</span>
        <div className="p-3 rounded-2xl bg-stone-50/80 border border-stone-200/70 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-full bg-stone-200 text-stone-800 font-bold text-xs flex items-center justify-center shrink-0">
                {getInitials(selectedOrder.customerName)}
              </span>
              <div className="min-w-0">
                <h4 className="font-bold text-gray-900 text-xs leading-tight truncate">
                  {selectedOrder.customerName}
                </h4>
                <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                  +91 {selectedOrder.customerPhone}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={`tel:${selectedOrder.customerPhone}`}
                className="w-8 h-8 rounded-full bg-white hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 border border-gray-200/80 flex items-center justify-center transition-colors shadow-2xs"
                title="Call Customer"
              >
                <span className="material-symbols-outlined text-[16px]">call</span>
              </a>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(formatAddress(selectedOrder.deliveryAddress))}`}
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-full bg-white hover:bg-stone-100 text-gray-700 border border-gray-200/80 flex items-center justify-center transition-colors shadow-2xs"
                title="View on Maps"
              >
                <span className="material-symbols-outlined text-[16px]">pin_drop</span>
              </a>
            </div>
          </div>

          <div className="pt-2 border-t border-stone-200/60 text-[11px]">
            <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider block mb-0.5">
              Drop location
            </span>
            <p className="text-gray-800 font-medium leading-snug">
              {formatAddress(selectedOrder.deliveryAddress)}
            </p>
            {selectedOrder.deliveryNotes && (
              <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200/70 text-[10px] font-semibold">
                <span className="material-symbols-outlined text-[12px] text-amber-700">edit_note</span>
                <span>{selectedOrder.deliveryNotes}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Order Items & Compact Bill Summary */}
      <div className="py-2.5 border-t border-b border-gray-100 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          <span>Order items &amp; Prices</span>
          <span>{selectedOrder.slotLabel ? selectedOrder.slotLabel.split("(")[0].trim() : "Standard"}</span>
        </div>

        <div className="divide-y divide-gray-50 max-h-48 overflow-y-auto pr-1">
          {selectedOrder.items && selectedOrder.items.length > 0 ? (
            selectedOrder.items.map((item, idx) => {
              const itemTotal = (item.totalPricePaise ?? (item.unitPricePaise ? item.unitPricePaise * item.quantity : 0)) / 100;
              return (
                <div key={item.id || idx} className="py-1 flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2 truncate">
                    <span className="font-semibold text-gray-900">
                      <span className="font-bold text-emerald-800 mr-1">{item.quantity}×</span>
                      {item.productName}
                    </span>
                    {item.variantName && item.variantName !== "Standard" && (
                      <span className="text-[10px] text-gray-400 ml-1">({item.variantName})</span>
                    )}
                  </div>
                  <span className="font-bold font-mono text-gray-900 shrink-0">
                    ₹{itemTotal.toFixed(0)}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="py-1 text-xs text-gray-600 font-medium">Standard Tiffin Thali (×1)</div>
          )}
        </div>

        {/* GST & Financial Breakdown */}
        <div className="pt-2 border-t border-gray-100 flex flex-col gap-1 text-[11px]">
          <div className="flex items-center justify-between text-gray-600">
            <span>Items Subtotal</span>
            <span className="font-mono font-medium text-gray-900">
              ₹{((selectedOrder.subtotalPaise ?? (selectedOrder.totalAmountPaise - (selectedOrder.taxPaise || 0))) / 100).toFixed(2)}
            </span>
          </div>

          <div className="flex items-center justify-between text-gray-600">
            <span>GST / Tax (5%)</span>
            <span className="font-mono font-semibold text-emerald-700">
              +₹{((selectedOrder.taxPaise ?? Math.round((selectedOrder.subtotalPaise || selectedOrder.totalAmountPaise) * 0.05)) / 100).toFixed(2)}
            </span>
          </div>

          {selectedOrder.packagingFeePaise ? selectedOrder.packagingFeePaise > 0 && (
            <div className="flex items-center justify-between text-gray-600">
              <span>Packaging Fee</span>
              <span className="font-mono font-medium text-gray-900">
                +₹{(selectedOrder.packagingFeePaise / 100).toFixed(2)}
              </span>
            </div>
          ) : null}

          {selectedOrder.deliveryFeePaise ? selectedOrder.deliveryFeePaise > 0 && (
            <div className="flex items-center justify-between text-gray-600">
              <span>Delivery Fee</span>
              <span className="font-mono font-medium text-gray-900">
                +₹{(selectedOrder.deliveryFeePaise / 100).toFixed(2)}
              </span>
            </div>
          ) : null}

          {selectedOrder.discountPaise ? selectedOrder.discountPaise > 0 && (
            <div className="flex items-center justify-between text-emerald-600 font-medium">
              <span>Discount</span>
              <span className="font-mono">
                -₹{(selectedOrder.discountPaise / 100).toFixed(2)}
              </span>
            </div>
          ) : null}

          <div className="pt-1.5 mt-0.5 border-t border-gray-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-gray-900 block text-xs">Total with GST</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {selectedOrder.paymentMethod || "COD"} • {selectedOrder.paymentStatus || "PENDING"}
              </span>
            </div>
            <span className="font-black font-mono text-base text-gray-950">
              ₹{(selectedOrder.totalAmountPaise / 100).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Unified Rider & Single-Action Dock */}
      <div className="mt-auto pt-2 flex flex-col gap-2">
        {selectedOrder.assignedRider ? (
          <div className="p-3 rounded-2xl bg-white border border-gray-200 shadow-2xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200/60">
                  <span className="material-symbols-outlined text-[18px]">moped</span>
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                    Delivery Rider
                  </span>
                  <h4 className="font-bold text-gray-900 text-xs leading-tight truncate">
                    {selectedOrder.assignedRider.name}
                  </h4>
                  <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                    +91 {selectedOrder.assignedRider.phone}
                  </p>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                  selectedOrder.status === "OUT_FOR_DELIVERY"
                    ? "bg-emerald-100 text-emerald-800"
                    : selectedOrder.assignedRider.assignmentStatus === "ACCEPTED"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                }`}
              >
                {selectedOrder.status === "OUT_FOR_DELIVERY"
                  ? "En Route"
                  : selectedOrder.assignedRider.assignmentStatus === "ACCEPTED"
                  ? "Already Assigned (Accepted)"
                  : "Already Assigned"}
              </span>
            </div>

            {/* Primary Action Button */}
            {selectedOrder.status === "OUT_FOR_DELIVERY" ? (
              <button
                onClick={() => handleManualOverride(selectedOrder.id)}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">task_alt</span>
                <span>Verify Handover OTP</span>
              </button>
            ) : selectedOrder.status === "READY_FOR_PICKUP" ? (
              <button
                onClick={() => {
                  setOrderForRiderModal?.(selectedOrder);
                  setShowRiderModal(true);
                }}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors bg-emerald-600 hover:bg-emerald-700"
              >
                <span className="material-symbols-outlined text-[16px]">two_wheeler</span>
                <span>
                  {selectedOrder.assignedRider.name} (Change Rider)
                </span>
              </button>
            ) : selectedOrder.status === "PLACED" ? (
              <button
                onClick={() => handleTransition(selectedOrder.id, "ACCEPTED")}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">skillet</span>
                <span>Accept & Start Cooking</span>
              </button>
            ) : (selectedOrder.status === "ACCEPTED" || selectedOrder.status === "PREPARING") ? (
              <button
                onClick={() => handleTransition(selectedOrder.id, "READY_FOR_PICKUP")}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Mark Food Ready</span>
              </button>
            ) : null}

            {/* Subtle Secondary Links */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[11px]">
              <button
                onClick={() => {
                  setOrderForRiderModal?.(selectedOrder);
                  setShowRiderModal(true);
                }}
                className="font-medium text-emerald-700 hover:text-emerald-900 transition-colors flex items-center gap-0.5"
              >
                <span className="material-symbols-outlined text-[13px]">swap_horiz</span>
                <span>Change Rider</span>
              </button>
              {selectedOrder.status !== "CANCELLED" && selectedOrder.status !== "DELIVERED" && (
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to cancel this order?")) {
                      handleTransition(selectedOrder.id, "CANCELLED");
                    }
                  }}
                  className="font-medium text-rose-600 hover:text-rose-700 transition-colors"
                >
                  Cancel Order
                </button>
              )}
            </div>
          </div>
        ) : (
          /* When no rider is assigned yet */
          <div className="flex flex-col gap-2">
            {selectedOrder.status === "PLACED" && (
              <button
                onClick={() => handleTransition(selectedOrder.id, "ACCEPTED")}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">skillet</span>
                <span>Accept & Start Cooking</span>
              </button>
            )}

            {(selectedOrder.status === "ACCEPTED" || selectedOrder.status === "PREPARING") && (
              <button
                onClick={() => handleTransition(selectedOrder.id, "READY_FOR_PICKUP")}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>Mark Food Ready</span>
              </button>
            )}

            {selectedOrder.status === "READY_FOR_PICKUP" && (
              <button
                onClick={() => {
                  setOrderForRiderModal?.(selectedOrder);
                  setShowRiderModal(true);
                }}
                disabled={actionLoadingId === selectedOrder.id}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">two_wheeler</span>
                <span>Assign Rider</span>
              </button>
            )}

            {selectedOrder.status === "DELIVERED" && (
              <div className="w-full py-2 rounded-xl bg-emerald-50 text-emerald-800 font-bold text-xs flex items-center justify-center gap-1 border border-emerald-200">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                <span>Order Delivered Successfully</span>
              </div>
            )}

            {/* Secondary Cancel */}
            {selectedOrder.status !== "CANCELLED" && selectedOrder.status !== "DELIVERED" && (
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to cancel this order?")) {
                      handleTransition(selectedOrder.id, "CANCELLED");
                    }
                  }}
                  className="text-[11px] font-medium text-rose-600 hover:text-rose-700 transition-colors"
                >
                  Cancel Order
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OperationsConsolePage() {
  // Staff Auth Guard State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [adminEmail, setAdminEmail] = useState('admin@jankirasoi.com');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('jr_admin_token');
      if (token) {
        setIsAuthenticated(true);
      }
    }
    setCheckingAuth(false);
  }, []);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmail.trim() || !adminPassword) {
      setAdminLoginError('Please enter admin email and password.');
      return;
    }
    setAdminLoginLoading(true);
    setAdminLoginError(null);
    try {
      await adminApi.login(adminEmail, adminPassword);
      setIsAuthenticated(true);
      showToast('Staff authentication successful!');
    } catch (err: any) {
      setAdminLoginError(err.message || 'Invalid credentials.');
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    await adminApi.logout();
    setIsAuthenticated(false);
    showToast('Signed out of Operations Console.');
  };

  // Navigation Module View matching target reference image
  const [mainView, setMainView] = useState<'ORDERS' | 'CUSTOMERS' | 'RIDERS' | 'MENU' | 'REPORTS' | 'SETTINGS'>('ORDERS');

  // KDS Orders State
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<'ACTIVE' | 'ALL' | 'NEW' | 'PREPARING' | 'READY' | 'DISPATCH' | 'DELIVERED' | 'CANCELLED'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [refreshIntervalSec, setRefreshIntervalSec] = useState<number>(8);
  const [isKitchenOpen, setIsKitchenOpen] = useState<boolean>(true);
  const [autoAcceptOrders, setAutoAcceptOrders] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter Pills Sliding Bar Ref & Action
  const filterPillsRef = useRef<HTMLDivElement>(null);
  const slidePills = (direction: 'left' | 'right') => {
    if (filterPillsRef.current) {
      filterPillsRef.current.scrollBy({
        left: direction === 'left' ? -220 : 220,
        behavior: 'smooth',
      });
    }
  };

  // Helper to persist console settings in localStorage
  const updateSetting = (key: string, value: any) => {
    try {
      const saved = JSON.parse(localStorage.getItem('jr_admin_settings') || '{}');
      saved[key] = value;
      localStorage.setItem('jr_admin_settings', JSON.stringify(saved));
    } catch {}
  };

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
  const [orderForRiderModal, setOrderForRiderModal] = useState<AdminOrder | null>(null);
  const [assigningRiderId, setAssigningRiderId] = useState<string | null>(null);

  // Add Rider Modal State
  const [showAddRiderModal, setShowAddRiderModal] = useState(false);
  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderPhone, setNewRiderPhone] = useState('');
  const [newRiderPassword, setNewRiderPassword] = useState('200720');
  const [newRiderVehicle, setNewRiderVehicle] = useState('MP-09-JR-2026');
  const [addRiderLoading, setAddRiderLoading] = useState(false);
  const [addRiderError, setAddRiderError] = useState<string | null>(null);
  const [togglingRiderId, setTogglingRiderId] = useState<string | null>(null);
  const [deletingRiderId, setDeletingRiderId] = useState<string | null>(null);

  // Customers & Riders State
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerFilterTab, setCustomerFilterTab] = useState<'ALL' | 'ACTIVE' | 'BANNED' | 'VIP'>('ALL');
  const [selectedCustomerForBan, setSelectedCustomerForBan] = useState<AdminCustomer | null>(null);
  const [banReason, setBanReason] = useState('Customer unreachable / phone not picked on COD delivery');
  const [banPenaltyAmount, setBanPenaltyAmount] = useState('250');
  const [isBanningCustomer, setIsBanningCustomer] = useState(false);
  const [actioningCustomerPhone, setActioningCustomerPhone] = useState<string | null>(null);
  const [viewingCustomerOrders, setViewingCustomerOrders] = useState<{
    customer: AdminCustomer;
    orders: CustomerOrderHistoryItem[];
    loading: boolean;
  } | null>(null);

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
  const [newDishPrice, setNewDishPrice] = useState('149');
  const [newDishDescription, setNewDishDescription] = useState('');
  const [newDishImageUrl, setNewDishImageUrl] = useState('');
  const [isSubmittingDish, setIsSubmittingDish] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [dishFormError, setDishFormError] = useState<string | null>(null);
  const [dishFormSuccess, setDishFormSuccess] = useState<string | null>(null);

  // Edit Existing Dish State
  const [editingDish, setEditingDish] = useState<any | null>(null);
  const [showEditDishModal, setShowEditDishModal] = useState(false);
  const [editDishName, setEditDishName] = useState('');
  const [editDishCategory, setEditDishCategory] = useState('');
  const [editDishPrice, setEditDishPrice] = useState('149');
  const [editDishDescription, setEditDishDescription] = useState('');
  const [editDishImageUrl, setEditDishImageUrl] = useState('');
  const [isUpdatingDish, setIsUpdatingDish] = useState(false);
  const [isUploadingEditImage, setIsUploadingEditImage] = useState(false);
  const [editDishError, setEditDishError] = useState<string | null>(null);
  const [editDishSuccess, setEditDishSuccess] = useState<string | null>(null);

  // Delete Dish State
  const [dishToDelete, setDishToDelete] = useState<any | null>(null);
  const [isDeletingDish, setIsDeletingDish] = useState(false);

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
      const fetched = (data.orders || []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

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

  // Open Ban Customer Modal
  const handleOpenBanModal = (c: AdminCustomer) => {
    setSelectedCustomerForBan(c);
    setBanReason('Customer phone unreachable / did not answer call on COD delivery');
    setBanPenaltyAmount('250');
  };

  // Confirm Ban Customer
  const handleConfirmBanCustomer = async () => {
    if (!selectedCustomerForBan) return;
    setIsBanningCustomer(true);
    try {
      const penalty = Math.round(parseFloat(banPenaltyAmount || '0') * 100);
      await adminApi.banCustomer(selectedCustomerForBan.phone, banReason, penalty);
      setCustomers((prev) =>
        prev.map((c) =>
          c.phone === selectedCustomerForBan.phone
            ? {
                ...c,
                isBanned: true,
                isActive: false,
                banReason,
                penaltyAmountPaise: penalty,
                segment: 'BANNED' as const,
              }
            : c
        )
      );
      showToast(`Customer +91 ${selectedCustomerForBan.phone} blocked from placing orders.`);
      setSelectedCustomerForBan(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to ban customer');
    } finally {
      setIsBanningCustomer(false);
    }
  };

  // Unban Customer
  const handleUnbanCustomer = async (c: AdminCustomer) => {
    if (!confirm(`Are you sure you want to unban ${c.name} (+91 ${c.phone})? They will be allowed to order again.`)) {
      return;
    }
    setActioningCustomerPhone(c.phone);
    try {
      await adminApi.unbanCustomer(c.phone);
      setCustomers((prev) =>
        prev.map((item) =>
          item.phone === c.phone
            ? {
                ...item,
                isBanned: false,
                isActive: true,
                banReason: null,
                penaltyAmountPaise: 0,
                segment: item.orderCount >= 5 ? 'VIP' : item.orderCount >= 2 ? 'REGULAR' : 'NEW',
              }
            : item
        )
      );
      showToast(`Customer +91 ${c.phone} has been unbanned.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to unban customer');
    } finally {
      setActioningCustomerPhone(null);
    }
  };

  // View Customer Order History
  const handleViewCustomerOrders = async (c: AdminCustomer) => {
    setViewingCustomerOrders({
      customer: c,
      orders: [],
      loading: true,
    });
    try {
      const res = await adminApi.getCustomerOrders(c.phone);
      setViewingCustomerOrders({
        customer: c,
        orders: (res.orders || []).sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
        loading: false,
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to load order history');
      setViewingCustomerOrders(null);
    }
  };

  // Copy Coupon Code & WhatsApp sharing
  const handleShareCoupon = (customer: AdminCustomer, code = 'JANKI50') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
    }
    showToast(`Coupon code ${code} (Flat ₹50 OFF) copied for ${customer.name}!`);
    const text = encodeURIComponent(
      `Namaste ${customer.name}! Janki Rasoi ki taraf se aapke liye vishesh discount coupon: Code ${code} lagayein aur paayein flat chhoot. Order karein: https://jankirasoi.in`
    );
    window.open(`https://wa.me/91${customer.phone}?text=${text}`, '_blank');
  };

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
  const loadCatalog = useCallback(async (retryCount = 0) => {
    setCatalogLoading(true);
    try {
      const data = await adminApi.getCatalog();
      const cats = data.categories || [];
      setCatalogCategories(cats);
      setNewDishCategory((prev) => (prev && cats.some((c: any) => c.id === prev) ? prev : cats[0]?.id || ''));
      const soldOuts = new Set<string>();
      cats.forEach((c: any) => {
        c.items?.forEach((i: any) => {
          if (i.isSoldOut) soldOuts.add(i.id);
        });
      });
      setSoldOutItemIds(soldOuts);
    } catch (err: any) {
      if (retryCount < 2) {
        setTimeout(() => loadCatalog(retryCount + 1), 2000);
      } else {
        showToast(err.message || 'Failed to fetch catalog');
      }
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

  // Hydrate console settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('jr_admin_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.audioEnabled === 'boolean') setAudioEnabled(parsed.audioEnabled);
        if (typeof parsed.refreshIntervalSec === 'number') setRefreshIntervalSec(parsed.refreshIntervalSec);
        if (typeof parsed.isKitchenOpen === 'boolean') setIsKitchenOpen(parsed.isKitchenOpen);
        if (typeof parsed.autoAcceptOrders === 'boolean') setAutoAcceptOrders(parsed.autoAcceptOrders);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadOrders();
    loadRiders();
    loadSlots();

    // 1. Resilient polling fallback based on configured refresh interval
    let interval: NodeJS.Timeout | null = null;
    if (refreshIntervalSec > 0) {
      interval = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          loadOrders(true);
        }
      }, refreshIntervalSec * 1000);
    }

    // 2. Instant sync when browser tab regains focus or visibility
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        loadOrders(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // 3. Real-time Server-Sent Events (SSE) + Zero-Millisecond BroadcastChannel for Instant Arrival
    let eventSource: EventSource | null = null;
    let ordersBroadcast: BroadcastChannel | null = null;

    try {
      ordersBroadcast = new BroadcastChannel('jankirasoi_orders_channel');
      ordersBroadcast.onmessage = (event) => {
        if (event.data?.type === 'ORDER_CREATED') {
          playKitchenOrderChime();
          showToast(`⚡ New order received: #${event.data.orderNumber || ''}`);
          loadOrders(true);
        }
        if (event.data?.type === 'CUSTOMER_UNBANNED_PAYMENT') {
          playKitchenOrderChime();
          showToast(
            `💰 Unban Penalty Paid: ₹${event.data.amount || 250} received from +91 ${event.data.phone}${
              event.data.name ? ` (${event.data.name})` : ''
            }. Account unbanned!`
          );
          loadCustomers();
          loadOrders(true);
        }
      };
    } catch {}

    try {
      const apiHost = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
      const streamUrl = `${apiHost}/api/v1/admin/orders/stream?simulated_role=STAFF`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'PING') return;
          if (payload.type === 'ORDER_CREATED') {
            playKitchenOrderChime();
            showToast(`New order received: #${payload.orderNumber || ''}`);
          }
          if (payload.type === 'CUSTOMER_UNBANNED') {
            playKitchenOrderChime();
            showToast(
              `💰 Unban Penalty Paid: ₹${payload.penaltyAmount || 250} received from +91 ${payload.phone}${
                payload.customerName ? ` (${payload.customerName})` : ''
              }. Account unbanned!`
            );
            loadCustomers();
          }
          if (payload.type === 'ORDER_UPDATED' && (payload.orderId || payload.orderNumber) && payload.status) {
            setOrders((prev) =>
              prev.map((o) => (o.id === payload.orderId || o.orderNumber === payload.orderNumber || o.orderNumber === payload.orderId ? { ...o, status: payload.status } : o))
            );
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
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (eventSource) {
        eventSource.close();
      }
      if (ordersBroadcast) {
        ordersBroadcast.close();
      }
    };
  }, [loadOrders, loadRiders, loadSlots, loadCustomers, refreshIntervalSec]);

  useEffect(() => {
    if (mainView === 'CUSTOMERS') loadCustomers();
    if (mainView === 'RIDERS') loadRiders();
    if (mainView === 'MENU') {
      loadCatalog();
      loadSlots();
    }
  }, [mainView, loadCustomers, loadRiders, loadCatalog, loadSlots]);

  // Always refresh live riders when opening the rider assignment modal
  useEffect(() => {
    if (showRiderModal) {
      loadRiders();
    }
  }, [showRiderModal, loadRiders]);

  // Handle Order Status Transitions
  const handleTransition = async (orderId: string, nextStatus: string) => {
    setActionLoadingId(orderId);
    // Instant optimistic update so the order card immediately moves to the new column / stage
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId || o.orderNumber === orderId ? { ...o, status: nextStatus as any } : o))
    );
    try {
      await adminApi.updateOrderStatus(orderId, nextStatus);
      showToast(`Order status updated to ${nextStatus.replace(/_/g, ' ')}`);
      await loadOrders(true);
    } catch (err: any) {
      showToast(err.message || 'Status transition failed');
      await loadOrders(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Assigning Rider
  const handleAssignRider = async (orderId: string, riderId: string) => {
    if (!orderId || !riderId) return;
    setAssigningRiderId(riderId);
    setActionLoadingId(orderId);
    const assignedRiderObj = riders.find((r) => r.id === riderId || r.userId === riderId);
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId || o.orderNumber === orderId) {
          const nextStatus = o.status === 'PLACED' ? 'ACCEPTED' : o.status;
          return {
            ...o,
            status: nextStatus as any,
            assignedRider: {
              id: riderId,
              name: assignedRiderObj?.name || 'Delivery Rider',
              phone: assignedRiderObj?.phone || '',
              assignmentStatus: 'ASSIGNED' as const,
            },
          };
        }
        return o;
      })
    );
    try {
      await adminApi.assignRider(orderId, riderId);
      showToast('Rider assigned successfully');
      setShowRiderModal(false);
      // Broadcast instant cross-tab notification to Rider Portal
      try {
        const bc = new BroadcastChannel('jankirasoi_orders_channel');
        bc.postMessage({ type: 'RIDER_ASSIGNED', orderId, riderId, timestamp: Date.now() });
        bc.close();
      } catch {}
      await loadOrders(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to assign rider');
    } finally {
      setAssigningRiderId(null);
      setActionLoadingId(null);
    }
  };

  // Handle Registering New Delivery Rider
  const handleCreateRiderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiderName.trim() || !newRiderPhone.trim()) {
      setAddRiderError('Rider name and phone number are required.');
      return;
    }
    setAddRiderLoading(true);
    setAddRiderError(null);
    try {
      await adminApi.createRider({
        name: newRiderName.trim(),
        phone: newRiderPhone.trim(),
        password: newRiderPassword.trim() || undefined,
        vehicleNumber: newRiderVehicle.trim() || undefined,
      });
      showToast('Delivery rider registered successfully');
      setShowAddRiderModal(false);
      setNewRiderName('');
      setNewRiderPhone('');
      await loadRiders();
    } catch (err: any) {
      setAddRiderError(err.message || 'Failed to register rider');
    } finally {
      setAddRiderLoading(false);
    }
  };

  // Handle Toggle Rider Live Duty Status
  const handleToggleRiderAvailability = async (riderId: string, currentAvailability: boolean) => {
    setTogglingRiderId(riderId);
    try {
      await adminApi.toggleRiderAvailability(riderId, !currentAvailability);
      showToast(`Rider availability set to ${!currentAvailability ? 'ON DUTY' : 'OFFLINE'}`);
      await loadRiders();
    } catch (err: any) {
      showToast(err.message || 'Failed to update rider duty status');
    } finally {
      setTogglingRiderId(null);
    }
  };

  // Handle Removing Rider
  const handleDeleteRider = async (riderId: string, riderName: string) => {
    if (!confirm(`Are you sure you want to remove rider "${riderName}"?`)) return;
    setDeletingRiderId(riderId);
    try {
      await adminApi.deleteRider(riderId);
      showToast(`Rider ${riderName} removed successfully`);
      await loadRiders();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove rider');
    } finally {
      setDeletingRiderId(null);
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
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
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

  // Quick Preset Authentic Dish Photos from Supabase Storage
  const SUPABASE_STORAGE_DISHES_BASE = 'https://yxvwgcjavxeqsttzcbty.supabase.co/storage/v1/object/public/menu/dishes';

  const PRESET_AUTHENTIC_DISHES = [
    { title: 'Special Thali (भर पेट)', url: `${SUPABASE_STORAGE_DISHES_BASE}/special-thali-bhar-pet.jpg` },
    { title: 'Dal Bati Thali (दाल-बाटी थाली)', url: `${SUPABASE_STORAGE_DISHES_BASE}/dal-bati-thali.jpg` },
    { title: 'Sadi Thali (सादी थाली)', url: `${SUPABASE_STORAGE_DISHES_BASE}/sadi-thali.jpg` },
    { title: 'Shahi Paneer', url: `${SUPABASE_STORAGE_DISHES_BASE}/shahi-paneer.jpg` },
    { title: 'Paneer Masala', url: `${SUPABASE_STORAGE_DISHES_BASE}/paneer-masala.jpg` },
    { title: 'Kadhai Paneer', url: `${SUPABASE_STORAGE_DISHES_BASE}/kadhai-paneer.jpg` },
    { title: 'Matar Paneer', url: `${SUPABASE_STORAGE_DISHES_BASE}/matar-paneer.jpg` },
    { title: 'Sev Bhaji', url: `${SUPABASE_STORAGE_DISHES_BASE}/sev-bhaji.jpg` },
    { title: 'Sev Tamatar', url: `${SUPABASE_STORAGE_DISHES_BASE}/sev-tamatar.jpg` },
    { title: 'Sev Masala', url: `${SUPABASE_STORAGE_DISHES_BASE}/sev-masala.jpg` },
    { title: 'Dal Tadka', url: `${SUPABASE_STORAGE_DISHES_BASE}/dal-tadka.jpg` },
    { title: 'Dal Fry', url: `${SUPABASE_STORAGE_DISHES_BASE}/dal-fry.jpg` },
    { title: 'Jeera Dal', url: `${SUPABASE_STORAGE_DISHES_BASE}/jeera-dal.jpg` },
    { title: 'Mix Dal', url: `${SUPABASE_STORAGE_DISHES_BASE}/mix-dal.jpg` },
    { title: 'Urad Chana Dal', url: `${SUPABASE_STORAGE_DISHES_BASE}/urad-chana-dal.jpg` },
    { title: 'Chana Masala', url: `${SUPABASE_STORAGE_DISHES_BASE}/chana-masala.jpg` },
    { title: 'Aloo Gobhi', url: `${SUPABASE_STORAGE_DISHES_BASE}/aloo-gobhi.jpg` },
    { title: 'Aloo Matar', url: `${SUPABASE_STORAGE_DISHES_BASE}/aloo-matar.jpg` },
    { title: 'Aloo Tamatar', url: `${SUPABASE_STORAGE_DISHES_BASE}/aloo-tamatar.jpg` },
    { title: 'Mix Sabzi', url: `${SUPABASE_STORAGE_DISHES_BASE}/mix-sabzi.jpg` },
    { title: 'Aloo Paratha', url: `${SUPABASE_STORAGE_DISHES_BASE}/aloo-paratha.jpg` },
    { title: 'Paneer Paratha', url: `${SUPABASE_STORAGE_DISHES_BASE}/paneer-paratha.jpg` },
    { title: 'Gobhi Paratha', url: `${SUPABASE_STORAGE_DISHES_BASE}/gobhi-paratha.jpg` },
    { title: 'Sev Paratha', url: `${SUPABASE_STORAGE_DISHES_BASE}/sev-paratha.jpg` },
    { title: 'Plain Paratha', url: `${SUPABASE_STORAGE_DISHES_BASE}/plain-paratha.jpg` },
    { title: 'Jeera Rice', url: `${SUPABASE_STORAGE_DISHES_BASE}/jeera-rice.jpg` },
    { title: 'Matar Pulao', url: `${SUPABASE_STORAGE_DISHES_BASE}/matar-pulao.jpg` },
    { title: 'Plain Rice', url: `${SUPABASE_STORAGE_DISHES_BASE}/plain-rice.jpg` },
    { title: 'Indori Poha (नाश्ता)', url: `${SUPABASE_STORAGE_DISHES_BASE}/indori-poha-special-nashta.jpg` },
    { title: 'Gud Ki Chai', url: `${SUPABASE_STORAGE_DISHES_BASE}/gud-ki-chai.jpg` },
    { title: 'Finger Chips', url: `${SUPABASE_STORAGE_DISHES_BASE}/finger-chips.jpg` },
  ];

  const PRESET_THALI_IMAGES = PRESET_AUTHENTIC_DISHES;

  const DEFAULT_DISH_IMAGES: Record<string, string> = {
    'aloo-gobhi': `${SUPABASE_STORAGE_DISHES_BASE}/aloo-gobhi.jpg`,
    'aloo-matar': `${SUPABASE_STORAGE_DISHES_BASE}/aloo-matar.jpg`,
    'aloo-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/aloo-paratha.jpg`,
    'aloo-tamatar': `${SUPABASE_STORAGE_DISHES_BASE}/aloo-tamatar.jpg`,
    'chana-masala': `${SUPABASE_STORAGE_DISHES_BASE}/chana-masala.jpg`,
    'dal-bati-thali': `${SUPABASE_STORAGE_DISHES_BASE}/dal-bati-thali.jpg`,
    'dal-fry': `${SUPABASE_STORAGE_DISHES_BASE}/dal-fry.jpg`,
    'dal-tadka': `${SUPABASE_STORAGE_DISHES_BASE}/dal-tadka.jpg`,
    'finger-chips': `${SUPABASE_STORAGE_DISHES_BASE}/finger-chips.jpg`,
    'gobhi-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/gobhi-paratha.jpg`,
    'gud-ki-chai': `${SUPABASE_STORAGE_DISHES_BASE}/gud-ki-chai.jpg`,
    'indori-poha-special-nashta': `${SUPABASE_STORAGE_DISHES_BASE}/indori-poha-special-nashta.jpg`,
    'jeera-dal': `${SUPABASE_STORAGE_DISHES_BASE}/jeera-dal.jpg`,
    'jeera-rice': `${SUPABASE_STORAGE_DISHES_BASE}/jeera-rice.jpg`,
    'kadhai-paneer': `${SUPABASE_STORAGE_DISHES_BASE}/kadhai-paneer.jpg`,
    'matar-paneer': `${SUPABASE_STORAGE_DISHES_BASE}/matar-paneer.jpg`,
    'matar-pulao': `${SUPABASE_STORAGE_DISHES_BASE}/matar-pulao.jpg`,
    'mix-dal': `${SUPABASE_STORAGE_DISHES_BASE}/mix-dal.jpg`,
    'mix-sabzi': `${SUPABASE_STORAGE_DISHES_BASE}/mix-sabzi.jpg`,
    'paneer-masala': `${SUPABASE_STORAGE_DISHES_BASE}/paneer-masala.jpg`,
    'paneer-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/paneer-paratha.jpg`,
    'plain-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/plain-paratha.jpg`,
    'plain-rice': `${SUPABASE_STORAGE_DISHES_BASE}/plain-rice.jpg`,
    'sadi-thali': `${SUPABASE_STORAGE_DISHES_BASE}/sadi-thali.jpg`,
    'sev-bhaji': `${SUPABASE_STORAGE_DISHES_BASE}/sev-bhaji.jpg`,
    'sev-masala': `${SUPABASE_STORAGE_DISHES_BASE}/sev-masala.jpg`,
    'sev-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/sev-paratha.jpg`,
    'sev-tamatar': `${SUPABASE_STORAGE_DISHES_BASE}/sev-tamatar.jpg`,
    'shahi-paneer': `${SUPABASE_STORAGE_DISHES_BASE}/shahi-paneer.jpg`,
    'special-thali-bhar-pet': `${SUPABASE_STORAGE_DISHES_BASE}/special-thali-bhar-pet.jpg`,
    'urad-chana-dal': `${SUPABASE_STORAGE_DISHES_BASE}/urad-chana-dal.jpg`,
  };

  const compressImageToDataUrl = async (file: File, maxWidth = 900, quality = 0.82): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          try {
            const webp = canvas.toDataURL('image/webp', quality);
            if (webp && webp.startsWith('data:image/webp')) {
              resolve(webp);
              return;
            }
          } catch {}
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Failed to parse image file'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setDishFormError('Please select a valid image file (JPG, PNG, or WebP)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setDishFormError('Image size exceeds 15MB limit');
      return;
    }
    setDishFormError(null);
    setIsUploadingImage(true);
    try {
      let uploadedUrl = '';
      try {
        uploadedUrl = await adminApi.uploadFoodImage(file);
        showToast('Image uploaded via Cloudinary');
      } catch (uploadErr) {
        console.warn('Cloudinary upload unavailable, compressing locally:', uploadErr);
        uploadedUrl = await compressImageToDataUrl(file, 900, 0.82);
        showToast('Image attached & optimized successfully');
      }
      setNewDishImageUrl(uploadedUrl);
    } catch (err: any) {
      console.error('Image upload failed:', err);
      setDishFormError(err.message || 'Image upload failed. Please try again.');
      showToast(err.message || 'Image upload failed');
    } finally {
      setIsUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleCreateDish = async (e: React.FormEvent) => {
    e.preventDefault();
    setDishFormError(null);

    const trimmedName = newDishName.trim();
    if (!trimmedName) {
      setDishFormError('Please enter a food name');
      return;
    }

    let catId = newDishCategory || catalogCategories[0]?.id;
    if (!catId) {
      try {
        const catData = await adminApi.getCatalog();
        if (catData?.categories?.length) {
          setCatalogCategories(catData.categories);
          catId = catData.categories[0].id;
          setNewDishCategory(catId);
        }
      } catch {
        // ignore
      }
    }

    if (!catId) {
      setDishFormError('Please wait for catalog categories to load');
      return;
    }

    const priceNum = parseFloat(newDishPrice || '149');
    if (isNaN(priceNum) || priceNum <= 0) {
      setDishFormError('Please enter a valid price in ₹ (e.g. 149)');
      return;
    }

    if (isUploadingImage) {
      setDishFormError('Please wait for image upload to finish');
      return;
    }

    setIsSubmittingDish(true);
    try {
      await adminApi.createDish({
        categoryId: catId,
        name: trimmedName,
        description: newDishDescription.trim() || 'Pure vegetarian homestyle meal freshly cooked in pure ghee.',
        basePricePaise: Math.round(priceNum * 100),
        imageUrl: newDishImageUrl || PRESET_THALI_IMAGES[0].url,
        dietaryType: 'VEG',
      });

      setDishFormSuccess(`"${trimmedName}" created and published!`);
      showToast(`Added "${trimmedName}" to Food Menu!`);
      setNewDishName('');
      setNewDishPrice('149');
      setNewDishDescription('');
      setNewDishImageUrl('');
      setShowAddDishModal(false);
      setDishFormSuccess(null);
      await loadCatalog();
    } catch (err: any) {
      setDishFormError(err.message || 'Failed to add food item');
      showToast(err.message || 'Failed to add food item');
    } finally {
      setIsSubmittingDish(false);
    }
  };

  const handleOpenEditDish = (dish: any, defaultCatId: string) => {
    setEditingDish(dish);
    setEditDishName(dish.name || '');
    setEditDishCategory(dish.categoryId || defaultCatId || catalogCategories[0]?.id || '');
    setEditDishPrice(dish.basePricePaise ? (dish.basePricePaise / 100).toString() : '149');
    setEditDishDescription(dish.description || '');
    setEditDishImageUrl(dish.imageUrl || DEFAULT_DISH_IMAGES[dish.slug] || '/images/dishes/special-thali-bhar-pet.jpg');
    setEditDishError(null);
    setEditDishSuccess(null);
    setShowEditDishModal(true);
  };

  const handleEditImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setEditDishError('Please select a valid image file (JPG, PNG, or WebP)');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setEditDishError('Image size exceeds 15MB limit');
      return;
    }
    setEditDishError(null);
    setIsUploadingEditImage(true);
    try {
      let uploadedUrl = '';
      try {
        uploadedUrl = await adminApi.uploadFoodImage(file);
        showToast('Image uploaded via Cloudinary');
      } catch (uploadErr) {
        console.warn('Cloudinary upload unavailable, compressing locally:', uploadErr);
        uploadedUrl = await compressImageToDataUrl(file, 900, 0.82);
        showToast('Image updated & attached successfully!');
      }
      setEditDishImageUrl(uploadedUrl);
    } catch (err: any) {
      console.error('Image upload failed:', err);
      setEditDishError(err.message || 'Image upload failed. Please try again.');
      showToast(err.message || 'Image upload failed');
    } finally {
      setIsUploadingEditImage(false);
      e.target.value = '';
    }
  };

  const handleUpdateDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDish) return;
    setEditDishError(null);

    const trimmedName = editDishName.trim();
    if (!trimmedName) {
      setEditDishError('Please enter a food name');
      return;
    }

    const priceNum = parseFloat(editDishPrice || '149');
    if (isNaN(priceNum) || priceNum <= 0) {
      setEditDishError('Please enter a valid price in ₹ (e.g. 149)');
      return;
    }

    if (isUploadingEditImage) {
      setEditDishError('Please wait for image upload to finish');
      return;
    }

    setIsUpdatingDish(true);
    try {
      await adminApi.updateDish(editingDish.id, {
        categoryId: editDishCategory || undefined,
        name: trimmedName,
        description: editDishDescription.trim() || undefined,
        basePricePaise: Math.round(priceNum * 100),
        imageUrl: editDishImageUrl || undefined,
      });

      setEditDishSuccess(`"${trimmedName}" updated successfully!`);
      showToast(`Updated "${trimmedName}" in menu!`);
      setShowEditDishModal(false);
      setEditingDish(null);
      setEditDishSuccess(null);
      await loadCatalog();
    } catch (err: any) {
      setEditDishError(err.message || 'Failed to update dish');
      showToast(err.message || 'Failed to update dish');
    } finally {
      setIsUpdatingDish(false);
    }
  };

  const handleConfirmDeleteDish = async () => {
    if (!dishToDelete) return;
    setIsDeletingDish(true);
    try {
      await adminApi.deleteDish(dishToDelete.id);
      showToast(`Removed "${dishToDelete.name}" from active menu`);
      setDishToDelete(null);
      await loadCatalog();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove dish');
    } finally {
      setIsDeletingDish(false);
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
      // Strict LIFO: Newest orders first (latest ordered always at the very top everywhere)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const selectedOrder = orders.find((o) => o.id === selectedOrderId || o.orderNumber === selectedOrderId) || filteredOrders[0] || null;

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

        {/* Minimalist Typographic Food Items with Item Prices */}
        <div className="space-y-1.5 py-1">
          {order.items && order.items.length > 0 ? (
            order.items.map((it, idx) => {
              const itemTotal = (it.totalPricePaise ?? (it.unitPricePaise ? it.unitPricePaise * it.quantity : 0)) / 100;
              return (
                <div key={idx} className="flex items-center justify-between text-xs leading-snug">
                  <span className="font-medium text-gray-800 truncate pr-2">
                    <span className="font-bold text-emerald-800 font-mono mr-1">{it.quantity}×</span>
                    {it.productName}
                    {it.variantName && it.variantName !== 'Standard' && (
                      <span className="text-[10px] text-gray-400 ml-1">({it.variantName})</span>
                    )}
                  </span>
                  <span className="font-bold font-mono text-gray-900 shrink-0 text-xs">
                    ₹{itemTotal > 0 ? itemTotal.toFixed(0) : '-'}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="flex items-center justify-between text-xs text-gray-700 font-medium leading-snug">
              <span>
                <span className="font-bold text-emerald-800 font-mono mr-1">{totalItems}×</span>
                Standard Tiffin
              </span>
              <span className="font-bold font-mono text-gray-900">
                ₹{(order.totalAmountPaise / 100).toFixed(0)}
              </span>
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

        {/* Assigned Rider Pill / Button on Kanban Card */}
        {order.assignedRider ? (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setOrderForRiderModal(order);
              setSelectedOrderId(order.id);
              setShowRiderModal(true);
            }}
            className="flex items-center justify-between text-[11px] pt-1 text-gray-600 border-t border-gray-50 cursor-pointer hover:bg-emerald-50/70 rounded p-1 transition-colors group"
            title="Click to change or reassign rider"
          >
            <span className="flex items-center gap-1 truncate font-medium">
              <span className="material-symbols-outlined text-[13px] text-blue-600">two_wheeler</span>
              <span className="truncate">{order.assignedRider.name}</span>
            </span>
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0 flex items-center gap-1 ${
                order.assignedRider.assignmentStatus === 'ACCEPTED'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              <span>{order.assignedRider.assignmentStatus === 'ACCEPTED' ? 'Assigned' : 'Assigned'}</span>
              <span className="text-[9px] text-emerald-700 font-bold underline group-hover:text-emerald-950">Change</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] pt-1 text-gray-400 border-t border-gray-50">
            <span className="flex items-center gap-1 text-gray-400">
              <span className="material-symbols-outlined text-[13px]">two_wheeler</span>
              <span>No rider assigned</span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOrderForRiderModal(order);
                setSelectedOrderId(order.id);
                setShowRiderModal(true);
              }}
              className="text-[10px] text-blue-700 font-bold bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded transition-colors flex items-center gap-0.5"
            >
              <span>+ Assign</span>
            </button>
          </div>
        )}

        {/* Price & Single 1-Tap Action Button */}
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 gap-2">
          <div className="flex flex-col min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold font-mono text-gray-950 text-sm">
                ₹{(order.totalAmountPaise / 100).toFixed(0)}
              </span>
              <span className="text-[9px] uppercase font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 shrink-0">
                {order.paymentMethod || 'COD'}
              </span>
            </div>
            <div className="text-[10px] text-gray-500 font-medium truncate">
              Items: ₹{((order.subtotalPaise ?? (order.totalAmountPaise - (order.taxPaise || Math.round(order.totalAmountPaise * 0.05 / 1.05)))) / 100).toFixed(0)} + GST (5%): ₹{((order.taxPaise ?? Math.round(order.totalAmountPaise * 0.05 / 1.05)) / 100).toFixed(0)}
            </div>
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
              !order.assignedRider ? (
                <button
                  onClick={() => {
                    setOrderForRiderModal(order);
                    setSelectedOrderId(order.id);
                    setShowRiderModal(true);
                  }}
                  disabled={actionLoadingId === order.id}
                  className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                  <span>Assign</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setOrderForRiderModal(order);
                    setSelectedOrderId(order.id);
                    setShowRiderModal(true);
                  }}
                  disabled={actionLoadingId === order.id}
                  className="px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200 inline-flex items-center gap-1 transition-colors"
                  title="Click to reassign or change rider"
                >
                  <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                  <span>Change Rider</span>
                </button>
              )
            )}

            {isDispatch && (
              <div className="flex items-center gap-1">
                <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-xs border border-emerald-200 inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  <span>Already Assigned</span>
                </span>
                <button
                  onClick={() => handleManualOverride(order.id)}
                  disabled={actionLoadingId === order.id}
                  className="px-1.5 py-1 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center gap-0.5 shadow-2xs transition-colors"
                  title="Emergency Manual OTP Override"
                >
                  <span className="material-symbols-outlined text-[12px]">dialpad</span>
                  <span className="text-[10px]">OTP</span>
                </button>
              </div>
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

  if (checkingAuth) {
    return (
      <div className="h-screen bg-[#FFF9F0] flex flex-col items-center justify-center p-6 text-stone-800">
        <div className="w-10 h-10 border-4 border-emerald-700 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-bold text-stone-600 tracking-wider uppercase">Loading Kitchen Operations Console...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen bg-[#FFF9F0] flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-xl border border-amber-200/80 flex flex-col gap-5">
          <div className="text-center flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-[#1D5C34] text-white flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[32px]">shield_person</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Kitchen Operations Console
            </h1>
            <p className="text-xs text-slate-500">
              Janki Rasoi • Staff &amp; Admin Sign In (Port 3002)
            </p>
          </div>

          {adminLoginError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] shrink-0 text-rose-600">error</span>
              <span>{adminLoginError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Staff Email
              </label>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@jankirasoi.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-[#1D5C34] text-sm font-medium outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full px-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-[#1D5C34] text-sm font-medium outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showAdminPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={adminLoginLoading}
              className="w-full mt-1 py-3 px-6 rounded-xl bg-[#1D5C34] hover:bg-[#164828] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {adminLoginLoading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In to Console</span>
                  <span className="material-symbols-outlined text-[18px]">lock_open</span>
                </>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <span className="material-symbols-outlined text-[14px] text-emerald-600">lock</span>
            <span>Authorized Kitchen &amp; Management Staff Only</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen max-h-screen overflow-hidden bg-[#f8faf7] text-stone-900 flex flex-col font-body selection:bg-emerald-800 selection:text-white antialiased">
      {/* 1. TOP COMPACT HEADER */}
      <header className="h-16 shrink-0 z-40 bg-white border-b border-gray-200/90 px-4 lg:px-6 flex items-center justify-between shadow-2xs">
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
            <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#FFF9F0] border border-[#7A1E1E]/20 shadow-xs flex items-center justify-center p-0.5 shrink-0">
              <img
                src="/images/logo-avatar.png"
                alt="Janki Rasoi Logo"
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
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
          <div className="w-9 h-9 rounded-full bg-emerald-900 text-white font-bold flex items-center justify-center text-xs shadow-xs cursor-pointer" title="Staff User">
            JR
          </div>

          {/* Logout Button */}
          <button
            onClick={handleAdminLogout}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors border border-rose-200 shrink-0"
            title="Logout from Operations Console"
          >
            <span className="material-symbols-outlined text-[15px]">logout</span>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* 2. BODY LAYOUT: Left Sidebar + Center Workspace (+ Right Panel on Orders) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Persistent Sidebar (Matching Reference Image) */}
        <aside className="w-56 h-full max-h-full bg-white border-r border-gray-200/90 flex flex-col justify-between p-3 shrink-0 select-none hidden md:flex overflow-y-auto no-scrollbar">
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
              data-testid="admin-nav-menu-btn"
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
        </aside>

        {/* 3. CENTER / WORKSPACE AREA */}
        <div className="flex-1 flex flex-col overflow-y-auto min-h-0 bg-[#f8faf7]">
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
                    <ClockwiseRefreshIcon className="w-4 h-4 text-emerald-700" spinning={loading} />
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              </div>

              {/* Consolidated Status Filter Ribbon & Operational Summary */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2 sm:p-2.5 rounded-2xl border border-gray-200/90 shadow-2xs">
                {/* Status Pills with Live Counts, Visible Sliding Bar & Arrow Controls */}
                <div className="relative flex items-center min-w-0 flex-1 gap-1">
                  {/* Left Slide Arrow */}
                  <button
                    type="button"
                    onClick={() => slidePills('left')}
                    className="shrink-0 w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200/80 text-gray-600 flex items-center justify-center transition-colors shadow-2xs"
                    title="Slide left"
                    aria-label="Slide filter pills left"
                  >
                    <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                  </button>

                  {/* Scrollable Track with Styled Sliding Bar */}
                  <div
                    ref={filterPillsRef}
                    className="custom-pills-slider flex items-center gap-1.5 overflow-x-auto scroll-smooth py-1 px-1 pb-2 min-w-0 flex-1"
                  >
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

                  {/* Right Slide Arrow */}
                  <button
                    type="button"
                    onClick={() => slidePills('right')}
                    className="shrink-0 w-7 h-7 rounded-lg bg-gray-50 hover:bg-gray-100 active:bg-gray-200 border border-gray-200/80 text-gray-600 flex items-center justify-center transition-colors shadow-2xs"
                    title="Slide right"
                    aria-label="Slide filter pills right"
                  >
                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
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
                                      title={order.items?.map((i) => `${i.productName} (x${i.quantity}) - ₹${(((i.totalPricePaise ?? ((i.unitPricePaise || 0) * i.quantity))) / 100).toFixed(0)}`).join(', ')}
                                    >
                                      {order.items && order.items.length > 0
                                        ? order.items.map((i) => `${i.quantity}x ${i.productName} (₹${(((i.totalPricePaise ?? ((i.unitPricePaise || 0) * i.quantity))) / 100).toFixed(0)})`).join(', ')
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
                                    <div className="text-[10px] text-gray-500 font-medium">
                                      Incl. GST: ₹{((order.taxPaise ?? Math.round(order.totalAmountPaise * 0.05 / 1.05)) / 100).toFixed(0)}
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
                                        !order.assignedRider ? (
                                          <button
                                            onClick={() => {
                    setOrderForRiderModal(order);
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
                                        ) : (
                                          <button
                                            onClick={() => {
                                              setOrderForRiderModal(order);
                                              setSelectedOrderId(order.id);
                                              setShowRiderModal(true);
                                            }}
                                            disabled={actionLoadingId === order.id}
                                            className="px-2 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs border border-emerald-200 inline-flex items-center gap-1 transition-colors"
                                            title="Click to reassign or change rider"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                                            <span>Change</span>
                                          </button>
                                        )
                                      )}

                                      {isDispatch && (
                                        <div className="flex items-center gap-1">
                                          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 font-bold text-xs border border-emerald-200 inline-flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                            <span>Already Assigned</span>
                                          </span>
                                          <button
                                            onClick={() => handleManualOverride(order.id)}
                                            disabled={actionLoadingId === order.id}
                                            className="px-2 py-1 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs flex items-center gap-1 shadow-2xs transition-colors"
                                            title="Verify PIN & Complete Delivery"
                                          >
                                            <span className="material-symbols-outlined text-[14px]">task_alt</span>
                                            <span>OTP</span>
                                          </button>
                                        </div>
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
                      setOrderForRiderModal={setOrderForRiderModal}
                      actionLoadingId={actionLoadingId}
                      onClose={() => setDesktopPanelOpen(false)}
                    />
                  </div>
                )}
              </div>
            </main>
          )}

          {/* VIEW: CUSTOMERS (CRM, FRAUD & BAN MANAGEMENT) */}
          {mainView === 'CUSTOMERS' && (
            <main className="p-4 lg:p-6 flex flex-col gap-5 flex-1 max-w-[1600px] w-full mx-auto">
              {/* Header Title & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-bold font-headline text-gray-900">Customers CRM &amp; Fraud Control</h2>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                      {customers.length} Profiles
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Track customer ordering history, ban fake / unreachable callers, and issue loyalty coupons.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadCustomers}
                    disabled={customersLoading}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 border border-gray-200 flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
                    title="Reload customers database"
                  >
                    <ClockwiseRefreshIcon className="w-4 h-4 text-emerald-800" spinning={customersLoading} />
                    <span>Reload CRM</span>
                  </button>
                </div>
              </div>

              {/* CRM Key Metrics Ribbon */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">group</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-500 font-semibold block">Total Registered</span>
                    <span className="text-xl font-extrabold text-gray-900 font-headline">{customers.length}</span>
                  </div>
                </div>

                <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">verified_user</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-500 font-semibold block">Active &amp; Verified</span>
                    <span className="text-xl font-extrabold text-emerald-800 font-headline">
                      {customers.filter((c) => !c.isBanned).length}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-rose-200/80 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">block</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-rose-600 font-semibold block">Blocked / Banned</span>
                    <span className="text-xl font-extrabold text-rose-700 font-headline">
                      {customers.filter((c) => c.isBanned).length}
                    </span>
                  </div>
                </div>

                <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">payments</span>
                  </div>
                  <div>
                    <span className="text-[11px] text-gray-500 font-semibold block">Customer GMV</span>
                    <span className="text-xl font-extrabold text-gray-900 font-headline">
                      ₹{(customers.reduce((acc, c) => acc + (c.totalSpendPaise || 0), 0) / 100).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Filters & Search Control Bar */}
              <div className="bg-white border border-gray-200/90 rounded-2xl p-3 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Search by customer name, phone (+91...) or address..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-800 placeholder:text-gray-400 focus:outline-hidden focus:border-emerald-600"
                  />
                  {customerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCustomerSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                  <button
                    type="button"
                    onClick={() => setCustomerFilterTab('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      customerFilterTab === 'ALL'
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All ({customers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerFilterTab('ACTIVE')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      customerFilterTab === 'ACTIVE'
                        ? 'bg-emerald-800 text-white shadow-2xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Active ({customers.filter((c) => !c.isBanned).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerFilterTab('BANNED')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      customerFilterTab === 'BANNED'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                    }`}
                  >
                    Banned 🚫 ({customers.filter((c) => c.isBanned).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerFilterTab('VIP')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      customerFilterTab === 'VIP'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    VIP / Frequent 👑 ({customers.filter((c) => c.segment === 'VIP').length})
                  </button>
                </div>
              </div>

              {/* Customers Directory Table */}
              <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[900px]">
                    <thead className="bg-[#f9faf8] text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
                      <tr>
                        <th className="py-3 px-4">Customer Profile</th>
                        <th className="py-3 px-4">Contact &amp; Call</th>
                        <th className="py-3 px-4">Account Status</th>
                        <th className="py-3 px-4">Orders &amp; GMV</th>
                        <th className="py-3 px-4">Last Activity &amp; Dishes</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customers
                        .filter((c) => {
                          if (customerFilterTab === 'ACTIVE' && c.isBanned) return false;
                          if (customerFilterTab === 'BANNED' && !c.isBanned) return false;
                          if (customerFilterTab === 'VIP' && c.segment !== 'VIP') return false;
                          if (customerSearchQuery.trim()) {
                            const q = customerSearchQuery.toLowerCase();
                            const matchName = c.name?.toLowerCase().includes(q);
                            const matchPhone = c.phone?.toLowerCase().includes(q);
                            const matchAddress = JSON.stringify(c.savedAddress || '').toLowerCase().includes(q);
                            return matchName || matchPhone || matchAddress;
                          }
                          return true;
                        })
                        .map((c, idx) => {
                          const isActioning = actioningCustomerPhone === c.phone;
                          return (
                            <tr key={idx} className={`hover:bg-gray-50/80 transition-colors ${c.isBanned ? 'bg-rose-50/20' : ''}`}>
                              {/* Customer Profile */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <span
                                    className={`w-8 h-8 rounded-full font-bold flex items-center justify-center text-xs shrink-0 ${
                                      c.isBanned
                                        ? 'bg-rose-100 text-rose-800'
                                        : c.segment === 'VIP'
                                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                        : 'bg-emerald-100 text-emerald-800'
                                    }`}
                                  >
                                    {getInitials(c.name)}
                                  </span>
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-gray-900 leading-tight">{c.name}</span>
                                      {c.segment === 'VIP' && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                                          👑 VIP
                                        </span>
                                      )}
                                      {c.isBanned && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200">
                                          🚫 BLOCKED
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-gray-500 truncate max-w-[220px]">
                                      {typeof c.savedAddress === 'string'
                                        ? c.savedAddress
                                        : c.savedAddress?.flat
                                        ? `${c.savedAddress.flat}, ${c.savedAddress.street || ''}`
                                        : 'Address saved on checkout'}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Contact & Call */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-gray-800 font-semibold">+91 {c.phone}</span>
                                  <a
                                    href={`tel:+91${c.phone}`}
                                    title="Call Customer"
                                    className="w-6 h-6 rounded-lg bg-gray-100 hover:bg-emerald-100 text-gray-600 hover:text-emerald-800 flex items-center justify-center transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">call</span>
                                  </a>
                                  <a
                                    href={`https://wa.me/91${c.phone}?text=${encodeURIComponent(
                                      `Namaste ${c.name}, Janki Rasoi kitchen support se message hai.`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Message on WhatsApp"
                                    className="w-6 h-6 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 flex items-center justify-center transition-colors"
                                  >
                                    <span className="material-symbols-outlined text-[13px]">chat</span>
                                  </a>
                                </div>
                              </td>

                              {/* Account Status */}
                              <td className="py-3 px-4">
                                {c.isBanned ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-rose-100 text-rose-700 border border-rose-200 w-fit">
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span>
                                      <span>Banned / Blacklisted</span>
                                    </span>
                                    <span className="text-[10px] text-rose-700 font-medium leading-tight max-w-[180px] line-clamp-1" title={c.banReason || ''}>
                                      {c.banReason || 'Fake order / unreachable'}
                                    </span>
                                    {c.penaltyAmountPaise ? c.penaltyAmountPaise > 0 && (
                                      <span className="text-[10px] font-bold text-amber-800">
                                        Settlement Penalty: ₹{(c.penaltyAmountPaise / 100).toFixed(0)}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                    <span>Active • Verified</span>
                                  </span>
                                )}
                              </td>

                              {/* Orders & GMV */}
                              <td className="py-3 px-4">
                                <div className="flex flex-col">
                                  <span className="font-bold text-gray-900">{c.orderCount} meals ordered</span>
                                  <span className="font-mono text-emerald-800 font-bold text-xs">
                                    ₹{((c.totalSpendPaise || 0) / 100).toFixed(2)}
                                  </span>
                                </div>
                              </td>

                              {/* Last Activity & Dishes */}
                              <td className="py-3 px-4">
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-gray-700 font-medium">{formatOrderDate(c.lastOrderDate)}</span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-gray-100 text-gray-700">
                                      {c.lastOrderStatus || 'DELIVERED'}
                                    </span>
                                  </div>
                                  {c.recentItems && c.recentItems.length > 0 && (
                                    <span className="text-[10px] text-gray-500 truncate max-w-[200px]" title={c.recentItems.join(', ')}>
                                      {c.recentItems.slice(0, 2).join(', ')}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* View Customer Order History */}
                                  <button
                                    type="button"
                                    onClick={() => handleViewCustomerOrders(c)}
                                    className="px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-700 font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs"
                                    title="View full past orders and dishes"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                                    <span className="hidden sm:inline">Orders</span>
                                  </button>

                                  {/* Send Discount Coupon via WhatsApp */}
                                  <button
                                    type="button"
                                    onClick={() => handleShareCoupon(c, 'JANKI50')}
                                    className="px-2.5 py-1.5 rounded-lg border border-amber-200 bg-amber-50/60 hover:bg-amber-100 text-amber-800 font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs"
                                    title="Send discount coupon offer to customer"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">local_offer</span>
                                    <span className="hidden sm:inline">Coupon</span>
                                  </button>

                                  {/* Ban / Unban Button */}
                                  {c.isBanned ? (
                                    <button
                                      type="button"
                                      disabled={isActioning}
                                      onClick={() => handleUnbanCustomer(c)}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs disabled:opacity-50"
                                      title="Unban customer and clear penalty"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">lock_open</span>
                                      <span>Unban</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenBanModal(c)}
                                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[11px] flex items-center gap-1 transition-colors shadow-2xs"
                                      title="Ban customer from future orders"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">block</span>
                                      <span>Ban</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                      {customers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-gray-400">
                            {customersLoading ? 'Loading customers directory...' : 'No customers found in database.'}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold font-headline text-gray-900">Riders &amp; Delivery Fleet</h2>
                  <p className="text-xs text-gray-500">Manage delivery partners and live dispatch availability in Supabase.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setAddRiderError(null);
                      setShowAddRiderModal(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-semibold text-white flex items-center gap-1.5 shadow-2xs transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">person_add</span>
                    <span>+ Register Rider</span>
                  </button>
                  <button
                    onClick={loadRiders}
                    disabled={ridersLoading}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 border border-gray-200 flex items-center gap-1.5 shadow-2xs"
                  >
                    <ClockwiseRefreshIcon className="w-4 h-4 text-emerald-800" spinning={ridersLoading} />
                    <span>Reload</span>
                  </button>
                </div>
              </div>

              <div className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                  <thead className="bg-[#f9faf8] text-gray-600 font-bold uppercase tracking-wider text-[10px] border-b border-gray-200">
                    <tr>
                      <th className="py-3 px-4">Rider</th>
                      <th className="py-3 px-4">Phone Number</th>
                      <th className="py-3 px-4">Vehicle Number</th>
                      <th className="py-3 px-4">Duty Status</th>
                      <th className="py-3 px-4">Account Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
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
                          <button
                            type="button"
                            onClick={() => handleToggleRiderAvailability(r.id, r.isAvailable)}
                            disabled={togglingRiderId === r.id}
                            title="Click to toggle rider duty availability"
                            className={`px-2.5 py-1 rounded-full font-bold text-[10px] inline-flex items-center gap-1 transition-all ${
                              r.isAvailable
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                            } ${togglingRiderId === r.id ? 'opacity-60 cursor-wait' : ''}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${r.isAvailable ? 'bg-emerald-600' : 'bg-rose-500'}`}></span>
                            <span>{togglingRiderId === r.id ? 'Updating...' : r.isAvailable ? 'ON DUTY' : 'OFFLINE'}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold text-[10px]">
                            {r.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleToggleRiderAvailability(r.id, r.isAvailable)}
                              disabled={togglingRiderId === r.id}
                              className="px-2 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 text-[11px] font-semibold transition-colors"
                            >
                              {r.isAvailable ? 'Set Offline' : 'Set On Duty'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRider(r.id, r.name)}
                              disabled={deletingRiderId === r.id}
                              title="Delete rider from database"
                              className="w-7 h-7 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors"
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                {deletingRiderId === r.id ? 'hourglass_top' : 'delete'}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {riders.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-gray-400">
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
                    <ClockwiseRefreshIcon className="w-4 h-4 text-emerald-800" spinning={catalogLoading} />
                    <span>Reload</span>
                  </button>
                  <button
                    onClick={() => {
                      if (catalogCategories.length > 0 && !newDishCategory) {
                        setNewDishCategory(catalogCategories[0].id);
                      }
                      setDishFormError(null);
                      setDishFormSuccess(null);
                      if (!newDishPrice) setNewDishPrice('149');
                      setShowAddDishModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">add_circle</span>
                    <span>Add New Food</span>
                  </button>
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
                                  src={item.imageUrl || DEFAULT_DISH_IMAGES[item.slug] || PRESET_AUTHENTIC_DISHES[0].url}
                                  alt={item.name}
                                  className="w-full h-full object-cover object-center"
                                  onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = DEFAULT_DISH_IMAGES[item.slug] || PRESET_AUTHENTIC_DISHES[0].url;
                                  }}
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

                            <div className="flex items-center justify-between pt-3 border-t border-gray-100 gap-2">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDish(item, cat.id)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold flex items-center gap-1 transition-all shadow-2xs"
                                  title="Edit food details, image, or price"
                                >
                                  <span className="material-symbols-outlined text-[14px]">edit</span>
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDishToDelete(item)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center justify-center transition-all shadow-2xs"
                                  title="Remove food from menu"
                                >
                                  <span className="material-symbols-outlined text-[15px]">delete</span>
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[11px] font-bold ${
                                    !is86ed ? 'text-emerald-800' : 'text-stone-400'
                                  }`}
                                >
                                  {!is86ed ? 'IN STOCK' : '86 / OFF'}
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={!is86ed}
                                  onClick={() => toggleItemStock(item.id, item.name)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                                    !is86ed ? 'bg-emerald-600' : 'bg-gray-300'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition duration-200 ${
                                      !is86ed ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
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
            <main className="p-4 lg:p-6 flex flex-col gap-4 flex-1 max-w-[1200px] w-full mx-auto">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-200/80 pb-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold font-headline text-gray-900">Console Settings</h2>
                  <p className="text-xs text-gray-500">Live kitchen station operations, order dispatch preferences &amp; sound alerts</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                    isKitchenOpen ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isKitchenOpen ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`}></span>
                    <span>{isKitchenOpen ? 'Kitchen Accepting Orders' : 'Kitchen Paused'}</span>
                  </span>
                </div>
              </div>

              {/* Functional Settings Arranged Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Kitchen Station Controls */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col gap-3.5">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5 text-xs font-bold text-gray-900 uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[18px] text-emerald-700">soup_kitchen</span>
                    <span>Kitchen Operations</span>
                  </div>

                  {/* Store Status Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-gray-900">Kitchen Store Status</div>
                      <div className="text-[11px] text-gray-500">Enable or pause customer ordering on storefront</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isKitchenOpen;
                        setIsKitchenOpen(next);
                        updateSetting('isKitchenOpen', next);
                        showToast(next ? 'Kitchen opened for storefront orders' : 'Kitchen paused. Storefront orders suspended');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${
                        isKitchenOpen
                          ? 'bg-emerald-700 text-white border-emerald-800'
                          : 'bg-rose-600 text-white border-rose-700'
                      }`}
                    >
                      {isKitchenOpen ? 'Open (Online)' : 'Paused'}
                    </button>
                  </div>

                  {/* Auto-Accept Orders */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div>
                      <div className="font-bold text-xs text-gray-900">Auto-Confirm New Orders</div>
                      <div className="text-[11px] text-gray-500">Automatically move placed orders directly to cooking queue</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !autoAcceptOrders;
                        setAutoAcceptOrders(next);
                        updateSetting('autoAcceptOrders', next);
                        showToast(next ? 'Auto-confirmation enabled' : 'Manual chef confirmation enabled');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${
                        autoAcceptOrders
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {autoAcceptOrders ? 'Auto-Accept ON' : 'Manual'}
                    </button>
                  </div>
                </div>

                {/* 2. Audio Chime & Alerts */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col gap-3.5">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5 text-xs font-bold text-gray-900 uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[18px] text-amber-600">notifications_active</span>
                    <span>Sound Alerts &amp; Chimes</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-gray-900">Incoming Order Chime</div>
                      <div className="text-[11px] text-gray-500">Plays bell chime on new order arrival</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          playKitchenOrderChime();
                          showToast('Played test chime sound');
                        }}
                        className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="Test sound"
                      >
                        <span className="material-symbols-outlined text-[15px]">volume_up</span>
                        <span className="text-[10px]">Test</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = !audioEnabled;
                          setAudioEnabled(next);
                          updateSetting('audioEnabled', next);
                          if (next) playKitchenOrderChime();
                          showToast(next ? 'Order chimes turned ON' : 'Order chimes MUTED');
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs border ${
                          audioEnabled
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {audioEnabled ? 'Chime ON' : 'Muted'}
                      </button>
                    </div>
                  </div>

                  {/* Polling Interval Selection */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div>
                      <div className="font-bold text-xs text-gray-900">Auto-Refresh Interval</div>
                      <div className="text-[11px] text-gray-500">Live order polling frequency</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[5, 8, 15, 30].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => {
                            setRefreshIntervalSec(sec);
                            updateSetting('refreshIntervalSec', sec);
                            showToast(`Refresh interval set to ${sec}s`);
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                            refreshIntervalSec === sec
                              ? 'bg-emerald-800 text-white shadow-2xs'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 3. Delivery Zones & Pincode Status */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col gap-3.5">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5 text-xs font-bold text-gray-900 uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[18px] text-blue-600">local_shipping</span>
                    <span>Delivery Zone &amp; Serviceability</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-gray-900">Central Hub Kitchen</div>
                      <div className="text-[11px] text-gray-500">Sagore, Pithampur Industrial Area</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                      PIN 454774
                    </span>
                  </div>

                  <div className="bg-[#fcfdfa] p-2.5 rounded-xl border border-stone-200/80 flex items-center justify-between text-[11px]">
                    <span className="text-gray-600">Base Sagore Delivery Fee</span>
                    <span className="font-bold text-emerald-800">₹0 Free</span>
                  </div>
                </div>

                {/* 4. System Diagnostics & Cache Actions */}
                <div className="bg-white p-4 sm:p-5 rounded-2xl border border-gray-200/90 shadow-2xs flex flex-col gap-3.5">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5 text-xs font-bold text-gray-900 uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[18px] text-stone-700">database</span>
                    <span>System &amp; Database</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-gray-900">PostgreSQL Database</div>
                      <div className="text-[11px] text-gray-500">Supabase managed cloud DB</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                      <span>Connected</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                    <div>
                      <div className="font-bold text-xs text-gray-900">Purge Console Cache</div>
                      <div className="text-[11px] text-gray-500">Force re-fetch all orders &amp; riders</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        loadOrders(false);
                        loadRiders();
                        showToast('Queue & riders refreshed from server');
                      }}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      <ClockwiseRefreshIcon className="w-3.5 h-3.5 text-gray-700" spinning={loading} />
                      <span>Resync</span>
                    </button>
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
                  <div className="w-8 h-8 rounded-xl overflow-hidden bg-[#FFF9F0] border border-[#7A1E1E]/20 shadow-xs flex items-center justify-center p-0.5 shrink-0">
                    <img
                      src="/images/logo-avatar.png"
                      alt="Janki Rasoi Logo"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  </div>
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
              setOrderForRiderModal={setOrderForRiderModal}
              actionLoadingId={actionLoadingId}
              onClose={() => setDrawerOpen(false)}
              isDrawer={true}
            />
          </div>
        </div>
      )}

      {/* 4. ASSIGN RIDER MODAL */}
      {showRiderModal && (orderForRiderModal || selectedOrder) && (() => {
        const modalOrder = orderForRiderModal || selectedOrder!;
        return (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowRiderModal(false);
          }}
        >
          <div className="absolute inset-0 cursor-pointer" onClick={() => { setShowRiderModal(false); setOrderForRiderModal(null); }} />
          <div className="relative z-10 bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-gray-200 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-gray-900 font-headline">Assign Delivery Rider</h3>
                <p className="text-xs text-gray-500">Select an available rider for order #{modalOrder.orderNumber}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={loadRiders}
                  disabled={ridersLoading}
                  title="Refresh riders from database"
                  className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <ClockwiseRefreshIcon className="w-3.5 h-3.5 text-gray-700" spinning={ridersLoading} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowRiderModal(false)}
                  className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
              {ridersLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-gray-500 text-xs">
                  <span className="w-5 h-5 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin"></span>
                  <span>Fetching live fleet status...</span>
                </div>
              ) : (
                <>
                  {riders.map((r) => {
                    const isAssigningThis = assigningRiderId === r.id;
                    const isAlreadyAssigned = modalOrder?.assignedRider?.id === r.id;
                    return (
                      <div
                        key={r.id}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isAlreadyAssigned
                            ? 'border-emerald-500 bg-emerald-50/60'
                            : r.isAvailable
                            ? 'border-gray-200 bg-white hover:border-emerald-600 hover:bg-emerald-50/30'
                            : 'border-gray-200/80 bg-gray-50/40 hover:bg-gray-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${r.isAvailable ? 'bg-amber-100 text-amber-900' : 'bg-gray-200 text-gray-600'}`}>
                            <span className="material-symbols-outlined text-[18px]">two_wheeler</span>
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-xs text-gray-900 flex items-center gap-1.5 truncate">
                              <span>{r.name}</span>
                              {!r.isAvailable && (
                                <span className="text-[10px] text-gray-400 font-normal">(Offline)</span>
                              )}
                              {isAlreadyAssigned && (
                                <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded font-semibold">Already Assigned</span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono">+91 {r.phone} • {r.vehicleNumber}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                            {r.isAvailable ? 'ON DUTY' : 'OFFLINE'}
                          </span>

                          <button
                            type="button"
                            disabled={isAssigningThis || actionLoadingId === (modalOrder.id || modalOrder.orderNumber)}
                            onClick={() => handleAssignRider(modalOrder.id || modalOrder.orderNumber, r.id)}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs ${
                              isAssigningThis
                                ? 'bg-emerald-700 text-white cursor-wait opacity-80'
                                : isAlreadyAssigned
                                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                                : r.isAvailable
                                ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white'
                                : 'bg-gray-700 hover:bg-gray-800 text-white'
                            }`}
                          >
                            {isAssigningThis ? (
                              <>
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Assigning...</span>
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                                <span>{isAlreadyAssigned ? 'Already Assigned' : 'Assign'}</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {riders.length === 0 && (
                    <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-3xl text-gray-300">no_accounts</span>
                      <p className="text-xs text-gray-500">No registered delivery riders found in database.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setShowRiderModal(false);
                          setAddRiderError(null);
                          setShowAddRiderModal(true);
                        }}
                        className="mt-1 px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors"
                      >
                        + Register First Rider
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setAddRiderError(null);
                  setShowAddRiderModal(true);
                }}
                className="text-xs text-emerald-800 font-bold hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                <span>+ Register New Rider</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRiderModal(false)}
                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* 4b. REGISTER NEW RIDER MODAL */}
      {showAddRiderModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setShowAddRiderModal(false)} />
          <div className="relative z-10 bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-gray-200 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150 my-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-base text-gray-900 font-headline">Register Delivery Rider</h3>
                <p className="text-xs text-gray-500">Add a delivery partner to the live fleet database.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddRiderModal(false);
                  setAddRiderError(null);
                }}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {addRiderError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-rose-600 shrink-0">error</span>
                <span>{addRiderError}</span>
              </div>
            )}

            <form onSubmit={handleCreateRiderSubmit} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newRiderName}
                  onChange={(e) => setNewRiderName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Phone Number (10 digits)</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 9876543210"
                  value={newRiderPhone}
                  onChange={(e) => setNewRiderPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-mono focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Login Password</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 200720"
                  value={newRiderPassword}
                  onChange={(e) => setNewRiderPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-mono focus:outline-hidden focus:border-emerald-600"
                />
                <span className="text-[10px] text-gray-400 mt-0.5 block">Used by rider to log into the delivery mobile portal.</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Vehicle License Plate</label>
                <input
                  type="text"
                  placeholder="e.g. MP-09-JR-2026"
                  value={newRiderVehicle}
                  onChange={(e) => setNewRiderVehicle(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-mono uppercase focus:outline-hidden focus:border-emerald-600"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddRiderModal(false);
                    setAddRiderError(null);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addRiderLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-xs font-bold text-white shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-60"
                >
                  {addRiderLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Saving Rider...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      <span>Save &amp; Activate Rider</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. ADD NEW FOOD ITEM MODAL */}
      {showAddDishModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setShowAddDishModal(false)} />
          <div className="relative z-10 bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-950 font-headline">Add New Food Item</h3>
                <p className="text-xs text-gray-500 mt-0.5">Enter food details and image to publish immediately to the live menu.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddDishModal(false);
                  setDishFormError(null);
                  setDishFormSuccess(null);
                }}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Error & Success State Feedback */}
            {dishFormError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <span className="material-symbols-outlined text-base text-rose-600 shrink-0">error</span>
                <span>{dishFormError}</span>
              </div>
            )}
            {dishFormSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <span className="material-symbols-outlined text-base text-emerald-600 shrink-0">check_circle</span>
                <span>{dishFormSuccess}</span>
              </div>
            )}

            {/* Food Creation Form */}
            <form onSubmit={handleCreateDish} className="flex flex-col gap-3.5 text-xs">
              {/* Food Name */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  Food Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDishName}
                  onChange={(e) => {
                    setNewDishName(e.target.value);
                    if (dishFormError) setDishFormError(null);
                  }}
                  placeholder="e.g. Special Shahi Paneer Thali"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-gray-900 font-medium"
                />
              </div>

              {/* Category & Price Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Category <span className="text-rose-500">*</span></label>
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
                  <label className="block font-bold text-gray-800 mb-1">Price in ₹ (INR) <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 font-bold">₹</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      value={newDishPrice}
                      onChange={(e) => setNewDishPrice(e.target.value)}
                      placeholder="149"
                      className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-800 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Description / Details */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">Description / Details</label>
                <textarea
                  rows={2}
                  value={newDishDescription}
                  onChange={(e) => setNewDishDescription(e.target.value)}
                  placeholder="e.g. 4 Phulkas, Paneer Lababdar, Dal Tadka, Basmati Jeera Rice, Fresh Salad & Sweet"
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-800 resize-none"
                />
              </div>

              {/* Food Image Upload & Preview */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  Food Image <span className="text-gray-400 font-normal">(Upload photo or choose preset)</span>
                </label>

                {/* Image Preview Box */}
                <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden bg-stone-900 border border-stone-200 mb-2 flex items-center justify-center shadow-inner">
                  {isUploadingImage ? (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-white/90 gap-2">
                      <span className="material-symbols-outlined text-3xl text-emerald-400 animate-spin">progress_activity</span>
                      <span className="text-xs font-bold">Uploading image to secure storage...</span>
                      <span className="text-[10px] text-stone-300">Optimizing resolution for website display</span>
                    </div>
                  ) : newDishImageUrl ? (
                    <>
                      <img src={newDishImageUrl} alt="Food Preview" className="w-full h-full object-cover object-center" />
                      <div className="absolute top-2.5 left-2.5 bg-black/75 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-400 flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        <span>Photo Ready</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewDishImageUrl('')}
                        title="Remove image"
                        className="absolute bottom-2.5 right-2.5 bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-full shadow-md transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-white/80">
                      <span className="material-symbols-outlined text-3xl text-emerald-400 mb-1">add_a_photo</span>
                      <span className="text-xs font-bold">Upload Food Image</span>
                      <span className="text-[10px] text-stone-400 mt-0.5">JPG, PNG, WebP supported</span>
                    </div>
                  )}
                </div>

                {/* Upload Action Row */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className={`cursor-pointer px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 border transition-all shrink-0 ${
                      isUploadingImage
                        ? 'bg-stone-200 text-stone-500 border-stone-300 cursor-not-allowed'
                        : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-300 shadow-2xs'
                    }`}>
                      <span className="material-symbols-outlined text-[17px] text-emerald-800">cloud_upload</span>
                      <span>{isUploadingImage ? 'Uploading...' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/jpg"
                        disabled={isUploadingImage}
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>
                    <input
                      type="url"
                      value={newDishImageUrl}
                      onChange={(e) => setNewDishImageUrl(e.target.value)}
                      placeholder="or paste image URL..."
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs focus:outline-hidden focus:border-emerald-600"
                    />
                  </div>

                  {/* Authentic Dish Presets */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-gray-600 font-bold">
                      <span>Or Choose Authentic Dish Photo:</span>
                      <span className="text-emerald-700 font-medium">31 Dishes Available</span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar">
                      {PRESET_AUTHENTIC_DISHES.map((preset) => {
                        const isSelected = newDishImageUrl === preset.url;
                        return (
                          <button
                            key={preset.title}
                            type="button"
                            onClick={() => setNewDishImageUrl(preset.url)}
                            className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left shrink-0 transition-all ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-950 border-emerald-500 shadow-xs ring-1 ring-emerald-500 font-bold'
                                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200 font-medium'
                            }`}
                          >
                            <img
                              src={preset.url}
                              alt={preset.title}
                              className="w-7 h-7 rounded-lg object-cover border border-stone-200 shrink-0"
                            />
                            <span className="text-xs whitespace-nowrap">{preset.title}</span>
                            {isSelected && (
                              <span className="material-symbols-outlined text-[15px] text-emerald-700 shrink-0">check_circle</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddDishModal(false);
                    setDishFormError(null);
                    setDishFormSuccess(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDish || isUploadingImage}
                  className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-colors"
                >
                  {isSubmittingDish ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      <span>Saving Food...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">restaurant</span>
                      <span>Save &amp; Publish Food</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. EDIT FOOD ITEM MODAL */}
      {showEditDishModal && editingDish && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-4 my-auto max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-lg text-gray-950 font-headline">Edit Food Item</h3>
                <p className="text-xs text-gray-500 mt-0.5">Update dish details, price, description, or image.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditDishModal(false);
                  setEditingDish(null);
                  setEditDishError(null);
                  setEditDishSuccess(null);
                }}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Feedback Messages */}
            {editDishError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <span className="material-symbols-outlined text-base text-rose-600 shrink-0">error</span>
                <span>{editDishError}</span>
              </div>
            )}
            {editDishSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                <span className="material-symbols-outlined text-base text-emerald-600 shrink-0">check_circle</span>
                <span>{editDishSuccess}</span>
              </div>
            )}

            <form onSubmit={handleUpdateDish} className="flex flex-col gap-3.5 text-xs">
              {/* Food Name */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  Food Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editDishName}
                  onChange={(e) => {
                    setEditDishName(e.target.value);
                    if (editDishError) setEditDishError(null);
                  }}
                  placeholder="e.g. Special Shahi Paneer Thali"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-900 font-medium"
                />
              </div>

              {/* Category & Price */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-800 mb-1">Category <span className="text-rose-500">*</span></label>
                  <select
                    value={editDishCategory}
                    onChange={(e) => setEditDishCategory(e.target.value)}
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
                  <label className="block font-bold text-gray-800 mb-1">Price in ₹ (INR) <span className="text-rose-500">*</span></label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 font-bold">₹</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      value={editDishPrice}
                      onChange={(e) => setEditDishPrice(e.target.value)}
                      placeholder="149"
                      className="w-full pl-7 pr-3.5 py-2.5 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-800 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">Description / Details</label>
                <textarea
                  rows={2}
                  value={editDishDescription}
                  onChange={(e) => setEditDishDescription(e.target.value)}
                  placeholder="Details of the meal..."
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-300 focus:outline-hidden focus:border-emerald-600 text-gray-800 resize-none"
                />
              </div>

              {/* Image Upload & Preview */}
              <div>
                <label className="block font-bold text-gray-800 mb-1">
                  Food Image <span className="text-gray-400 font-normal">(Upload photo or paste URL)</span>
                </label>

                <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden bg-stone-900 border border-stone-200 mb-2 flex items-center justify-center shadow-inner">
                  {isUploadingEditImage ? (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-white/90 gap-2">
                      <span className="material-symbols-outlined text-3xl text-emerald-400 animate-spin">progress_activity</span>
                      <span className="text-xs font-bold">Uploading new photo...</span>
                    </div>
                  ) : editDishImageUrl ? (
                    <>
                      <img src={editDishImageUrl} alt="Preview" className="w-full h-full object-cover object-center" />
                      <div className="absolute top-2.5 left-2.5 bg-black/75 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-400 flex items-center gap-1 shadow-sm">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        <span>Photo Ready</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditDishImageUrl('')}
                        title="Remove image"
                        className="absolute bottom-2.5 right-2.5 bg-rose-600 hover:bg-rose-700 text-white p-1.5 rounded-full shadow-md transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center text-white/80">
                      <span className="material-symbols-outlined text-3xl text-emerald-400 mb-1">add_a_photo</span>
                      <span className="text-xs font-bold">Upload Food Image</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <label className={`cursor-pointer px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 border transition-all shrink-0 ${
                      isUploadingEditImage
                        ? 'bg-stone-200 text-stone-500 border-stone-300 cursor-not-allowed'
                        : 'bg-stone-100 hover:bg-stone-200 text-stone-800 border-stone-300 shadow-2xs'
                    }`}>
                      <span className="material-symbols-outlined text-[17px] text-emerald-800">cloud_upload</span>
                      <span>{isUploadingEditImage ? 'Uploading...' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/jpg"
                        disabled={isUploadingEditImage}
                        onChange={handleEditImageFileChange}
                        className="hidden"
                      />
                    </label>
                    <input
                      type="url"
                      value={editDishImageUrl}
                      onChange={(e) => setEditDishImageUrl(e.target.value)}
                      placeholder="or paste image URL..."
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-stone-700 text-xs focus:outline-hidden focus:border-emerald-600"
                    />
                  </div>

                  {/* Authentic Dish Presets */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-gray-600 font-bold">
                      <span>Or Choose Authentic Dish Photo:</span>
                      <span className="text-emerald-700 font-medium">31 Dishes Available</span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1 no-scrollbar">
                      {PRESET_AUTHENTIC_DISHES.map((preset) => {
                        const isSelected = editDishImageUrl === preset.url;
                        return (
                          <button
                            key={preset.title}
                            type="button"
                            onClick={() => setEditDishImageUrl(preset.url)}
                            className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-left shrink-0 transition-all ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-950 border-emerald-500 shadow-xs ring-1 ring-emerald-500 font-bold'
                                : 'bg-white hover:bg-stone-50 text-stone-700 border-stone-200 font-medium'
                            }`}
                          >
                            <img
                              src={preset.url}
                              alt={preset.title}
                              className="w-7 h-7 rounded-lg object-cover border border-stone-200 shrink-0"
                            />
                            <span className="text-xs whitespace-nowrap">{preset.title}</span>
                            {isSelected && (
                              <span className="material-symbols-outlined text-[15px] text-emerald-700 shrink-0">check_circle</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditDishModal(false);
                    setEditingDish(null);
                    setEditDishError(null);
                    setEditDishSuccess(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingDish || isUploadingEditImage}
                  className="px-5 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-colors"
                >
                  {isUpdatingDish ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      <span>Update &amp; Save Dish</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. DELETE DISH CONFIRMATION MODAL */}
      {dishToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">delete_forever</span>
            </div>

            <div>
              <h3 className="font-bold text-base text-gray-950 font-headline">Remove "{dishToDelete.name}"?</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                This will remove the food item from the active customer ordering menu. Existing order records and customer receipts will remain safely preserved in the database.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDishToDelete(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-colors text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingDish}
                onClick={handleConfirmDeleteDish}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-colors"
              >
                {isDeletingDish ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">delete</span>
                    <span>Yes, Remove Food</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4c. BAN CUSTOMER MODAL */}
      {selectedCustomerForBan && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setSelectedCustomerForBan(null)} />
          <div className="relative z-10 bg-white w-full max-w-md rounded-2xl p-5 shadow-2xl border border-gray-200 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[18px]">block</span>
                </span>
                <div>
                  <h3 className="font-bold text-base text-gray-900 font-headline">Ban Customer from Ordering</h3>
                  <p className="text-xs text-gray-500">Prevent fake orders &amp; unreachable deliveries</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomerForBan(null)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Target Profile Highlight */}
            <div className="bg-rose-50/70 border border-rose-200/80 rounded-xl p-3 flex items-center justify-between text-xs">
              <div>
                <span className="font-extrabold text-rose-950 block">{selectedCustomerForBan.name}</span>
                <span className="font-mono text-rose-800 font-bold">+91 {selectedCustomerForBan.phone}</span>
              </div>
              <span className="px-2 py-1 rounded bg-rose-200/80 text-rose-900 font-extrabold text-[11px]">
                {selectedCustomerForBan.orderCount} Past Orders
              </span>
            </div>

            {/* Quick Reason Chips */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-700">Select Ban Reason:</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Phone call nahi uthaya / Unreachable',
                  'Galat address diya tha',
                  'COD delivery par paise nahi diye',
                  'Fake / Prank order tha',
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setBanReason(reason)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                      banReason === reason
                        ? 'bg-rose-700 text-white border-rose-700 shadow-2xs font-bold'
                        : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Reason Input */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Ban Reason / Explanation (Shown on Customer Lock Window):</span>
                <span className="text-[10px] text-gray-400">Editable / Custom</span>
              </label>
              <textarea
                rows={2}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Enter specific ban reason (e.g. Rider called 5 times, customer switched off phone)..."
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs text-gray-800 focus:outline-hidden focus:border-rose-600 resize-none font-medium leading-relaxed"
              />
              <p className="text-[10px] text-gray-400">
                Yeh reason customer ki storefront lock window par dikhai dega taaki unhe pata chale kyu restrict kiya gaya.
              </p>
            </div>

            {/* Penalty Amount to Settle */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                <span>Loss / Settlement Penalty (₹):</span>
                <span className="text-[11px] font-normal text-gray-500">Amount required to unban</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-500 text-xs">₹</span>
                <input
                  type="number"
                  value={banPenaltyAmount}
                  onChange={(e) => setBanPenaltyAmount(e.target.value)}
                  placeholder="250"
                  className="w-full pl-7 pr-3 py-2 rounded-xl border border-gray-200 text-xs font-mono font-bold text-gray-800 focus:outline-hidden focus:border-rose-600"
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Jab yeh customer apna pending recovery bill (₹{banPenaltyAmount || '0'}) settle kar dega, account automatically unban ho jayega.
              </p>
            </div>

            {/* Statutory Legal Protection Citation */}
            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-2 text-[11px] text-amber-950">
              <span className="material-symbols-outlined text-base text-amber-800 shrink-0">gavel</span>
              <div className="leading-tight">
                <strong>Legal Protection:</strong> Indian Contract Act, 1872 (Section 73) &amp; Consumer Protection (E-Commerce) Rules, 2020 allow fresh perishable food preparation &amp; dispatch loss recovery for unfulfilled COD orders.
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setSelectedCustomerForBan(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isBanningCustomer}
                onClick={handleConfirmBanCustomer}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 transition-colors"
              >
                {isBanningCustomer ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    <span>Blocking Customer...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">lock</span>
                    <span>Confirm &amp; Ban Customer</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4d. CUSTOMER ORDER HISTORY MODAL */}
      {viewingCustomerOrders && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="absolute inset-0 cursor-pointer" onClick={() => setViewingCustomerOrders(null)} />
          <div className="relative z-10 bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl p-5 shadow-2xl border border-gray-200 flex flex-col gap-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-hidden my-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-900 font-extrabold flex items-center justify-center text-sm shadow-2xs">
                  {getInitials(viewingCustomerOrders.customer.name)}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-gray-900 font-headline">
                      {viewingCustomerOrders.customer.name}
                    </h3>
                    {viewingCustomerOrders.customer.segment === 'VIP' && (
                      <span className="px-2 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                        👑 VIP CUSTOMER
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono">
                    +91 {viewingCustomerOrders.customer.phone} • Lifetime GMV: ₹{((viewingCustomerOrders.customer.totalSpendPaise || 0) / 100).toFixed(2)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingCustomerOrders(null)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Orders List */}
            <div className="flex flex-col gap-3 overflow-y-auto pr-1 flex-1">
              {viewingCustomerOrders.loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-500 text-xs">
                  <span className="w-6 h-6 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin"></span>
                  <span>Fetching customer order timeline...</span>
                </div>
              ) : viewingCustomerOrders.orders.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-xs">
                  No orders recorded yet for this customer.
                </div>
              ) : (
                viewingCustomerOrders.orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-3.5 rounded-2xl border border-gray-200/90 hover:border-gray-300 bg-[#FFFDF9] flex flex-col gap-2 transition-all shadow-2xs"
                  >
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-gray-900">#{ord.orderNumber}</span>
                        <span className="text-[11px] text-gray-500">{formatOrderDate(ord.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                            ord.status === 'DELIVERED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ord.status === 'CANCELLED'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {ord.status}
                        </span>
                        <span className="font-mono font-bold text-gray-900">
                          ₹{(ord.totalAmountPaise / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Ordered Items List */}
                    <div className="flex flex-col divide-y divide-gray-100/80 text-xs">
                      {ord.items.map((it, iIdx) => (
                        <div key={iIdx} className="py-1.5 flex items-center justify-between">
                          <span className="font-semibold text-gray-800">
                            {it.quantity}x {it.name}
                            {it.variant && <span className="text-gray-500 text-[11px] ml-1">({it.variant})</span>}
                          </span>
                          {it.totalPricePaise ? (
                            <span className="font-mono text-gray-700">₹{(it.totalPricePaise / 100).toFixed(0)}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>

                    {/* Delivery Address & Mode */}
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                      <div className="truncate max-w-[320px]">
                        📍{' '}
                        {typeof ord.deliveryAddress === 'string'
                          ? ord.deliveryAddress
                          : ord.deliveryAddress?.flat
                          ? `${ord.deliveryAddress.flat}, ${ord.deliveryAddress.street || ''}`
                          : 'Customer Address'}
                      </div>
                      <span className="font-bold text-gray-700 shrink-0">
                        {ord.paymentMethod === 'COD' ? '💵 Cash on Delivery' : '💳 Paid Online'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between shrink-0">
              <span className="text-xs text-gray-500 font-medium">
                Total {viewingCustomerOrders.orders.length} order records found
              </span>
              <button
                type="button"
                onClick={() => setViewingCustomerOrders(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
              >
                Close History
              </button>
            </div>
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
