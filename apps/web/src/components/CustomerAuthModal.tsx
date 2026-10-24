'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, UserProfile } from '../lib/api';
import DeliveryStatusPill from './DeliveryStatusPill';
import LocationMapModal, { LocationData } from './LocationMapModal';

interface CustomerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (user: UserProfile) => void;
  initialTab?: 'PROFILE' | 'ORDERS' | 'EDIT';
}

export default function CustomerAuthModal({
  isOpen,
  onClose,
  onLoginSuccess,
  initialTab = 'PROFILE',
}: CustomerAuthModalProps) {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  
  // Delivery address fields for login & profile edit
  const [flat, setFlat] = useState('');
  const [street, setStreet] = useState('');
  const [landmark, setLandmark] = useState('');
  const [pincode, setPincode] = useState('454774');
  const [detectedCity, setDetectedCity] = useState<string | null>('Sagore, Pithampur');
  const [checkingPin, setCheckingPin] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Tabs for logged-in view: 'PROFILE' (view/edit) or 'ORDERS'
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'ORDERS'>('PROFILE');
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  // Sync user status on modal open
  useEffect(() => {
    if (isOpen) {
      api.getCurrentUser().then((user) => {
        let activeUser = user;
        if (!activeUser && typeof window !== 'undefined') {
          const storedPhone = localStorage.getItem('jr_customer_phone');
          const storedName = localStorage.getItem('jr_customer_name');
          const storedAddrRaw =
            localStorage.getItem('jr_customer_address') ||
            localStorage.getItem('jr_selected_address');
          if (storedPhone) {
            let addrObj: any = undefined;
            if (storedAddrRaw) {
              try {
                addrObj = JSON.parse(storedAddrRaw);
              } catch {}
            }
            activeUser = {
              id: 'cust_' + storedPhone,
              name: storedName || 'Customer',
              phone: storedPhone,
              role: 'CUSTOMER',
              savedAddress: addrObj,
            };
          }
        }

        if (activeUser && activeUser.role === 'CUSTOMER') {
          setCurrentUser(activeUser);
          setName(activeUser.name || '');
          setPhone(activeUser.phone || '');
          if (activeUser.savedAddress) {
            setFlat(activeUser.savedAddress.flat || '');
            setStreet(activeUser.savedAddress.street || '');
            setLandmark(activeUser.savedAddress.landmark || '');
            setPincode(activeUser.savedAddress.pincode || '454774');
          }
          if (initialTab === 'ORDERS') {
            setActiveTab('ORDERS');
            setIsEditingProfile(false);
          } else if (initialTab === 'EDIT') {
            setActiveTab('PROFILE');
            setIsEditingProfile(true);
          } else {
            setActiveTab('PROFILE');
            setIsEditingProfile(false);
          }
        } else {
          setCurrentUser(null);
          setIsEditingProfile(false);
        }
      });
      setError(null);
      setSuccessMsg(null);
    }
  }, [isOpen, initialTab]);

  // Automated Pincode Check
  useEffect(() => {
    const cleanPin = pincode.trim().replace(/\D/g, '');
    if (cleanPin.length !== 6) {
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
      } catch {
        // Fallback
      } finally {
        if (isMounted) setCheckingPin(false);
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [pincode]);

  if (!isOpen) return null;

  // Handle Login / Registration
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!flat.trim() || !street.trim()) {
      setError('Please provide your complete delivery address (Flat & Street)');
      return;
    }
    if (pincode.trim().length !== 6) {
      setError('Please enter a valid 6-digit delivery pincode');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const addressObj = {
        flat: flat.trim(),
        street: street.trim(),
        landmark: landmark.trim() || undefined,
        pincode: pincode.trim(),
      };

      const res = await api.loginCustomer(cleanPhone, name.trim(), addressObj);
      if (typeof window !== 'undefined') {
        localStorage.setItem('jr_customer_phone', cleanPhone);
        localStorage.setItem('jr_customer_name', name.trim());
        localStorage.setItem('jr_customer_address', JSON.stringify(addressObj));
        localStorage.setItem('jr_user_profile', JSON.stringify(res.user));
      }
      setCurrentUser(res.user);
      setActiveTab('PROFILE');
      setIsEditingProfile(false);
      setSuccessMsg('Details saved successfully!');
      if (onLoginSuccess) {
        onLoginSuccess(res.user);
      }
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Failed to authenticate. Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Profile Update (Save changes to name and address)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name cannot be empty');
      return;
    }
    if (!flat.trim() || !street.trim()) {
      setError('Please provide complete address (House/Flat & Street)');
      return;
    }
    if (pincode.trim().length !== 6) {
      setError('Please enter a valid 6-digit pincode');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const addressObj = {
        flat: flat.trim(),
        street: street.trim(),
        landmark: landmark.trim() || undefined,
        pincode: pincode.trim(),
      };

      const res = await api.loginCustomer(currentUser!.phone, name.trim(), addressObj);
      setCurrentUser(res.user);
      setIsEditingProfile(false);
      setSuccessMsg('Profile and delivery address updated successfully!');
      if (onLoginSuccess) {
        onLoginSuccess(res.user);
      }
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setLoading(false);
    }
  };

  // 1-Tap Quick Demo Customer
  const handleQuickDemo = async () => {
    setPhone('9876543210');
    setName('Rahul Sharma');
    setFlat('House 14, Main Market');
    setStreet('Near Sagore Post Office, Sagore');
    setLandmark('Near Sagore Bus Stand');
    setPincode('454774');
    setError(null);
    setLoading(true);

    try {
      const addressObj = {
        flat: 'House 14, Main Market',
        street: 'Near Sagore Post Office, Sagore',
        landmark: 'Near Sagore Bus Stand',
        pincode: '454774',
      };
      const res = await api.loginCustomer('9876543210', 'Rahul Sharma', addressObj);
      setCurrentUser(res.user);
      setActiveTab('PROFILE');
      setIsEditingProfile(false);
      setSuccessMsg('Logged in as Rahul Sharma (Sagore)!');
      if (onLoginSuccess) {
        onLoginSuccess(res.user);
      }
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await api.logout();
      setCurrentUser(null);
      setPhone('');
      setName('');
      setFlat('');
      setStreet('');
      setLandmark('');
      setPincode('454774');
      setIsEditingProfile(false);
      window.dispatchEvent(new Event('storage'));
    } finally {
      setLoading(false);
    }
  };

  // Extract recent orders from currentUser or localStorage
  const getOrdersList = () => {
    const list: any[] = [];
    if (currentUser?.recentOrders && currentUser.recentOrders.length > 0) {
      list.push(...currentUser.recentOrders);
    }
    if (typeof window !== 'undefined') {
      try {
        const stored = JSON.parse(window.localStorage.getItem('jr_recent_orders') || '[]');
        if (Array.isArray(stored)) {
          stored.forEach((item: any) => {
            if (!list.some((o) => o.orderNumber === item.orderNumber)) {
              list.push(item);
            }
          });
        }
      } catch {}
    }
    return list;
  };

  const ordersList = getOrdersList();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Backdrop tap to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 max-h-[92vh] flex flex-col">
        {/* Header Strip */}
        <div className="bg-[#38754A] text-white p-4 sm:p-5 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
              {currentUser ? (
                currentUser.name.charAt(0).toUpperCase()
              ) : (
                <span className="material-symbols-outlined text-[20px]">person</span>
              )}
            </span>
            <div className="min-w-0">
              <h3 className="font-bold text-base leading-tight truncate">
                {currentUser ? currentUser.name : 'Welcome to Janki Rasoi'}
              </h3>
              <p className="text-xs text-[#EAF4ED] truncate">
                {currentUser ? `+91 ${currentUser.phone}` : 'Ghar Jaisa Shuddh Khana, Delivered Daily'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors shrink-0"
            title="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Tab Selector (When logged in) */}
        {currentUser && (
          <div className="flex border-b border-[#EEE7DC] bg-[#FFF9F0] px-3 pt-2 shrink-0">
            <button
              onClick={() => {
                setActiveTab('PROFILE');
                setIsEditingProfile(false);
              }}
              className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'PROFILE'
                  ? 'border-[#38754A] text-[#38754A]'
                  : 'border-transparent text-[#77786F] hover:text-[#292D26]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">account_circle</span>
              <span>Profile &amp; Address</span>
            </button>
            <button
              onClick={() => setActiveTab('ORDERS')}
              className={`flex-1 py-2.5 text-xs font-bold text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'ORDERS'
                  ? 'border-[#38754A] text-[#38754A]'
                  : 'border-transparent text-[#77786F] hover:text-[#292D26]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>My Orders</span>
              {ordersList.length > 0 && (
                <span className="px-1.5 py-0.2 bg-[#38754A] text-white text-[10px] rounded-full">
                  {ordersList.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-medium flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              <span>{successMsg}</span>
            </div>
          )}

          {/* ============================================================== */}
          {/* LOGGED IN: TAB 1 - PROFILE & ADDRESS                           */}
          {/* ============================================================== */}
          {currentUser && activeTab === 'PROFILE' && (
            <div className="space-y-4">
              {!isEditingProfile ? (
                /* View Mode */
                <div className="space-y-3.5">
                  {/* Customer Card */}
                  <div className="bg-[#FFF9F0] border border-[#EEE7DC] rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-[#38754A] uppercase tracking-wider block">
                        Verified Customer
                      </span>
                      <div className="text-sm font-bold text-[#292D26] mt-0.5">{currentUser.name}</div>
                      <div className="text-xs text-[#77786F] mt-0.5 font-mono">+91 {currentUser.phone}</div>
                    </div>
                    <button
                      onClick={() => setIsEditingProfile(true)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-[#EEE7DC] text-[#38754A] text-xs font-bold hover:bg-[#EAF4ED] transition-colors flex items-center gap-1 shadow-xs"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                      <span>Edit</span>
                    </button>
                  </div>

                  {/* Saved Delivery Address Card */}
                  <div className="border border-[#EEE7DC] rounded-2xl p-4 bg-white shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#292D26] uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[#38754A] text-[18px]">location_on</span>
                        <span>Saved Delivery Address</span>
                      </div>
                      <button
                        onClick={() => setIsEditingProfile(true)}
                        className="text-xs font-bold text-[#38754A] hover:underline"
                      >
                        Change
                      </button>
                    </div>

                    {currentUser.savedAddress && (currentUser.savedAddress.flat || currentUser.savedAddress.street) ? (
                      <div className="text-xs text-[#292D26] leading-relaxed bg-[#FFF9F0] p-3 rounded-xl border border-[#EEE7DC]">
                        <p className="font-bold text-[#292D26]">{currentUser.savedAddress.flat}</p>
                        <p className="text-[#77786F]">{currentUser.savedAddress.street}</p>
                        {currentUser.savedAddress.landmark && (
                          <p className="text-[#77786F]">Landmark: {currentUser.savedAddress.landmark}</p>
                        )}
                        <p className="text-[#38754A] font-bold mt-1">
                          Pincode: {currentUser.savedAddress.pincode || '454774'}
                        </p>
                      </div>
                    ) : (
                      <div className="text-xs text-[#77786F] italic bg-[#FFF9F0] p-3 rounded-xl border border-[#EEE7DC] flex items-center justify-between">
                        <span>No address saved yet. Tap Edit to add your flat &amp; locality.</span>
                        <button
                          onClick={() => setIsEditingProfile(true)}
                          className="px-2.5 py-1 bg-[#38754A] text-white rounded-lg font-bold text-xs shrink-0 ml-2"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Primary Actions */}
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      onClick={() => {
                        if (onLoginSuccess && currentUser) onLoginSuccess(currentUser);
                        onClose();
                      }}
                      className="w-full py-3 bg-[#008848] hover:bg-[#00703c] text-white rounded-xl font-extrabold text-xs sm:text-sm shadow-md transition-all active:scale-98 flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>Confirm &amp; Proceed</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      disabled={loading}
                      className="w-full py-2.5 text-xs text-rose-600 font-semibold hover:bg-rose-50 rounded-xl transition-colors border border-transparent hover:border-rose-100"
                    >
                      {loading ? 'Logging out...' : 'Sign Out / Switch Account'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit Mode */
                <form onSubmit={handleSaveProfile} className="space-y-3">
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-bold text-[#38754A] uppercase tracking-wider">
                      Edit Profile &amp; Address
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="text-xs text-[#77786F] hover:text-[#292D26]"
                    >
                      Cancel
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#292D26] uppercase mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsMapModalOpen(true)}
                    className="w-full py-2 px-3 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#E25822] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_location_alt</span>
                    <span>Choose Location on Map</span>
                  </button>

                  <div>
                    <label className="block text-[11px] font-bold text-[#292D26] uppercase mb-1">
                      Flat / House No. / Building *
                    </label>
                    <input
                      type="text"
                      required
                      value={flat}
                      onChange={(e) => setFlat(e.target.value)}
                      placeholder="Flat 402, Block C, Malviya Nagar"
                      className="w-full px-3 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#292D26] uppercase mb-1">
                      Street / Colony / Area *
                    </label>
                    <input
                      type="text"
                      required
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Outer Ring Road, Malviya Nagar"
                      className="w-full px-3 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-[#292D26] uppercase mb-1">
                        Landmark (Optional)
                      </label>
                      <input
                        type="text"
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        placeholder="Near Metro Station"
                        className="w-full px-3 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#292D26] uppercase mb-1">
                        Pincode *
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                        placeholder="454774"
                        className="w-full px-3 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={loading || !name.trim() || !flat.trim() || !street.trim()}
                      className="flex-1 py-2.5 bg-[#38754A] hover:bg-[#285C38] text-white rounded-xl font-bold text-xs shadow-xs transition-colors disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Profile & Address'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-[#292D26] rounded-xl font-semibold text-xs transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* LOGGED IN: TAB 2 - MY ORDERS                                   */}
          {/* ============================================================== */}
          {currentUser && activeTab === 'ORDERS' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-1">
                <span className="text-xs font-bold text-[#38754A] uppercase tracking-wider">
                  Order History &amp; Live Tracking
                </span>
                <span className="text-xs text-[#77786F]">
                  {ordersList.length} {ordersList.length === 1 ? 'Order' : 'Orders'}
                </span>
              </div>

              {ordersList.length > 0 ? (
                <div className="space-y-2.5">
                  {ordersList.map((ord, idx) => {
                    const token = ord.trackingToken || ord.orderNumber;
                    const dateStr = ord.createdAt
                      ? new Date(ord.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Recently placed';

                    return (
                      <div
                        key={ord.orderNumber || idx}
                        className="p-3.5 rounded-2xl border border-[#EEE7DC] bg-[#FFF9F0] flex items-center justify-between gap-2.5 hover:border-[#38754A]/40 transition-colors shadow-2xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#292D26] truncate">
                              #{ord.orderNumber}
                            </span>
                            <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#EAF4ED] text-[#38754A] border border-[#38754A]/20">
                              {ord.status ? ord.status.replace(/_/g, ' ') : 'PLACED'}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#77786F] mt-1">
                            {ord.totalAmountPaise
                              ? `₹${(ord.totalAmountPaise / 100).toFixed(0)} • `
                              : ''}
                            {dateStr}
                          </div>
                        </div>

                        <DeliveryStatusPill
                          orderNumber={ord.orderNumber}
                          token={token}
                          status={ord.status || 'PLACED'}
                          createdAt={ord.createdAt}
                          deliveryAddress={ord.deliveryAddress || currentUser.savedAddress}
                          onClick={onClose}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center bg-[#FFF9F0] rounded-2xl border border-[#EEE7DC]">
                  <span className="material-symbols-outlined text-[36px] text-[#38754A]">receipt_long</span>
                  <p className="text-xs font-bold text-[#292D26] mt-2">No Past Orders Found</p>
                  <p className="text-[11px] text-[#77786F] mt-0.5">
                    Order today&apos;s freshly cooked thali or bowl to start tracking.
                  </p>
                  <Link
                    href="/menu"
                    onClick={onClose}
                    className="mt-3 inline-block px-4 py-2 bg-[#38754A] text-white rounded-xl text-xs font-bold"
                  >
                    Explore Menu
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* NOT LOGGED IN: COMPLETE DELIVERY & PHONE LOGIN FORM            */}
          {/* ============================================================== */}
          {!currentUser && (
            <form onSubmit={handleLoginSubmit} className="space-y-3.5">
              <div className="text-center pb-1">
                <h4 className="font-bold text-[#292D26] text-base font-headline">
                  Enter Your Delivery &amp; Contact Details
                </h4>
                <p className="text-xs text-[#77786F] mt-0.5">
                  Save your address &amp; mobile number for real-time delivery and verbal handover PIN.
                </p>
              </div>

              {/* Mobile Number with +91 */}
              <div>
                <label className="block text-[11px] font-bold text-[#292D26] uppercase tracking-wider mb-1">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center border border-[#EEE7DC] rounded-xl overflow-hidden focus-within:border-[#38754A] focus-within:ring-1 focus-within:ring-[#38754A] bg-white">
                  <div className="px-3 py-2.5 bg-[#FFF9F0] text-[#292D26] font-bold text-xs border-r border-[#EEE7DC]">
                    +91
                  </div>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full px-3 py-2 text-xs font-semibold tracking-wider text-[#292D26] outline-none"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[11px] font-bold text-[#292D26] uppercase tracking-wider mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                />
              </div>

              {/* Delivery Address Details */}
              <button
                type="button"
                onClick={() => setIsMapModalOpen(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#E25822] font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">add_location_alt</span>
                <span>Select Delivery Location on Map</span>
              </button>

              <div>
                <label className="block text-[11px] font-bold text-[#292D26] uppercase tracking-wider mb-1">
                  Flat / House No. / Building <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Flat 402, Block C, Malviya Nagar"
                  value={flat}
                  onChange={(e) => setFlat(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#292D26] uppercase tracking-wider mb-1">
                  Street / Area / Locality <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Outer Ring Road, Malviya Nagar"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-[#292D26] uppercase tracking-wider mb-1">
                    Landmark (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Near Metro Station"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#292D26] uppercase tracking-wider mb-1">
                    Pincode <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="454774"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3 py-2 text-xs border border-[#EEE7DC] rounded-xl focus:border-[#38754A] outline-none"
                  />
                </div>
              </div>

              {detectedCity && (
                <div className="text-[11px] text-[#38754A] font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  <span>Delivering to {detectedCity}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || phone.length < 10 || !name.trim() || !flat.trim() || !street.trim()}
                className="w-full py-3 bg-[#38754A] hover:bg-[#285C38] disabled:opacity-50 text-white rounded-xl font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Instant Login &amp; Continue</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </>
                )}
              </button>

              {/* Quick 1-Tap Demo Customer */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleQuickDemo}
                  disabled={loading}
                  className="w-full py-2 px-3 bg-[#EAF4ED] hover:bg-[#d8eed7] border border-[#38754A]/30 text-[#38754A] rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">touch_app</span>
                  <span>1-Tap Test Customer (Rahul Sharma • Malviya Nagar)</span>
                </button>
              </div>

              <p className="text-[11px] text-[#77786F] text-center leading-tight">
                No OTP passwords required. We only use your phone number for rider delivery contact.
              </p>
            </form>
          )}
        </div>
      </div>

      {/* Select Your Location Modal (Swiggy Style 2-Step) */}
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
        }}
      />
    </div>
  );
}
