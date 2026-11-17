// Janki Rasoi — Authoritative Admin & Kitchen KDS API Client

export interface AdminOrderItem {
  id?: string;
  productId: string;
  productName: string;
  variantName?: string;
  quantity: number;
  unitPricePaise?: number;
  totalPricePaise?: number;
  addons?: { id: string; name: string; pricePaise: number }[];
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  status: 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED' | 'PREPARING' | 'READY_FOR_PICKUP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
  paymentStatus: string;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: {
    flat?: string;
    street?: string;
    pincode?: string;
    landmark?: string;
  } | string;
  deliveryNotes?: string | null;
  slotLabel: string;
  subtotalPaise?: number;
  taxPaise?: number;
  deliveryFeePaise?: number;
  packagingFeePaise?: number;
  discountPaise?: number;
  totalAmountPaise: number;
  assignedRider?: {
    id?: string;
    name: string;
    phone: string;
    assignmentStatus?: 'ASSIGNED' | 'ACCEPTED' | string;
  } | null;
  itemsCount: number;
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

const getApiBase = () => {
  if (typeof window === 'undefined') {
    const raw =
      process.env.API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      process.env.API_INTERNAL_URL ||
      'http://127.0.0.1:3000';
    const cleanBase = raw.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return `${cleanBase}/api/v1`;
  }
  return '/api/v1';
};

function notifyMenuChange() {
  if (typeof window !== 'undefined') {
    try {
      const channel = new BroadcastChannel('jankirasoi_menu_channel');
      channel.postMessage({ type: 'MENU_UPDATED', timestamp: Date.now() });
      channel.close();
    } catch {}
    try {
      localStorage.setItem('jr_menu_timestamp', String(Date.now()));
    } catch {}
  }
}

export const adminApi = {
  // 1. Fetch Orders Queue with Status Filter
  async getOrders(status?: string): Promise<AdminOrdersResponse> {
    const base = getApiBase();
    const ts = Date.now();
    const query = status ? `?status=${encodeURIComponent(status)}&limit=100&_t=${ts}` : `?limit=100&_t=${ts}`;
    const res = await fetch(`${base}/admin/orders${query}`, {
      headers: {
        'X-Simulated-Role': 'STAFF',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch kitchen orders queue');
    }
    return res.json();
  },

  // 2. Kitchen Order Status Transition (ACCEPTED, PREPARING, READY_FOR_PICKUP, CANCELLED)
  async updateOrderStatus(orderId: string, status: string, reason = 'Kitchen Console Action') {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify({ status, reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update order status');
    }
    return res.json();
  },

  // 3. Manual PIN Delivery Override (Audit Logged)
  async overrideDelivery(orderId: string, reason: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/orders/${encodeURIComponent(orderId)}/override-delivery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to execute manual delivery override');
    }
    return res.json();
  },

  // 3b. Assign Rider
  async assignRider(orderId: string, riderId: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/orders/${encodeURIComponent(orderId)}/assign-rider`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify({ riderId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to assign rider');
    }
    return res.json();
  },

  // 4. Daily Slots Inspection
  async getDeliverySlots(date?: string) {
    const base = getApiBase();
    const d = date || new Date().toISOString().split('T')[0];
    const res = await fetch(`${base}/delivery-slots?date=${encodeURIComponent(d)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch slots');
    return res.json();
  },

  // 5. Admin Staff Login
  async login(email: string, password: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Invalid admin credentials');
    }
    const data = await res.json();
    if (typeof window !== 'undefined' && data?.sessionToken) {
      localStorage.setItem('jr_admin_token', data.sessionToken);
      if (data.user) {
        localStorage.setItem('jr_admin_profile', JSON.stringify(data.user));
      }
    }
    return data;
  },

  // 5b. Admin Logout
  async logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('jr_admin_token');
      localStorage.removeItem('jr_admin_profile');
    }
    try {
      const base = getApiBase();
      await fetch(`${base}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
  },

  // 6. Manage & View Customers
  async getCustomers(): Promise<{
    customers: AdminCustomer[];
    totalCount?: number;
    bannedCount?: number;
    vipCount?: number;
  }> {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/customers`, {
      headers: { 'X-Simulated-Role': 'STAFF' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch customers list');
    return res.json();
  },

  async banCustomer(phone: string, reason?: string, penaltyAmountPaise?: number): Promise<{ success: boolean; message: string; isBanned: boolean }> {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/customers/${encodeURIComponent(phone)}/ban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify({ reason, penaltyAmountPaise }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to ban customer');
    }
    return res.json();
  },

  async unbanCustomer(phone: string): Promise<{ success: boolean; message: string; isBanned: boolean }> {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/customers/${encodeURIComponent(phone)}/unban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to unban customer');
    }
    return res.json();
  },

  async getCustomerOrders(phone: string): Promise<{ phone: string; orderCount: number; orders: CustomerOrderHistoryItem[] }> {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/customers/${encodeURIComponent(phone)}/orders`, {
      headers: { 'X-Simulated-Role': 'STAFF' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch customer order history');
    return res.json();
  },

  // 7. Manage & View Delivery Riders
  async getRiders(): Promise<{ riders: AdminRider[] }> {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/riders`, {
      headers: { 'X-Simulated-Role': 'STAFF' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('Failed to fetch riders list');
    return res.json();
  },

  async createRider(data: { name: string; phone: string; password?: string; vehicleNumber?: string }) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/riders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to register rider');
    }
    return res.json();
  },

  async toggleRiderAvailability(riderId: string, isAvailable: boolean) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/riders/${encodeURIComponent(riderId)}/availability`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify({ isAvailable }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update rider availability');
    }
    return res.json();
  },

  async deleteRider(riderId: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/riders/${encodeURIComponent(riderId)}`, {
      method: 'DELETE',
      headers: {
        'X-Simulated-Role': 'STAFF',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to remove rider');
    }
    return res.json();
  },

  // 8. Live Menu & Inventory Inspection
  async getCatalog(): Promise<any> {
    const base = getApiBase();
    const res = await fetch(`${base}/catalog`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch catalog');
    return res.json();
  },

  // 9. Live 86 / Sold Out Toggle
  async toggleDishSoldOut(productId: string, serviceDate: string, isSoldOut: boolean) {
    const base = getApiBase();
    const res = await fetch(`${base}/catalog/${encodeURIComponent(productId)}/sold-out`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify({ serviceDate, isSoldOut }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to toggle item availability');
    }
    const data = await res.json();
    notifyMenuChange();
    return data;
  },

  // 10. Create New Dish / Thali
  async createDish(data: {
    categoryId: string;
    name: string;
    description?: string;
    basePricePaise: number;
    imageUrl?: string;
    dietaryType?: string;
  }) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/catalog/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify({
        categoryId: data.categoryId,
        name: data.name,
        description: data.description,
        dietaryType: data.dietaryType || 'VEG',
        imageUrl: data.imageUrl,
        basePricePaise: data.basePricePaise,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to create new dish');
    }
    const created = await res.json();
    notifyMenuChange();
    return created;
  },

  // 11. Update Existing Dish / Thali
  async updateDish(
    productId: string,
    data: {
      categoryId?: string;
      name?: string;
      description?: string;
      basePricePaise?: number;
      imageUrl?: string;
      dietaryType?: string;
    },
  ) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/catalog/products/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Simulated-Role': 'STAFF',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to update dish');
    }
    const updated = await res.json();
    notifyMenuChange();
    return updated;
  },

  // 12. Delete / Archive Dish
  async deleteDish(productId: string) {
    const base = getApiBase();
    const res = await fetch(`${base}/admin/catalog/products/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      headers: {
        'X-Simulated-Role': 'STAFF',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to remove dish');
    }
    const deleted = await res.json();
    notifyMenuChange();
    return deleted;
  },

  // 11. Fetch Active Delivery Zones
  async getDeliveryZones() {
    const base = getApiBase();
    const res = await fetch(`${base}/delivery-zones`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to fetch delivery zones');
    }
    return res.json();
  },

  // 12. Upload Food Image directly to Supabase Storage (with Cloudinary fallback)
  async uploadFoodImage(file: File): Promise<string> {
    const base = getApiBase();

    // 1. Try Supabase Storage direct upload via backend
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${base}/admin/uploads/food-image`, {
        method: 'POST',
        headers: {
          'X-Simulated-Role': 'STAFF',
        },
        body: formData,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.url) return json.url;
      }
    } catch (e) {
      console.warn('Supabase backend upload failed, trying Cloudinary signature:', e);
    }

    // 2. Cloudinary signed upload fallback
    const sigRes = await fetch(`${base}/admin/uploads/signature?folder=jankirasoi/menu`, {
      headers: {
        'X-Simulated-Role': 'STAFF',
      },
    });
    if (!sigRes.ok) {
      const err = await sigRes.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to get upload signature');
    }
    const { apiKey, timestamp, folder, signature, uploadUrl } = await sigRes.json();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('folder', folder);
    formData.append('signature', signature);

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to upload food image');
    }
    const uploadData = await uploadRes.json();
    let url = uploadData.secure_url || uploadData.url;
    // Automatically apply Cloudinary lossless compression & smart format conversion (WebP/AVIF)
    if (url && url.includes('cloudinary.com') && url.includes('/upload/') && !url.includes('/f_auto')) {
      url = url.replace('/upload/', '/upload/f_auto,q_auto,w_1200,c_limit/');
    }
    return url;
  },
};

export interface AdminCustomer {
  id?: string;
  name: string;
  phone: string;
  isActive: boolean;
  isBanned: boolean;
  banReason?: string | null;
  penaltyAmountPaise?: number;
  orderCount: number;
  totalSpendPaise: number;
  lastOrderDate: string;
  lastOrderStatus?: string;
  recentItems?: string[];
  savedAddress?: any;
  segment?: 'VIP' | 'REGULAR' | 'NEW' | 'BANNED';
}

export interface CustomerOrderHistoryItem {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmountPaise: number;
  subtotalPaise?: number;
  deliveryAddress?: any;
  deliveryNotes?: string | null;
  slotLabel?: string;
  createdAt: string;
  items: Array<{
    name: string;
    variant?: string | null;
    quantity: number;
    totalPricePaise?: number;
    unitPricePaise?: number;
  }>;
}

export interface AdminRider {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  vehicleNumber: string;
  isAvailable: boolean;
  isActive: boolean;
}
