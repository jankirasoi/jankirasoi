'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { api, MenuItem, CatalogResponse, TrackOrderResponse, DEFAULT_FOOD_IMAGE, resolveDishImageUrl, DEFAULT_DISH_IMAGES } from '../lib/api';
import { useCart } from '../context/CartContext';
import DishDetailModal from '../components/DishDetailModal';
import ActiveOrderBanner from '../components/ActiveOrderBanner';

export default function HomePage() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDishModal, setSelectedDishModal] = useState<MenuItem | null>(null);

  const [activeFilter, setActiveFilter] = useState<string>('all');

  const { items, addItem, updateQty } = useCart();

  useEffect(() => {
    // Safely load cached data after hydration
    const cached = api.getCachedCatalog();
    if (cached?.categories?.length) {
      setCatalog(cached);
      setLoading(false);
    }

    async function loadData(force = true) {
      try {
        const catalogData = await api.getCatalog(undefined, force).catch(() => null);
        if (catalogData?.categories?.length) {
          setCatalog(catalogData as CatalogResponse);
        }
      } catch (err) {
        console.error('Failed to load catalog data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData(false);

    // Subscribe to cross-tab updates & focus revalidation
    const unsubscribe = api.subscribeToCatalogUpdates(() => {
      loadData(true);
    });

    const interval = setInterval(() => {
      loadData(false);
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const allDishes = useMemo(() => {
    if (!catalog?.categories) return [];
    return catalog.categories.flatMap((cat) => cat.items);
  }, [catalog]);

  const filterPills = useMemo(() => {
    const list: Array<{ id: string; label: string; icon?: string; badge?: string }> = [
      { id: 'all', label: 'All Items', icon: 'restaurant' },
      { id: 'bestseller', label: 'Bestseller', icon: 'local_fire_department' },
    ];

    if (catalog?.categories && catalog.categories.length > 0) {
      catalog.categories.forEach((cat) => {
        const cleanName = cat.name.split('(')[0].trim();
        list.push({
          id: cat.id,
          label: cleanName,
          badge: cat.items?.length ? cat.items.length.toString() : undefined,
        });
      });
    }

    list.push({ id: 'under_99', label: 'Under ₹99', icon: 'savings' });
    list.push({ id: 'ratings_4', label: 'Ratings 4.5+ ★' });

    return list;
  }, [catalog]);

  const filteredDishes = useMemo(() => {
    if (!catalog?.categories) return [];
    const all = catalog.categories.flatMap((cat) => cat.items);

    if (activeFilter === 'all') return all;

    if (activeFilter === 'bestseller') {
      return all.filter((item) => {
        const lower = (item.name + ' ' + (item.slug || '') + ' ' + (item.description || '')).toLowerCase();
        return (
          lower.includes('thali') ||
          lower.includes('shahi paneer') ||
          lower.includes('dal tadka') ||
          lower.includes('dal fry') ||
          lower.includes('dal bati') ||
          lower.includes('poha') ||
          lower.includes('aloo paratha') ||
          lower.includes('matar pulao')
        );
      });
    }

    if (activeFilter === 'under_99') {
      return all.filter((item) => item.basePricePaise <= 9900);
    }

    if (activeFilter === 'ratings_4') {
      return all.filter((item) => !item.isSoldOut);
    }

    const matchedCat = catalog.categories.find((c) => c.id === activeFilter);
    if (matchedCat) return matchedCat.items;

    return all;
  }, [catalog, activeFilter]);

  const currentFilterLabel = useMemo(() => {
    const pill = filterPills.find((p) => p.id === activeFilter);
    return pill ? pill.label : 'Recommended';
  }, [filterPills, activeFilter]);

  const getItemQuantity = (productId: string) => {
    const cartItem = items.find((i) => i.productId === productId);
    return cartItem ? cartItem.quantity : 0;
  };

  const handleAdd = (item: {
    id: string;
    name: string;
    pricePaise: number;
    imageUrl?: string;
    variantId?: string;
    variantName?: string;
  }) => {
    addItem({
      productId: item.id,
      name: item.name,
      pricePaise: item.pricePaise,
      imageUrl: item.imageUrl,
      variantId: item.variantId,
      variantName: item.variantName,
      quantity: 1,
    });
  };

  const handleIncrease = (item: {
    id: string;
    name: string;
    pricePaise: number;
    imageUrl?: string;
    variantId?: string;
    variantName?: string;
  }) => {
    const idx = items.findIndex((i) => i.productId === item.id);
    if (idx > -1) updateQty(idx, 1);
    else handleAdd(item);
  };

  const handleDecrease = (productId: string) => {
    const idx = items.findIndex((i) => i.productId === productId);
    if (idx > -1) updateQty(idx, -1);
  };

  // Recommended count
  const recommendedCount = allDishes.length;

  return (
    <main className="flex flex-col relative w-full pt-16 pb-28 bg-[#FFF9F0] min-h-screen">
      <div className="flex flex-col w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        {/* 1. Delivery Notice Banner */}
        <div className="mt-3 bg-[#FFF1DC] border border-[#E99A32]/30 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="material-symbols-outlined text-[#E99A32] text-[20px] shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              bolt
            </span>
            <p className="text-xs sm:text-sm font-medium text-[#292D26] truncate">
              <span className="font-bold text-[#E99A32]">Free delivery</span> within 4km • Fresh Hot Meals Everyday
            </p>
          </div>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#38754A] text-white shrink-0">
            LIVE
          </span>
        </div>

        {/* 2. Hero Visual & Headline Card */}
        <div className="mt-4 rounded-2xl sm:rounded-3xl bg-white border border-[#EEE7DC] overflow-hidden shadow-sm">
          <div className="relative h-60 sm:h-72 md:h-80 lg:h-96 w-full">
            <img
              className="w-full h-full object-cover"
              alt="Indian royal vegetarian thali overhead view"
              fetchPriority="high"
              decoding="async"
              src="/images/hero-thali.jpg"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent"></div>

            {/* Top Badges Overlay */}
            <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-white/95 backdrop-blur-md text-xs sm:text-sm text-[#38754A] font-bold shadow-xs">
                <span className="w-2 h-2 rounded-full bg-[#38754A] animate-pulse"></span>
                Fresh Batch Ready
              </span>
            </div>

            {/* Official Brand Logo Badge on Hero */}
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-white/90 backdrop-blur-md rounded-2xl px-3 py-1 shadow-sm border border-white/40 flex items-center gap-1.5">
              <img
                src="/images/logo.png"
                alt="Janki Rasoi"
                className="h-7 sm:h-9 w-auto object-contain"
              />
            </div>

            {/* Hero Bottom Content */}
            <div className="absolute bottom-4 inset-x-4 sm:bottom-6 sm:inset-x-6 text-white">
              <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                <span className="w-4 h-4 rounded-[3px] bg-white flex items-center justify-center p-0.5 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-[#38754A]"></span>
                </span>
                <span className="text-[11px] sm:text-xs text-[#EAF4ED] tracking-wide uppercase font-bold">
                  Home-Style Vegetarian Kitchen
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight drop-shadow-sm font-headline">
                Ghar Jaisa Khana, Har Din!
              </h1>
            </div>
          </div>
        </div>

        {/* Active Order Tracking Banner (Home-only, hidden when no order) */}
        <ActiveOrderBanner />

        {/* 3. Quick Filter Pills Ribbon */}
        <div className="mt-5 flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          {filterPills.map((pill) => {
            const isActive = activeFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setActiveFilter(pill.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-all shadow-2xs cursor-pointer select-none ${
                  isActive
                    ? 'border border-[#38754A] bg-[#38754A] text-white font-bold shadow-xs scale-102'
                    : 'border border-[#EEE7DC] bg-white text-[#292D26] hover:bg-[#F6FBF7] font-semibold'
                }`}
              >
                {pill.icon && (
                  <span
                    className={`material-symbols-outlined text-[15px] ${
                      isActive ? 'text-white' : 'text-[#38754A]'
                    }`}
                  >
                    {pill.icon}
                  </span>
                )}
                <span>{pill.label}</span>
                {pill.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive
                        ? 'bg-white/25 text-white'
                        : 'bg-[#EEE7DC] text-[#77786F]'
                    }`}
                  >
                    {pill.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 5. Recommended / Filtered Header */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-extrabold text-[#292D26] font-headline">
              {activeFilter === 'all'
                ? `Recommended (${filteredDishes.length})`
                : `${currentFilterLabel} (${filteredDishes.length})`}
            </h2>
            {activeFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="text-[11px] text-[#7A1E1E] hover:underline font-bold ml-1 cursor-pointer flex items-center gap-0.5"
              >
                <span className="material-symbols-outlined text-[13px]">close</span>
                <span>Reset</span>
              </button>
            )}
          </div>
          <Link
            href="/menu"
            className="text-xs text-[#38754A] font-bold hover:underline flex items-center gap-0.5"
          >
            <span>View Full Menu ({allDishes.length})</span>
            <span>&rarr;</span>
          </Link>
        </div>

        {/* Empty state if filter has no dishes */}
        {!loading && filteredDishes.length === 0 && (
          <div className="mt-8 p-8 bg-white rounded-2xl border border-[#EEE7DC] text-center flex flex-col items-center">
            <span className="material-symbols-outlined text-4xl text-[#77786F] mb-2">restaurant_menu</span>
            <p className="font-bold text-sm text-[#292D26]">No dishes found under &quot;{currentFilterLabel}&quot;</p>
            <p className="text-xs text-[#77786F] mt-1">Try selecting another category or view all items.</p>
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="mt-4 px-4 py-2 bg-[#38754A] text-white text-xs font-bold rounded-xl shadow-xs hover:bg-[#285C38]"
            >
              Show All Dishes
            </button>
          </div>
        )}

        {/* 6. Food Card Grid (Zero mock data, 100% database items) */}
        {loading && allDishes.length === 0 ? (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-2.5 sm:p-3 border border-[#EEE7DC] shadow-xs flex flex-col justify-between animate-pulse"
              >
                <div
                  className="w-full rounded-xl bg-[#EFECE4]"
                  style={{ aspectRatio: '1 / 1' }}
                />
                <div className="flex flex-col gap-1 mt-2 flex-1 justify-between">
                  <div>
                    <div className="w-3/4 h-3.5 bg-[#EFECE4] rounded" />
                    <div className="w-1/2 h-3 bg-[#EFECE4] rounded mt-1" />
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-auto">
                    <div className="w-12 h-4 bg-[#EFECE4] rounded" />
                    <div className="w-14 h-7 bg-[#EFECE4] rounded-lg" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
            {filteredDishes.map((dish) => {
              const qty = getItemQuantity(dish.id);
              return (
                <div
                  key={dish.id}
                  onClick={() => setSelectedDishModal(dish)}
                  className="bg-white rounded-2xl p-2.5 sm:p-3 border border-[#EEE7DC] shadow-xs hover:border-[#38754A]/40 hover:shadow-md transition-all flex flex-col justify-between group cursor-pointer select-none"
                >
                  {/* Square Food Image with Floating Overlay Badges */}
                  <div
                    className="relative w-full rounded-xl overflow-hidden bg-[#FFF9F0] border border-[#EEE7DC]/70 shadow-2xs"
                    style={{ aspectRatio: '1 / 1' }}
                  >
                    <img
                      className={`w-full h-full object-cover group-hover:scale-104 transition-transform duration-300 ${dish.isSoldOut ? 'grayscale contrast-75 opacity-60' : ''}`}
                      style={{ aspectRatio: '1 / 1' }}
                      loading="lazy"
                      decoding="async"
                      src={resolveDishImageUrl(dish)}
                      alt={dish.name}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        const fallback = (dish.slug && DEFAULT_DISH_IMAGES[dish.slug]) || DEFAULT_FOOD_IMAGE;
                        e.currentTarget.src = fallback;
                      }}
                    />

                    {/* Top-Left Pure Veg Overlay Mark */}
                    <div className="absolute top-2 left-2 z-10 w-4 h-4 rounded-xs border border-[#38754A] flex items-center justify-center p-0.5 bg-white/95 backdrop-blur-xs shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#38754A]"></span>
                    </div>

                    {/* Bottom-Right Rating Pill */}
                    {!dish.isSoldOut && (
                      <div className="absolute bottom-2 right-2 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/95 backdrop-blur-xs text-[#292D26] font-extrabold text-[10px] shadow-xs border border-black/5">
                        <span>4.8</span>
                        <span className="text-amber-500 text-[10px]">★</span>
                      </div>
                    )}

                    {/* Sold Out Overlay */}
                    {dish.isSoldOut && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-2">
                        <span className="px-2.5 py-1 rounded-full bg-stone-900/90 text-stone-100 text-[10px] font-extrabold uppercase tracking-wider border border-white/20 shadow-sm text-center">
                          Sold Out Today
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Clean Content Area Below Image */}
                  <div className="flex flex-col mt-2 flex-1 justify-between">
                    <div>
                      {/* Dish Name */}
                      <h3 className="font-bold text-xs sm:text-sm text-[#292D26] line-clamp-1 leading-snug group-hover:text-[#38754A] transition-colors">
                        {dish.name}
                      </h3>

                      {/* Subheading / Description (Tight 2px spacing, zero artificial gap) */}
                      <p className="text-[11px] text-[#77786F] line-clamp-1 mt-0.5 font-normal leading-tight">
                        {dish.description || 'Cooked fresh with pure desi ghee • Homestyle'}
                      </p>
                    </div>

                    {/* Price & Action Button */}
                    <div className="flex items-center justify-between pt-2.5 mt-auto">
                      <span className="font-extrabold text-xs sm:text-sm text-[#292D26]">
                        ₹{(dish.basePricePaise / 100).toFixed(0)}
                      </span>

                      {dish.isSoldOut ? (
                        <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-400 font-extrabold text-[10px] border border-stone-200 cursor-not-allowed">
                          SOLD OUT
                        </span>
                      ) : qty > 0 ? (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center bg-[#38754A] text-white rounded-lg px-2 py-0.5 shadow-xs gap-1.5 font-bold text-xs"
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDecrease(dish.id);
                            }}
                            className="w-5 h-5 flex items-center justify-center hover:bg-black/10 active:scale-90 font-bold"
                          >
                            -
                          </button>
                          <span className="min-w-[12px] text-center font-bold">{qty}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleIncrease({
                                id: dish.id,
                                name: dish.name,
                                pricePaise: dish.basePricePaise,
                                imageUrl: dish.imageUrl,
                              });
                            }}
                            className="w-5 h-5 flex items-center justify-center hover:bg-black/10 active:scale-90 font-bold"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAdd({
                              id: dish.id,
                              name: dish.name,
                              pricePaise: dish.basePricePaise,
                              imageUrl: dish.imageUrl,
                            });
                          }}
                          className="px-3 py-1 rounded-lg border border-[#38754A] text-[#38754A] bg-white hover:bg-[#38754A] hover:text-white font-extrabold text-xs shadow-2xs active:scale-95 transition-all cursor-pointer flex items-center gap-0.5"
                        >
                          <span>+</span>
                          <span>ADD</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating ITEMS Quick Menu Button */}
        <Link
          href="/menu"
          className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-[#1C1C1C] text-white shadow-xl flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform border border-white/20"
        >
          <span className="material-symbols-outlined text-[18px]">menu_book</span>
          <span className="text-[9px] font-extrabold tracking-wider uppercase">ITEMS</span>
        </Link>


      </div>

      {/* Food Item Detail Bottom Sheet / Modal matching reference screenshot */}
      <DishDetailModal
        dish={selectedDishModal}
        onClose={() => setSelectedDishModal(null)}
      />
    </main>
  );
}
