'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api, RiderDelivery, UserProfile } from '../../lib/api';

const LiveDeliveryMap = dynamic(() => import('../../components/LiveDeliveryMap'), { ssr: false });

export default function RiderPage() {
  const [deliveries, setDeliveries] = useState<RiderDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOnDuty, setIsOnDuty] = useState(true);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');

  // Rider Auth State
  const [riderUser, setRiderUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isTogglingDuty, setIsTogglingDuty] = useState(false);

  // Keypad & PIN Verification State
  const [selectedOrder, setSelectedOrder] = useState<RiderDelivery | null>(null);
  const [pinDigits, setPinDigits] = useState<string[]>([]);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // In-App Map & Route Navigation State
  const [activeMapDelivery, setActiveMapDelivery] = useState<RiderDelivery | null>(null);
  const [riderGps, setRiderGps] = useState<{ lat: number; lng: number } | null>(null);
  const [isGpsLocating, setIsGpsLocating] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Offline Telemetry Buffer & Route Optimization State (Ola Maps)
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [isOptimizingRoute, setIsOptimizingRoute] = useState(false);
  const [optimizedRouteData, setOptimizedRouteData] = useState<{
    orderedIds: string[];
    totalDistanceKm: number;
    estimatedDurationMinutes: number;
  } | null>(null);

  const SAGORE_KITCHEN_COORDS = { lat: 22.6288, lng: 75.5684 };

  const formatOrderTime = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      let hours = d.getHours();
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const timeStr = `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;

      if (isToday) {
        return `Today, ${timeStr}`;
      }
      const day = d.getDate();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getMonth()];
      return `${day} ${month}, ${timeStr}`;
    } catch {
      return '';
    }
  };

  const formatRelativeTime = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      if (isNaN(diffMs) || diffMs < 0) return 'Just now';
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      const remMins = diffMins % 60;
      if (diffHours < 24) {
        return remMins > 0 ? `${diffHours}h ${remMins}m ago` : `${diffHours}h ago`;
      }
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  const calculateDistanceKm = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }, []);

  // Calculate delivery distance & ETA based on real live rider location & trip phase (Kitchen pickup vs Drop-off)
  const getDeliveryDistanceAndEta = useCallback(
    (del: RiderDelivery) => {
      const destLat = del.coordinates?.latitude || 22.6312;
      const destLng = del.coordinates?.longitude || 75.5715;

      const isOutForDelivery = del.status === 'OUT_FOR_DELIVERY' || del.status === 'DISPATCHED';

      const kitchenToCustomerKm = calculateDistanceKm(
        SAGORE_KITCHEN_COORDS.lat,
        SAGORE_KITCHEN_COORDS.lng,
        destLat,
        destLng
      );

      if (!riderGps) {
        // Without rider GPS, calculate distance from kitchen to customer
        const etaMins = Math.max(5, Math.round(kitchenToCustomerKm * 3.2 + 3));
        return {
          distanceKm: kitchenToCustomerKm,
          etaMins,
          isLiveRiderLocation: false,
          isOutForDelivery: false,
          riderToKitchenKm: null as number | null,
          kitchenToCustomerKm,
          totalTripKm: kitchenToCustomerKm,
          label: `~${kitchenToCustomerKm} km (Kitchen ➔ Drop)`,
          sublabel: 'Turn on GPS for live distance from your location',
        };
      }

      // Live Rider GPS is active (calculates accurately even if rider is 200 km away testing)
      const riderToKitchenKm = calculateDistanceKm(
        riderGps.lat,
        riderGps.lng,
        SAGORE_KITCHEN_COORDS.lat,
        SAGORE_KITCHEN_COORDS.lng
      );

      const riderToCustomerKm = calculateDistanceKm(
        riderGps.lat,
        riderGps.lng,
        destLat,
        destLng
      );

      if (isOutForDelivery) {
        // Food is already picked up: Rider goes directly to customer
        const etaMins = Math.max(3, Math.round(riderToCustomerKm * 3.2 + 2));
        return {
          distanceKm: riderToCustomerKm,
          etaMins,
          isLiveRiderLocation: true,
          isOutForDelivery: true,
          riderToKitchenKm: 0,
          kitchenToCustomerKm,
          totalTripKm: riderToCustomerKm,
          label: `~${riderToCustomerKm} km (You ➔ Drop)`,
          sublabel: 'Food picked up • On the way to customer',
        };
      } else {
        // Order pending pickup: Rider travels to Kitchen first, then delivers to Customer
        const isAtKitchen = riderToKitchenKm < 0.25;
        const totalTripKm = isAtKitchen
          ? kitchenToCustomerKm
          : Math.round((riderToKitchenKm + kitchenToCustomerKm) * 10) / 10;
        const etaMins = Math.max(5, Math.round(totalTripKm * 3.2 + 5));

        return {
          distanceKm: totalTripKm,
          etaMins,
          isLiveRiderLocation: true,
          isOutForDelivery: false,
          riderToKitchenKm: isAtKitchen ? 0 : riderToKitchenKm,
          kitchenToCustomerKm,
          totalTripKm,
          label: isAtKitchen
            ? `~${kitchenToCustomerKm} km (At Kitchen ➔ Drop)`
            : `~${totalTripKm} km total route`,
          sublabel: isAtKitchen
            ? 'At Kitchen • Waiting for food handover'
            : `You ➔ Kitchen: ~${riderToKitchenKm} km • Kitchen ➔ Drop: ~${kitchenToCustomerKm} km`,
        };
      }
    },
    [riderGps, calculateDistanceKm, SAGORE_KITCHEN_COORDS]
  );

  const showRiderToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Request Rider GPS silently or with user prompt
  const requestRiderGps = useCallback((forcePrompt = false) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    if (!forcePrompt && typeof window !== 'undefined') {
      const isAllowed = localStorage.getItem('jr_rider_gps_enabled') === 'true';
      if (!isAllowed) return;
    }

    setIsGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const heading = pos.coords.heading ?? 0;
        const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;

        setRiderGps({ lat, lng });
        setIsGpsLocating(false);
        try { localStorage.setItem('jr_rider_gps_enabled', 'true'); } catch {}
        api.updateRiderLocation({ latitude: lat, longitude: lng, heading, speed }).catch(() => {});
        if (forcePrompt) showRiderToast('GPS active • Location synced with live map');
      },
      (err) => {
        setIsGpsLocating(false);
        console.warn('Rider GPS notice:', err.message);
        if (forcePrompt) showRiderToast('Could not access GPS. Distances calculated from Sagore Kitchen.');
      },
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 30000 }
    );
  }, []);

  // Smart multi-stop route sequence optimizer (powered by Ola Maps Route Optimizer)
  const handleOptimizeDeliveryRoute = async () => {
    if (activeDeliveries.length < 2) return;
    setIsOptimizingRoute(true);

    const origin = riderGps
      ? { lat: riderGps.lat, lng: riderGps.lng }
      : SAGORE_KITCHEN_COORDS;

    const stops = activeDeliveries.map((d) => ({
      id: d.orderId,
      lat: d.coordinates?.latitude || 22.6312,
      lng: d.coordinates?.longitude || 75.5715,
      title: `${d.customerName} (#${d.orderNumber})`,
    }));

    try {
      const res = await api.optimizeRoute(origin, stops);
      if (res && res.orderedStops && res.orderedStops.length > 0) {
        setOptimizedRouteData({
          orderedIds: res.orderedStops.map((s) => s.id),
          totalDistanceKm: res.totalDistanceKm,
          estimatedDurationMinutes: res.estimatedDurationMinutes,
        });
        showRiderToast(`✓ Sequence optimized via Ola Maps (~${res.totalDistanceKm} km total)`);
      }
    } catch {
      showRiderToast('Route optimization completed with standard sequence');
    } finally {
      setIsOptimizingRoute(false);
    }
  };


  // Check saved GPS permission on mount
  useEffect(() => {
    if (riderUser && isOnDuty) {
      requestRiderGps(false);
    }
  }, [riderUser, isOnDuty, requestRiderGps]);

  // Continuous Rider GPS Telemetry Watcher (Swiggy/Zomato style distance-throttled updates with offline buffering)
  useEffect(() => {
    if (!riderUser || !isOnDuty || typeof navigator === 'undefined' || !navigator.geolocation) return;

    let lastSentLat = 0;
    let lastSentLng = 0;
    let lastSentTime = 0;

    // Flush any pending offline queue when connectivity is restored
    const flushOfflineQueue = async () => {
      try {
        const stored = localStorage.getItem('jr_offline_telemetry_queue');
        if (!stored) return;
        const queue = JSON.parse(stored);
        if (Array.isArray(queue) && queue.length > 0) {
          const latest = queue[queue.length - 1];
          await api.updateRiderLocation(latest);
          localStorage.removeItem('jr_offline_telemetry_queue');
          setOfflineQueueCount(0);
          showRiderToast('🟢 GPS synced: flushed offline telemetry');
        }
      } catch {}
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', flushOfflineQueue);
      // Check initial stored queue count
      try {
        const stored = localStorage.getItem('jr_offline_telemetry_queue');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) setOfflineQueueCount(parsed.length);
        }
      } catch {}
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const now = Date.now();

        // Distance thresholding: only send to server if moved > 15m or 10s elapsed
        const distKm = calculateDistanceKm(lastSentLat, lastSentLng, lat, lng);
        if (distKm > 0.015 || now - lastSentTime > 10000) {
          lastSentLat = lat;
          lastSentLng = lng;
          lastSentTime = now;
          setRiderGps({ lat, lng });

          const telemetryPayload = {
            latitude: lat,
            longitude: lng,
            heading: pos.coords.heading ?? 0,
            speed: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0,
          };

          api
            .updateRiderLocation(telemetryPayload)
            .then(() => {
              setOfflineQueueCount(0);
              localStorage.removeItem('jr_offline_telemetry_queue');
            })
            .catch(() => {
              // Network failed (Pithampur industrial dead zone): buffer offline
              try {
                const stored = localStorage.getItem('jr_offline_telemetry_queue');
                const queue = stored ? JSON.parse(stored) : [];
                const updated = [...queue, telemetryPayload].slice(-15);
                localStorage.setItem('jr_offline_telemetry_queue', JSON.stringify(updated));
                setOfflineQueueCount(updated.length);
              } catch {}
            });
        }
      },
      (err) => {
        console.warn('GPS watcher notice:', err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', flushOfflineQueue);
      }
    };
  }, [riderUser, isOnDuty, calculateDistanceKm]);

  // Initial Auth Check
  useEffect(() => {
    async function checkRiderAuth() {
        if (typeof window !== 'undefined') localStorage.removeItem('jr_demo_rider_deliveries');
      try {
        const user = await api.getCurrentUser('RIDER');
        if (user && user.role === 'RIDER') {
          setRiderUser(user);
          if (user.riderProfile?.isAvailable !== undefined) {
            setIsOnDuty(user.riderProfile.isAvailable);
          }
        } else {
          const cached = typeof window !== 'undefined' ? localStorage.getItem('jr_rider_profile') : null;
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              setRiderUser(parsed);
              if (parsed?.riderProfile?.isAvailable !== undefined) {
                setIsOnDuty(parsed.riderProfile.isAvailable);
              }
            } catch {}
          }
        }
      } finally {
        setAuthChecking(false);
      }
    }
    checkRiderAuth();
  }, []);

  const handleRiderLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);
    try {
      const res = await api.loginRider(loginPhone.trim(), loginPassword.trim());
      setRiderUser(res.user);
      if (res.user?.riderProfile?.isAvailable !== undefined) {
        setIsOnDuty(res.user.riderProfile.isAvailable);
      }
      loadDeliveries();
    } catch (err: any) {
      setLoginError(err.message || 'Invalid rider phone or password.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleToggleDuty = async () => {
    if (isTogglingDuty) return;
    const nextStatus = !isOnDuty;
    setIsTogglingDuty(true);
    setIsOnDuty(nextStatus);
    try {
      await api.updateRiderDutyStatus(nextStatus);
      if (riderUser && riderUser.riderProfile) {
        const updated = {
          ...riderUser,
          riderProfile: {
            ...riderUser.riderProfile,
            isAvailable: nextStatus,
          },
        };
        setRiderUser(updated);
        if (typeof window !== 'undefined') {
          localStorage.setItem('jr_rider_profile', JSON.stringify(updated));
        }
      }
    } catch (err: any) {
      console.warn('Failed to update duty status on server:', err.message);
      setIsOnDuty(!nextStatus);
    } finally {
      setIsTogglingDuty(false);
    }
  };

  const handleRiderLogout = async () => {
    await api.logout('RIDER');
    setRiderUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('jr_rider_token');
      localStorage.removeItem('jr_rider_profile');
    }
  };

  const prevDeliveriesCountRef = React.useRef(0);

  // Synthesizer Web Audio API chime for new delivery alerts
  const playRiderNotificationChime = useCallback(() => {
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
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }, []);

  // Fetch Assigned Deliveries with Real-Time Delta Detection
  const loadDeliveries = useCallback(async (isBackground = false, signal?: AbortSignal) => {
    if (!isBackground) setLoading(true);
    setIsRefreshing(true);
    try {
      const data = await api.getRiderDeliveries(signal);
      if (signal?.aborted) return;
      if (data && data.deliveries) {
        const activeTrips = data.deliveries.filter((d) => d.status !== 'DELIVERED');
        if (isBackground && activeTrips.length > prevDeliveriesCountRef.current) {
          playRiderNotificationChime();
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([150, 70, 150]);
          }
          const latest = activeTrips[0];
          setToastMsg(`⚡ Naya Order Assign Hua: #${latest?.orderNumber || 'Order'}`);
          setTimeout(() => setToastMsg(null), 4000);
        }
        prevDeliveriesCountRef.current = activeTrips.length;
        setDeliveries(data.deliveries);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('Rider deliveries fetch notice:', err.message);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [playRiderNotificationChime]);

  // Real-Time Delivery Stream (BroadcastChannel + SSE + 3s Auto-Poll)
  useEffect(() => {
    if (!riderUser) {
      setLoading(false);
      return;
    }

    // 1. Initial Load
    loadDeliveries(false);

    // 2. High-Frequency Resilient Polling (every 3 seconds for instant updates)
    const interval = setInterval(() => {
      loadDeliveries(true);
    }, 3000);

    // 3. Tab Visibility & Window Focus Auto-Refresh
    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        loadDeliveries(true);
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // 4. Cross-Tab Zero-Latency BroadcastChannel (0ms real-time from Admin tab)
    let ordersBroadcast: BroadcastChannel | null = null;
    try {
      ordersBroadcast = new BroadcastChannel('jankirasoi_orders_channel');
      ordersBroadcast.onmessage = (event) => {
        if (event.data?.type === 'RIDER_ASSIGNED' || event.data?.type === 'ORDER_CREATED' || event.data?.type === 'ORDER_UPDATED') {
          loadDeliveries(true);
        }
      };
    } catch {}

    // 5. Server-Sent Events (SSE) Real-Time Stream from API
    let eventSource: EventSource | null = null;
    try {
      const apiHost = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
      const token = typeof window !== 'undefined' ? localStorage.getItem('jr_rider_token') : null;
      const riderPhone = riderUser?.phone || '';
      const streamUrl = `${apiHost}/api/v1/rider/deliveries/stream?simulated_role=RIDER${token ? `&token=${token}` : ''}${riderPhone ? `&rider_phone=${encodeURIComponent(riderPhone)}` : ''}`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'PING') return;
          loadDeliveries(true);
        } catch {
          loadDeliveries(true);
        }
      };

      eventSource.onerror = () => {
        // Automatically reconnects; fallback interval will handle updates
      };
    } catch (e) {
      console.warn('Rider SSE stream connection fallback:', e);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (ordersBroadcast) {
        ordersBroadcast.close();
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [loadDeliveries, riderUser]);

  // Handle Accept Assigned Delivery
  const handleAcceptTrip = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await api.acceptRiderDelivery(orderId);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80]);
      }
      setDeliveries((prev) =>
        prev.map((d) => (d.orderId === orderId ? { ...d, assignmentStatus: 'ACCEPTED' } : d))
      );
      await loadDeliveries(true);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('credentials')) {
        showRiderToast('Rider session expired. Please sign in again.');
        setRiderUser(null);
      } else {
        alert(msg || 'Failed to accept delivery assignment.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Mark Out For Delivery
  const handleStartTrip = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await api.markRiderOutForDelivery(orderId);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100]);
      }
      await loadDeliveries(true);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('credentials')) {
        showRiderToast('Rider session expired. Please sign in again.');
        setRiderUser(null);
      } else {
        alert(msg || 'Failed to start delivery trip.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open PIN Modal
  const openPinModal = (delivery: RiderDelivery) => {
    setSelectedOrder(delivery);
    setPinDigits([]);
    setPinError(null);
    setVerifySuccess(false);
  };

  // Close PIN Modal
  const closePinModal = () => {
    setSelectedOrder(null);
    setPinDigits([]);
    setPinError(null);
    setVerifySuccess(false);
  };

  // Keypad Digit Click
  const handleKeypadPress = (digit: string) => {
    if (isVerifying || verifySuccess) return;
    if (pinDigits.length < 6) {
      const updated = [...pinDigits, digit];
      setPinDigits(updated);
      setPinError(null);

      // Auto-submit on 6th digit
      if (updated.length === 6) {
        submitPinVerification(updated.join(''));
      }
    }
  };

  // Keypad Backspace
  const handleBackspace = () => {
    if (isVerifying || verifySuccess) return;
    setPinDigits((prev) => prev.slice(0, -1));
    setPinError(null);
  };

  // Submit PIN Verification
  const submitPinVerification = async (pinCode: string) => {
    if (!selectedOrder) return;
    setIsVerifying(true);
    setPinError(null);

    try {
      await api.verifyRiderDeliveryOtp(selectedOrder.orderId, pinCode);
      setVerifySuccess(true);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([100, 50, 150]);
      }
      setTimeout(async () => {
        closePinModal();
        await loadDeliveries(true);
      }, 1500);
    } catch (err: any) {
      setPinError(err.message || 'Incorrect PIN. Ask customer for the 6-digit code on their live screen.');
      setPinDigits([]);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([300]);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Deduplicate deliveries by orderId to guarantee no duplicate cards and sort newest at the top
  const uniqueDeliveries = Array.from(
    new Map(deliveries.map((d) => [d.orderId, d])).values()
  ).sort((a, b) => {
    const timeA = new Date(a.assignedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.assignedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  const activeDeliveries = uniqueDeliveries.filter(
    (d) => d.status !== 'DELIVERED' && d.status !== 'CANCELLED'
  );
  const completedDeliveries = uniqueDeliveries.filter(
    (d) => d.status === 'DELIVERED'
  );
  const displayList =
    activeTab === 'ACTIVE'
      ? (optimizedRouteData && optimizedRouteData.orderedIds.length > 0
          ? [...activeDeliveries].sort((a, b) => {
              const idxA = optimizedRouteData.orderedIds.indexOf(a.orderId);
              const idxB = optimizedRouteData.orderedIds.indexOf(b.orderId);
              if (idxA === -1 && idxB === -1) return 0;
              if (idxA === -1) return 1;
              if (idxB === -1) return -1;
              return idxA - idxB;
            })
          : activeDeliveries)
      : completedDeliveries;

  return (
    <div className="min-h-screen bg-[#FFF9F0] text-[#292D26] flex flex-col font-body pb-16 selection:bg-[#38754A] selection:text-white">
      {/* Top Rider Header (Optimized for Mobile, Tablet and Laptop) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#EEE7DC] px-4 sm:px-6 lg:px-8 py-2.5 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Left Brand & Profile Info */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="w-8 h-8 rounded-full bg-[#38754A] text-white font-bold flex items-center justify-center text-xs shadow-xs shrink-0">
              JR
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <h1 className="font-headline font-bold text-xs sm:text-sm md:text-base text-[#292D26] leading-tight truncate">
                  Rider Portal
                </h1>
                <span className="hidden sm:inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#EAF4ED] text-[#38754A] border border-[#38754A]/30 shrink-0">
                  PARTNER
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-[#77786F] truncate">
                {riderUser
                  ? `${riderUser.name} • ${riderUser.riderProfile?.vehicleNumber || 'DL-01-AB-1234'}`
                  : 'Delivery Partner'}
              </p>
            </div>
          </div>

          {/* Right Action Controls */}
          {riderUser ? (
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Offline Telemetry Badge */}
              {offlineQueueCount > 0 && (
                <div
                  title={`${offlineQueueCount} GPS update(s) stored locally. Will auto-sync to server when network reconnects.`}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1 shrink-0 animate-pulse"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <span>Offline ({offlineQueueCount})</span>
                </div>
              )}

              {/* Rider GPS toggle button */}
              <button
                type="button"
                onClick={() => requestRiderGps(true)}
                disabled={isGpsLocating}
                title={riderGps ? 'GPS Active • Distances Calibrated' : 'Calibrate GPS Location'}
                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors shadow-2xs shrink-0 ${
                  riderGps
                    ? 'bg-[#EAF4ED] text-[#38754A] border-[#38754A]/30'
                    : 'bg-white text-[#77786F] border-[#EEE7DC] hover:text-[#292D26]'
                }`}
              >
                <span className={`material-symbols-outlined text-[17px] ${isGpsLocating ? 'animate-spin' : ''}`}>
                  {isGpsLocating ? 'sync' : riderGps ? 'my_location' : 'location_searching'}
                </span>
              </button>

              {/* Duty Status Toggle (Compact pill) */}
              <button
                onClick={handleToggleDuty}
                disabled={isTogglingDuty}
                title={isOnDuty ? 'Tap to go offline' : 'Tap to go on duty'}
                className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold flex items-center gap-1 transition-colors border shadow-2xs shrink-0 ${
                  isOnDuty
                    ? 'bg-[#EAF4ED] text-[#38754A] border-[#38754A]/30'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                } ${isTogglingDuty ? 'opacity-70 cursor-wait' : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOnDuty ? 'bg-[#38754A] animate-pulse' : 'bg-rose-500'}`}></span>
                <span>{isTogglingDuty ? '...' : isOnDuty ? 'DUTY' : 'OFF'}</span>
              </button>

              {/* Quick Refresh */}
              <button
                onClick={() => loadDeliveries()}
                disabled={isRefreshing}
                aria-label="Refresh deliveries"
                title="Refresh deliveries"
                className="w-8 h-8 rounded-full bg-white border border-[#EEE7DC] flex items-center justify-center text-[#77786F] hover:text-[#292D26] shadow-2xs active:scale-95 transition-all shrink-0"
              >
                <svg
                  className={`w-[17px] h-[17px] text-[#77786F] transition-transform ${isRefreshing ? 'animate-spin-reverse' : ''}`}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                </svg>
              </button>

              {/* End Shift / Sign out */}
              <button
                onClick={handleRiderLogout}
                title="End Shift / Logout"
                className="w-8 h-8 rounded-full bg-white border border-[#EEE7DC] hover:bg-rose-50 text-[#77786F] hover:text-rose-600 flex items-center justify-center transition-colors shadow-2xs shrink-0"
              >
                <span className="material-symbols-outlined text-[17px]">logout</span>
              </button>
            </div>
          ) : (
            <Link
              href="/"
              className="text-xs text-[#38754A] hover:text-[#285C38] flex items-center gap-1 font-bold bg-[#EAF4ED] px-3 py-1.5 rounded-full border border-[#38754A]/20 transition-colors shadow-2xs shrink-0"
            >
              <span>Store</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          )}
        </div>
      </header>

      {/* Unauthenticated State: Show Clean Rider Login Screen */}
      {!riderUser && !authChecking ? (
        <main className="flex-1 max-w-md mx-auto w-full px-4 py-8 flex flex-col justify-center">
          <div className="bg-white border border-[#EEE7DC] rounded-3xl p-6 sm:p-8 shadow-sm space-y-5">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 rounded-2xl bg-[#EAF4ED] border border-[#38754A]/20 text-[#38754A] flex items-center justify-center mx-auto text-3xl shadow-xs">
                🛵
              </div>
              <h2 className="font-headline font-bold text-xl text-[#292D26]">Rider Shift Sign-in</h2>
              <p className="text-xs text-[#77786F] leading-relaxed">
                Enter your registered rider mobile number and credentials to access delivery assignments.
              </p>
            </div>

            {loginError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-rose-500">error</span>
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleRiderLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#292D26] uppercase tracking-wider mb-1.5">
                  Rider Phone Number
                </label>
                <input
                  type="tel"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="9811223344"
                  className="w-full px-4 py-3 bg-[#FFF9F0] border border-[#EEE7DC] rounded-xl text-sm font-semibold text-[#292D26] placeholder-[#77786F] focus:border-[#38754A] focus:bg-white focus:outline-none transition-all shadow-2xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#292D26] uppercase tracking-wider mb-1.5">
                  Shift Password / PIN
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-[#FFF9F0] border border-[#EEE7DC] rounded-xl text-sm font-semibold text-[#292D26] placeholder-[#77786F] focus:border-[#38754A] focus:bg-white focus:outline-none transition-all shadow-2xs"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-3.5 bg-[#38754A] hover:bg-[#285C38] active:scale-98 text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
              >
                {loginLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Start Delivery Shift</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginPhone('987654321');
                  setLoginPassword('200720');
                  setLoginError(null);
                }}
                className="w-full py-2.5 bg-[#FFF9F0] hover:bg-[#F3EADF] text-xs text-[#38754A] font-bold rounded-xl border border-[#EEE7DC] transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">bolt</span>
                <span>Quick Fill Registered Rider (987654321)</span>
              </button>
            </form>
          </div>
        </main>
      ) : (
        <>
          {/* Rider Notice / PWA Banner */}
          <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-3">
            <div className="bg-white border border-[#EEE7DC] rounded-2xl p-3 sm:p-4 flex items-center justify-between text-xs sm:text-sm shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#EAF4ED] text-[#38754A] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px]">verified</span>
                </div>
                <span className="text-[#292D26]">
                  <strong className="text-[#38754A]">Handover:</strong> Enter customer PIN upon arrival to finish.
                </span>
              </div>
              <Link href="/" className="text-[#38754A] font-bold hover:underline text-xs shrink-0">
                Storefront ›
              </Link>
            </div>
          </div>

          {/* Tabs: Active vs Completed */}
          <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-3">
            <div className="grid grid-cols-2 bg-white p-1 rounded-2xl border border-[#EEE7DC] shadow-2xs sm:max-w-md">
              <button
                onClick={() => setActiveTab('ACTIVE')}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'ACTIVE'
                    ? 'bg-[#38754A] text-white shadow-xs'
                    : 'text-[#77786F] hover:text-[#292D26]'
                }`}
              >
                <span>Active Trips</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'ACTIVE' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {activeDeliveries.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('COMPLETED')}
                className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'COMPLETED'
                    ? 'bg-[#38754A] text-white shadow-xs'
                    : 'text-[#77786F] hover:text-[#292D26]'
                }`}
              >
                <span>Completed</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'COMPLETED' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {completedDeliveries.length}
                </span>
              </button>
            </div>
          </div>

          {/* Deliveries Feed */}
          <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4 pb-12 flex-1">
            {/* Smart Delivery Route Sequence Banner (Ola Maps) */}
            {activeTab === 'ACTIVE' && activeDeliveries.length >= 2 && (
              <div className="mb-4 bg-gradient-to-r from-[#EAF4ED] to-[#F4F9F5] border border-[#38754A]/30 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
                <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#38754A] text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <span className="material-symbols-outlined text-[20px]">alt_route</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-bold text-[#292D26]">
                        Smart Delivery Sequence
                      </h3>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-[#38754A]/10 text-[#38754A] border border-[#38754A]/20">
                        Ola Maps
                      </span>
                    </div>
                    <p className="text-[11px] text-[#77786F]">
                      {optimizedRouteData
                        ? `Optimized for ${optimizedRouteData.orderedIds.length} stops • Total ~${optimizedRouteData.totalDistanceKm} km (${optimizedRouteData.estimatedDurationMinutes} mins)`
                        : `Auto-order deliveries from ${riderGps ? 'your live GPS' : 'Sagore Kitchen'} for shortest travel time`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOptimizeDeliveryRoute}
                  disabled={isOptimizingRoute}
                  className="px-3.5 py-1.5 rounded-xl bg-[#38754A] hover:bg-[#285C38] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 disabled:opacity-60 cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-[16px] ${isOptimizingRoute ? 'animate-spin' : ''}`}>
                    {isOptimizingRoute ? 'sync' : 'auto_fix_high'}
                  </span>
                  <span>{isOptimizingRoute ? 'Optimizing...' : optimizedRouteData ? 'Re-optimize' : 'Optimize Sequence'}</span>
                </button>
              </div>
            )}

            {loading && deliveries.length === 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="h-44 bg-white border border-[#EEE7DC] rounded-2xl animate-pulse"></div>
                <div className="h-44 bg-white border border-[#EEE7DC] rounded-2xl animate-pulse"></div>
              </div>
            ) : displayList.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-[#EEE7DC] shadow-xs text-center flex flex-col items-center gap-3 my-6 max-w-md mx-auto">
                <div className="w-14 h-14 rounded-full bg-[#EAF4ED] text-[#38754A] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[32px]">two_wheeler</span>
                </div>
                <h2 className="font-bold text-base text-[#292D26]">
                  {activeTab === 'ACTIVE' ? 'No Active Delivery Trips' : 'No Completed Trips Today'}
                </h2>
                <p className="text-xs text-[#77786F] max-w-xs leading-relaxed">
                  {activeTab === 'ACTIVE'
                    ? 'When kitchen marks orders Ready for Dispatch, they will appear here automatically.'
                    : 'Delivered orders will be logged in this tab after PIN verification.'}
                </p>
                {activeTab === 'ACTIVE' && (
                  <button
                    onClick={() => loadDeliveries()}
                    className="mt-2 px-4 py-2 rounded-full bg-[#38754A] hover:bg-[#285C38] font-bold text-xs text-white flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 text-white transition-transform ${isRefreshing ? 'animate-spin-reverse' : ''}`}
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
                    </svg>
                    Check for New Batches
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayList.map((del) => {
                const isOutOfDelivery = del.status === 'OUT_FOR_DELIVERY';
                const isReady = del.status === 'READY_FOR_PICKUP';
                const isDelivered = del.status === 'DELIVERED';
                const isPendingAcceptance = del.assignmentStatus === 'ASSIGNED' && !isOutOfDelivery && !isDelivered;

                return (
                  <div
                    key={del.orderId}
                    className="bg-white rounded-2xl border border-[#EEE7DC] shadow-xs p-4 flex flex-col gap-3 transition-all"
                  >
                    {/* Order Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-mono font-bold text-[#38754A]">
                            #{del.orderNumber}
                          </span>
                          {optimizedRouteData && activeTab === 'ACTIVE' && (() => {
                            const stopIdx = optimizedRouteData.orderedIds.indexOf(del.orderId);
                            if (stopIdx !== -1) {
                              return (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-[#38754A] px-2 py-0.5 rounded-md shadow-2xs">
                                  <span className="material-symbols-outlined text-[12px]">pin_drop</span>
                                  Stop #{stopIdx + 1}
                                </span>
                              );
                            }
                            return null;
                          })()}
                          {del.createdAt && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                              <span className="material-symbols-outlined text-[13px] text-[#38754A]">schedule</span>
                              {formatOrderTime(del.createdAt)}
                            </span>
                          )}
                          {del.createdAt && (
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded">
                              {formatRelativeTime(del.createdAt)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-[#77786F] mt-1 flex-wrap">
                          <span>{del.slotLabel}</span>
                          {del.assignedAt && (
                            <span className="text-[10px] text-slate-400">
                              • Assigned {formatOrderTime(del.assignedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${
                          isDelivered
                            ? 'bg-[#EAF4ED] text-[#38754A] border border-[#38754A]/30'
                            : isOutOfDelivery
                            ? 'bg-[#FFF1DC] text-[#E99A32] border border-[#E99A32]/40 animate-pulse'
                            : isPendingAcceptance
                            ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {isDelivered
                          ? 'DELIVERED'
                          : isOutOfDelivery
                          ? 'ON THE WAY'
                          : isPendingAcceptance
                          ? 'DISPATCH PENDING'
                          : 'READY AT KITCHEN'}
                      </span>
                    </div>

                    {/* Items Summary & Payment */}
                    <div className="flex items-center justify-between text-xs bg-[#FFF9F0] p-2.5 rounded-xl border border-[#EEE7DC]">
                      <div className="truncate pr-2">
                        <span className="text-[#77786F] block text-[10px] font-bold uppercase tracking-wider">Meals</span>
                        <span className="font-semibold text-[#292D26] truncate block">{del.itemsSummary}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[#77786F] block text-[10px] font-bold uppercase tracking-wider">Payment</span>
                        {del.cashDuePaise > 0 ? (
                          <span className="font-bold text-[#E99A32] text-xs">
                            COD: Collect ₹{(del.cashDuePaise / 100).toFixed(2)}
                          </span>
                        ) : (
                          <span className="font-bold text-[#38754A] text-xs">PAID ONLINE ✓</span>
                        )}
                      </div>
                    </div>

                    {/* Customer Details & Address */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-[#292D26] flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[#77786F] text-[18px]">person</span>
                          {del.customerName}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (typeof navigator !== 'undefined' && navigator.clipboard) {
                                navigator.clipboard.writeText(
                                  `${del.customerName}, ${del.deliveryAddress}${del.landmark ? ' (Landmark: ' + del.landmark + ')' : ''}`
                                );
                                showRiderToast('Address copied!');
                              }
                            }}
                            title="Copy customer delivery address"
                            className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[15px]">content_copy</span>
                          </button>
                          <a
                            href={`tel:${del.customerPhone}`}
                            className="px-3 py-1 rounded-full bg-[#38754A] hover:bg-[#285C38] text-white font-bold text-xs flex items-center gap-1 active:scale-95 transition-transform shadow-2xs"
                          >
                            <span className="material-symbols-outlined text-[15px]">call</span>
                            Call
                          </a>
                        </div>
                      </div>
                      <div className="text-xs text-[#292D26] flex items-start gap-1.5 bg-[#FFF9F0] p-2.5 rounded-xl border border-[#EEE7DC]">
                        <span className="material-symbols-outlined text-[#38754A] text-[18px] shrink-0 mt-0.5">
                          location_on
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="text-[10px] font-bold text-[#77786F] uppercase tracking-wider">
                              Drop Location
                            </span>
                            {(() => {
                              const info = getDeliveryDistanceAndEta(del);
                              return (
                                <div className="flex flex-col items-end gap-1">
                                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                    <span className="text-[10px] font-bold text-[#38754A] flex items-center gap-0.5 bg-[#EAF4ED] border border-[#38754A]/30 px-1.5 py-0.5 rounded-md">
                                      <span className="material-symbols-outlined text-[12px]">schedule</span>
                                      <span>~{info.etaMins} mins</span>
                                    </span>
                                    <span className="text-[10px] font-semibold text-slate-700 flex items-center gap-0.5 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-md">
                                      <span className="material-symbols-outlined text-[12px] text-[#38754A]">near_me</span>
                                      <span>{info.label}</span>
                                    </span>
                                  </div>
                                  {info.sublabel && (
                                    <span className="text-[9.5px] text-slate-500 font-medium text-right max-w-[260px] truncate" title={info.sublabel}>
                                      {info.sublabel}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          <p className="leading-snug font-medium text-slate-800">{del.deliveryAddress}</p>
                          {del.landmark && (
                            <p className="text-[11px] text-[#38754A] font-semibold mt-0.5 flex items-center gap-1">
                              <span>Landmark:</span>
                              <span>{del.landmark}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Customer Delivery Instructions & Preferences */}
                      {del.deliveryNotes && (
                        <div className="text-xs bg-[#FFFDF5] p-2.5 rounded-xl border border-amber-200/90 shadow-2xs">
                          <div className="flex items-center gap-1.5 mb-1.5 text-amber-900">
                            <span className="material-symbols-outlined text-amber-700 text-[16px]">
                              speaker_notes
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">
                              Customer Delivery Instructions
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {del.deliveryNotes.split(/\s*(?:•|\.|\n|;)\s*/).filter(Boolean).map((note, idx) => {
                              const trimmedNote = note.trim();
                              const lower = trimmedNote.toLowerCase();
                              let icon = 'info';
                              if (lower.includes('door')) icon = 'meeting_room';
                              else if (lower.includes('call')) icon = 'phone_paused';
                              else if (lower.includes('bell')) icon = 'notifications_paused';
                              else if (lower.includes('cutlery')) icon = 'flatware';
                              else if (lower.includes('direction')) icon = 'alt_route';
                              else if (lower.includes('cooking')) icon = 'soup_kitchen';

                              return (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100/70 border border-amber-300 text-amber-950 font-bold text-[11px]"
                                >
                                  <span className="material-symbols-outlined text-[13px] text-amber-800">{icon}</span>
                                  <span>{trimmedNote}</span>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {!isDelivered && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {/* In-app Map & Navigation Trigger */}
                        <button
                          type="button"
                          onClick={() => setActiveMapDelivery(del)}
                          className="h-11 rounded-xl bg-white hover:bg-[#FFF9F0] border border-[#EEE7DC] font-bold text-xs flex items-center justify-center gap-1.5 text-[#292D26] active:scale-95 transition-transform shadow-2xs"
                        >
                          <span className="material-symbols-outlined text-[#38754A] text-[18px]">map</span>
                          <span>Map & Route</span>
                        </button>

                        {/* Step Transitions */}
                        {isPendingAcceptance ? (
                          <button
                            onClick={() => handleAcceptTrip(del.orderId)}
                            disabled={actionLoadingId === del.orderId}
                            className="h-11 rounded-xl bg-[#38754A] hover:bg-[#285C38] font-bold text-xs flex items-center justify-center gap-1.5 text-white active:scale-95 transition-transform shadow-xs"
                          >
                            {actionLoadingId === del.orderId ? (
                              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[18px]">thumb_up</span>
                                <span>Accept Delivery</span>
                              </>
                            )}
                          </button>
                        ) : isReady ? (
                          <button
                            onClick={() => handleStartTrip(del.orderId)}
                            disabled={actionLoadingId === del.orderId}
                            className="h-11 rounded-xl bg-[#38754A] hover:bg-[#285C38] font-bold text-xs flex items-center justify-center gap-1.5 text-white active:scale-95 transition-transform shadow-xs"
                          >
                            {actionLoadingId === del.orderId ? (
                              <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[18px]">two_wheeler</span>
                                <span>Start Ride</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => openPinModal(del)}
                            className="h-11 rounded-xl bg-[#E99A32] hover:bg-[#D38520] font-bold text-xs flex items-center justify-center gap-1.5 text-white active:scale-95 transition-all shadow-xs"
                          >
                            <span className="material-symbols-outlined text-[18px]">dialpad</span>
                            <span>Verify PIN</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </main>

          {/* 6-DIGIT CUSTOMER PIN KEYPAD MODAL */}
          {selectedOrder && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
              <div className="bg-white border border-[#EEE7DC] w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4 shadow-2xl">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="font-headline font-bold text-base text-[#292D26]">Enter Customer PIN</h3>
                    <p className="text-xs text-[#77786F]">Order #{selectedOrder.orderNumber}</p>
                  </div>
                  <button
                    onClick={closePinModal}
                    disabled={isVerifying}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                {/* Instruction */}
                <p className="text-xs text-[#77786F] text-center px-2">
                  Ask customer for the <strong className="text-[#38754A]">6-digit handover PIN</strong> displayed on their
                  live tracking screen.
                </p>

                {/* Customer Instructions in PIN Modal */}
                {selectedOrder.deliveryNotes && (
                  <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-950 text-xs">
                    <div className="flex items-center gap-1 font-bold text-amber-900 text-[10px] uppercase tracking-wider mb-1">
                      <span className="material-symbols-outlined text-[14px]">speaker_notes</span>
                      <span>Customer Delivery Instructions:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedOrder.deliveryNotes.split(/\s*(?:•|\.|\n|;)\s*/).filter(Boolean).map((note, idx) => (
                        <span key={idx} className="bg-white border border-amber-300 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">
                          {note.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6 PIN Display Boxes */}
                <div className="flex items-center justify-center gap-2 py-2">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const hasVal = pinDigits[idx] !== undefined;
                    return (
                      <div
                        key={idx}
                        className={`w-11 h-13 rounded-xl flex items-center justify-center text-xl font-mono font-bold transition-all ${
                          verifySuccess
                            ? 'bg-[#EAF4ED] border-2 border-[#38754A] text-[#38754A]'
                            : hasVal
                            ? 'bg-[#FFF1DC] border-2 border-[#E99A32] text-[#292D26] shadow-xs'
                            : 'bg-[#FFF9F0] border border-[#EEE7DC] text-[#77786F]'
                        }`}
                      >
                        {verifySuccess ? (
                          <span className="material-symbols-outlined text-[#38754A] text-[20px]">check</span>
                        ) : hasVal ? (
                          pinDigits[idx]
                        ) : (
                          '•'
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Error or Success feedback */}
                {pinError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs text-center flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    <span>{pinError}</span>
                  </div>
                )}
                {verifySuccess && (
                  <div className="p-2.5 rounded-xl bg-[#EAF4ED] border border-[#38754A]/30 text-[#38754A] text-xs text-center flex items-center justify-center gap-1.5 font-bold">
                    <span className="material-symbols-outlined text-[20px]">verified</span>
                    <span>PIN Verified! Meal Delivered Fresh.</span>
                  </div>
                )}

                {/* Numeric Touch Keypad */}
                <div className="grid grid-cols-3 gap-2 pt-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      onClick={() => handleKeypadPress(digit)}
                      disabled={isVerifying || verifySuccess}
                      className="h-14 rounded-2xl bg-[#FFF9F0] hover:bg-[#F3EADF] active:bg-[#38754A] active:text-white border border-[#EEE7DC] text-xl font-bold font-mono text-[#292D26] flex items-center justify-center shadow-xs active:scale-95 transition-all"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    onClick={() => setPinDigits([])}
                    disabled={isVerifying || verifySuccess || pinDigits.length === 0}
                    className="h-14 rounded-2xl bg-white border border-[#EEE7DC] text-xs font-bold text-[#77786F] hover:text-[#292D26] hover:bg-slate-50 flex items-center justify-center active:scale-95 transition-all"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => handleKeypadPress('0')}
                    disabled={isVerifying || verifySuccess}
                    className="h-14 rounded-2xl bg-[#FFF9F0] hover:bg-[#F3EADF] active:bg-[#38754A] active:text-white border border-[#EEE7DC] text-xl font-bold font-mono text-[#292D26] flex items-center justify-center shadow-xs active:scale-95 transition-all"
                  >
                    0
                  </button>
                  <button
                    onClick={handleBackspace}
                    disabled={isVerifying || verifySuccess || pinDigits.length === 0}
                    className="h-14 rounded-2xl bg-white border border-[#EEE7DC] text-[#77786F] hover:text-[#292D26] hover:bg-slate-50 flex items-center justify-center active:scale-95 transition-all"
                    aria-label="Backspace"
                  >
                    <span className="material-symbols-outlined text-[22px]">backspace</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* IN-APP INTERACTIVE ROUTE & MAP MODAL */}
          {activeMapDelivery && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
              <div className="bg-white border border-[#EEE7DC] w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-3.5 shadow-2xl max-h-[92vh] overflow-hidden">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-headline font-bold text-base text-[#292D26]">Delivery Route & Map</h3>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF4ED] text-[#38754A]">
                        #{activeMapDelivery.orderNumber}
                      </span>
                    </div>
                    <p className="text-xs text-[#77786F]">
                      {activeMapDelivery.customerName} • {activeMapDelivery.slotLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveMapDelivery(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                {/* Real-time Interactive Route & Live Driver Map (Swiggy/Zomato style) */}
                <div className="w-full shrink-0">
                  <LiveDeliveryMap
                    driverLocation={
                      riderGps
                        ? { latitude: riderGps.lat, longitude: riderGps.lng }
                        : null
                    }
                    customerLocation={{
                      latitude: activeMapDelivery.coordinates?.latitude || SAGORE_KITCHEN_COORDS.lat,
                      longitude: activeMapDelivery.coordinates?.longitude || SAGORE_KITCHEN_COORDS.lng,
                      address: activeMapDelivery.deliveryAddress,
                      name: activeMapDelivery.customerName,
                    }}
                    kitchenLocation={{
                      latitude: SAGORE_KITCHEN_COORDS.lat,
                      longitude: SAGORE_KITCHEN_COORDS.lng,
                      name: 'Janki Rasoi Cloud Kitchen',
                    }}
                    orderNumber={activeMapDelivery.orderNumber}
                    status={activeMapDelivery.status}
                    riderName={riderUser?.name || 'You'}
                    riderVehicle={riderUser?.riderProfile?.vehicleNumber || undefined}
                    height="280px"
                    isRiderView={true}
                    onLocationUpdate={(loc) => {
                      setRiderGps({ lat: loc.latitude, lng: loc.longitude });
                      api.updateRiderLocation(loc).catch(() => {});
                    }}
                  />
                </div>

                {/* Route Breakdown: Pickup -> Drop-off */}
                {(() => {
                  const modalDist = getDeliveryDistanceAndEta(activeMapDelivery);
                  return (
                    <div className="flex flex-col gap-2 bg-[#FFF9F0] p-3 rounded-2xl border border-[#EEE7DC] text-xs">
                      {/* Live Rider Location (if GPS available) */}
                      {riderGps && (
                        <div className="flex items-start gap-2.5 pb-2 border-b border-[#EEE7DC]/70">
                          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            📍
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-bold text-[#77786F] uppercase tracking-wider block">
                              Your Live Location
                            </span>
                            <span className="font-bold text-[#292D26] block">
                              {modalDist.riderToKitchenKm !== null && modalDist.riderToKitchenKm > 0
                                ? `~${modalDist.riderToKitchenKm} km away from Sagore Kitchen`
                                : 'At Sagore Kitchen'}
                            </span>
                            <span className="text-[11px] text-[#77786F]">
                              Total Route: ~{modalDist.totalTripKm} km ({modalDist.etaMins} mins estimated travel)
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Pickup Stop */}
                      <div className="flex items-start gap-2.5 pb-2 border-b border-[#EEE7DC]/70">
                        <span className="w-5 h-5 rounded-full bg-[#EAF4ED] text-[#38754A] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          A
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#77786F] uppercase tracking-wider block">
                              Kitchen Pickup
                            </span>
                            {activeMapDelivery.status === 'OUT_FOR_DELIVERY' ? (
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                ✓ Picked Up
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                Pending Pickup
                              </span>
                            )}
                          </div>
                          <span className="font-bold text-[#292D26] block">Janki Rasoi Cloud Kitchen</span>
                          <span className="text-[11px] text-[#77786F]">Main Bazar, Sagore, Pithampur (454774)</span>
                        </div>
                      </div>

                      {/* Drop-off Stop */}
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-full bg-[#FFF1DC] text-[#E99A32] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                          B
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-[#77786F] uppercase tracking-wider block">
                              Customer Drop-off
                            </span>
                            <span className="text-[10px] font-bold text-slate-700">
                              ~{modalDist.kitchenToCustomerKm} km from kitchen
                            </span>
                          </div>
                          <span className="font-bold text-[#292D26] block">{activeMapDelivery.deliveryAddress}</span>
                          {activeMapDelivery.landmark && (
                            <span className="text-[11px] text-[#38754A] font-semibold block mt-0.5">
                              Landmark: {activeMapDelivery.landmark}
                            </span>
                          )}
                          {activeMapDelivery.deliveryNotes && (
                            <div className="mt-2 p-2 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-950 text-xs">
                              <div className="flex items-center gap-1 font-bold text-amber-900 text-[10px] uppercase tracking-wider mb-1">
                                <span className="material-symbols-outlined text-[13px]">speaker_notes</span>
                                <span>Customer Delivery Instructions:</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {activeMapDelivery.deliveryNotes.split(/\s*(?:•|\.|\n|;)\s*/).filter(Boolean).map((note, idx) => (
                                  <span key={idx} className="bg-white border border-amber-300 text-amber-900 font-bold px-1.5 py-0.5 rounded text-[10px]">
                                    {note.trim()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Navigation and Call Actions */}
                <div className="flex flex-col gap-2 pt-1">
                  {activeMapDelivery.status !== 'OUT_FOR_DELIVERY' && activeMapDelivery.status !== 'DISPATCHED' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${SAGORE_KITCHEN_COORDS.lat},${SAGORE_KITCHEN_COORDS.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-11 rounded-xl bg-[#1b4d2e] hover:bg-[#143a23] active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all"
                      >
                        <span className="material-symbols-outlined text-[17px]">store</span>
                        <span>1. GPS to Kitchen</span>
                      </a>
                      <a
                        href={activeMapDelivery.navigationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-11 rounded-xl bg-amber-700 hover:bg-amber-800 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all"
                      >
                        <span className="material-symbols-outlined text-[17px]">home_pin</span>
                        <span>2. GPS to Drop-off</span>
                      </a>
                    </div>
                  ) : (
                    <a
                      href={activeMapDelivery.navigationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-12 rounded-xl bg-[#38754A] hover:bg-[#285C38] active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
                    >
                      <span className="material-symbols-outlined text-[18px]">directions</span>
                      <span>Start Turn-by-Turn GPS to Customer</span>
                    </a>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={`tel:${activeMapDelivery.customerPhone}`}
                      className="h-10 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 text-slate-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[#38754A] text-[16px]">call</span>
                      <span>Call Customer</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => {
                        if (typeof navigator !== 'undefined' && navigator.clipboard) {
                          navigator.clipboard.writeText(
                            `${activeMapDelivery.customerName}, ${activeMapDelivery.deliveryAddress}${
                              activeMapDelivery.landmark ? ', Landmark: ' + activeMapDelivery.landmark : ''
                            }`
                          );
                          showRiderToast('Address copied!');
                        }
                      }}
                      className="h-10 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 text-slate-800 transition-colors"
                    >
                      <span className="material-symbols-outlined text-slate-500 text-[16px]">content_copy</span>
                      <span>Copy Address</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rider Toast Notification */}
          {toastMsg && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-60 bg-[#292D26] text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom duration-200 border border-white/10">
              <span className="material-symbols-outlined text-[18px] text-emerald-400">check_circle</span>
              <span>{toastMsg}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
