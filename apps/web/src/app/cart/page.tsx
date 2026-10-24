'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, DeliverySlot, QuoteResponse, DEFAULT_FOOD_IMAGE, UserProfile } from '../../lib/api';
import { useCart } from '../../context/CartContext';
import CustomerAuthModal from '../../components/CustomerAuthModal';
import LocationMapModal, { LocationData } from '../../components/LocationMapModal';

export default function CartPage() {
  const router = useRouter();
  const { items, addItem, updateQty, clearCart, showToast } = useCart();

  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const quoteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteInFlightRef = useRef(false);
  const quoteErrorCountRef = useRef(0);
  const isSubmittingOrderRef = useRef(false);
  const orderIdempotencyKeyRef = useRef<string | null>(null);
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  // Address & Customer form state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isAddressConfirmModalOpen, setIsAddressConfirmModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'PROFILE' | 'ORDERS' | 'EDIT'>('PROFILE');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [flat, setFlat] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('454774');
  const [detectedCity, setDetectedCity] = useState<string | null>('Sagore, Pithampur');
  const [checkingPin, setCheckingPin] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [isCutleryNeeded, setIsCutleryNeeded] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [showCookingInput, setShowCookingInput] = useState(false);
  const [pinStatusMsg, setPinStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'RAZORPAY'>('COD');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [riderTab, setRiderTab] = useState<'DELIVERY_TYPE' | 'TIP' | 'INSTRUCTIONS'>('INSTRUCTIONS');
  const [selectedRiderInstructions, setSelectedRiderInstructions] = useState<string[]>([]);
  const [directionsToReach, setDirectionsToReach] = useState('');
  const [showDirectionsInput, setShowDirectionsInput] = useState(false);
  const [tipPaise, setTipPaise] = useState(0);

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Fetch Delivery Slots
  useEffect(() => {
    const cached = api.getCachedSlots();
    if (cached?.slots?.length) {
      setSlots(cached.slots);
      setSelectedSlotId(cached.slots[0].id);
    }

    async function fetchSlots() {
      try {
        const data = await api.getSlots(today);
        if (data && data.slots && data.slots.length > 0) {
          setSlots(data.slots);
          setSelectedSlotId((prev) => prev || data.slots[0].id);
        }
      } catch (err) {
        console.error('Failed to load slots', err);
      }
    }
    fetchSlots();
  }, [today]);

  // Fetch logged in customer and prefill address
  useEffect(() => {
    api.getCurrentUser().then((user) => {
      if (user && user.role === 'CUSTOMER') {
        setCurrentUser(user);
        if (user.name) setCustomerName(user.name);
        if (user.phone) setCustomerPhone(user.phone);
        if (user.savedAddress) {
          if (user.savedAddress.flat) setFlat(user.savedAddress.flat);
          if (user.savedAddress.street) setStreet(user.savedAddress.street);
          if (user.savedAddress.landmark) setLandmark(user.savedAddress.landmark);
          if (user.savedAddress.pincode) setPincode(user.savedAddress.pincode);
        }
      } else if (typeof window !== 'undefined') {
        // Fallback to local storage so user data is never lost
        const savedPhone = localStorage.getItem('jr_customer_phone');
        const savedName = localStorage.getItem('jr_customer_name');
        const savedAddrRaw =
          localStorage.getItem('jr_customer_address') ||
          localStorage.getItem('jr_selected_address');
        if (savedPhone) {
          let addrObj: any = undefined;
          if (savedAddrRaw) {
            try {
              addrObj = JSON.parse(savedAddrRaw);
            } catch {}
          }
          const restored: UserProfile = {
            id: 'cust_' + savedPhone,
            name: savedName || 'Customer',
            phone: savedPhone,
            role: 'CUSTOMER',
            savedAddress: addrObj,
          };
          setCurrentUser(restored);
          setCustomerPhone(savedPhone);
          if (savedName) setCustomerName(savedName);
          if (addrObj) {
            if (addrObj.flat) setFlat(addrObj.flat);
            if (addrObj.street) setStreet(addrObj.street);
            if (addrObj.landmark) setLandmark(addrObj.landmark);
            if (addrObj.pincode) setPincode(addrObj.pincode);
          }
        }
      }
    });
  }, []);

  // Online/offline connection listener
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      showToastRef.current('Internet restored! Updating billing quote...');
      requestQuoteRef.current(true);
    };

    const handleOffline = () => {
      setIsOnline(false);
      showToastRef.current('Connection lost. Please check your internet connection.', true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Invalidate idempotency key whenever cart items change
  useEffect(() => {
    orderIdempotencyKeyRef.current = null;
  }, [items]);

  // Request Server-Authoritative Quote (Resilient, Non-Looping)
  const requestQuote = useCallback(async (isManualRetry = false) => {
    if (items.length === 0 || !selectedSlotId) return;

    // Fast-exit if browser is currently offline
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setQuoteLoading(false);
      return;
    }

    // In-flight guard to prevent hammering concurrent requests
    if (quoteInFlightRef.current) return;
    quoteInFlightRef.current = true;
    setQuoteLoading(true);

    try {
      const q = await api.calculateQuote({
        serviceDate: today,
        deliverySlotId: selectedSlotId,
        pincode: pincode.trim() || '454774',
        items: items.map((i) => {
          let pid = i.productId;
          if (pid === 'spec-full-thali') pid = '09f67dad-2306-49b7-88c7-cae050592f14';
          if (pid === 'spec-home-thali') pid = 'cd02708b-cf9d-460a-878d-3597115602b7';
          if (pid === 'spec-roti-sabzi') pid = 'a1c1e8ff-8f9e-4a82-98f3-876bd6f9e0f3';
          return {
            productId: pid,
            variantId: i.variantId,
            quantity: i.quantity,
            selectedAddonOptionIds: i.selectedAddonOptionIds,
          };
        }),
      });
      setQuote(q);
      quoteErrorCountRef.current = 0;
    } catch (err: any) {
      console.warn('Quotation notice:', err.message);
      // Only toast on explicit manual retry or first error to prevent infinite toast spam
      if (isManualRetry || quoteErrorCountRef.current === 0) {
        showToastRef.current(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'Connection lost. Please check your internet.'
            : (err.message || 'Could not fetch quote for selected items'),
          true
        );
      }
      quoteErrorCountRef.current += 1;
    } finally {
      quoteInFlightRef.current = false;
      setQuoteLoading(false);
    }
  }, [items, selectedSlotId, pincode, today]);

  const requestQuoteRef = useRef(requestQuote);
  useEffect(() => {
    requestQuoteRef.current = requestQuote;
  }, [requestQuote]);

  // Debounced quote request when items or slot changes (No circular callback dependencies)
  useEffect(() => {
    if (items.length > 0 && selectedSlotId) {
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
      quoteDebounceRef.current = setTimeout(() => {
        requestQuoteRef.current();
      }, 600);
    }
    return () => {
      if (quoteDebounceRef.current) clearTimeout(quoteDebounceRef.current);
    };
  }, [items, selectedSlotId, pincode]);

  // Automated Pincode Verification & City Loader
  useEffect(() => {
    const cleanPin = pincode.trim().replace(/\D/g, '');
    if (cleanPin.length !== 6) {
      setPinStatusMsg(null);
      setDetectedCity(null);
      return;
    }

    let isMounted = true;
    setCheckingPin(true);

    const timer = setTimeout(async () => {
      try {
        const res = await api.checkPincode(cleanPin);
        if (!isMounted) return;

        if (res.city) {
          setDetectedCity(res.city);
        }

        if (res.serviceable) {
          const feePaise = res.deliveryFeePaise ?? 0;
          const feeText = feePaise === 0
            ? 'Free Delivery (Within 5 km)'
            : `Delivery Fee: ₹${(feePaise / 100).toFixed(0)} (Beyond 5 km free zone)`;
          setPinStatusMsg({
            text: `✓ ${res.zoneName || res.city || 'Sagore'} • ${feeText}`,
            isError: false,
          });
          requestQuoteRef.current();
        } else {
          setPinStatusMsg({
            text: res.message || 'Delivery not available beyond 15 km from Sagore Kitchen.',
            isError: true,
          });
        }
      } catch (err: any) {
        if (!isMounted) return;
        setPinStatusMsg({
          text: err.message || 'Error checking pincode',
          isError: true,
        });
      } finally {
        if (isMounted) setCheckingPin(false);
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [pincode]);

  // Place Order Handler with 1-Click Address Confirmation
  const handlePlaceOrder = async () => {
    // 1. Guard against concurrent / duplicate submissions
    if (isSubmittingOrderRef.current || placingOrder) {
      return;
    }

    // 2. Offline check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast('You are currently offline. Please check your internet connection before placing order.', true);
      return;
    }

    // If phone or address details are missing, ask user to fill once
    if (!customerPhone.trim() || !flat.trim() || !street.trim() || !pincode.trim()) {
      if (!flat.trim() || !street.trim()) {
        setIsMapModalOpen(true);
        showToast('Please select your delivery location on the map.', true);
      } else {
        setAuthModalTab('PROFILE');
        setIsAuthOpen(true);
        showToast('Please provide your mobile number to proceed.', true);
      }
      return;
    }

    if (pinStatusMsg?.isError) {
      showToast(pinStatusMsg.text || 'Cannot deliver to selected location (Beyond 15 km of Sagore Kitchen).', true);
      return;
    }

    // Show 1-click address confirmation modal
    setIsAddressConfirmModalOpen(true);
  };

  // Execute Order Placement after Address Confirmation
  const executeOrderPlacement = async () => {
    setIsAddressConfirmModalOpen(false);

    if (isSubmittingOrderRef.current || placingOrder) {
      return;
    }

    // Synchronously lock order submission immediately
    isSubmittingOrderRef.current = true;
    setPlacingOrder(true);

    try {
      let activeQuoteToken = quote?.quoteToken;
      if (!activeQuoteToken) {
        const q = await api.calculateQuote({
          serviceDate: today,
          deliverySlotId: selectedSlotId || slots[0]?.id || 'slot-lunch',
          pincode: pincode.trim() || '454774',
          items: items.map((i) => {
            let pid = i.productId;
            if (pid === 'spec-full-thali') pid = '09f67dad-2306-49b7-88c7-cae050592f14';
            if (pid === 'spec-home-thali') pid = 'cd02708b-cf9d-460a-878d-3597115602b7';
            if (pid === 'spec-roti-sabzi') pid = 'a1c1e8ff-8f9e-4a82-98f3-876bd6f9e0f3';
            return {
              productId: pid,
              variantId: i.variantId,
              quantity: i.quantity,
              selectedAddonOptionIds: i.selectedAddonOptionIds,
            };
          }),
        });
        setQuote(q);
        activeQuoteToken = q.quoteToken;
      }

      const compiledNotes = [
        ...selectedRiderInstructions,
        isCutleryNeeded ? 'Please provide disposable cutlery' : null,
        directionsToReach.trim() ? `Directions: ${directionsToReach.trim()}` : null,
        deliveryNotes.trim() ? `Cooking: ${deliveryNotes.trim()}` : null,
      ].filter(Boolean).join(' • ');

      // Maintain persistent idempotency key for this order session so retries never double-order
      if (!orderIdempotencyKeyRef.current) {
        orderIdempotencyKeyRef.current = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }

      let orderResult;
      const orderPayload = {
        paymentMethod,
        customerName: customerName.trim() || 'Customer',
        customerPhone: customerPhone.trim(),
        deliveryAddress: {
          flat: flat.trim(),
          street: street.trim(),
          landmark: landmark.trim() || undefined,
          pincode: pincode.trim(),
        },
        deliveryNotes: compiledNotes || undefined,
      };

      try {
        orderResult = await api.placeOrder(
          {
            ...orderPayload,
            quoteToken: activeQuoteToken,
          },
          orderIdempotencyKeyRef.current
        );
      } catch (placeErr: any) {
        // If quotation expired or invalid, auto-refresh quote once and retry seamlessly
        const isQuoteExpired =
          placeErr.message?.toLowerCase().includes('quotation has expired') ||
          placeErr.message?.toLowerCase().includes('invalid quote') ||
          placeErr.message?.toLowerCase().includes('quote');

        if (isQuoteExpired) {
          console.warn('Quote expired, auto-refreshing quote and retrying placeOrder...');
          const freshQ = await api.calculateQuote({
            serviceDate: today,
            deliverySlotId: selectedSlotId || slots[0]?.id || 'slot-lunch',
            pincode: pincode.trim() || '454774',
            items: items.map((i) => {
              let pid = i.productId;
              if (pid === 'spec-full-thali') pid = '09f67dad-2306-49b7-88c7-cae050592f14';
              if (pid === 'spec-home-thali') pid = 'cd02708b-cf9d-460a-878d-3597115602b7';
              if (pid === 'spec-roti-sabzi') pid = 'a1c1e8ff-8f9e-4a82-98f3-876bd6f9e0f3';
              return {
                productId: pid,
                variantId: i.variantId,
                quantity: i.quantity,
                selectedAddonOptionIds: i.selectedAddonOptionIds,
              };
            }),
          });
          setQuote(freshQ);
          // New idempotency key for fresh quote attempt
          orderIdempotencyKeyRef.current = `idem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

          orderResult = await api.placeOrder(
            {
              ...orderPayload,
              quoteToken: freshQ.quoteToken,
            },
            orderIdempotencyKeyRef.current
          );
        } else {
          throw placeErr;
        }
      }

      // Successfully placed: reset idempotency key and clear cart
      orderIdempotencyKeyRef.current = null;
      clearCart();

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('jr_last_tracking_token', orderResult.trackingToken);
          window.localStorage.setItem('jr_last_order_number', orderResult.orderNumber);
          window.localStorage.setItem('jr_customer_phone', customerPhone.trim());
          if (customerName) window.localStorage.setItem('jr_customer_name', customerName.trim());
          window.localStorage.setItem(
            'jr_customer_address',
            JSON.stringify({ flat, street, landmark, pincode })
          );
          const recents = JSON.parse(window.localStorage.getItem('jr_recent_orders') || '[]');
          recents.unshift({
            orderNumber: orderResult.orderNumber,
            trackingToken: orderResult.trackingToken,
            placedAt: new Date().toISOString(),
          });
          window.localStorage.setItem('jr_recent_orders', JSON.stringify(recents.slice(0, 10)));
        } catch {}
      }

      api
        .loginCustomer(customerPhone.trim(), customerName.trim(), {
          flat: flat.trim(),
          street: street.trim(),
          landmark: landmark.trim() || undefined,
          pincode: pincode.trim(),
        })
        .catch(() => {});

      showToast('Order placed successfully!');
      setTimeout(() => {
        router.push(`/track?token=${orderResult.trackingToken}`);
      }, 800);
    } catch (err: any) {
      setPlacingOrder(false);
      isSubmittingOrderRef.current = false;

      const isNetworkError =
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        err.message?.toLowerCase().includes('fetch') ||
        err.message?.toLowerCase().includes('network') ||
        err.message?.toLowerCase().includes('failed to fetch');

      if (isNetworkError) {
        showToast('Connection interrupted. Don\'t worry, your order was not duplicated. Please verify connection and retry.', true);
      } else {
        showToast(err.message || 'Failed to place order', true);
      }
    }
  };

  const selectedSlot = slots.find((s) => s.id === selectedSlotId);

  // If cart is empty
  if (items.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-[70vh] pt-20 pb-28 px-4 bg-[#F4F4F6]">
        <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 max-w-sm w-full text-center flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700">
            <span className="material-symbols-outlined text-[36px]">shopping_bag</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">Your Cart is Empty</h2>
          <p className="text-xs text-slate-500">
            Explore fresh homestyle pure veg thalis, combo meals, and tawa rotis.
          </p>
          <Link
            href="/menu"
            className="mt-2 h-10 px-6 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <span>Explore Menu</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>
      </main>
    );
  }

  const itemsTotalPaise = items.reduce((acc, i) => acc + i.pricePaise * i.quantity, 0);
  const deliveryFeePaise = quote?.deliveryFeePaise ?? 0;
  const packagingFeePaise = quote?.packagingFeePaise ?? 1500;
  const finalTotalPaise = (quote?.totalPaise ?? (itemsTotalPaise + deliveryFeePaise + packagingFeePaise)) + tipPaise;

  const COMPLETE_MEAL_ADDONS = [
    {
      id: 'addon-roti-4',
      name: 'Plain Phulka Roti (4 Pcs)',
      pricePaise: 4000,
      imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=400&q=80',
    },
    {
      id: 'addon-paratha-plain',
      name: 'Plain Paratha (2 Pcs)',
      pricePaise: 5000,
      imageUrl: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&q=80',
    },
    {
      id: 'addon-boondi-raita',
      name: 'Boondi Raita (Fresh Curd)',
      pricePaise: 3500,
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400&q=80',
    },
    {
      id: 'addon-gulab-jamun',
      name: 'Gulab Jamun (2 Pcs)',
      pricePaise: 4500,
      imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400&q=80',
    },
    {
      id: 'addon-papad-salad',
      name: 'Roasted Papad & Salad',
      pricePaise: 2000,
      imageUrl: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=400&q=80',
    },
  ];

  return (
    <main className="flex flex-col relative w-full pb-36 bg-[#F4F4F6] min-h-screen">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs font-bold py-2 px-4 flex items-center justify-center gap-2 shadow-inner sticky top-0 z-50 animate-in fade-in">
          <span className="material-symbols-outlined text-[18px]">wifi_off</span>
          <span>No internet connection. Waiting for network to resume billing...</span>
        </div>
      )}
      {/* 1. Top Header Bar with Back Button, Delivery Address, and Profile Action */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200/80 px-3 sm:px-4 py-2.5 shadow-2xs">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-2">
          {/* Back button & Address */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="Go Back"
              className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-800 shrink-0 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px] sm:text-[22px]">arrow_back</span>
            </button>
            <div
              onClick={() => setIsMapModalOpen(true)}
              className="cursor-pointer flex items-center gap-1.5 min-w-0 hover:opacity-85 transition-opacity"
              title="Click to select or change delivery location"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[17px]">location_on</span>
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-extrabold text-xs sm:text-sm text-slate-900 leading-tight">
                    {currentUser ? 'Delivering to' : 'Delivery Address'}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-slate-500 shrink-0">
                    expand_more
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 truncate max-w-[150px] sm:max-w-xs font-medium">
                  {flat ? `${flat}${street ? `, ${street}` : ''} • ${pincode}` : 'Tap to select location on map'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Address Change Button & Profile / Login button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsMapModalOpen(true)}
              className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-200 transition-colors shrink-0 flex items-center gap-0.5"
            >
              <span>Change</span>
              <span className="material-symbols-outlined text-[13px]">expand_more</span>
            </button>

            {/* Profile / Account Button */}
            {currentUser ? (
              <button
                type="button"
                onClick={() => {
                  setAuthModalTab('PROFILE');
                  setIsAuthOpen(true);
                }}
                className="flex items-center gap-1.5 py-1 px-2 rounded-full hover:bg-slate-100 border border-slate-200 transition-colors shrink-0"
                title={`${currentUser.name} - View Profile & Orders`}
              >
                <div className="w-7 h-7 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shadow-2xs shrink-0">
                  {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="text-xs font-bold text-slate-800 max-w-[70px] truncate hidden sm:inline">
                  {currentUser.name ? currentUser.name.split(' ')[0] : 'Profile'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthModalTab('PROFILE');
                  setIsAuthOpen(true);
                }}
                className="flex items-center gap-1 py-1.5 px-3 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">account_circle</span>
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-col w-full max-w-xl mx-auto pb-4">
        {/* 3. Minimalistic Items Summary Bar */}
        <div className="px-3 pt-3 flex items-center justify-between gap-2">
          {/* Minimalist Items Count & Subtotal */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-slate-800">
              {items.reduce((a, b) => a + b.quantity, 0)} {items.reduce((a, b) => a + b.quantity, 0) === 1 ? 'item' : 'items'}
            </span>
            <span className="text-slate-300">•</span>
            <span className="font-extrabold text-slate-900">
              ₹{(itemsTotalPaise / 100).toFixed(0)}
            </span>
          </div>
        </div>

        {/* 4. Restaurant Items Card */}
        <div className="px-3 pt-3">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col gap-3">
            {/* Items Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                TRYNEW eligible items
              </span>
              <Link
                href="/menu"
                className="text-xs font-bold text-[#008848] hover:underline flex items-center gap-1"
              >
                <span className="text-sm font-extrabold">+</span>
                <span>Add more</span>
              </Link>
            </div>

            {/* Items List */}
            <div className="flex flex-col divide-y divide-slate-100">
              {items.map((item, idx) => (
                <div
                  key={`${item.productId}-${item.variantId || 'base'}`}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className="w-3.5 h-3.5 rounded-xs border border-emerald-600 flex items-center justify-center p-0.5 mt-0.5 shrink-0 bg-white">
                      <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-xs sm:text-sm text-slate-900 truncate">{item.name}</p>
                      {item.variantName && (
                        <p className="text-[11px] text-slate-500">{item.variantName}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Stepper */}
                    <div className="flex items-center bg-white rounded-lg border border-slate-300 shadow-2xs h-7 px-1">
                      <button
                        type="button"
                        onClick={() => updateQty(idx, -1)}
                        className="w-5 h-5 flex items-center justify-center text-slate-700 font-bold hover:text-emerald-700 text-sm"
                      >
                        -
                      </button>
                      <span className="px-2 font-extrabold text-xs text-emerald-700">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(idx, 1)}
                        className="w-5 h-5 flex items-center justify-center text-slate-700 font-bold hover:text-emerald-700 text-sm"
                      >
                        +
                      </button>
                    </div>

                    {/* Price with strikethrough */}
                    <div className="text-right min-w-[54px]">
                      <span className="text-[10px] text-slate-400 line-through block leading-none">
                        ₹{(((item.pricePaise * item.quantity) / 100) + 40).toFixed(0)}
                      </span>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900">
                        ₹{((item.pricePaise * item.quantity) / 100).toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5. Complete Your Meal Addons Horizontal Carousel */}
        <div className="px-3 pt-3">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5">
            <h3 className="text-[11px] uppercase font-extrabold tracking-wider text-slate-500 mb-2.5">
              COMPLETE YOUR MEAL
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
              {COMPLETE_MEAL_ADDONS.map((addon) => (
                <div key={addon.id} className="w-28 shrink-0 flex flex-col gap-1">
                  <div className="relative w-28 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                    <img src={addon.imageUrl} alt={addon.name} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        addItem({
                          productId: addon.id,
                          name: addon.name,
                          pricePaise: addon.pricePaise,
                          quantity: 1,
                          imageUrl: addon.imageUrl,
                        });
                        showToast(`Added ${addon.name}`);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white text-emerald-700 font-extrabold text-sm flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-transform border border-emerald-600"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-2.5 h-2.5 rounded-2xs border border-emerald-600 flex items-center justify-center p-0.5 shrink-0 bg-white">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    </span>
                    <p className="text-[11px] font-bold text-slate-800 truncate leading-tight">{addon.name}</p>
                  </div>
                  <span className="text-xs font-extrabold text-slate-900">
                    ₹{(addon.pricePaise / 100).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>


        {/* 7. Rider Delivery Instructions (Exact 1:1 with Reference Image 2) */}
        <div className="px-3 pt-3">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 flex flex-col gap-2.5">
            {/* Top Tabs */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRiderTab('DELIVERY_TYPE')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  riderTab === 'DELIVERY_TYPE'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Delivery Type
              </button>
              <button
                type="button"
                onClick={() => setRiderTab('TIP')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  riderTab === 'TIP'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tip {tipPaise > 0 ? `(₹${tipPaise / 100})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setRiderTab('INSTRUCTIONS')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                  riderTab === 'INSTRUCTIONS'
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Instructions
              </button>
            </div>

            {/* Tab 1: Instructions */}
            {riderTab === 'INSTRUCTIONS' && (
              <div className="flex flex-col gap-2 pt-0.5">
                <p className="text-[11px] text-slate-500 font-medium px-0.5">
                  Instructions will be applied on your order &amp; delivery
                </p>

                {/* 6 Instruction Cards Grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {/* Card 1: Cutlery Needed */}
                  <div
                    onClick={() => setIsCutleryNeeded(!isCutleryNeeded)}
                    className={`p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-between text-center gap-1.5 cursor-pointer transition-all select-none ${
                      isCutleryNeeded
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${isCutleryNeeded ? 'text-emerald-700' : 'text-slate-700'}`}>
                      restaurant
                    </span>
                    <span className="text-[10px] leading-tight">Cutlery needed</span>
                  </div>

                  {/* Card 2: Cooking Note */}
                  <div
                    onClick={() => setShowCookingInput(!showCookingInput)}
                    className={`p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-between text-center gap-1.5 cursor-pointer transition-all select-none ${
                      showCookingInput || deliveryNotes
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${showCookingInput || deliveryNotes ? 'text-emerald-700' : 'text-slate-700'}`}>
                      edit_note
                    </span>
                    <span className="text-[10px] leading-tight">Cooking note</span>
                  </div>

                  {/* Card 3: Directions to reach */}
                  <div
                    onClick={() => setShowDirectionsInput(!showDirectionsInput)}
                    className={`p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-between text-center gap-1.5 cursor-pointer transition-all select-none ${
                      showDirectionsInput || directionsToReach
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${showDirectionsInput || directionsToReach ? 'text-emerald-700' : 'text-slate-700'}`}>
                      mic
                    </span>
                    <span className="text-[10px] leading-tight">Directions</span>
                  </div>

                  {/* Card 4: Leave at the door */}
                  <div
                    onClick={() => {
                      setSelectedRiderInstructions((prev) =>
                        prev.includes('Leave at the door')
                          ? prev.filter((i) => i !== 'Leave at the door')
                          : [...prev, 'Leave at the door']
                      );
                    }}
                    className={`p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-between text-center gap-1.5 cursor-pointer transition-all select-none ${
                      selectedRiderInstructions.includes('Leave at the door')
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${selectedRiderInstructions.includes('Leave at the door') ? 'text-emerald-700' : 'text-slate-700'}`}>
                      door_front
                    </span>
                    <span className="text-[10px] leading-tight">Leave at door</span>
                  </div>

                  {/* Card 5: Avoid calling */}
                  <div
                    onClick={() => {
                      setSelectedRiderInstructions((prev) =>
                        prev.includes('Avoid calling')
                          ? prev.filter((i) => i !== 'Avoid calling')
                          : [...prev, 'Avoid calling']
                      );
                    }}
                    className={`p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-between text-center gap-1.5 cursor-pointer transition-all select-none ${
                      selectedRiderInstructions.includes('Avoid calling')
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${selectedRiderInstructions.includes('Avoid calling') ? 'text-emerald-700' : 'text-slate-700'}`}>
                      phone_paused
                    </span>
                    <span className="text-[10px] leading-tight">Avoid calling</span>
                  </div>

                  {/* Card 6: Avoid ringing bell */}
                  <div
                    onClick={() => {
                      setSelectedRiderInstructions((prev) =>
                        prev.includes('Avoid ringing bell')
                          ? prev.filter((i) => i !== 'Avoid ringing bell')
                          : [...prev, 'Avoid ringing bell']
                      );
                    }}
                    className={`p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-between text-center gap-1.5 cursor-pointer transition-all select-none ${
                      selectedRiderInstructions.includes('Avoid ringing bell')
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`material-symbols-outlined text-[20px] ${selectedRiderInstructions.includes('Avoid ringing bell') ? 'text-emerald-700' : 'text-slate-700'}`}>
                      notifications_paused
                    </span>
                    <span className="text-[10px] leading-tight">Avoid bell</span>
                  </div>
                </div>

                {/* Cooking Note Input */}
                {(showCookingInput || deliveryNotes) && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      Cooking &amp; Kitchen Instructions:
                    </label>
                    <input
                      type="text"
                      value={deliveryNotes}
                      onChange={(e) => setDeliveryNotes(e.target.value)}
                      placeholder="e.g. Less spicy dal, no onion-garlic, extra dry phulkas"
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                )}

                {/* Expandable Directions Input */}
                {(showDirectionsInput || directionsToReach) && (
                  <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      Directions for Rider:
                    </label>
                    <input
                      type="text"
                      value={directionsToReach}
                      onChange={(e) => setDirectionsToReach(e.target.value)}
                      placeholder="e.g. 2nd floor, blue door, near yellow overhead water tank"
                      className="w-full text-xs px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Tip */}
            {riderTab === 'TIP' && (
              <div className="flex flex-col gap-2 pt-0.5">
                <p className="text-[11px] text-slate-500 font-medium">
                  Add a tip to thank your delivery partner for their effort:
                </p>
                <div className="flex items-center gap-2">
                  {[0, 2000, 3000, 5000].map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setTipPaise(amount)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                        tipPaise === amount
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900 shadow-2xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {amount === 0 ? 'No Tip' : `₹${amount / 100}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: Delivery Type */}
            {riderTab === 'DELIVERY_TYPE' && (
              <div className="flex flex-col gap-1.5 pt-0.5">
                <p className="text-[11px] text-slate-500 font-medium">Delivery Mode</p>
                <div className="px-3 py-2 rounded-xl border border-emerald-600 bg-emerald-50 text-emerald-900 text-xs font-bold flex items-center gap-1.5 shadow-2xs">
                  <span className="material-symbols-outlined text-[16px] text-emerald-700">bolt</span>
                  <span>Standard Fresh Dispatch (30-40 mins)</span>
                </div>
              </div>
            )}
          </div>
        </div>



        {/* 9. Bill Details Breakdown */}
        <div className="px-3 pt-3">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 flex flex-col gap-2">
            <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-1">
              Bill Details
            </h3>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Item Total</span>
              <span className="font-semibold text-slate-900">₹{(itemsTotalPaise / 100).toFixed(0)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <span>Delivery Partner Fee</span>
                {deliveryFeePaise === 0 ? (
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded">
                    Free (Within 5 km)
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded">
                    Beyond 5 km
                  </span>
                )}
              </span>
              <span className={`font-extrabold ${deliveryFeePaise === 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                {deliveryFeePaise === 0 ? 'FREE' : `₹${(deliveryFeePaise / 100).toFixed(0)}`}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Platform &amp; Packaging Fee</span>
              <span className="font-semibold text-slate-900">₹15</span>
            </div>
            {tipPaise > 0 && (
              <div className="flex justify-between text-xs text-emerald-700 font-bold">
                <span>Delivery Partner Tip</span>
                <span>₹{(tipPaise / 100).toFixed(0)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-extrabold text-slate-900">
              <span>To Pay</span>
              <span>₹{(finalTotalPaise / 100).toFixed(0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 10. Sticky Bottom Payment Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 px-4 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Payment Method Info */}
          <div
            onClick={() => setIsPaymentModalOpen(true)}
            className="flex flex-col cursor-pointer select-none min-w-0 hover:opacity-85 transition-opacity"
            title="Click to change payment method"
          >
            <div className="flex items-center gap-1 text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
              <span className="material-symbols-outlined text-[13px] text-slate-600">account_balance_wallet</span>
              <span>PAY USING</span>
              <span className="text-[10px] text-emerald-700 font-bold">▲ CHANGE</span>
            </div>
            <div className="flex items-center gap-1.5 font-extrabold text-xs sm:text-sm text-slate-900 truncate mt-0.5">
              <span>{paymentMethod === 'COD' ? 'Pay on Delivery (Cash/UPI)' : 'Online UPI / Cards'}</span>
            </div>
            <span className="text-[10px] text-slate-500 truncate leading-none mt-0.5">
              {paymentMethod === 'COD' ? 'Cash or scan rider QR code' : 'Instant PhonePe, GPay, Paytm'}
            </span>
          </div>

          {/* Right: Big Green Pay Button */}
          <button
            type="button"
            onClick={handlePlaceOrder}
            disabled={placingOrder || quoteLoading || pinStatusMsg?.isError}
            className="bg-[#008848] hover:bg-[#00703c] active:scale-98 text-white font-extrabold text-sm sm:text-base px-6 sm:px-8 py-3 rounded-xl shadow-md transition-all flex items-center gap-2 shrink-0 disabled:opacity-50"
          >
            <span>
              {placingOrder
                ? 'Processing...'
                : pinStatusMsg?.isError
                ? 'Delivery Unavailable'
                : `Pay ₹${(finalTotalPaise / 100).toFixed(0)}`}
            </span>
            {placingOrder && (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0 inline-block" />
            )}
          </button>
        </div>
      </div>

      {/* 11. Interactive Address Changing Modal Popup */}
      {isEditingAddress && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          {/* Backdrop */}
          <div className="absolute inset-0" onClick={() => setIsEditingAddress(false)} />

          <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 duration-200">
            {/* Header */}
            <div className="bg-[#008848] text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[22px]">location_on</span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base leading-tight">Change Delivery Address</h3>
                  <p className="text-[11px] text-emerald-100">Ensure fresh lunch &amp; dinner reaches your doorstep</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingAddress(false)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Address Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!flat.trim() || !pincode.trim()) {
                  showToast('Please provide flat/house and a valid pincode', true);
                  return;
                }
                setIsEditingAddress(false);
                showToast('Delivery address updated!');
              }}
              className="p-5 flex flex-col gap-3 overflow-y-auto"
            >
              {/* Map & Sagore Presets Trigger */}
              <button
                type="button"
                onClick={() => setIsMapModalOpen(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                <span className="material-symbols-outlined text-[17px] text-emerald-400">explore</span>
                <span>Select on Interactive Map / Sagore Presets</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Recipient's name"
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Phone (+91) *
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit number"
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Flat / House / Floor / Society *
                </label>
                <input
                  type="text"
                  required
                  value={flat}
                  onChange={(e) => setFlat(e.target.value)}
                  placeholder="e.g. Flat 402, Block C, Sunrise Heights"
                  className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Street / Area / Sector *
                  </label>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="e.g. Main Market, Sagore"
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    6-digit Pincode *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 454774"
                    className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Nearby Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Near Mother Dairy or Metro Gate 2"
                  className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                />
              </div>

              {pinStatusMsg && (
                <div
                  className={`text-xs p-2.5 rounded-xl border flex items-center gap-2 ${
                    pinStatusMsg.isError
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {pinStatusMsg.isError ? 'cancel' : 'check_circle'}
                  </span>
                  <span className="font-semibold">{pinStatusMsg.text}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full mt-2 py-3 bg-[#008848] hover:bg-[#00703c] text-white text-sm font-extrabold rounded-xl shadow-md transition-all active:scale-98 flex items-center justify-center gap-1.5"
              >
                <span>Save &amp; Deliver Here</span>
                <span className="material-symbols-outlined text-[18px]">check</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 12. Payment Method Selector Modal Popup */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          {/* Backdrop */}
          <div className="absolute inset-0" onClick={() => setIsPaymentModalOpen(false)} />

          <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col animate-in slide-in-from-bottom-4 duration-200">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">Select Payment Method</h3>
                <p className="text-xs text-slate-500">100% Safe &amp; Secure Payments</p>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Payment Options */}
            <div className="p-4 flex flex-col gap-2.5">
              {/* Option 1: Online UPI / PhonePe / GPay */}
              <div
                onClick={() => {
                  setPaymentMethod('RAZORPAY');
                  setIsPaymentModalOpen(false);
                }}
                className={`p-3.5 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                  paymentMethod === 'RAZORPAY'
                    ? 'border-[#008848] bg-emerald-50/60 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-lg shrink-0 border border-purple-200">
                    <span className="material-symbols-outlined text-[22px]">contactless</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">Online UPI / Cards</span>
                      <span className="px-1.5 py-0.5 rounded-md bg-purple-100 text-purple-700 font-extrabold text-[10px]">
                        RECOMMENDED
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      PhonePe, Google Pay, Paytm, UPI, Cards, Netbanking
                    </p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-2 ${
                  paymentMethod === 'RAZORPAY' ? 'border-[#008848] bg-[#008848]' : 'border-slate-300'
                }`}>
                  {paymentMethod === 'RAZORPAY' && <span className="w-2 h-2 rounded-full bg-white"></span>}
                </div>
              </div>

              {/* Option 2: Cash / QR on Delivery */}
              <div
                onClick={() => {
                  setPaymentMethod('COD');
                  setIsPaymentModalOpen(false);
                }}
                className={`p-3.5 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition-all ${
                  paymentMethod === 'COD'
                    ? 'border-[#008848] bg-emerald-50/60 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-lg shrink-0 border border-amber-200">
                    <span className="material-symbols-outlined text-[22px]">payments</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">Cash / UPI on Delivery</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pay cash or scan rider's QR code when order arrives
                    </p>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ml-2 ${
                  paymentMethod === 'COD' ? 'border-[#008848] bg-[#008848]' : 'border-slate-300'
                }`}>
                  {paymentMethod === 'COD' && <span className="w-2 h-2 rounded-full bg-white"></span>}
                </div>
              </div>
            </div>

            <div className="p-4 pt-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px] text-emerald-700">verified_user</span>
                <span>Bank-grade 256-bit encryption</span>
              </span>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="font-bold text-[#008848] hover:underline"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-Click Delivery Address Confirmation Bottom Sheet */}
      {isAddressConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setIsAddressConfirmModalOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 z-10 flex flex-col gap-3.5 animate-in slide-in-from-bottom-4">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-900 leading-tight">
                    Confirm Delivery Address
                  </h3>
                  <p className="text-[11px] text-slate-500">Please verify your delivery address</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddressConfirmModalOpen(false)}
                className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Address Details Card */}
            <div className="bg-[#FFF9F0] border border-[#EEE7DC] rounded-2xl p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-700 text-[18px]">person</span>
                  <span className="font-extrabold text-xs text-slate-800">{customerName || 'Customer'}</span>
                  <span className="text-slate-400 text-xs">•</span>
                  <span className="text-xs font-semibold text-slate-600 font-mono">+91 {customerPhone}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddressConfirmModalOpen(false);
                    setIsMapModalOpen(true);
                  }}
                  className="text-[11px] font-bold text-emerald-700 hover:underline"
                >
                  Change
                </button>
              </div>

              <div className="flex items-start gap-2 pt-2 border-t border-[#EEE7DC]/80 text-xs text-slate-700 leading-snug">
                <span className="material-symbols-outlined text-[#E25822] text-[18px] shrink-0 mt-0.5">location_on</span>
                <div>
                  <span className="font-bold text-slate-900">{flat}</span>, {street}
                  {landmark && <span> (Near {landmark})</span>}
                  <div className="text-[11px] font-bold text-emerald-700 mt-1 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    <span>Sagore, Pithampur - {pincode}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={executeOrderPlacement}
                disabled={placingOrder}
                className="w-full py-3.5 rounded-xl bg-[#008848] hover:bg-[#00703c] text-white font-extrabold text-sm shadow-md active:scale-98 transition-all flex items-center justify-center gap-2"
              >
                {placingOrder ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>Confirm &amp; Proceed</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAddressConfirmModalOpen(false);
                  setIsMapModalOpen(true);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all text-center"
              >
                Change Delivery Address
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Customer Auth Modal */}
      <CustomerAuthModal
        isOpen={isAuthOpen}
        initialTab={authModalTab}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(user: UserProfile) => {
          setCurrentUser(user);
          if (user.name) setCustomerName(user.name);
          if (user.phone) setCustomerPhone(user.phone);
          if (user.savedAddress) {
            if (user.savedAddress.flat) setFlat(user.savedAddress.flat);
            if (user.savedAddress.street) setStreet(user.savedAddress.street);
            if (user.savedAddress.landmark) setLandmark(user.savedAddress.landmark);
            if (user.savedAddress.pincode) setPincode(user.savedAddress.pincode);
          }
          showToast(`Welcome ${user.name || user.phone}!`);
        }}
      />

      {/* Location & Map Selector Modal */}
      <LocationMapModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        initialPincode={pincode}
        initialFlat={flat}
        initialStreet={street}
        initialLandmark={landmark}
        onConfirm={(loc: LocationData) => {
          setFlat(loc.flat);
          setStreet(loc.street);
          setLandmark(loc.landmark);
          setPincode(loc.pincode);
          setDetectedCity(loc.city);
          setIsMapModalOpen(false);
          showToast(`✓ Location updated: ${loc.street}, ${loc.city} (${loc.pincode})`);
          requestQuoteRef.current(true);
        }}
      />
    </main>
  );
}
