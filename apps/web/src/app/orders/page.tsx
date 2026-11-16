'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '../../components/Header';
import DeliveryStatusPill from '../../components/DeliveryStatusPill';
import { api, UserProfile, TrackOrderResponse } from '../../lib/api';
import { useCart } from '../../context/CartContext';

interface CompactOrderItem {
  name: string;
  quantity: number;
  variant?: string;
  pricePaise?: number;
}

interface CompactOrder {
  id: string;
  orderNumber: string;
  trackingToken: string;
  status: string;
  totalAmountPaise: number;
  paymentMethod?: string;
  createdAt: string;
  itemsSummary?: string;
  deliveryAddress?: any;
  items?: CompactOrderItem[];
}

export default function OrdersPage() {
  const router = useRouter();
  const { addItem } = useCart();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<CompactOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'ACTIVE' | 'DELIVERED'>('ALL');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    let isMounted = true;

    async function loadOrders() {
      setLoading(true);
      try {
        const user = await api.getCurrentUser('CUSTOMER');
        if (isMounted) setCurrentUser(user);

        if (!user) {
          // Logged out: do not display any cached or previous customer orders
          if (isMounted) {
            setOrders([]);
            setLoading(false);
          }
          return;
        }

        const fetchedList: CompactOrder[] = [];
        const seenOrderNumbers = new Set<string>();

        // 1. Fetch authentic order history by authenticated customer phone from DB
        const customerPhone = user.phone;
        if (customerPhone) {
          try {
            const liveOrders = await api.getCustomerOrders(customerPhone);
            if (Array.isArray(liveOrders)) {
              liveOrders.forEach((ord: any) => {
                if (ord.orderNumber && !seenOrderNumbers.has(ord.orderNumber)) {
                  seenOrderNumbers.add(ord.orderNumber);
                  fetchedList.push({
                    id: ord.orderNumber,
                    orderNumber: ord.orderNumber,
                    trackingToken: ord.trackingToken || ord.orderNumber,
                    status: ord.status,
                    totalAmountPaise: ord.totalAmountPaise,
                    paymentMethod: ord.paymentMethod || 'COD',
                    createdAt: ord.createdAt || new Date().toISOString(),
                    itemsSummary: ord.itemsSummary || 'Homestyle Pure Veg Meal',
                    deliveryAddress: ord.deliveryAddress,
                    items: ord.items || [],
                  });
                }
              });
            }
          } catch (e) {
            console.warn('Failed to fetch orders by phone:', e);
          }
        }

        // 2. Also check active tracking token from localStorage
        const tokensToFetch = new Set<string>();
        if (typeof window !== 'undefined') {
          const lastToken = localStorage.getItem('jr_last_tracking_token');
          if (lastToken) tokensToFetch.add(lastToken);

          try {
            const stored = JSON.parse(localStorage.getItem('jr_recent_orders') || '[]');
            if (Array.isArray(stored)) {
              stored.forEach((item: any) => {
                const tok = item.trackingToken || item.orderNumber;
                if (tok) tokensToFetch.add(tok);
              });
            }
          } catch {}
        }

        const validStoredOrders: any[] = [];
        for (const tok of Array.from(tokensToFetch)) {
          try {
            const data = await api.trackOrder(tok);
            if (data && data.orderNumber && !seenOrderNumbers.has(data.orderNumber)) {
              seenOrderNumbers.add(data.orderNumber);
              const summary = data.items && data.items.length > 0
                ? data.items.map((i: any) => i.quantity + 'x ' + i.name).join(' • ')
                : 'Homestyle Pure Veg Meal';

              const orderObj: CompactOrder = {
                id: data.orderNumber,
                orderNumber: data.orderNumber,
                trackingToken: tok,
                status: data.status,
                totalAmountPaise: data.totalAmountPaise,
                paymentMethod: data.paymentMethod || 'COD',
                createdAt: data.createdAt,
                itemsSummary: summary,
                deliveryAddress: data.deliveryAddress,
                items: data.items,
              };
              fetchedList.push(orderObj);
              validStoredOrders.push(orderObj);
            }
          } catch {
            // Prune invalid or non-existent tokens
          }
        }

        // Filter out any mock/corrupt zero-rupee orders
        const realOrders = fetchedList.filter((o) => (o.totalAmountPaise || 0) > 0);

        // Remove stale/fake legacy mock orders from localStorage
        if (typeof window !== 'undefined') {
          try {
            if (realOrders.length > 0) {
              localStorage.setItem('jr_recent_orders', JSON.stringify(realOrders.slice(0, 20)));
            } else {
              localStorage.removeItem('jr_recent_orders');
            }
          } catch {}
        }

        // Sort by createdAt descending
        realOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (isMounted) {
          setOrders(realOrders);
        }
      } catch (err) {
        console.warn('Orders load error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOrders();

    const handleAuth = () => {
      const token = localStorage.getItem('jr_session_token');
      if (!token) {
        if (isMounted) {
          setCurrentUser(null);
          setOrders([]);
          setLoading(false);
        }
      } else {
        loadOrders();
      }
    };

    window.addEventListener('storage', handleAuth);
    window.addEventListener('jr_auth_changed', handleAuth);

    return () => {
      isMounted = false;
      window.removeEventListener('storage', handleAuth);
      window.removeEventListener('jr_auth_changed', handleAuth);
    };
  }, []);

  // Filtered orders
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED'),
    [orders]
  );

  const deliveredOrders = useMemo(
    () => orders.filter((o) => o.status === 'DELIVERED'),
    [orders]
  );

  const displayedOrders = useMemo(() => {
    if (activeTab === 'ACTIVE') return activeOrders;
    if (activeTab === 'DELIVERED') return deliveredOrders;
    return orders;
  }, [activeTab, orders, activeOrders, deliveredOrders]);

  // Handle reorder
  const handleReorder = (order: CompactOrder) => {
    setReorderingId(order.orderNumber);
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        addItem({
          productId: `dish_${item.name.toLowerCase().replace(/\s+/g, '_')}`,
          name: item.name,
          pricePaise: item.pricePaise || 12000,
          quantity: item.quantity || 1,
        });
      });
      showToast(`Added ${order.items.length} items to your meal tray!`);
      setTimeout(() => {
        router.push('/cart');
      }, 700);
    } else {
      router.push('/menu');
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF9F0] text-[#292D26] font-body flex flex-col selection:bg-[#38754A] selection:text-white pb-24">
      <Header />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 inset-x-0 z-50 flex justify-center px-4 pointer-events-none animate-fadeIn">
          <div className="bg-[#292D26] text-white px-4 py-2.5 rounded-full text-xs font-bold shadow-xl border border-white/10 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#38754A]">check_circle</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 flex-1">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between py-2 mb-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#77786F] hover:text-[#292D26] transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            <span>Back to Store</span>
          </Link>

          {!currentUser && (
            <Link
              href="/login?redirect=/orders"
              className="text-xs font-bold text-[#38754A] hover:underline flex items-center gap-1"
            >
              <span>Sign In for full history</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          )}
        </div>

        {/* Section Heading */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-[#EEE7DC]">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-headline font-black text-2xl text-[#292D26] tracking-tight">
                My Orders
              </h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#EAF4ED] text-[#38754A] border border-[#38754A]/20">
                {orders.length} {orders.length === 1 ? 'Trip' : 'Trips'}
              </span>
            </div>
            <p className="text-xs text-[#77786F] mt-0.5">
              Track live home deliveries &amp; easily reorder past favourites
            </p>
          </div>

          <Link
            href="/menu"
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#38754A] hover:bg-[#285C38] text-white text-xs font-bold rounded-xl shadow-2xs transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[16px]">restaurant_menu</span>
            <span>Order New Meal</span>
          </Link>
        </div>

        {/* Filter Tabs */}
        <div className="pt-4 pb-2">
          <div className="grid grid-cols-3 bg-white p-1 rounded-2xl border border-[#EEE7DC] shadow-2xs text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'ALL'
                  ? 'bg-[#38754A] text-white shadow-xs'
                  : 'text-[#77786F] hover:text-[#292D26]'
              }`}
            >
              <span>All Orders</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {orders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ACTIVE')}
              className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'ACTIVE'
                  ? 'bg-[#38754A] text-white shadow-xs'
                  : 'text-[#77786F] hover:text-[#292D26]'
              }`}
            >
              <span>Active</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'ACTIVE' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {activeOrders.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('DELIVERED')}
              className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'DELIVERED'
                  ? 'bg-[#38754A] text-white shadow-xs'
                  : 'text-[#77786F] hover:text-[#292D26]'
              }`}
            >
              <span>Delivered</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'DELIVERED' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {deliveredOrders.length}
              </span>
            </button>
          </div>
        </div>

        {/* Orders Feed / Responsive Cards Grid */}
        <section className="pt-3 grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 items-start">
          {loading ? (
            <>
              <div className="h-32 bg-white rounded-2xl border border-[#EEE7DC] animate-pulse"></div>
              <div className="h-32 bg-white rounded-2xl border border-[#EEE7DC] animate-pulse"></div>
              <div className="h-32 bg-white rounded-2xl border border-[#EEE7DC] animate-pulse"></div>
              <div className="h-32 bg-white rounded-2xl border border-[#EEE7DC] animate-pulse"></div>
            </>
          ) : displayedOrders.length === 0 ? (
            /* Empty State */
            <div className="col-span-full bg-white rounded-2xl border border-[#EEE7DC] p-8 text-center flex flex-col items-center gap-3 my-4 shadow-xs">
              <div className="w-14 h-14 rounded-full bg-[#EAF4ED] text-[#38754A] flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px]">
                  {currentUser ? 'receipt_long' : 'account_circle'}
                </span>
              </div>
              <div>
                <h3 className="font-headline font-bold text-base text-[#292D26]">
                  {!currentUser
                    ? 'Sign In to View Orders'
                    : activeTab === 'ACTIVE'
                    ? 'No Active Orders In Transit'
                    : activeTab === 'DELIVERED'
                    ? 'No Delivered Orders Found'
                    : 'No Orders Placed Yet'}
                </h3>
                <p className="text-xs text-[#77786F] max-w-xs mx-auto mt-1 leading-relaxed">
                  {!currentUser
                    ? 'Please sign in with your mobile number to view your active deliveries and past meals.'
                    : activeTab === 'ACTIVE'
                    ? 'When you order a piping-hot thali or fresh parathas, track live rider progress here.'
                    : 'Order fresh home-style meals cooked in pure desi ghee to start building your order history.'}
                </p>
              </div>
              <Link
                href={currentUser ? '/menu' : '/login?redirect=/orders'}
                className="mt-2 px-5 py-2.5 bg-[#38754A] hover:bg-[#285C38] text-white font-bold text-xs rounded-xl shadow-xs transition-transform active:scale-95 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {currentUser ? 'restaurant' : 'login'}
                </span>
                <span>{currentUser ? "Explore Today's Menu" : 'Sign In with Mobile'}</span>
              </Link>
            </div>
          ) : (
            displayedOrders.map((ord) => {
              const isDelivered = ord.status === 'DELIVERED';
              const isCancelled = ord.status === 'CANCELLED';
              const isActive = !isDelivered && !isCancelled;
              const dateStr = ord.createdAt
                ? new Date(ord.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Recently placed';

              const isExpanded = expandedOrderId === ord.orderNumber;
              const addressText = ord.deliveryAddress
                ? typeof ord.deliveryAddress === 'object'
                  ? `${ord.deliveryAddress.flat || ''} ${ord.deliveryAddress.street || ''}`.trim() || 'Sagore, Pithampur'
                  : ord.deliveryAddress
                : 'Sagore, Pithampur';

              return (
                <article
                  key={ord.orderNumber}
                  onClick={() => setExpandedOrderId(isExpanded ? null : ord.orderNumber)}
                  className={`bg-white rounded-2xl sm:rounded-3xl border transition-all p-3.5 sm:p-4 flex flex-col gap-2.5 cursor-pointer select-none group shadow-2xs hover:shadow-md ${
                    isExpanded ? 'border-[#38754A] ring-1 ring-[#38754A]/20' : 'border-[#EEE7DC] hover:border-[#38754A]/40'
                  }`}
                >
                  {/* Clean, Decluttered Card Face: Food Summary & Enlarged Delivery Pill */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm sm:text-base text-[#292D26] group-hover:text-[#38754A] transition-colors line-clamp-1 leading-snug">
                        {ord.itemsSummary || 'Fresh Homestyle Meal'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-[#77786F] mt-1">
                        <span className="font-extrabold text-[#38754A] text-sm sm:text-base">
                          ₹{(ord.totalAmountPaise / 100).toFixed(0)}
                        </span>
                        <span>•</span>
                        <span className="font-semibold text-slate-700">
                          {ord.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Paid Online'}
                        </span>
                      </div>
                    </div>

                    {/* Enlarged Delivery Status Pill */}
                    <div className="shrink-0">
                      <DeliveryStatusPill
                        orderNumber={ord.orderNumber}
                        token={ord.trackingToken}
                        status={ord.status}
                        createdAt={ord.createdAt}
                        deliveryAddress={ord.deliveryAddress}
                        size="lg"
                        interactive={false}
                      />
                    </div>
                  </div>

                  {/* Subtle Tap to View Details Bar */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] font-semibold text-[#77786F]">
                    <span className="flex items-center gap-1 group-hover:text-[#38754A] transition-colors">
                      <span>{isExpanded ? 'Hide order details' : 'Tap to view details & tracking'}</span>
                    </span>
                    <span
                      className={`material-symbols-outlined text-[18px] text-[#77786F] group-hover:text-[#38754A] transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      expand_more
                    </span>
                  </div>

                  {/* Expanded Full Order Details (Shown on Card Click) */}
                  {isExpanded && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="bg-[#FFF9F0] rounded-xl sm:rounded-2xl p-3.5 sm:p-4 border border-[#EEE7DC] flex flex-col gap-3 text-xs text-[#292D26] animate-fadeIn cursor-default"
                    >
                      {/* Meta Strip: Order #, Date, Delivery Address */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#EEE7DC]">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs bg-white px-2 py-1 rounded-lg border border-[#EEE7DC] text-[#292D26]">
                            #{ord.orderNumber}
                          </span>
                          <span className="text-[11px] text-[#77786F] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">schedule</span>
                            {dateStr}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-[#77786F] max-w-[220px] sm:max-w-xs truncate">
                          <span className="material-symbols-outlined text-[13px] text-[#38754A] shrink-0">
                            location_on
                          </span>
                          <span className="truncate">{addressText}</span>
                        </div>
                      </div>

                      {/* Items Breakdown */}
                      {ord.items && ord.items.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] uppercase font-bold text-[#77786F] tracking-wider">
                            Ordered Dishes ({ord.items.reduce((s, it) => s + (it.quantity || 1), 0)} items)
                          </span>
                          <div className="flex flex-col gap-1">
                            {ord.items.map((it, idx) => (
                              <div key={idx} className="flex items-center justify-between py-0.5">
                                <span className="font-medium text-slate-800">
                                  {it.quantity}x {it.name}
                                </span>
                                <span className="font-mono font-semibold text-slate-600">
                                  {it.pricePaise ? `₹${((it.pricePaise * it.quantity) / 100).toFixed(0)}` : 'Included'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons inside Details */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EEE7DC]">
                        {/* Live Track Button */}
                        <Link
                          href={`/track?token=${encodeURIComponent(ord.trackingToken)}`}
                          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs ${
                            isActive
                              ? 'bg-[#38754A] hover:bg-[#285C38] text-white active:scale-95'
                              : 'bg-white hover:bg-slate-100 text-[#38754A] border border-[#EEE7DC]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {isActive ? 'two_wheeler' : 'receipt_long'}
                          </span>
                          <span>{isActive ? 'Track Live Ride' : 'Trip Summary'}</span>
                        </Link>

                        {/* Reorder Button */}
                        <button
                          type="button"
                          onClick={() => handleReorder(ord)}
                          disabled={reorderingId === ord.orderNumber}
                          className="px-3.5 py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#E25822] border border-orange-200 font-bold text-xs flex items-center gap-1 transition-colors active:scale-95 shadow-2xs"
                        >
                          <span className="material-symbols-outlined text-[16px]">sync</span>
                          <span>{reorderingId === ord.orderNumber ? 'Adding...' : 'Reorder'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}
