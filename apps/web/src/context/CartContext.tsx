'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface CartItem {
  productId: string;
  name: string;
  pricePaise: number;
  quantity: number;
  variantId?: string;
  variantName?: string;
  imageUrl?: string;
  selectedAddonOptionIds?: string[];
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQty: (index: number, delta: number) => void;
  removeItem: (index: number) => void;
  clearCart: () => void;
  totalCount: number;
  totalPricePaise: number;
  toastMessage: string | null;
  isToastError: boolean;
  showToast: (msg: string, isError?: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);
const STORAGE_KEY = 'jankirasoi_tray_v1';

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isToastError, setIsToastError] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: CartItem[] = JSON.parse(stored);
        const mapped = parsed.map((item) => {
          if (item.productId === 'spec-full-thali' || item.productId === '09f67dad-2306-49b7-88c7-cae050592f14') {
            return {
              ...item,
              productId: '5e27450e-59d4-40af-b42d-94fd2503b678',
              variantId: '5fb90ecb-8273-43d8-bc30-2f2b23fc4fd0',
            };
          }
          if (item.productId === 'spec-home-thali' || item.productId === 'cd02708b-cf9d-460a-878d-3597115602b7') {
            return {
              ...item,
              productId: '9526a501-703b-4ac6-aa81-0f8009d9e2c1',
              variantId: '70fa6fe3-4c52-48a4-a660-493ea34c2b96',
            };
          }
          if (item.productId === 'spec-roti-sabzi' || item.productId === 'a1c1e8ff-8f9e-4a82-98f3-876bd6f9e0f3') {
            return {
              ...item,
              productId: 'e8b30a5c-e92a-4b20-85f8-a9b3bc0f649a',
              variantId: '52b837e4-ae11-4495-b4a4-267af46564c6',
            };
          }
          return item;
        });
        setItems(mapped);
      }
    } catch (e) {
      console.warn('Could not read cart from localStorage', e);
    }
    setMounted(true);
  }, []);

  // Listen for storage events & logout to instantly clear cart
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageSync = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          setItems([]);
        } else {
          setItems(JSON.parse(stored));
        }
      } catch {
        setItems([]);
      }
    };

    const handleCartCleared = () => {
      setItems([]);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    };

    window.addEventListener('storage', handleStorageSync);
    window.addEventListener('jr_cart_cleared', handleCartCleared);
    window.addEventListener('jr_auth_changed', handleStorageSync);

    return () => {
      window.removeEventListener('storage', handleStorageSync);
      window.removeEventListener('jr_cart_cleared', handleCartCleared);
      window.removeEventListener('jr_auth_changed', handleStorageSync);
    };
  }, []);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveItems = useCallback((newItems: CartItem[]) => {
    setItems(newItems);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    } catch (e) {
      console.warn('Could not save cart to localStorage', e);
    }
  }, []);

  const showToast = useCallback((msg: string, isError = false) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(msg);
    setIsToastError(isError);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 1500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const addItem = useCallback((newItem: CartItem) => {
    setItems((prev) => {
      const existingIdx = prev.findIndex(
        (i) => i.productId === newItem.productId && i.variantId === newItem.variantId
      );
      let updated: CartItem[];
      if (existingIdx > -1) {
        updated = [...prev];
        updated[existingIdx].quantity += newItem.quantity;
      } else {
        updated = [...prev, newItem];
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Could not save cart to localStorage', e);
      }
      return updated;
    });
    showToast(`Added ${newItem.name} to your tray!`);
  }, [showToast]);

  const updateQty = useCallback((index: number, delta: number) => {
    setItems((prev) => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      updated[index].quantity += delta;
      if (updated[index].quantity <= 0) {
        updated.splice(index, 1);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Could not save cart to localStorage', e);
      }
      return updated;
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Could not save cart to localStorage', e);
      }
      return updated;
    });
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch (e) {
      console.warn('Could not save cart to localStorage', e);
    }
  }, []);

  const totalCount = mounted ? items.reduce((sum, item) => sum + item.quantity, 0) : 0;
  const totalPricePaise = mounted ? items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0) : 0;

  return (
    <CartContext.Provider
      value={{
        items: mounted ? items : [],
        addItem,
        updateQty,
        removeItem,
        clearCart,
        totalCount,
        totalPricePaise,
        toastMessage,
        isToastError,
        showToast,
      }}
    >
      {children}
      {/* Small Toast Notification Pill Centered on Screen */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            backgroundColor: isToastError ? 'rgba(153, 27, 27, 0.95)' : 'rgba(28, 46, 32, 0.95)',
            color: '#FFFFFF',
          }}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] px-4 py-2 rounded-full text-xs font-semibold shadow-2xl transition-all flex items-center gap-2 max-w-[85vw] border border-white/15 backdrop-blur-md pointer-events-none animate-in fade-in zoom-in-95 duration-150"
        >
          <span
            className={`material-symbols-outlined text-[16px] shrink-0 ${
              isToastError ? 'text-red-300' : 'text-[#4ADE80]'
            }`}
          >
            {isToastError ? 'error' : 'check_circle'}
          </span>
          <span className="text-white font-medium tracking-tight truncate">{toastMessage}</span>
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
