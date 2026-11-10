// Janki Rasoi — Authoritative API Client & Type Definitions

export interface PortionVariant {
  id: string;
  name: string;
  priceModifierPaise: number;
  isDefault: boolean;
}

export interface AddonOption {
  id: string;
  name: string;
  pricePaise: number;
}

export interface AddonGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: AddonOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  dietaryType: 'VEG' | 'NON_VEG';
  imageUrl?: string;
  basePricePaise: number;
  taxRatePercent: number;
  isSoldOut: boolean;
  variants: PortionVariant[];
  addonGroups: AddonGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  items: MenuItem[];
}

export interface CatalogResponse {
  serviceDate: string;
  categories: MenuCategory[];
}

export interface DeliverySlot {
  id: string;
  mealType: 'LUNCH' | 'DINNER';
  label: string;
  startTime: string;
  endTime: string;
  cutoffTime: string;
  isAvailable: boolean;
  remainingCapacity: number;
}

export interface SlotsResponse {
  date: string;
  slots: DeliverySlot[];
}

export interface PincodeCheckResponse {
  serviceable: boolean;
  pincode: string;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  zoneName?: string;
  distanceKm?: number;
  deliveryFeePaise?: number;
  freeDeliveryThresholdPaise?: number;
  isFreeDelivery?: boolean;
  message?: string;
}

export interface PlaceSearchResult {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  lat: number | null;
  lng: number | null;
  pincode: string | null;
  city: string | null;
}

export interface ReverseGeocodeResult {
  formattedAddress: string;
  name: string;
  suburb: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  lat: number;
  lng: number;
}

export interface DirectionsResult {
  distanceMeters: number;
  durationSeconds: number;
  distanceKm: number;
  durationMinutes: number;
  coordinates: [number, number][];
}

export interface QuoteRequestItem {
  productId: string;
  variantId?: string;
  quantity: number;
  selectedAddonOptionIds?: string[];
}

export interface QuoteRequest {
  serviceDate: string;
  deliverySlotId: string;
  pincode: string;
  items: QuoteRequestItem[];
}

export interface QuoteResponse {
  quoteToken: string;
  expiresAt: string;
  serviceDate: string;
  slotLabel: string;
  subtotalPaise: number;
  packagingFeePaise: number;
  deliveryFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  formattedTotal: string;
  items: Array<{
    productId: string;
    productName: string;
    variantName?: string;
    quantity: number;
    unitPricePaise: number;
    lineTotalPaise: number;
  }>;
}

export interface PlaceOrderPayload {
  quoteToken: string;
  paymentMethod: 'COD' | 'RAZORPAY' | 'PHONEPE';
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: {
    flat: string;
    street: string;
    landmark?: string;
    pincode: string;
    latitude?: number;
    longitude?: number;
  };
  deliveryNotes?: string;
}

export interface PlaceOrderResponse {
  orderId: string;
  orderNumber: string;
  trackingToken: string;
  status: string;
  totalAmountPaise: number;
  paymentMethod: string;
  phonepeRedirectUrl?: string;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  currency: string;
}

export interface TrackOrderResponse {
  orderNumber: string;
  status: 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  paymentMethod?: string;
  paymentStatus?: string;
  serviceDate: string;
  deliverySlot: string;
  subtotalPaise?: number;
  taxPaise?: number;
  deliveryFeePaise?: number;
  packagingFeePaise?: number;
  discountPaise?: number;
  totalAmountPaise: number;
  items: Array<{
    name: string;
    variant?: string;
    quantity: number;
    unitPricePaise?: number;
    totalPricePaise?: number;
  }>;
  deliveryOtp?: string; // Zero-cost in-app verbal handover PIN when OUT_FOR_DELIVERY
  riderName?: string;
  riderPhone?: string;
  rider?: {
    name: string;
    phone: string;
    vehicleNumber?: string;
    location?: {
      latitude: number;
      longitude: number;
      heading?: number;
      speed?: number;
      updatedAt?: string;
    };
  } | null;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  kitchenCoordinates?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  customerName?: string;
  maskedPhone?: string;
  deliveryAddress?: {
    flat?: string;
    street?: string;
    landmark?: string;
    pincode?: string;
  };
  deliveryNotes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminOrderItem {
  id: string;
  productId: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPricePaise: number;
  totalPricePaise: number;
  addons?: Array<{ id: string; name: string; pricePaise: number }>;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: {
    flat: string;
    street: string;
    landmark?: string;
    pincode: string;
  } | string;
  slotLabel: string;
  totalAmountPaise: number;
  paymentMethod: string;
  paymentStatus: string;
  assignedRider?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  itemsCount?: number;
  items?: AdminOrderItem[];
  createdAt: string;
}

export interface AdminOrdersResponse {
  orders: AdminOrder[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RiderDelivery {
  orderId: string;
  orderNumber: string;
  status: string;
  assignmentStatus?: 'ASSIGNED' | 'ACCEPTED' | 'COMPLETED' | 'CANCELLED';
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  landmark?: string;
  deliveryNotes?: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  navigationUrl: string;
  slotLabel: string;
  paymentMethod: string;
  cashDuePaise: number;
  itemsSummary: string;
  createdAt?: string;
  assignedAt?: string;
}

export const SUPABASE_STORAGE_DISHES_BASE = 'https://yxvwgcjavxeqsttzcbty.supabase.co/storage/v1/object/public/menu/dishes';
export const DEFAULT_FOOD_IMAGE = `${SUPABASE_STORAGE_DISHES_BASE}/special-thali-bhar-pet.jpg`;

export const DEFAULT_DISH_IMAGES: Record<string, string> = {
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
  // Common legacy seeds
  'executive-north-indian-thali': `${SUPABASE_STORAGE_DISHES_BASE}/special-thali-bhar-pet.jpg`,
  'homestyle-dal-khichdi-bowl': `${SUPABASE_STORAGE_DISHES_BASE}/mix-dal.jpg`,
  'janaki-special-full-thali': `${SUPABASE_STORAGE_DISHES_BASE}/special-thali-bhar-pet.jpg`,
  'regular-home-thali': `${SUPABASE_STORAGE_DISHES_BASE}/sadi-thali.jpg`,
  'roti-sabzi-duo': `${SUPABASE_STORAGE_DISHES_BASE}/mix-sabzi.jpg`,
};

export function resolveDishImageUrl(dish?: { imageUrl?: string | null; slug?: string; name?: string }): string {
  if (!dish) return DEFAULT_FOOD_IMAGE;
  const img = dish.imageUrl?.trim();
  if (img && img !== DEFAULT_FOOD_IMAGE) {
    return img;
  }
  if (dish.slug && DEFAULT_DISH_IMAGES[dish.slug]) {
    return DEFAULT_DISH_IMAGES[dish.slug];
  }
  if (dish.name) {
    const norm = dish.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    for (const [slug, url] of Object.entries(DEFAULT_DISH_IMAGES)) {
      if (norm.includes(slug) || slug.includes(norm)) {
        return url;
      }
    }
  }
  return DEFAULT_FOOD_IMAGE;
}

// In-memory + SessionStorage cache for instant zero-latency client transitions without re-fetching
const memoryCache = new Map<string, { data: any; expiry: number }>();
const CACHE_PREFIX = 'jr_v5_cache_';

function getCached<T>(key: string): T | null {
  const item = memoryCache.get(key);
  if (item) {
    if (Date.now() <= item.expiry) {
      return item.data as T;
    }
    memoryCache.delete(key);
  }

  // Cross-refresh fallback from sessionStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = window.sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Date.now() <= parsed.expiry) {
          memoryCache.set(key, parsed);
          return parsed.data as T;
        } else {
          window.sessionStorage.removeItem(`${CACHE_PREFIX}${key}`);
        }
      }
    } catch {
      // Ignore sessionStorage issues
    }
  }

  return null;
}

function setCached<T>(key: string, data: T, ttlMs = 180000): T {
  const expiry = Date.now() + ttlMs;
  memoryCache.set(key, { data, expiry });
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ data, expiry }));
    } catch {
      // Ignore quota issues
    }
  }
  return data;
}

const getApiBase = () => {
  if (typeof window === 'undefined') {
    const raw =
      process.env.NEXT_PUBLIC_INTERNAL_API_URL ||
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3000';
    const cleanBase = raw.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return `${cleanBase}/api/v1`;
  }
  return '/api/v1';
};

export function optimizeImageUrl(url?: string, width = 400): string {
  if (!url) return '';
  if (url.startsWith('/images/dishes/') || url.startsWith('/images/')) {
    return url.includes('?') ? url : `${url}?v=20261106_v2`;
  }
  if (url.includes('cloudinary.com') && url.includes('/upload/') && !url.includes('/f_auto')) {
    return url.replace('/upload/', `/upload/f_auto,q_auto,w_${width},c_limit/`);
  }
  if (url.includes('images.unsplash.com')) {
    try {
      const u = new URL(url);
      u.searchParams.set('auto', 'format');
      u.searchParams.set('fit', 'crop');
      if (!u.searchParams.has('w') || parseInt(u.searchParams.get('w') || '0', 10) > width) {
        u.searchParams.set('w', width.toString());
      }
      u.searchParams.set('q', '75');
      return u.toString();
    } catch (e) {
      return url;
    }
  }
  return url;
}

// In api client:
// Helper to build full headers for Rider Portal requests
function getRiderHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Simulated-Role': 'RIDER',
  };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('jr_rider_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const profileStr = localStorage.getItem('jr_rider_profile') || localStorage.getItem('jr_rider_user');
    if (profileStr) {
      try {
        const parsed = JSON.parse(profileStr);
        const phone = parsed.phone || parsed.user?.phone || '';
        const id = parsed.riderProfile?.id || parsed.riderId || parsed.id || '';
        if (phone) headers['X-Rider-Phone'] = phone;
        if (id) headers['X-Rider-Id'] = id;
      } catch {}
    }
  }
  return headers;
}

export const api = {
  // Synchronous cache accessors for zero-flicker instant hydration
  getCachedCatalog(serviceDate?: string): CatalogResponse | null {
    return getCached<CatalogResponse>(`catalog_${serviceDate || 'today'}`);
  },

  getCachedSlots(date?: string): SlotsResponse | null {
    const d = date || (typeof window !== 'undefined' ? new Date().toISOString().split('T')[0] : '');
    return getCached<SlotsResponse>(`slots_${d}`);
  },

  getCachedPincode(pincode: string): PincodeCheckResponse | null {
    return getCached<PincodeCheckResponse>(`pin_${pincode}`);
  },

  // 1. Live Catalog with Instant SWR Refresh
  async getCatalog(serviceDate?: string, forceRefresh = false): Promise<CatalogResponse> {
    const cacheKey = `catalog_${serviceDate || 'today'}`;
    if (!forceRefresh) {
      const cached = getCached<CatalogResponse>(cacheKey);
      if (cached) return cached;
    }

    const base = getApiBase();
    const url = serviceDate ? `${base}/catalog?service_date=${encodeURIComponent(serviceDate)}` : `${base}/catalog`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch catalog from server');
    }
    const data = await res.json();
    if (data?.categories?.length) {
      data.categories.forEach((cat: any) => {
        cat.items?.forEach((it: any) => {
          if (it.imageUrl) it.imageUrl = optimizeImageUrl(it.imageUrl);
        });
      });
    }
    return setCached(cacheKey, data, 60000); // 60s fresh cache
  },

  // Real-time listener for cross-tab and cross-window menu changes
  subscribeToCatalogUpdates(callback: () => void): () => void {
    if (typeof window === 'undefined') return () => {};

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('jankirasoi_menu_channel');
      channel.onmessage = () => {
        memoryCache.delete('catalog_today');
        try { 
          window.sessionStorage.removeItem(`${CACHE_PREFIX}catalog_today`);
          window.sessionStorage.removeItem('jr_v3_cache_catalog_today');
          window.sessionStorage.removeItem('jr_cache_catalog_today');
        } catch {}
        callback();
      };
    } catch {}

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'jr_menu_timestamp') {
        memoryCache.delete('catalog_today');
        try { 
          window.sessionStorage.removeItem(`${CACHE_PREFIX}catalog_today`);
          window.sessionStorage.removeItem('jr_v3_cache_catalog_today');
          window.sessionStorage.removeItem('jr_cache_catalog_today');
        } catch {}
        callback();
      }
    };

    const handleFocus = () => {
      memoryCache.delete('catalog_today');
      try { 
        window.sessionStorage.removeItem(`${CACHE_PREFIX}catalog_today`);
        window.sessionStorage.removeItem('jr_v3_cache_catalog_today');
        window.sessionStorage.removeItem('jr_cache_catalog_today');
      } catch {}
      callback();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      channel?.close();
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  },

  // 2. Delivery Zones with 5-minute Cache (Sagore Kitchen 5km Free Delivery / 15km boundary)
  async checkPincode(pincode: string, lat?: number, lng?: number): Promise<PincodeCheckResponse> {
    const cleanPin = pincode.trim().replace(/\D/g, '');
    const cacheKey = `pin_${cleanPin}_${lat ?? ''}_${lng ?? ''}`;
    const cached = getCached<PincodeCheckResponse>(cacheKey);
    if (cached) return cached;

    const base = getApiBase();
    let url = `${base}/delivery-zones/check?pincode=${encodeURIComponent(cleanPin)}`;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      url += `&lat=${lat}&lng=${lng}`;
    }
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data: PincodeCheckResponse = await res.json();
        return setCached(cacheKey, data, 300000);
      }
    } catch {
      // Fall through to client-side distance heuristics
    }

    // Client-side fallback for Sagore kitchen (5km Free Delivery, max 15km boundary)
    // 1. If coordinates are provided, compute real distance
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      const R = 6371;
      const dLat = ((lat - 22.6288) * Math.PI) / 180;
      const dLon = ((lng - 75.5684) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((22.6288 * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distKm = Math.round(R * c * 10) / 10;

      if (distKm <= 5.0) {
        return setCached(cacheKey, {
          serviceable: true,
          pincode: cleanPin || '454774',
          city: 'Sagore, Pithampur',
          zoneName: `Sagore Local (${distKm} km)`,
          distanceKm: distKm,
          deliveryFeePaise: 0,
          isFreeDelivery: true,
          message: `✓ Delivering within 5 km (${distKm} km) • Free Delivery`,
        }, 300000);
      } else if (distKm <= 15.0) {
        return setCached(cacheKey, {
          serviceable: true,
          pincode: cleanPin || '454775',
          city: 'Pithampur Outer, Dhar',
          zoneName: `Pithampur Outer (${distKm} km)`,
          distanceKm: distKm,
          deliveryFeePaise: 3500,
          isFreeDelivery: false,
          message: `✓ Serviceable (${distKm} km) • Delivery Fee ₹35`,
        }, 300000);
      }
    }

    // 2. Local Pincode heuristics for Sagore / Pithampur / Dhar / Mhow
    if (cleanPin === '454774' || cleanPin.startsWith('454') || cleanPin.startsWith('453') || !cleanPin) {
      const isCore = cleanPin === '454774' || !cleanPin;
      return setCached(cacheKey, {
        serviceable: true,
        pincode: cleanPin || '454774',
        city: 'Sagore, Pithampur',
        district: 'Dhar',
        state: 'Madhya Pradesh',
        zoneName: isCore ? 'Sagore Central Zone (Within 5 km)' : 'Pithampur Zone',
        distanceKm: isCore ? 2.0 : 4.5,
        deliveryFeePaise: 0,
        isFreeDelivery: true,
        message: '✓ Delivering to Sagore • Free Delivery (Within 5 km)',
      }, 300000);
    }

    if (cleanPin === '454775') {
      return setCached(cacheKey, {
        serviceable: true,
        pincode: '454775',
        city: 'Pithampur Outer, Dhar',
        district: 'Dhar',
        state: 'Madhya Pradesh',
        zoneName: 'Pithampur Outer (~7.5 km)',
        distanceKm: 7.5,
        deliveryFeePaise: 3500,
        isFreeDelivery: false,
        message: '✓ Serviceable: Pithampur Outer (~7.5 km) • Delivery Fee ₹35',
      }, 300000);
    }

    const unserviceableData: PincodeCheckResponse = {
      serviceable: false,
      pincode: cleanPin,
      message: 'Delivery not available beyond 15 km from Sagore Kitchen.',
    };
    return setCached(cacheKey, unserviceableData, 60000);
  },

  // 2b. Places Autocomplete via Ola Maps (Backend Proxy)
  async searchPlaces(query: string, lat?: number, lng?: number): Promise<PlaceSearchResult[]> {
    if (!query || query.trim().length < 2) return [];
    const base = getApiBase();
    let url = `${base}/delivery-zones/places-search?q=${encodeURIComponent(query.trim())}`;
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      url += `&lat=${lat}&lng=${lng}`;
    }
    const cacheKey = `places_${query.trim().toLowerCase()}_${lat ?? ''}_${lng ?? ''}`;
    const cached = getCached<PlaceSearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data: PlaceSearchResult[] = await res.json();
      return setCached(cacheKey, data, 1800000); // 30 min cache
    } catch {
      return [];
    }
  },

  // 2c. Reverse Geocode via Ola Maps (Backend Proxy)
  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    const base = getApiBase();
    const cacheKey = `rev_${lat.toFixed(4)}_${lng.toFixed(4)}`;
    const cached = getCached<ReverseGeocodeResult>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(`${base}/delivery-zones/reverse-geocode?lat=${lat}&lng=${lng}`);
      if (!res.ok) return null;
      const data: ReverseGeocodeResult = await res.json();
      return setCached(cacheKey, data, 86400000); // 24 hr cache
    } catch {
      return null;
    }
  },

  // 2d. Delivery Route Directions via Ola Maps (Backend Proxy)
  async getDirections(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<DirectionsResult | null> {
    const base = getApiBase();
    const cacheKey = `dir_${originLat.toFixed(3)}_${originLng.toFixed(3)}_${destLat.toFixed(3)}_${destLng.toFixed(3)}`;
    const cached = getCached<DirectionsResult>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(
        `${base}/delivery-zones/directions?originLat=${originLat}&originLng=${originLng}&destLat=${destLat}&destLng=${destLng}`,
      );
      if (!res.ok) return null;
      const data: DirectionsResult = await res.json();
      return setCached(cacheKey, data, 3600000); // 1 hr cache
    } catch {
      return null;
    }
  },

  // 2e. Multi-Stop Route Optimization for Riders
  async optimizeRoute(
    origin: { lat: number; lng: number },
    stops: { id: string; lat: number; lng: number; title?: string }[],
  ): Promise<{
    orderedStops: { id: string; lat: number; lng: number; title?: string }[];
    totalDistanceKm: number;
    estimatedDurationMinutes: number;
  }> {
    if (!stops || stops.length <= 1) {
      return { orderedStops: stops || [], totalDistanceKm: 0, estimatedDurationMinutes: 0 };
    }
    const base = getApiBase();
    try {
      const res = await fetch(`${base}/delivery-zones/route-optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, stops }),
      });
      if (!res.ok) throw new Error('Route optimization failed');
      return await res.json();
    } catch {
      return { orderedStops: stops, totalDistanceKm: 0, estimatedDurationMinutes: 0 };
    }
  },

  // 2f. Snap GPS Telemetry to Roads
  async snapToRoad(points: [number, number][]): Promise<[number, number][]> {
    if (!points || points.length <= 1) return points;
    const base = getApiBase();
    try {
      const res = await fetch(`${base}/delivery-zones/snap-to-road`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      });
      if (!res.ok) return points;
      return await res.json();
    } catch {
      return points;
    }
  },

  // 3. Delivery Slots with 1-minute Cache
  async getSlots(date: string, forceRefresh = false): Promise<SlotsResponse> {
    const cacheKey = `slots_${date}`;
    if (!forceRefresh) {
      const cached = getCached<SlotsResponse>(cacheKey);
      if (cached) return cached;
    }

    const base = getApiBase();
    const res = await fetch(`${base}/delivery-slots?date=${encodeURIComponent(date)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch delivery slots');
    }
    const data = await res.json();
    return setCached(cacheKey, data, 60000);
  },

  // 4. Server-Authoritative Quotation (in paise)
  async calculateQuote(payload: QuoteRequest): Promise<QuoteResponse> {
    const base = getApiBase();
    const res = await fetch(`${base}/checkout/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to compute authoritative quote');
    }
    return res.json();
  },

  // 5. Place Order (Atomic Transaction)
  async placeOrder(payload: PlaceOrderPayload, idempotencyKey?: string): Promise<PlaceOrderResponse> {
    const base = getApiBase();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const res = await fetch(`${base}/checkout/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to place meal order');
    }
    return res.json();
  },

  // 6. Track Order (Real-time with in-app OTP)
  async trackOrder(token: string): Promise<TrackOrderResponse> {
    const base = getApiBase();
    const res = await fetch(`${base}/orders/track/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const error: any = new Error(err.message || 'Tracking token not found or expired');
      error.status = res.status;
      throw error;
    }
    return res.json();
  },

  // 6b. Get Customer Order History by Phone
  async getCustomerOrders(phone: string): Promise<any[]> {
    const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length < 10) return [];
    const base = getApiBase();
    try {
      const res = await fetch(base + '/orders/customer/' + encodeURIComponent(cleanPhone), { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (Array.isArray(data?.orders) ? data.orders : []);
    } catch {
      return [];
    }
  },

  // 7. Kitchen KDS Admin Orders
  async getAdminOrders(): Promise<AdminOrdersResponse> {
    const base = getApiBase();
    const token = typeof window !== 'undefined' ? localStorage.getItem('jr_admin_token') : null;
    const headers: Record<string, string> = {
      'X-Simulated-Role': 'ADMIN',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${base}/admin/orders?limit=50`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch kitchen orders queue');
    }
    return res.json();
  },

  // 8. Admin Status Transition
  async updateOrderStatus(orderId: string, status: string, reason?: string) {
    const base = getApiBase();
    const token = typeof window !== 'undefined' ? localStorage.getItem('jr_admin_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Simulated-Role': 'ADMIN',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${base}/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ status, reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to transition order status');
    }
    return res.json();
  },

  // 9. Manual Delivery Override
  async overrideDelivery(orderId: string, reason: string) {
    const base = getApiBase();
    const token = typeof window !== 'undefined' ? localStorage.getItem('jr_admin_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Simulated-Role': 'ADMIN',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${base}/admin/orders/${encodeURIComponent(orderId)}/override-delivery`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to perform manual override');
    }
    return res.json();
  },

  // 9b. Assign Rider
  async assignRider(orderId: string, riderId: string) {
    const base = getApiBase();
    const token = typeof window !== 'undefined' ? localStorage.getItem('jr_admin_token') : null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Simulated-Role': 'ADMIN',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${base}/admin/orders/${encodeURIComponent(orderId)}/assign-rider`, {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ riderId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to assign rider');
    }
    return res.json();
  },

  // 9c. Admin Get Riders
  async getAdminRiders(): Promise<{ riders: Array<{ id: string; name: string; phone: string; vehicleNumber?: string; isAvailable?: boolean }> }> {
    const base = getApiBase();
    const token = typeof window !== 'undefined' ? localStorage.getItem('jr_admin_token') : null;
    const headers: Record<string, string> = {
      'X-Simulated-Role': 'ADMIN',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${base}/admin/riders`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch riders list');
    }
    return res.json();
  },

  // 10. Rider Deliveries Queue (Live database state only - zero mock data)
  async getRiderDeliveries(signal?: AbortSignal): Promise<{ deliveries: RiderDelivery[] }> {
    const base = getApiBase();
    const headers = getRiderHeaders();
    const riderPhone = headers['X-Rider-Phone'] || '';
    const riderId = headers['X-Rider-Id'] || '';

    const queryParams = new URLSearchParams();
    queryParams.set('_t', Date.now().toString());
    queryParams.set('simulated_role', 'RIDER');
    if (riderPhone) queryParams.set('rider_phone', riderPhone);
    if (riderId) queryParams.set('rider_id', riderId);

    const res = await fetch(`${base}/rider/deliveries?${queryParams.toString()}`, {
      headers,
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch rider deliveries queue');
    }
    const data = await res.json();
    return { deliveries: Array.isArray(data?.deliveries) ? data.deliveries : (Array.isArray(data) ? data : []) };
  },

  // 10b. Rider Accept Delivery Assignment
  async acceptRiderDelivery(orderId: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/rider/deliveries/${encodeURIComponent(orderId)}/accept`, {
      method: 'PATCH',
      headers: getRiderHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to accept delivery assignment');
    }
    return res.json();
  },

  // 11. Rider Mark Out for Delivery (generates customer PIN)
  async markRiderOutForDelivery(orderId: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/rider/deliveries/${encodeURIComponent(orderId)}/out-for-delivery`, {
      method: 'PATCH',
      headers: getRiderHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to transition delivery to OUT_FOR_DELIVERY');
    }
    return res.json();
  },

  // 12. Rider Verify Delivery OTP PIN
  async verifyRiderDeliveryOtp(orderId: string, code: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/rider/deliveries/${encodeURIComponent(orderId)}/verify-otp`, {
      method: 'POST',
      headers: getRiderHeaders(),
      credentials: 'include',
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to verify delivery OTP');
    }
    return res.json();
  },

  // 12b. Update Rider Duty Availability Status
  async updateRiderDutyStatus(isAvailable: boolean) {
    const base = getApiBase();
    const res = await fetch(`${base}/rider/deliveries/duty-status`, {
      method: 'PATCH',
      headers: getRiderHeaders(),
      credentials: 'include',
      body: JSON.stringify({ isAvailable }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update duty status');
    }
    return res.json();
  },

  // 12c. Rider Update Real-time GPS Location Telemetry
  async updateRiderLocation(coords: { latitude: number; longitude: number; heading?: number; speed?: number }) {
    const base = getApiBase();
    const res = await fetch(`${base}/rider/deliveries/location`, {
      method: 'POST',
      headers: getRiderHeaders(),
      credentials: 'include',
      body: JSON.stringify(coords),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update rider location');
    }
    return res.json();
  },

  // 13. Customer Phone Login / Registration
  async loginCustomer(phone: string, name?: string, address?: any): Promise<AuthSessionResponse> {
    const base = getApiBase();
    const res = await fetch(`${base}/auth/customer/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, name, address }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to log in customer');
    }
    const data: AuthSessionResponse = await res.json();
    if (typeof window !== 'undefined') {
      localStorage.setItem('jr_session_token', data.sessionToken);
      localStorage.setItem('jr_user_profile', JSON.stringify(data.user));
      localStorage.setItem('jr_customer_phone', phone);
      if (name) localStorage.setItem('jr_customer_name', name);
      if (address) localStorage.setItem('jr_customer_address', JSON.stringify(address));
    }
    return data;
  },

  // 14. Rider Login
  async loginRider(phone: string, password: string): Promise<AuthSessionResponse> {
    const base = getApiBase();
    const res = await fetch(`${base}/rider/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone.trim(), password }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Invalid rider credentials.');
    }
    const data: AuthSessionResponse = await res.json();
    if (typeof window !== 'undefined') {
      localStorage.setItem('jr_rider_token', data.sessionToken);
      localStorage.setItem('jr_rider_profile', JSON.stringify(data.user));
    }
    return data;
  },

  // 14b. Admin Login
  async loginAdmin(email: string, password: string): Promise<AuthSessionResponse> {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Invalid admin email or password.');
    }
    const data: AuthSessionResponse = await res.json();
    if (typeof window !== 'undefined') {
      localStorage.setItem('jr_admin_token', data.sessionToken);
      localStorage.setItem('jr_admin_profile', JSON.stringify(data.user));
    }
    return data;
  },

  // 15. Get Current User Profile (Customer / Rider)
  async getCurrentUser(role: 'CUSTOMER' | 'RIDER' = 'CUSTOMER'): Promise<UserProfile | null> {
    if (typeof window === 'undefined') return null;
    const token = role === 'CUSTOMER'
      ? localStorage.getItem('jr_session_token')
      : localStorage.getItem('jr_rider_token');

    const base = getApiBase();
    if (token) {
      try {
        const res = await fetch(`${base}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            // Verify role matches requested context to avoid cross-role profile bleed
            if (role === 'CUSTOMER' && data.user.role === 'CUSTOMER') {
              localStorage.setItem('jr_user_profile', JSON.stringify(data.user));
              if (data.user.phone) localStorage.setItem('jr_customer_phone', data.user.phone);
              if (data.user.name) localStorage.setItem('jr_customer_name', data.user.name);
              if (data.user.savedAddress) localStorage.setItem('jr_customer_address', JSON.stringify(data.user.savedAddress));
              return data.user;
            } else if (role === 'RIDER' && data.user.role === 'RIDER') {
              localStorage.setItem('jr_rider_profile', JSON.stringify(data.user));
              return data.user;
            }
          }
        }
      } catch {
        // Fallback to cache
      }
    }

    if (role === 'CUSTOMER') {
      const cached = localStorage.getItem('jr_user_profile');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.role === 'CUSTOMER') return parsed;
        } catch {}
      }
    } else if (role === 'RIDER') {
      const cached = localStorage.getItem('jr_rider_profile');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed?.role === 'RIDER') return parsed;
        } catch {}
      }
    }
    return null;
  },

  // 16. Logout (Role-isolated to prevent customer session clearing on rider actions)
  async logout(role: 'CUSTOMER' | 'RIDER' | 'ALL' = 'CUSTOMER'): Promise<void> {
    const base = getApiBase();
    let token: string | null = null;
    if (typeof window !== 'undefined') {
      if (role === 'CUSTOMER') token = localStorage.getItem('jr_session_token');
      else if (role === 'RIDER') token = localStorage.getItem('jr_rider_token');
      else token = localStorage.getItem('jr_session_token') || localStorage.getItem('jr_rider_token');
    }

    try {
      await fetch(`${base}/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
    } catch {
      // ignore
    }

    if (typeof window !== 'undefined') {
      if (role === 'CUSTOMER' || role === 'ALL') {
        localStorage.removeItem('jr_session_token');
        localStorage.removeItem('jr_user_profile');
      }
      if (role === 'RIDER' || role === 'ALL') {
        localStorage.removeItem('jr_rider_token');
        localStorage.removeItem('jr_rider_profile');
      }
    }
  },

  // 17. Check Customer Ban / Restriction Status
  async checkCustomerBanStatus(phone?: string): Promise<{
    isBanned: boolean;
    phone?: string;
    name?: string;
    reason?: string;
    penaltyAmountPaise?: number;
    penaltyAmountRupees?: number;
    bannedAt?: string;
  }> {
    const base = getApiBase();
    let queryPhone = phone;
    if (!queryPhone && typeof window !== 'undefined') {
      queryPhone = localStorage.getItem('jr_customer_phone') || undefined;
    }
    const token = typeof window !== 'undefined' ? localStorage.getItem('jr_session_token') : null;
    const url = queryPhone
      ? `${base}/auth/customer/status?phone=${encodeURIComponent(queryPhone)}`
      : `${base}/auth/customer/status`;
    try {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      if (res.ok) {
        return res.json();
      }
    } catch {}
    return { isBanned: false, phone: queryPhone };
  },

  // 18. Customer Pays Penalty to Unban Account
  async payUnbanPenalty(phone: string, paymentMethod = 'UPI', transactionRef?: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/auth/customer/pay-unban-penalty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, paymentMethod, transactionRef }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Payment processing failed');
    }
    const data = await res.json();
    if (typeof window !== 'undefined') {
      if (data.sessionToken) localStorage.setItem('jr_session_token', data.sessionToken);
      if (data.user) localStorage.setItem('jr_user_profile', JSON.stringify(data.user));
    }
    return data;
  },
};

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  role: 'CUSTOMER' | 'RIDER' | 'ADMIN' | 'STAFF';
  isActive?: boolean;
  isBanned?: boolean;
  banReason?: string | null;
  penaltyAmountPaise?: number | null;
  penaltyAmountRupees?: number | null;
  savedAddress?: {
    flat?: string;
    street?: string;
    landmark?: string;
    pincode?: string;
  } | null;
  orderCount?: number;
  recentOrders?: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmountPaise: number;
    deliveryAddress: any;
    trackingToken: string;
    createdAt: string;
  }>;
  riderProfile?: {
    id: string;
    vehicleNumber: string;
    isAvailable: boolean;
  } | null;
}

export interface AuthSessionResponse {
  user: UserProfile;
  sessionToken: string;
  expiresAt: string;
}
