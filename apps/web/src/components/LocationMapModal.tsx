'use client';

import React, { useState, useEffect } from 'react';

export interface LocationData {
  id?: string;
  addressType: 'Home' | 'Work' | 'Other';
  flat: string;
  street: string;
  landmark: string;
  pincode: string;
  city: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

interface LocationMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (location: LocationData) => void;
  initialPincode?: string;
  initialFlat?: string;
  initialStreet?: string;
  initialLandmark?: string;
}

export const SAGORE_KITCHEN_LAT = 22.6288;
export const SAGORE_KITCHEN_LNG = 75.5684;

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

const SAGORE_PRESETS = [
  {
    name: 'Sagore Main Market',
    area: 'Main Bazar, Sagore, Pithampur',
    landmark: 'Near Sagore Post Office',
    pincode: '454774',
    lat: 22.6288,
    lng: 75.5684,
  },
  {
    name: 'Sagore Kuti & Bus Stand',
    area: 'Dhar-Indore Road, Sagore',
    landmark: 'Near Sagore Bus Stand',
    pincode: '454774',
    lat: 22.6312,
    lng: 75.5715,
  },
  {
    name: 'Pithampur Sector 1',
    area: 'Sector 1 Industrial Area, Pithampur',
    landmark: 'Near Cipla / Eicher Square',
    pincode: '454774',
    lat: 22.6085,
    lng: 75.5921,
  },
  {
    name: 'Pithampur Sector 3',
    area: 'Sector 3 Smart Industrial Zone, Pithampur',
    landmark: 'Near NATRAX Hub',
    pincode: '454774',
    lat: 22.5891,
    lng: 75.5412,
  },
  {
    name: 'Chatrachhaya Colony',
    area: 'Chatrachhaya Colony, Sagore',
    landmark: 'Near Hanuman Temple',
    pincode: '454774',
    lat: 22.6254,
    lng: 75.5642,
  },
];

export default function LocationMapModal({
  isOpen,
  onClose,
  onConfirm,
  initialPincode = '454774',
  initialFlat = '',
  initialStreet = '',
  initialLandmark = '',
}: LocationMapModalProps) {
  // Two view modes: 'SELECT_LOCATION' (Screenshot 1) vs 'MAP_PINPOINT' (Screenshot 2)
  const [viewMode, setViewMode] = useState<'SELECT_LOCATION' | 'MAP_PINPOINT'>('SELECT_LOCATION');
  const [addressType, setAddressType] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Map coordinates
  const [lat, setLat] = useState(22.6288);
  const [lng, setLng] = useState(75.5684);
  const [flat, setFlat] = useState(initialFlat || '');
  const [street, setStreet] = useState(initialStreet || 'Main Market Road, Sagore');
  const [areaTitle, setAreaTitle] = useState('Sagore Main Market');
  const [landmark, setLandmark] = useState(initialLandmark || 'Near Sagore Police Station');
  const [pincode, setPincode] = useState(initialPincode || '454774');
  const [city, setCity] = useState('Sagore, Pithampur');
  const [displayAddress, setDisplayAddress] = useState('Sagore Main Market, Pithampur, Dhar, Madhya Pradesh 454774, India');
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [accuracyMode, setAccuracyMode] = useState<'precise' | 'approximate'>('precise');
  const [savedAddresses, setSavedAddresses] = useState<LocationData[]>([]);

  // Load saved addresses from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('jr_saved_addresses');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setSavedAddresses(parsed);
          }
        }
      } catch {}
    }
  }, [isOpen]);

  // Sync initial props
  useEffect(() => {
    if (isOpen) {
      if (initialFlat) setFlat(initialFlat);
      if (initialStreet) {
        setStreet(initialStreet);
        setAreaTitle(initialStreet.split(',')[0]);
      }
      if (initialLandmark) setLandmark(initialLandmark);
      if (initialPincode) setPincode(initialPincode);
      setViewMode('SELECT_LOCATION');
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, initialFlat, initialStreet, initialLandmark, initialPincode]);

  if (!isOpen) return null;

  // Search places via Nominatim OpenStreetMap
  const handleSearch = async (queryText: string) => {
    setSearchQuery(queryText);
    if (!queryText || queryText.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const q = encodeURIComponent(`${queryText}, Madhya Pradesh`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=5`, {
        headers: { 'Accept-Language': 'en' },
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data || []);
      }
    } catch {
      const local = SAGORE_PRESETS.filter(
        (p) =>
          p.name.toLowerCase().includes(queryText.toLowerCase()) ||
          p.area.toLowerCase().includes(queryText.toLowerCase())
      );
      setSearchResults(
        local.map((p) => ({
          display_name: `${p.name}, ${p.area}, ${p.pincode}`,
          lat: p.lat.toString(),
          lon: p.lng.toString(),
        }))
      );
    } finally {
      setIsSearching(false);
    }
  };

  // Select place from search or preset and switch to MAP view
  const selectLocation = (newLat: number, newLng: number, fullName: string, pin = '454774') => {
    setLat(newLat);
    setLng(newLng);
    setDisplayAddress(fullName);
    const primaryName = fullName.split(',')[0] || fullName;
    setAreaTitle(primaryName);
    setStreet(primaryName);
    setPincode(pin);
    setCity('Sagore, Pithampur');
    setSearchResults([]);
    setSearchQuery('');
    setViewMode('MAP_PINPOINT');
  };

  // Open Android-style location permission dialog (or execute directly if already granted "While using the app")
  const handleUseCurrentLocation = () => {
    if (typeof window !== 'undefined' && localStorage.getItem('jr_location_perm') === 'granted') {
      const isPrecise = localStorage.getItem('jr_location_accuracy') !== 'approximate';
      executeGeolocation(isPrecise, false);
      return;
    }
    setShowPermissionDialog(true);
  };

  // Perform geolocation once user chooses permission in dialog
  const executeGeolocation = (highAccuracy: boolean, persistPermission: boolean) => {
    setShowPermissionDialog(false);
    setIsGpsLoading(true);

    if (persistPermission && typeof window !== 'undefined') {
      try {
        localStorage.setItem('jr_location_perm', 'granted');
        localStorage.setItem('jr_location_accuracy', highAccuracy ? 'precise' : 'approximate');
      } catch {}
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      setIsGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        setLat(userLat);
        setLng(userLng);

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLng}`,
            { headers: { 'Accept-Language': 'en' } }
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const pin = addr.postcode || '454774';
            const detectedArea = addr.suburb || addr.neighbourhood || addr.road || 'Sagore Main Area';
            const detectedCity = addr.city || addr.town || addr.village || 'Sagore, Pithampur';

            setAreaTitle(detectedArea);
            setDisplayAddress(data.display_name || `${detectedArea}, ${detectedCity} ${pin}`);
            setStreet(detectedArea);
            setPincode(pin === '454774' ? '454774' : pin);
            setCity(detectedCity);
          }
        } catch {
          setAreaTitle('Current GPS Location');
          setDisplayAddress('Near Current GPS Location, Sagore, Pithampur (454774)');
          setStreet('Near Current Location, Sagore');
          setPincode('454774');
        } finally {
          setIsGpsLoading(false);
          setViewMode('MAP_PINPOINT');
        }
      },
      (err) => {
        setIsGpsLoading(false);
        console.warn('GPS location error:', err.message);
        // Fallback to Sagore center
        selectLocation(22.6288, 75.5684, 'Sagore Main Market, Pithampur, MP 454774', '454774');
      },
      { timeout: 15000, enableHighAccuracy: highAccuracy, maximumAge: 0 }
    );
  };

  // Share via WhatsApp / Request Address (Screenshot 1 Action 3)
  const handleRequestAddress = () => {
    const text = encodeURIComponent(
      'Hi! Please share your current delivery location address so I can order fresh homestyle food for you from Janki Rasoi: https://jankirasoi.vercel.app'
    );
    if (typeof window !== 'undefined') {
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    }
  };

  // Distance calculations
  const distanceKm = calculateHaversineDistanceKm(SAGORE_KITCHEN_LAT, SAGORE_KITCHEN_LNG, lat, lng);
  const isWithin5Km = distanceKm <= 5.0;
  const isWithin15Km = distanceKm <= 15.0;

  // Confirm and persist location
  const handleConfirmLocation = () => {
    if (!isWithin15Km) {
      alert(`Delivery is not available beyond 15 km from Sagore Kitchen. Selected location is ~${distanceKm} km away.`);
      return;
    }

    const confirmedLocation: LocationData = {
      id: `loc-${Date.now()}`,
      addressType,
      flat: flat.trim() || 'House / Flat Details',
      street: street.trim() || areaTitle || 'Sagore Main Road',
      landmark: landmark.trim(),
      pincode: pincode.trim() || '454774',
      city,
      formattedAddress: displayAddress || `${flat ? flat + ', ' : ''}${street}, ${city} - ${pincode}`,
      lat,
      lng,
    };

    // Save to localStorage list of saved addresses
    if (typeof window !== 'undefined') {
      try {
        const existing = savedAddresses.filter(
          (a) => a.formattedAddress !== confirmedLocation.formattedAddress
        );
        const updated = [confirmedLocation, ...existing].slice(0, 10);
        localStorage.setItem('jr_saved_addresses', JSON.stringify(updated));
        localStorage.setItem('jr_selected_address', JSON.stringify(confirmedLocation));
        setSavedAddresses(updated);
      } catch {}
    }

    onConfirm(confirmedLocation);
    onClose();
  };

  // Pick an existing saved address directly
  const handleSelectSavedAddress = (addr: LocationData) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('jr_selected_address', JSON.stringify(addr));
      } catch {}
    }
    onConfirm(addr);
    onClose();
  };

  // Google Maps Embed URL with exact coordinates and street-level zoom
  const mapEmbedUrl = `https://maps.google.com/maps?q=${lat},${lng}&hl=en&z=16&output=embed`;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#FAF9F6] w-full max-w-md sm:max-w-lg rounded-t-[28px] sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden border border-slate-200">

        {/* ============================================================== */}
        {/* VIEW 1: SELECT YOUR LOCATION (Exact Match with Reference 1)     */}
        {/* ============================================================== */}
        {viewMode === 'SELECT_LOCATION' && (
          <div className="flex flex-col h-full overflow-hidden bg-[#FAF9F6]">
            
            {/* 1. Header: Back Arrow + "Select Your Location" */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-2 bg-[#FAF9F6] shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-800 transition-colors"
                aria-label="Back"
              >
                <span className="material-symbols-outlined text-[24px]">arrow_back</span>
              </button>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Select Your Location
              </h2>
            </div>

            {/* 2. Search an area or address Input (Screenshot 1) */}
            <div className="px-4 py-2 shrink-0 relative">
              <div className="relative flex items-center bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search an area or address"
                  className="w-full pl-4 pr-10 py-3 rounded-2xl text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                <span className="material-symbols-outlined text-[20px] text-slate-400 absolute right-3 pointer-events-none">
                  search
                </span>
              </div>

              {/* Autocomplete Dropdown */}
              {searchResults.length > 0 && (
                <div className="absolute left-4 right-4 top-full mt-1.5 z-30 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {searchResults.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        selectLocation(
                          parseFloat(item.lat),
                          parseFloat(item.lon),
                          item.display_name,
                          '454774'
                        )
                      }
                      className="w-full p-3 text-left hover:bg-emerald-50/50 flex items-start gap-2.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-emerald-700 text-[18px] shrink-0 mt-0.5">
                        location_on
                      </span>
                      <span className="text-xs text-slate-700 font-medium line-clamp-2 leading-tight">
                        {item.display_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Three Action Cards Row (Exact Match with Reference 1) */}
            <div className="grid grid-cols-3 gap-2.5 px-4 pt-2 pb-3 shrink-0">
              
              {/* Card 1: Turn on Location */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isGpsLoading}
                className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all flex flex-col items-start justify-between min-h-[96px] text-left group active:scale-98"
              >
                {/* Toggle switch icon */}
                <div className="w-8 h-4 rounded-full bg-slate-300 p-0.5 flex items-center group-hover:bg-emerald-600 transition-colors">
                  <div className={`w-3 h-3 rounded-full bg-white shadow-xs transition-transform ${isGpsLoading ? 'translate-x-4 animate-pulse' : 'translate-x-0'}`} />
                </div>
                <div>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-800 leading-tight block">
                    {isGpsLoading ? 'Locating...' : 'Turn on'}
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-800 leading-tight block">
                    Location
                  </span>
                </div>
              </button>

              {/* Card 2: Add New Address */}
              <button
                type="button"
                onClick={() => setViewMode('MAP_PINPOINT')}
                className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all flex flex-col items-start justify-between min-h-[96px] text-left active:scale-98"
              >
                {/* Orange plus in rounded square */}
                <div className="w-6 h-6 rounded-md border-2 border-[#E25822] text-[#E25822] flex items-center justify-center font-black text-sm">
                  +
                </div>
                <div>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-800 leading-tight block">
                    Add New
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-800 leading-tight block">
                    Address
                  </span>
                </div>
              </button>

              {/* Card 3: Request Address */}
              <button
                type="button"
                onClick={handleRequestAddress}
                className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs hover:border-slate-300 transition-all flex flex-col items-start justify-between min-h-[96px] text-left active:scale-98"
              >
                {/* WhatsApp Green Icon */}
                <div className="w-6 h-6 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xs">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.072-2.127-.521-1.834-.759-2.999-2.616-3.09-2.738-.09-.122-.738-.983-.738-1.874 0-.891.467-1.328.633-1.508.167-.179.364-.224.486-.224.122 0 .243.002.35.007.113.005.263-.043.412.315.153.369.524 1.278.57 1.37.045.09.076.197.015.318-.061.121-.092.197-.183.303-.09.106-.19.237-.272.318-.09.09-.184.188-.079.369.106.182.47 1.774 1.731 2.451.342.184.629.24.846.307.218.067.416.058.572.035.174-.026.545-.223.621-.438z"/>
                  </svg>
                </div>
                <div>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-800 leading-tight block">
                    Request
                  </span>
                  <span className="text-[11px] sm:text-xs font-bold text-slate-800 leading-tight block">
                    Address
                  </span>
                </div>
              </button>
            </div>

            {/* 4. Body Area: Saved Addresses List OR Empty State (Screenshot 1) */}
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {savedAddresses.length > 0 ? (
                <div className="flex flex-col gap-2.5 pb-4">
                  <div className="text-[11px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">
                    Saved Addresses ({savedAddresses.length})
                  </div>
                  {savedAddresses.map((addr, idx) => (
                    <button
                      key={addr.id || idx}
                      type="button"
                      onClick={() => handleSelectSavedAddress(addr)}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:border-emerald-600/50 hover:bg-emerald-50/20 text-left transition-all flex items-start justify-between gap-3 group active:scale-[0.99]"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-emerald-100 text-slate-700 group-hover:text-emerald-800 flex items-center justify-center shrink-0 transition-colors">
                          <span className="material-symbols-outlined text-[18px]">
                            {addr.addressType === 'Home'
                              ? 'home'
                              : addr.addressType === 'Work'
                              ? 'work'
                              : 'location_on'}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-slate-900">
                              {addr.addressType}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold">
                              • {addr.pincode}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-1 mt-0.5">
                            {addr.flat ? `${addr.flat}, ` : ''}{addr.street}
                          </p>
                          {addr.landmark && (
                            <p className="text-[11px] text-slate-400 line-clamp-1">
                              Landmark: {addr.landmark}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-slate-400 text-[18px] group-hover:text-emerald-700 group-hover:translate-x-0.5 transition-all mt-1">
                        arrow_forward
                      </span>
                    </button>
                  ))}

                  {/* Add New Address Button */}
                  <button
                    type="button"
                    onClick={() => setViewMode('MAP_PINPOINT')}
                    className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors mt-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_location_alt</span>
                    <span>Add Another Address</span>
                  </button>
                </div>
              ) : (
                /* Empty State: Exact Visual Match with Reference 1 */
                <div className="flex flex-col items-center justify-center text-center py-12 px-6">
                  {/* Clean SVG Illustration: Map circle with magnifying glass & ? */}
                  <div className="relative w-36 h-36 flex items-center justify-center mb-6">
                    {/* Background Map Grid Circle */}
                    <svg className="w-32 h-32" viewBox="0 0 120 120" fill="none">
                      <circle cx="60" cy="60" r="58" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1.5" strokeDasharray="3 3"/>
                      {/* Stylized street grid paths */}
                      <path d="M20 50h80M20 75h80M50 20v80M75 20v80" stroke="#F1F5F9" strokeWidth="6" strokeLinecap="round"/>
                      <path d="M30 35l60 50M30 85l60-50" stroke="#F8FAFC" strokeWidth="4"/>
                    </svg>

                    {/* Magnifying Glass with Question Mark */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative w-16 h-16 rounded-full border-4 border-[#8B9DB0] bg-white/90 shadow-md flex items-center justify-center">
                        <span className="text-2xl font-black text-[#5C6F84]">?</span>
                        {/* Glass handle */}
                        <div className="absolute -bottom-2 -right-2 w-4 h-6 bg-[#8B9DB0] rounded-sm rotate-45 transform origin-top-left" />
                      </div>
                    </div>

                    {/* Curved Pointer Arrow at top-right */}
                    <div className="absolute top-2 right-2 text-[#8B9DB0]">
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 18a8 8 0 0 1 14-8l3 3"/>
                        <polyline points="21 7 21 13 15 13"/>
                      </svg>
                    </div>
                  </div>

                  {/* Empty state text */}
                  <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1">
                    You don't have any saved addresses
                  </p>
                  <p className="text-sm sm:text-base font-bold text-slate-800 leading-snug max-w-xs">
                    Add a new address and continue ordering
                  </p>

                  {/* Call to action button */}
                  <button
                    type="button"
                    onClick={() => setViewMode('MAP_PINPOINT')}
                    className="mt-6 px-6 py-2.5 rounded-xl bg-[#E25822] hover:bg-[#D04B18] text-white font-extrabold text-xs shadow-md active:scale-98 transition-all flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_location_alt</span>
                    <span>Set Location on Map</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: MAP PINPOINT & CONFIRM (Exact Match with Reference 2)   */}
        {/* ============================================================== */}
        {viewMode === 'MAP_PINPOINT' && (
          <div className="flex flex-col h-full bg-white relative">

            {/* 1. Floating Top Search Bar (Reference 2) */}
            <div className="absolute top-3 inset-x-3 z-20 flex items-center gap-2">
              <div className="flex-1 relative flex items-center bg-white rounded-2xl shadow-lg border border-slate-200/90 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('SELECT_LOCATION')}
                  className="w-10 h-10 flex items-center justify-center text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
                  aria-label="Back to location list"
                >
                  <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                </button>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search an area or address"
                  className="w-full pr-10 py-2.5 text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                <span className="material-symbols-outlined text-[20px] text-slate-400 absolute right-3 pointer-events-none">
                  search
                </span>
              </div>
            </div>

            {/* Live Autocomplete in Map View */}
            {searchResults.length > 0 && (
              <div className="absolute top-16 inset-x-3 z-30 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      selectLocation(
                        parseFloat(item.lat),
                        parseFloat(item.lon),
                        item.display_name,
                        '454774'
                      )
                    }
                    className="w-full p-2.5 text-left hover:bg-emerald-50/50 flex items-start gap-2 text-xs"
                  >
                    <span className="material-symbols-outlined text-emerald-700 text-[16px] shrink-0 mt-0.5">
                      location_on
                    </span>
                    <span className="text-slate-700 font-medium line-clamp-2 leading-tight">
                      {item.display_name}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* 2. Map Canvas (Takes top ~55% of viewport) */}
            <div className="relative w-full h-[320px] sm:h-[360px] bg-slate-100 overflow-hidden shrink-0">
              
              {/* Distance from Sagore Kitchen Badge */}
              <div className="absolute top-16 left-3 z-10 flex flex-wrap items-center gap-1.5 max-w-[calc(100%-24px)]">
                {isWithin5Km ? (
                  <div className="px-3 py-1 rounded-full bg-emerald-700/95 text-white text-[10px] font-bold shadow-md flex items-center gap-1 backdrop-blur-xs">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                    <span>~{distanceKm} km from Sagore Kitchen • Free Delivery</span>
                  </div>
                ) : isWithin15Km ? (
                  <div className="px-3 py-1 rounded-full bg-amber-600/95 text-white text-[10px] font-bold shadow-md flex items-center gap-1 backdrop-blur-xs">
                    <span className="material-symbols-outlined text-[13px]">info</span>
                    <span>~{distanceKm} km • Delivery Fee ₹35 (Beyond 5 km)</span>
                  </div>
                ) : (
                  <>
                    <div className="px-3 py-1 rounded-full bg-rose-600/95 text-white text-[10px] font-bold shadow-md flex items-center gap-1 backdrop-blur-xs animate-pulse">
                      <span className="material-symbols-outlined text-[13px]">cancel</span>
                      <span>~{distanceKm} km • Outside 15 km Zone</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectLocation(22.6288, 75.5684, 'Sagore Main Market, Pithampur, MP 454774', '454774')}
                      className="px-3 py-1 rounded-full bg-white text-emerald-800 border border-emerald-400 text-[10px] font-extrabold shadow-md flex items-center gap-1 active:scale-95 hover:bg-emerald-50 transition-all shrink-0"
                    >
                      <span className="material-symbols-outlined text-[13px] text-emerald-700">near_me</span>
                      <span>Sagore Set Karein</span>
                    </button>
                  </>
                )}
              </div>

              {/* Google Maps Embed Iframe */}
              <iframe
                title="Google Maps Delivery Location"
                src={mapEmbedUrl}
                className="w-full h-full border-0 pointer-events-auto"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />

              {/* Open in Google Maps Link (Bottom Left) */}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 left-3 z-10 px-3 py-1.5 rounded-full bg-white text-slate-800 hover:text-slate-900 text-[11px] font-bold shadow-lg border border-slate-200/90 flex items-center gap-1.5 transition-all active:scale-95 hover:bg-slate-50"
                title="Open in Google Maps App or Web"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/>
                  <circle cx="12" cy="9" r="2.5" fill="#FFFFFF"/>
                </svg>
                <span>Google Maps</span>
              </a>

              {/* Floating "Current location" Button (Screenshot 2) */}
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={isGpsLoading}
                className="absolute bottom-3 right-3 z-10 px-3.5 py-2 rounded-full bg-white text-slate-800 text-xs font-bold shadow-lg border border-slate-200/80 flex items-center gap-1.5 hover:bg-slate-50 active:scale-95 transition-all"
              >
                <span className={`material-symbols-outlined text-[17px] text-[#E25822] ${isGpsLoading ? 'animate-spin' : ''}`}>
                  {isGpsLoading ? 'sync' : 'my_location'}
                </span>
                <span>Current location</span>
              </button>
            </div>

            {/* 3. Bottom Sheet Address Details (Screenshot 2) */}
            <div className="flex-1 bg-white p-4 sm:p-5 flex flex-col justify-between overflow-y-auto no-scrollbar border-t border-slate-100">
              <div className="flex flex-col gap-2.5">
                
                {/* Area Title with Orange Pin */}
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[#E25822] text-[22px] shrink-0 mt-0.5">
                    location_on
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-sm sm:text-base text-slate-900 leading-tight truncate">
                      {areaTitle}
                    </h3>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">
                      {displayAddress}
                    </p>
                  </div>
                </div>

                {/* Out of Zone / Telecom Network IP Notice with 1-Tap Presets */}
                {!isWithin15Km && (
                  <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-2xl flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-amber-700 text-[18px] shrink-0 mt-0.5">
                        wrong_location
                      </span>
                      <div className="min-w-0">
                        <span className="font-extrabold text-xs text-amber-900 block">
                          Network Location Detected (~{Math.round(distanceKm)} km Dur)
                        </span>
                        <span className="text-[11px] text-amber-800 leading-tight block mt-0.5">
                          Internet Provider ne Bhopal/Dur ki location di hai. Janki Rasoi Sagore & Pithampur (15 km zone) me deliver karta hai:
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {SAGORE_PRESETS.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => selectLocation(p.lat, p.lng, `${p.name}, ${p.area}`, p.pincode)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-bold shadow-2xs active:scale-95 transition-all flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[13px]">location_on</span>
                          <span>{p.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Flat & Landmark Details */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      House / Flat / Floor
                    </label>
                    <input
                      type="text"
                      value={flat}
                      onChange={(e) => setFlat(e.target.value)}
                      placeholder="e.g. Flat 302 / House 12"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#E25822]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Landmark
                    </label>
                    <input
                      type="text"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="e.g. Near Temple"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:border-[#E25822]"
                    />
                  </div>
                </div>

                {/* Address Type Tag (Home, Work, Other) */}
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Tag:
                  </span>
                  {(['Home', 'Work', 'Other'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAddressType(type)}
                      className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                        addressType === type
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

              </div>

              {/* Big Primary Action Button: "Confirm & proceed" (Screenshot 2) */}
              <div className="pt-3 border-t border-slate-100 mt-2">
                <button
                  type="button"
                  onClick={handleConfirmLocation}
                  disabled={!isWithin15Km}
                  className={`w-full py-3.5 px-4 rounded-xl font-extrabold text-sm sm:text-base text-white shadow-md active:scale-98 transition-all flex items-center justify-center gap-2 ${
                    !isWithin15Km
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-[#E25822] hover:bg-[#D04B18]'
                  }`}
                >
                  <span>
                    {!isWithin15Km
                      ? `Delivery Not Available (>15 km: ~${distanceKm} km)`
                      : 'Confirm & proceed'}
                  </span>
                </button>

                {!isWithin15Km && (
                  <button
                    type="button"
                    onClick={() => selectLocation(22.6288, 75.5684, 'Sagore Main Market, Pithampur, MP 454774', '454774')}
                    className="w-full mt-2 py-2.5 px-4 rounded-xl border border-emerald-600 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-98"
                  >
                    <span className="material-symbols-outlined text-[16px] text-emerald-700">check_circle</span>
                    <span>Sagore Kitchen Delivery Zone Chunein (Free Delivery)</span>
                  </button>
                )}
              </div>

            </div>

          </div>
        )}

      </div>

      {/* ============================================================== */}
      {/* ANDROID SYSTEM-STYLE LOCATION PERMISSION DIALOG                 */}
      {/* (Exact 1:1 Match with User's Reference Screenshot)             */}
      {/* ============================================================== */}
      {showPermissionDialog && (
        <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#2B2D30] w-full max-w-[340px] sm:max-w-[360px] rounded-[32px] p-6 sm:p-7 shadow-2xl border border-white/10 flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            
            {/* Top Location Icon */}
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-[#9AA0A6] mb-3">
              <span className="material-symbols-outlined text-[32px]">location_on</span>
            </div>

            {/* Title */}
            <h3 className="text-lg sm:text-[19px] font-normal text-white leading-snug">
              Allow <span className="font-bold text-white">Janki Rasoi</span> to access this device’s location?
            </h3>

            {/* Notice Banner */}
            <div className="mt-4 w-full bg-[#3C4043]/80 border border-[#5F6368]/50 rounded-2xl p-3 flex items-center justify-between text-left hover:bg-[#3C4043] transition-colors">
              <div className="flex items-start gap-2.5 pr-2">
                <span className="material-symbols-outlined text-[19px] text-[#9AA0A6] shrink-0 mt-0.5">
                  security
                </span>
                <span className="text-[11px] text-[#BDC1C6] leading-tight font-normal">
                  This app stated that it may share location data with third parties
                </span>
              </div>
              <span className="material-symbols-outlined text-[18px] text-[#9AA0A6] shrink-0">
                chevron_right
              </span>
            </div>

            {/* Circular Options: Precise vs Approximate */}
            <div className="grid grid-cols-2 gap-4 w-full my-6">
              
              {/* Option 1: Precise */}
              <button
                type="button"
                onClick={() => setAccuracyMode('precise')}
                className="flex flex-col items-center group cursor-pointer focus:outline-none"
              >
                <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full relative transition-all duration-200 ${
                  accuracyMode === 'precise'
                    ? 'ring-3 ring-[#8AB4F8] shadow-lg shadow-blue-500/25 scale-102'
                    : 'opacity-55 hover:opacity-80'
                }`}>
                  <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
                    <rect width="100" height="100" rx="50" fill="#1C2430" />
                    <ellipse cx="50" cy="50" rx="46" ry="20" stroke="#37475E" strokeWidth="1.2" fill="none" />
                    <ellipse cx="50" cy="50" rx="46" ry="38" stroke="#37475E" strokeWidth="1.2" fill="none" />
                    <path d="M50 4v92M4 50h92" stroke="#37475E" strokeWidth="1.2" />
                    <path d="M18 18l64 64M18 82l64-64" stroke="#2C3B4E" strokeWidth="1.2" />
                    <circle cx="28" cy="30" r="2.5" fill="#FBBC04" />
                    <circle cx="75" cy="28" r="2" fill="#8AB4F8" />
                    <circle cx="22" cy="68" r="2" fill="#8AB4F8" />
                    <circle cx="50" cy="50" r="14" fill="#1A73E8" fillOpacity="0.25" />
                    <path d="M50 34c-5.5 0-10 4.5-10 10 0 7.5 10 18 10 18s10-10.5 10-18c0-5.5-4.5-10-10-10z" fill="#4285F4" />
                    <circle cx="50" cy="44" r="3.5" fill="#FFFFFF" />
                  </svg>
                </div>
                <span className={`mt-2.5 text-xs sm:text-sm transition-colors ${
                  accuracyMode === 'precise' ? 'text-white font-bold' : 'text-[#9AA0A6] font-medium'
                }`}>
                  Precise
                </span>
              </button>

              {/* Option 2: Approximate */}
              <button
                type="button"
                onClick={() => setAccuracyMode('approximate')}
                className="flex flex-col items-center group cursor-pointer focus:outline-none"
              >
                <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full relative transition-all duration-200 ${
                  accuracyMode === 'approximate'
                    ? 'ring-3 ring-[#8AB4F8] shadow-lg shadow-blue-500/25 scale-102'
                    : 'opacity-55 hover:opacity-80'
                }`}>
                  <svg className="w-full h-full" viewBox="0 0 100 100" fill="none">
                    <rect width="100" height="100" rx="50" fill="#1C2430" />
                    <path d="M10 35h80M5 52h90M15 70h70M25 15v70M50 10v80M75 15v70" stroke="#37475E" strokeWidth="1.2" />
                    <path d="M8 82c20-5 35-25 45-42s25-25 40-28" stroke="#F9AB00" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M20 12c12 18 22 28 35 48s20 28 35 32" stroke="#F9AB00" strokeWidth="2" strokeLinecap="round" />
                    <path d="M42 45l35-15" stroke="#F9AB00" strokeWidth="2" strokeLinecap="round" />
                    <rect x="22" y="62" width="7" height="6" rx="1.5" fill="#1A73E8" />
                    <rect x="68" y="72" width="7" height="6" rx="1.5" fill="#EA4335" />
                  </svg>
                </div>
                <span className={`mt-2.5 text-xs sm:text-sm transition-colors ${
                  accuracyMode === 'approximate' ? 'text-white font-bold' : 'text-[#9AA0A6] font-medium'
                }`}>
                  Approximate
                </span>
              </button>

            </div>

            {/* Action Buttons Stack */}
            <div className="flex flex-col gap-2.5 w-full">
              <button
                type="button"
                onClick={() => executeGeolocation(accuracyMode === 'precise', true)}
                className="w-full py-3.5 px-4 rounded-full bg-[#E2E5E9] hover:bg-[#D4D7DB] active:scale-98 transition-all text-[#1F1F1F] font-bold text-xs sm:text-sm text-center shadow-xs"
              >
                While using the app
              </button>
              
              <button
                type="button"
                onClick={() => executeGeolocation(accuracyMode === 'precise', false)}
                className="w-full py-3.5 px-4 rounded-full bg-[#E2E5E9] hover:bg-[#D4D7DB] active:scale-98 transition-all text-[#1F1F1F] font-bold text-xs sm:text-sm text-center shadow-xs"
              >
                Only this time
              </button>
              
              <button
                type="button"
                onClick={() => setShowPermissionDialog(false)}
                className="w-full py-3.5 px-4 rounded-full bg-[#E2E5E9] hover:bg-[#D4D7DB] active:scale-98 transition-all text-[#1F1F1F] font-bold text-xs sm:text-sm text-center shadow-xs"
              >
                Don't allow
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
