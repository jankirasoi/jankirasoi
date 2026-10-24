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
          if (item.productId === 'spec-full-thali') {
            return {
              ...item,
              productId: '09f67dad-2306-49b7-88c7-cae050592f14',
              variantId: item.variantId || 'd897e546-e669-4f5f-8f98-dd2db0308313',
            };
          }
          if (item.productId === 'spec-home-thali') {
            return {
              ...item,
              productId: 'cd02708b-cf9d-460a-878d-3597115602b7',
              variantId: item.variantId || '7ee248f8-545a-46ba-b790-03a4e79cde96',
            };
          }
          if (item.productId === 'spec-roti-sabzi') {
            return {
              ...item,
              productId: 'a1c1e8ff-8f9e-4a82-98f3-876bd6f9e0f3',
              variantId: item.variantId || '22e8ae01-205b-49d0-ac13-10354ea5155f',
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
    }, 3000);
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
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            backgroundColor: isToastError ? '#B91C1C' : '#0F172A',
            color: '#FFFFFF',
          }}
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold shadow-2xl transition-all flex items-center gap-2 max-w-[90vw] border border-white/20 backdrop-blur-md pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-200`}
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
