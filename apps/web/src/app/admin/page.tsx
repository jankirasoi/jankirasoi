'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, AdminOrder, UserProfile } from '../../lib/api';

export default function AdminPortalPage() {
  // Auth state
  const [adminUser, setAdminUser] = useState<UserProfile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Login form state
  const [email, setEmail] = useState('admin@jankirasoi.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Orders dashboard state
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PLACED' | 'PREPARING' | 'OUT_FOR_DELIVERY' | 'DELIVERED'>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Check auth on load
  const verifyAuth = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const user = await api.getCurrentUser('ADMIN');
      if (user && (user.role === 'ADMIN' || user.role === 'STAFF')) {
        setAdminUser(user);
      } else {
        setAdminUser(null);
      }
    } catch {
      setAdminUser(null);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  // Load orders
  const loadOrders = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingOrders(true);
    try {
      const res = await api.getAdminOrders();
      const list = res?.orders || [];
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(list);
      setLastRefreshed(new Date());
    } catch (err: any) {
      if (!isSilent) {
        showToast(err.message || 'Failed to fetch kitchen orders');
      }
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    if (adminUser) {
      loadOrders();
      const interval = setInterval(() => {
        loadOrders(true);
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [adminUser, loadOrders]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setLoginError('Please enter both admin email and password.');
      return;
    }

    setLoginLoading(true);
    setLoginError(null);

    try {
      const res = await api.loginAdmin(email, password);
      if (res?.user) {
        setAdminUser(res.user);
        showToast('Admin login successful!');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Invalid admin credentials. Please check and try again.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    await api.logoutAdmin();
    setAdminUser(null);
    setOrders([]);
    showToast('Signed out successfully.');
  };

  // Handle Order Status Transitions
  const handleStatusChange = async (orderId: string, nextStatus: string) => {
    setActionLoadingId(orderId);
    try {
      await api.updateOrderStatus(orderId, nextStatus);
      showToast(`Order status updated to ${nextStatus}`);
      await loadOrders(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to update order status');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Format currency
  const formatRupees = (paise?: number) => {
    if (typeof paise !== 'number') return '₹0';
    return `₹${Math.round(paise / 100)}`;
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PLACED') return o.status === 'PLACED' || o.status === 'PENDING_PAYMENT' || o.status === 'ACCEPTED';
    if (activeTab === 'PREPARING') return o.status === 'PREPARING' || o.status === 'READY_FOR_PICKUP';
    if (activeTab === 'OUT_FOR_DELIVERY') return o.status === 'OUT_FOR_DELIVERY';
    if (activeTab === 'DELIVERED') return o.status === 'DELIVERED';
    return true;
  });

  // Loading state
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#FFF9F0] flex flex-col items-center justify-center p-6 text-slate-800">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-bold text-slate-600 tracking-wider uppercase">Verifying Kitchen Staff Credentials...</p>
      </div>
    );
  }

  // 1. LOGIN SCREEN (When not authenticated)
  if (!adminUser) {
    return (
      <div className="min-h-screen bg-[#FFF9F0] text-slate-800 flex flex-col justify-between p-4 sm:p-6 font-sans">
        <header className="max-w-md mx-auto w-full flex items-center justify-between py-4">
          <Link href="/" className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-800 transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to Storefront</span>
          </Link>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
            <span>Authorized Access Only</span>
          </div>
        </header>

        <main className="max-w-md mx-auto w-full my-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-amber-200/80 flex flex-col gap-6">
            <div className="text-center flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-2xl bg-[#1D5C34] text-white flex items-center justify-center shadow-md">
                <span className="material-symbols-outlined text-[36px]">shield_person</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
                Janki Rasoi Admin
              </h1>
              <p className="text-xs text-slate-500 max-w-xs">
                Sagore Tiffin Center &amp; Kitchen Management Operations Console
              </p>
            </div>

            {loginError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] shrink-0 text-rose-600">error</span>
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Admin Email
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
                    alternate_email
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@jankirasoi.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-[#1D5C34] focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Security Password
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
                    lock
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter admin password"
                    className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 focus:border-[#1D5C34] focus:ring-2 focus:ring-emerald-500/20 text-sm font-medium outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full mt-2 py-3.5 px-6 rounded-xl bg-[#1D5C34] hover:bg-[#164828] text-white font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loginLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Admin Portal</span>
                    <span className="material-symbols-outlined text-[18px]">lock_open</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100 flex flex-col items-center gap-1.5 text-[11px] text-slate-400 text-center">
              <span className="flex items-center gap-1 font-semibold text-slate-500">
                <span className="material-symbols-outlined text-[14px] text-emerald-600">verified_user</span>
                256-Bit SSL Encrypted Session
              </span>
              <span>Sagore &amp; Pithampur Kitchen Operations</span>
            </div>
          </div>
        </main>

        <footer className="text-center py-4 text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Janki Rasoi Sagore. All rights reserved.
        </footer>
      </div>
    );
  }

  // 2. AUTHENTICATED ADMIN DASHBOARD
  return (
    <div className="min-h-screen bg-[#FFF9F0] text-slate-800 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[16px] text-emerald-400">info</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-white border-b border-amber-200/80 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#1D5C34] text-white flex items-center justify-center shadow-xs">
            <span className="material-symbols-outlined text-[22px]">restaurant</span>
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
              Janki Rasoi • Kitchen Operations
            </h1>
            <p className="text-[11px] text-slate-500">
              Sagore Tiffin Center Admin Console
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex flex-col text-right">
            <span className="text-xs font-bold text-slate-800">{adminUser.name || 'Janki Rasoi Admin'}</span>
            <span className="text-[10px] text-slate-500">{adminUser.email}</span>
          </div>

          <button
            onClick={() => loadOrders(false)}
            disabled={loadingOrders}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="Refresh Orders"
          >
            <span className={`material-symbols-outlined text-[16px] ${loadingOrders ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <a
            href="http://localhost:3002"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-2 rounded-xl transition-colors border border-amber-300/60"
            title="Open Dedicated Kitchen Display (Port 3002)"
          >
            <span className="material-symbols-outlined text-[16px]">desktop_windows</span>
            <span>Dedicated KDS (3002)</span>
          </a>

          <button
            onClick={handleLogout}
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors border border-rose-200"
            title="Sign Out"
          >
            <span className="material-symbols-outlined text-[16px]">logout</span>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Metric Cards Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Orders</span>
            <span className="text-2xl font-black text-slate-900 mt-1">{orders.length}</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">New / To Accept</span>
            <span className="text-2xl font-black text-amber-600 mt-1">
              {orders.filter((o) => o.status === 'PLACED' || o.status === 'PENDING_PAYMENT').length}
            </span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Cooking / In-Kitchen</span>
            <span className="text-2xl font-black text-blue-600 mt-1">
              {orders.filter((o) => o.status === 'PREPARING' || o.status === 'ACCEPTED').length}
            </span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs flex flex-col">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Delivered Today</span>
            <span className="text-2xl font-black text-emerald-600 mt-1">
              {orders.filter((o) => o.status === 'DELIVERED').length}
            </span>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-amber-200/80">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ALL', 'PLACED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab
                    ? 'bg-[#1D5C34] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab === 'ALL' && `All (${orders.length})`}
                {tab === 'PLACED' && `New / Placed (${orders.filter((o) => o.status === 'PLACED' || o.status === 'PENDING_PAYMENT' || o.status === 'ACCEPTED').length})`}
                {tab === 'PREPARING' && `Kitchen Prep (${orders.filter((o) => o.status === 'PREPARING' || o.status === 'READY_FOR_PICKUP').length})`}
                {tab === 'OUT_FOR_DELIVERY' && `Out for Delivery (${orders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length})`}
                {tab === 'DELIVERED' && `Delivered (${orders.filter((o) => o.status === 'DELIVERED').length})`}
              </button>
            ))}
          </div>

          <div className="text-[11px] text-slate-400 font-medium">
            Updated: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>

        {/* Orders Listing */}
        {loadingOrders && orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-amber-200/80 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-3 text-xs font-bold text-slate-500">Loading live orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-amber-200/80 flex flex-col items-center justify-center">
            <span className="material-symbols-outlined text-[48px] text-slate-300">receipt_long</span>
            <p className="mt-2 text-sm font-bold text-slate-700">No orders in this view</p>
            <p className="text-xs text-slate-400 mt-1">New incoming customer orders will automatically appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const isLoading = actionLoadingId === order.id;
              const addrStr = typeof order.deliveryAddress === 'string'
                ? order.deliveryAddress
                : [order.deliveryAddress?.flat, order.deliveryAddress?.street, order.deliveryAddress?.landmark, order.deliveryAddress?.pincode].filter(Boolean).join(', ');

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border border-amber-200/90 shadow-sm p-4 flex flex-col justify-between gap-3 hover:shadow-md transition-shadow"
                >
                  {/* Order Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 text-[#7A1E1E]">
                          {order.orderNumber}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-800 mt-1.5">
                        {order.customerName || 'Customer'}
                      </h3>
                      <a
                        href={`tel:${order.customerPhone}`}
                        className="text-xs text-emerald-700 font-semibold hover:underline flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[13px]">phone</span>
                        <span>{order.customerPhone}</span>
                      </a>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        order.status === 'DELIVERED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.status === 'OUT_FOR_DELIVERY'
                          ? 'bg-purple-100 text-purple-800'
                          : order.status === 'PREPARING'
                          ? 'bg-blue-100 text-blue-800'
                          : order.status === 'ACCEPTED'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Order Address */}
                  {addrStr && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl flex items-start gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-slate-400 shrink-0 mt-0.5">location_on</span>
                      <span className="line-clamp-2">{addrStr}</span>
                    </div>
                  )}

                  {/* Items List */}
                  <div className="flex flex-col gap-1 text-xs">
                    {order.items && order.items.length > 0 ? (
                      order.items.map((it, idx) => (
                        <div key={idx} className="flex items-center justify-between text-slate-700">
                          <span className="font-medium">
                            {it.quantity}x {it.productName}
                          </span>
                          <span className="text-slate-500 font-semibold">
                            {formatRupees(it.totalPricePaise)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">Order details recorded</span>
                    )}
                  </div>

                  {/* Total & Action Bar */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Total</span>
                      <span className="text-base font-black text-slate-900">
                        {formatRupees(order.totalAmountPaise)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {order.status === 'PLACED' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusChange(order.id, 'ACCEPTED')}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                        >
                          {isLoading ? '...' : 'Accept Order'}
                        </button>
                      )}

                      {(order.status === 'ACCEPTED' || order.status === 'PLACED') && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusChange(order.id, 'PREPARING')}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                        >
                          {isLoading ? '...' : 'Start Cooking'}
                        </button>
                      )}

                      {order.status === 'PREPARING' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusChange(order.id, 'OUT_FOR_DELIVERY')}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                        >
                          {isLoading ? '...' : 'Dispatch'}
                        </button>
                      )}

                      {order.status === 'OUT_FOR_DELIVERY' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusChange(order.id, 'DELIVERED')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
                        >
                          {isLoading ? '...' : 'Mark Delivered'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
