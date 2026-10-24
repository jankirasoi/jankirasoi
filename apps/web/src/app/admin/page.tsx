'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api, AdminOrder, UserProfile } from '../../lib/api';

type StatusFilter =
  | 'ALL'
  | 'PENDING_ACCEPTANCE'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export default function AdminPage() {
  // Authentication state
  const [adminUser, setAdminUser] = useState<UserProfile | null>(null);
  const [emailInput, setEmailInput] = useState('admin@jankirasoi.in');
  const [passwordInput, setPasswordInput] = useState('AdminPassword123!');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Orders and KDS state
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  // Rider assignment state
  const [riders, setRiders] = useState<Array<{ id: string; name: string; phone: string; vehicleNumber?: string; isAvailable?: boolean }>>([]);
  const [assigningOrderId, setAssigningOrderId] = useState<string | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<string>('');
  const [isAssigning, setIsAssigning] = useState(false);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isToastError, setIsToastError] = useState(false);

  const showToast = useCallback((msg: string, isError = false) => {
    setToastMessage(msg);
    setIsToastError(isError);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Check stored admin session on mount
  useEffect(() => {
    try {
      const storedProfile = localStorage.getItem('jr_admin_profile');
      const storedToken = localStorage.getItem('jr_admin_token');
      if (storedProfile && storedToken) {
        const parsed = JSON.parse(storedProfile);
        setAdminUser(parsed);
      }
    } catch (e) {
      console.warn('Could not read admin profile from localStorage', e);
    }
  }, []);

  // Fetch admin orders
  const loadOrders = useCallback(async (quiet = false) => {
    if (!quiet) setLoadingOrders(true);
    try {
      const res = await api.getAdminOrders();
      setOrders(res.orders || []);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      console.error('Failed to load admin orders', err);
      if (!quiet) showToast(err.message || 'Failed to load kitchen orders queue', true);
    } finally {
      if (!quiet) setLoadingOrders(false);
    }
  }, [showToast]);

  // Fetch riders list
  const loadRiders = useCallback(async () => {
    try {
      const res = await api.getAdminRiders();
      setRiders(res.riders || []);
    } catch (err) {
      console.warn('Could not load riders list', err);
    }
  }, []);

  // Auto-refresh orders every 15s if logged in
  useEffect(() => {
    if (!adminUser) return;
    loadOrders();
    loadRiders();

    const interval = setInterval(() => {
      loadOrders(true);
    }, 15000);

    return () => clearInterval(interval);
  }, [adminUser, loadOrders, loadRiders]);

  // Handle Admin Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) {
      setLoginError('Please enter both email and password.');
      return;
    }

    setLoginLoading(true);
    setLoginError(null);
    try {
      const session = await api.loginAdmin(emailInput.trim(), passwordInput);
      setAdminUser(session.user);
      showToast(`Welcome back, ${session.user.name || 'Admin'}!`);
      loadOrders();
      loadRiders();
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('jr_admin_token');
    localStorage.removeItem('jr_admin_profile');
    setAdminUser(null);
    setOrders([]);
    showToast('Logged out of Admin Console.');
  };

  // Handle Order Status Update
  const handleUpdateStatus = async (orderId: string, newStatus: string, reason?: string) => {
    try {
      await api.updateOrderStatus(orderId, newStatus, reason);
      showToast(`Order status updated to ${newStatus}`);
      loadOrders(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to update order status', true);
    }
  };

  // Handle Rider Assignment
  const handleAssignRider = async () => {
    if (!assigningOrderId || !selectedRiderId) return;
    setIsAssigning(true);
    try {
      await api.assignRider(assigningOrderId, selectedRiderId);
      showToast('Rider assigned successfully!');
      setAssigningOrderId(null);
      setSelectedRiderId('');
      loadOrders(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to assign rider', true);
    } finally {
      setIsAssigning(false);
    }
  };

  // Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Status filter
      if (statusFilter !== 'ALL' && o.status !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchNumber = o.orderNumber?.toLowerCase().includes(query);
        const matchName = o.customerName?.toLowerCase().includes(query);
        const matchPhone = o.customerPhone?.includes(query);
        return matchNumber || matchName || matchPhone;
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  // Shift KPIs
  const kpis = useMemo(() => {
    const totalCount = orders.length;
    const activeCount = orders.filter(
      (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
    ).length;
    const preparingCount = orders.filter((o) => o.status === 'PREPARING').length;
    const readyCount = orders.filter(
      (o) => o.status === 'READY_FOR_PICKUP' || o.status === 'OUT_FOR_DELIVERY'
    ).length;
    const totalRevenuePaise = orders
      .filter((o) => o.status !== 'CANCELLED')
      .reduce((sum, o) => sum + (o.totalAmountPaise || 0), 0);

    return {
      totalCount,
      activeCount,
      preparingCount,
      readyCount,
      totalRevenuePaise,
    };
  }, [orders]);

  // Helper for Status Badge Color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_ACCEPTANCE':
        return {
          bg: 'bg-amber-100 text-amber-900 border-amber-300',
          dot: 'bg-amber-500 animate-ping',
          label: 'New Order',
        };
      case 'CONFIRMED':
        return {
          bg: 'bg-blue-100 text-blue-900 border-blue-300',
          dot: 'bg-blue-500',
          label: 'Confirmed',
        };
      case 'PREPARING':
        return {
          bg: 'bg-orange-100 text-orange-900 border-orange-300',
          dot: 'bg-orange-500 animate-pulse',
          label: 'In Kitchen (Cooking)',
        };
      case 'READY_FOR_PICKUP':
        return {
          bg: 'bg-purple-100 text-purple-900 border-purple-300',
          dot: 'bg-purple-500',
          label: 'Ready for Pickup',
        };
      case 'OUT_FOR_DELIVERY':
        return {
          bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          dot: 'bg-emerald-500 animate-pulse',
          label: 'Out with Rider',
        };
      case 'DELIVERED':
        return {
          bg: 'bg-green-100 text-green-900 border-green-300',
          dot: 'bg-green-600',
          label: 'Delivered',
        };
      case 'CANCELLED':
        return {
          bg: 'bg-red-100 text-red-900 border-red-300',
          dot: 'bg-red-500',
          label: 'Cancelled',
        };
      default:
        return {
          bg: 'bg-slate-100 text-slate-800 border-slate-300',
          dot: 'bg-slate-400',
          label: status,
        };
    }
  };

  // Helper to format delivery address
  const formatAddress = (addr: any) => {
    if (!addr) return 'Address not provided';
    if (typeof addr === 'string') return addr;
    const parts = [addr.flat, addr.street, addr.landmark, addr.pincode].filter(Boolean);
    return parts.join(', ');
  };

  return (
    <div className="min-h-screen bg-[#FFF9F0] text-slate-900 flex flex-col font-sans">
      {/* 1. Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-amber-200/60 shadow-xs px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="w-9 h-9 rounded-full bg-[#1D5C34] text-white flex items-center justify-center font-bold text-sm shadow-xs group-hover:scale-105 transition-transform">
                JR
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
                    Janki Rasoi Admin
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E99A32]/20 text-[#875200] border border-[#E99A32]/40">
                    KDS Console
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">Live Kitchen Dispatch &amp; Operations</p>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {adminUser && (
              <>
                <button
                  type="button"
                  onClick={() => loadOrders(false)}
                  disabled={loadingOrders}
                  className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Refresh orders queue"
                >
                  <span className={`material-symbols-outlined text-[16px] ${loadingOrders ? 'animate-spin' : ''}`}>
                    refresh
                  </span>
                  <span className="hidden sm:inline">Refresh</span>
                </button>

                <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-full border border-amber-200 text-xs text-amber-900 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>{adminUser.name || 'Admin'}</span>
                </div>

                <Link
                  href="/rider"
                  className="px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 border border-emerald-200 flex items-center gap-1 transition-colors"
                  title="Open Rider Partner Console"
                >
                  <span className="material-symbols-outlined text-[16px]">two_wheeler</span>
                  <span className="hidden sm:inline">Rider App</span>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 rounded-full bg-red-50 hover:bg-red-100 text-xs font-bold text-red-700 border border-red-200 transition-colors"
                >
                  Logout
                </button>
              </>
            )}

            {!adminUser && (
              <Link
                href="/"
                className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors"
              >
                Storefront
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-3 sm:px-4 py-5 flex flex-col gap-5">
        {/* LOGIN SCREEN IF NOT AUTHENTICATED */}
        {!adminUser ? (
          <div className="flex-1 flex items-center justify-center py-10 px-4">
            <div className="bg-white rounded-3xl shadow-xl border border-amber-100 p-6 sm:p-8 max-w-md w-full flex flex-col gap-5">
              <div className="text-center flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-[#1D5C34] text-white flex items-center justify-center font-bold text-xl shadow-md">
                  <span className="material-symbols-outlined text-[28px]">admin_panel_settings</span>
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">Admin &amp; Kitchen Login</h2>
                <p className="text-xs text-slate-500">
                  Secure access for kitchen dispatchers, managers, and staff
                </p>
              </div>

              {loginError && (
                <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-3 flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] text-red-500 shrink-0">error</span>
                  <span className="font-medium">{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700">Staff Email Address</label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    required
                    placeholder="admin@jankirasoi.in"
                    className="h-11 px-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1D5C34] bg-slate-50/50"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700">Password</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    className="h-11 px-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1D5C34] bg-slate-50/50"
                  />
                </div>

                {/* Pre-fill Demo Admin button */}
                <button
                  type="button"
                  onClick={() => {
                    setEmailInput('admin@jankirasoi.in');
                    setPasswordInput('AdminPassword123!');
                  }}
                  className="text-xs text-[#1D5C34] hover:underline font-bold text-left self-start flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">key</span>
                  <span>Use Default Admin Credentials</span>
                </button>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="mt-2 h-12 rounded-xl bg-[#1D5C34] hover:bg-[#154627] active:scale-98 text-white font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loginLoading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                      <span>Verifying Session...</span>
                    </>
                  ) : (
                    <>
                      <span>Login to Console</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>

              <div className="border-t border-slate-100 pt-3 text-center">
                <span className="text-[11px] text-slate-400">
                  Credentials: <strong className="text-slate-600">admin@jankirasoi.in</strong> / <strong className="text-slate-600">AdminPassword123!</strong>
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED ADMIN DASHBOARD */
          <>
            {/* Shift KPI Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white rounded-2xl p-4 shadow-2xs border border-amber-100 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active in Kitchen</span>
                  <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">restaurant</span>
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">{kpis.activeCount}</span>
                  <span className="text-xs text-amber-700 font-bold">Orders live</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-2xs border border-amber-100 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shift Revenue</span>
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">payments</span>
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">
                    ₹{(kpis.totalRevenuePaise / 100).toFixed(0)}
                  </span>
                  <span className="text-xs text-emerald-700 font-bold">Gross</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-2xs border border-amber-100 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ready / Out</span>
                  <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">delivery_dining</span>
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">{kpis.readyCount}</span>
                  <span className="text-xs text-purple-700 font-bold">Dispatching</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-2xs border border-amber-100 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Shift Orders</span>
                  <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  </div>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-black text-slate-900">{kpis.totalCount}</span>
                  <span className="text-xs text-blue-700 font-bold">Total</span>
                </div>
              </div>
            </div>

            {/* Filter Bar & Search */}
            <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-2xs border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Status Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                {(
                  [
                    ['ALL', 'All'],
                    ['PENDING_ACCEPTANCE', 'New'],
                    ['CONFIRMED', 'Confirmed'],
                    ['PREPARING', 'In Kitchen'],
                    ['READY_FOR_PICKUP', 'Ready'],
                    ['OUT_FOR_DELIVERY', 'Out with Rider'],
                    ['DELIVERED', 'Delivered'],
                    ['CANCELLED', 'Cancelled'],
                  ] as const
                ).map(([key, label]) => {
                  const isActive = statusFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStatusFilter(key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                        isActive
                          ? 'bg-[#1D5C34] text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Search input */}
              <div className="relative min-w-[220px]">
                <span className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by Order # or Phone"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-full border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:border-[#1D5C34]"
                />
              </div>
            </div>

            {/* Orders Feed */}
            {loadingOrders && orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 bg-white rounded-3xl border border-amber-100">
                <span className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3"></span>
                <p className="text-xs font-bold text-slate-500">Loading live kitchen orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-amber-100 flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mb-1">
                  <span className="material-symbols-outlined text-[28px]">soup_kitchen</span>
                </div>
                <h3 className="font-extrabold text-base text-slate-800">No Orders in this queue</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  {statusFilter === 'ALL'
                    ? 'No orders have been received yet for today.'
                    : `No orders currently matching status: ${statusFilter}.`}
                </p>
                <button
                  type="button"
                  onClick={() => loadOrders(false)}
                  className="mt-3 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Check Server Again</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrders.map((order) => {
                  const badge = getStatusBadge(order.status);
                  const isPending = order.status === 'PENDING_ACCEPTANCE';
                  const isConfirmed = order.status === 'CONFIRMED';
                  const isPreparing = order.status === 'PREPARING';
                  const isReady = order.status === 'READY_FOR_PICKUP';
                  const isOut = order.status === 'OUT_FOR_DELIVERY';

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl border border-amber-100/90 shadow-2xs hover:shadow-md transition-shadow flex flex-col overflow-hidden"
                    >
                      {/* Order Card Header */}
                      <div className="p-4 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-900 tracking-tight">
                              #{order.orderNumber}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              {order.slotLabel || 'Regular'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <div className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border flex items-center gap-1.5 shrink-0 ${badge.bg}`}>
                          <span className={`w-2 h-2 rounded-full ${badge.dot}`}></span>
                          <span>{badge.label}</span>
                        </div>
                      </div>

                      {/* Customer & Address Details */}
                      <div className="p-4 flex flex-col gap-2.5 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-extrabold text-xs text-slate-900 block">
                              {order.customerName}
                            </span>
                            <a
                              href={`tel:${order.customerPhone}`}
                              className="text-[11px] text-emerald-700 font-bold hover:underline flex items-center gap-0.5 mt-0.5"
                            >
                              <span className="material-symbols-outlined text-[12px]">call</span>
                              <span>{order.customerPhone}</span>
                            </a>
                          </div>

                          <div className="text-right">
                            <span className="font-black text-sm text-slate-900 block">
                              ₹{((order.totalAmountPaise || 0) / 100).toFixed(0)}
                            </span>
                            <span className="text-[10px] text-slate-500 uppercase font-semibold">
                              {order.paymentMethod === 'COD' ? 'Pay on Delivery' : 'Online Paid'}
                            </span>
                          </div>
                        </div>

                        {/* Address */}
                        <div className="bg-amber-50/50 rounded-xl p-2.5 text-[11px] text-slate-600 border border-amber-100/60 flex items-start gap-1.5">
                          <span className="material-symbols-outlined text-[15px] text-amber-700 shrink-0 mt-0.5">
                            location_on
                          </span>
                          <span className="line-clamp-2 leading-relaxed">
                            {formatAddress(order.deliveryAddress)}
                          </span>
                        </div>

                        {/* Items list */}
                        <div className="border-t border-slate-100 pt-2 flex flex-col gap-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                            Order Items ({order.items?.length || 0})
                          </span>

                          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto pr-1">
                            {order.items && order.items.length > 0 ? (
                              order.items.map((it) => (
                                <div key={it.id} className="flex justify-between items-center text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-slate-900 text-xs">{it.quantity}x</span>
                                    <span className="text-slate-700 font-medium">{it.productName}</span>
                                    {it.variantName && (
                                      <span className="text-[10px] text-slate-500">({it.variantName})</span>
                                    )}
                                  </div>
                                  <span className="text-slate-500 text-xs">
                                    ₹{((it.totalPricePaise || 0) / 100).toFixed(0)}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400 italic">Item details in order note</span>
                            )}
                          </div>
                        </div>

                        {/* Assigned Rider Indicator */}
                        {order.assignedRider ? (
                          <div className="mt-1 flex items-center justify-between p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-xs">
                            <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">two_wheeler</span>
                              <span>Rider: {order.assignedRider.name}</span>
                            </span>
                            <a
                              href={`tel:${order.assignedRider.phone}`}
                              className="text-[11px] text-emerald-700 font-bold hover:underline"
                            >
                              {order.assignedRider.phone}
                            </a>
                          </div>
                        ) : null}
                      </div>

                      {/* Action Buttons */}
                      <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                        {isPending && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(order.id, 'CONFIRMED')}
                              className="flex-1 h-9 rounded-xl bg-[#1D5C34] hover:bg-[#154627] text-white text-xs font-bold transition-colors shadow-xs"
                            >
                              Accept Order
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(order.id, 'CANCELLED', 'Kitchen capacity full')}
                              className="px-3 h-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition-colors border border-red-200"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {isConfirmed && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(order.id, 'PREPARING')}
                            className="flex-1 h-9 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">skillet</span>
                            <span>Start Cooking</span>
                          </button>
                        )}

                        {isPreparing && (
                          <button
                            type="button"
                            onClick={() => handleUpdateStatus(order.id, 'READY_FOR_PICKUP')}
                            className="flex-1 h-9 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
                          >
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            <span>Mark Food Ready</span>
                          </button>
                        )}

                        {isReady && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningOrderId(order.id);
                                if (riders.length > 0) setSelectedRiderId(riders[0].id);
                              }}
                              className="flex-1 h-9 rounded-xl bg-[#1D5C34] hover:bg-[#154627] text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-[16px]">two_wheeler</span>
                              <span>{order.assignedRider ? 'Reassign Rider' : 'Assign Rider'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(order.id, 'OUT_FOR_DELIVERY')}
                              className="px-3 h-9 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold transition-colors"
                            >
                              Dispatch
                            </button>
                          </>
                        )}

                        {isOut && (
                          <button
                            type="button"
                            onClick={() => {
                              const reason = prompt('Administrative delivery override reason (e.g. customer confirmed delivery):');
                              if (reason) {
                                api.overrideDelivery(order.id, reason).then(() => {
                                  showToast('Order marked delivered via admin override.');
                                  loadOrders(true);
                                }).catch((e) => showToast(e.message, true));
                              }
                            }}
                            className="flex-1 h-9 rounded-xl bg-green-700 hover:bg-green-800 text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[16px]">verified</span>
                            <span>Emergency Deliver Override</span>
                          </button>
                        )}

                        {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && (
                          <button
                            type="button"
                            onClick={() => {
                              const reason = prompt('Cancellation reason:');
                              if (reason) handleUpdateStatus(order.id, 'CANCELLED', reason);
                            }}
                            className="px-2.5 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-bold transition-colors"
                            title="Cancel Order"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Rider Assignment Modal Popup */}
      {assigningOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4 border border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[22px] text-[#1D5C34]">two_wheeler</span>
                <h3 className="font-extrabold text-base text-slate-900">Assign Delivery Rider</h3>
              </div>
              <button
                type="button"
                onClick={() => setAssigningOrderId(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Select an available rider for order #{orders.find((o) => o.id === assigningOrderId)?.orderNumber}.
            </p>

            {riders.length === 0 ? (
              <div className="p-4 bg-amber-50 rounded-2xl text-xs text-amber-800 font-medium">
                No active riders currently registered. You can dispatch orders with default partner.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {riders.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all ${
                      selectedRiderId === r.id
                        ? 'border-[#1D5C34] bg-emerald-50/50 shadow-xs'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name="rider_select"
                        value={r.id}
                        checked={selectedRiderId === r.id}
                        onChange={() => setSelectedRiderId(r.id)}
                        className="text-[#1D5C34] focus:ring-[#1D5C34]"
                      />
                      <div>
                        <span className="font-bold text-xs text-slate-900 block">{r.name}</span>
                        <span className="text-[10px] text-slate-500">{r.phone} • {r.vehicleNumber || 'Bike'}</span>
                      </div>
                    </div>
                    {r.isAvailable && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-800">
                        Available
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAssigningOrderId(null)}
                className="flex-1 h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignRider}
                disabled={isAssigning || riders.length === 0}
                className="flex-1 h-11 rounded-xl bg-[#1D5C34] hover:bg-[#154627] text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isAssigning ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            backgroundColor: isToastError ? '#B91C1C' : '#0F172A',
            color: '#FFFFFF',
          }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold shadow-2xl transition-all flex items-center gap-2 max-w-[90vw] border border-white/20 backdrop-blur-md pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <span
            className={`material-symbols-outlined text-[18px] shrink-0 ${
              isToastError ? 'text-red-300' : 'text-emerald-400'
            }`}
          >
            {isToastError ? 'error' : 'check_circle'}
          </span>
          <span className="text-white font-bold tracking-tight truncate">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
