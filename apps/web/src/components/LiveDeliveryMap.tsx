'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api';

export interface LiveDeliveryMapProps {
  driverLocation?: { latitude: number; longitude: number; heading?: number } | null;
  customerLocation: { latitude: number; longitude: number; address?: string; name?: string };
  kitchenLocation?: { latitude: number; longitude: number; name?: string };
  orderNumber?: string;
  status?: string;
  riderName?: string;
  riderVehicle?: string;
  height?: string;
  isRiderView?: boolean;
  onLocationUpdate?: (location: { latitude: number; longitude: number; heading?: number }) => void;
}

export default function LiveDeliveryMap({
  driverLocation,
  customerLocation,
  kitchenLocation = { latitude: 22.6288, longitude: 75.5684, name: 'Janki Rasoi Kitchen' },
  orderNumber,
  status = 'OUT_FOR_DELIVERY',
  riderName = 'Delivery Partner',
  riderVehicle,
  height = '360px',
  isRiderView = false,
  onLocationUpdate,
}: LiveDeliveryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const driverMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const kitchenMarkerRef = useRef<any>(null);
  const polylineRef = useRef<any>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Active current driver location (interpolated smoothly) — null until real location arrives
  const [currentDriverPos, setCurrentDriverPos] = useState<{ lat: number; lng: number; heading: number } | null>(
    driverLocation
      ? { lat: driverLocation.latitude, lng: driverLocation.longitude, heading: driverLocation.heading ?? 0 }
      : null
  );

  // Calculate distance in km
  const getDistanceKm = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
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

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let isMounted = true;

    // Dynamically import Leaflet to prevent SSR window errors
    import('leaflet').then((L) => {
      if (!isMounted || !mapContainerRef.current) return;

      // Clean existing instance
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Initial center: between driver and customer if known, else between kitchen and customer
      const anchorLat = currentDriverPos?.lat ?? kitchenLocation.latitude;
      const anchorLng = currentDriverPos?.lng ?? kitchenLocation.longitude;
      const midLat = (anchorLat + customerLocation.latitude) / 2;
      const midLng = (anchorLng + customerLocation.longitude) / 2;

      const map = L.map(mapContainerRef.current, {
        center: [midLat, midLng],
        zoom: 14,
        zoomControl: false,
        attributionControl: false,
      });
      mapInstanceRef.current = map;

      // Clean OpenStreetMap standard tiles (100% free, zero watermark, full local road accuracy)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        subdomains: ['a', 'b', 'c'],
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      // Add Zoom Control at bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // 1. Kitchen Custom Pin (Storefront)
      const kitchenIcon = L.divIcon({
        className: 'custom-kitchen-marker',
        html: `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="background-color: #1b4d2e; color: white; border: 2px solid white; border-radius: 9999px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.25);">
              <span class="material-symbols-outlined" style="font-size: 20px;">restaurant</span>
            </div>
            <div style="background: white; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 800; color: #1b4d2e; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-top: 2px; white-space: nowrap;">
              Kitchen
            </div>
          </div>
        `,
        iconSize: [34, 52],
        iconAnchor: [17, 34],
      });

      kitchenMarkerRef.current = L.marker([kitchenLocation.latitude, kitchenLocation.longitude], {
        icon: kitchenIcon,
      })
        .addTo(map)
        .bindPopup(`<strong>${kitchenLocation.name || 'Janki Rasoi Kitchen'}</strong><br/>Pickup Hub, Sagore`);

      // 2. Customer Destination Pin
      const customerIcon = L.divIcon({
        className: 'custom-customer-marker',
        html: `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="background-color: #d97706; color: white; border: 2px solid white; border-radius: 9999px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(217, 119, 6, 0.4);">
              <span class="material-symbols-outlined" style="font-size: 20px;">home_pin</span>
            </div>
            <div style="background: white; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 6px; font-size: 10px; font-weight: 800; color: #92400e; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-top: 2px; white-space: nowrap;">
              Drop-off
            </div>
          </div>
        `,
        iconSize: [34, 52],
        iconAnchor: [17, 34],
      });

      customerMarkerRef.current = L.marker([customerLocation.latitude, customerLocation.longitude], {
        icon: customerIcon,
      })
        .addTo(map)
        .bindPopup(`<strong>Drop-off: ${customerLocation.name || 'Customer'}</strong><br/>${customerLocation.address || 'Sagore, Pithampur'}`);

      // 3. Driver Live Marker — only add when real location is known
      if (driverLocation) {
        const driverIcon = L.divIcon({
          className: 'custom-driver-marker',
          html: `
            <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
              <!-- Radar Ripple Ring -->
              <div style="position: absolute; inset: -4px; border-radius: 9999px; background: rgba(56, 117, 74, 0.25); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <!-- Marker Body -->
              <div style="position: relative; background: #38754A; color: white; border: 2.5px solid white; border-radius: 9999px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(56, 117, 74, 0.45); transform: rotate(${driverLocation.heading ?? 0}deg); transition: transform 0.4s ease;">
                <span class="material-symbols-outlined" style="font-size: 22px;">two_wheeler</span>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        driverMarkerRef.current = L.marker([driverLocation.latitude, driverLocation.longitude], {
          icon: driverIcon,
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindPopup(`<strong>${riderName}</strong><br/>${riderVehicle || ''} • Out for Delivery`);

        // 4. Route Polyline connecting Kitchen -> Driver -> Destination
        const routePoints: [number, number][] = [
          [kitchenLocation.latitude, kitchenLocation.longitude],
          [driverLocation.latitude, driverLocation.longitude],
          [customerLocation.latitude, customerLocation.longitude],
        ];

        polylineRef.current = L.polyline(routePoints, {
          color: '#38754A',
          weight: 4.5,
          opacity: 0.85,
          dashArray: '8, 8',
          lineCap: 'round',
          lineJoin: 'round',
        }).addTo(map);

        // Asynchronously fetch accurate road directions from Ola Maps
        const startLat = driverLocation.latitude;
        const startLng = driverLocation.longitude;

        api
          .getDirections(
            startLat,
            startLng,
            customerLocation.latitude,
            customerLocation.longitude,
          )
          .then((directions) => {
            if (!isMounted || !mapInstanceRef.current || !polylineRef.current) return;
            if (directions && directions.coordinates && directions.coordinates.length > 1) {
              polylineRef.current.setLatLngs(directions.coordinates);
            }
          })
          .catch(() => {});
      }

      // Fit bounds: include driver if available, else just kitchen + customer
      const markerGroup = driverMarkerRef.current
        ? L.featureGroup([driverMarkerRef.current, customerMarkerRef.current, kitchenMarkerRef.current])
        : L.featureGroup([customerMarkerRef.current, kitchenMarkerRef.current]);
      map.fitBounds(markerGroup.getBounds().pad(0.2));
    });


    return () => {
      isMounted = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Driver Marker smoothly when driverLocation prop changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (!driverLocation) {
      setCurrentDriverPos(null);
      if (driverMarkerRef.current) {
        driverMarkerRef.current.remove();
        driverMarkerRef.current = null;
      }
      if (polylineRef.current) {
        polylineRef.current.remove();
        polylineRef.current = null;
      }
      return;
    }

    const targetLat = driverLocation.latitude;
    const targetLng = driverLocation.longitude;
    const heading = driverLocation.heading ?? 0;

    setCurrentDriverPos({ lat: targetLat, lng: targetLng, heading });

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng([targetLat, targetLng]);
    } else {
      import('leaflet').then((L) => {
        if (!mapInstanceRef.current || driverMarkerRef.current) return;
        const driverIcon = L.divIcon({
          className: 'custom-driver-marker',
          html: `
            <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
              <div style="position: absolute; inset: -4px; border-radius: 9999px; background: rgba(56, 117, 74, 0.25); animation: ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="position: relative; background: #38754A; color: white; border: 2.5px solid white; border-radius: 9999px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(56, 117, 74, 0.45); transform: rotate(${heading}deg); transition: transform 0.4s ease;">
                <span class="material-symbols-outlined" style="font-size: 22px;">two_wheeler</span>
              </div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        driverMarkerRef.current = L.marker([targetLat, targetLng], {
          icon: driverIcon,
          zIndexOffset: 1000,
        })
          .addTo(mapInstanceRef.current)
          .bindPopup(`<strong>${riderName}</strong>${riderVehicle ? `<br/>${riderVehicle}` : ''} • Out for Delivery`);
      });
    }

    import('leaflet').then((L) => {
      if (!mapInstanceRef.current) return;
      if (!polylineRef.current) {
        polylineRef.current = L.polyline(
          [
            [kitchenLocation.latitude, kitchenLocation.longitude],
            [targetLat, targetLng],
            [customerLocation.latitude, customerLocation.longitude],
          ],
          {
            color: '#38754A',
            weight: 4.5,
            opacity: 0.85,
            dashArray: '8, 8',
            lineCap: 'round',
            lineJoin: 'round',
          }
        ).addTo(mapInstanceRef.current);
      } else {
        polylineRef.current.setLatLngs([
          [kitchenLocation.latitude, kitchenLocation.longitude],
          [targetLat, targetLng],
          [customerLocation.latitude, customerLocation.longitude],
        ]);
      }

      api
        .getDirections(targetLat, targetLng, customerLocation.latitude, customerLocation.longitude)
        .then((directions) => {
          if (!mapInstanceRef.current || !polylineRef.current) return;
          if (directions && directions.coordinates && directions.coordinates.length > 1) {
            polylineRef.current.setLatLngs(directions.coordinates);
          }
        })
        .catch(() => {});
    });
  }, [driverLocation, customerLocation, kitchenLocation, riderName, riderVehicle]);

  // Recenter on Driver (only valid when driver position is known)
  const handleRecenterOnDriver = () => {
    if (!mapInstanceRef.current || !currentDriverPos) return;
    mapInstanceRef.current.panTo([currentDriverPos.lat, currentDriverPos.lng], {
      animate: true,
      duration: 0.8,
    });
  };

  // Fit Entire Route
  const handleFitRoute = () => {
    if (!mapInstanceRef.current || typeof window === 'undefined') return;
    import('leaflet').then((L) => {
      if (!mapInstanceRef.current) return;
      const points: [number, number][] = [
        [kitchenLocation.latitude, kitchenLocation.longitude],
        [customerLocation.latitude, customerLocation.longitude],
      ];
      if (currentDriverPos) {
        points.splice(1, 0, [currentDriverPos.lat, currentDriverPos.lng]);
      }
      const bounds = L.latLngBounds(points);
      mapInstanceRef.current.fitBounds(bounds.pad(0.25));
    });
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-[#EEE7DC] bg-[#FFF9F0] shadow-sm">
      {/* Map Canvas */}
      <div
        ref={mapContainerRef}
        style={{ height }}
        className="w-full relative z-0"
      />

      {/* Floating Status & ETA Card */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 pointer-events-auto">
        <div className="px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-md flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
          <div className="flex flex-col">
            <span className="text-[11px] font-black text-[#292D26] leading-none">
              {status === 'DELIVERED'
                ? 'Delivered to Customer'
                : currentDriverPos
                  ? `Driver ~${getDistanceKm(currentDriverPos.lat, currentDriverPos.lng, customerLocation.latitude, customerLocation.longitude)} km away`
                  : 'Awaiting rider assignment'}
            </span>
            <span className="text-[10px] text-[#77786F] font-semibold">
              {status === 'DELIVERED'
                ? 'Order Complete'
                : currentDriverPos
                  ? `ETA ~${Math.max(2, Math.round(getDistanceKm(currentDriverPos.lat, currentDriverPos.lng, customerLocation.latitude, customerLocation.longitude) * 3.5))} mins • On the way`
                  : 'Rider will be assigned soon'}
            </span>
          </div>
        </div>

        {orderNumber && (
          <span className="self-start px-2 py-0.5 rounded-md bg-[#EAF4ED] text-[#38754A] font-bold text-[10px] border border-[#38754A]/20 shadow-2xs">
            Order #{orderNumber}
          </span>
        )}
      </div>

      {/* Floating Action Controls on Map */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 pointer-events-auto">
        {currentDriverPos && (
          <button
            type="button"
            onClick={handleRecenterOnDriver}
            title="Center on Driver"
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#292D26] text-[11px] font-bold border border-slate-200 shadow-md flex items-center gap-1 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-[15px] text-[#38754A]">my_location</span>
            <span>Driver</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleFitRoute}
          title="Fit Route"
          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-[#292D26] text-[11px] font-bold border border-slate-200 shadow-md flex items-center gap-1 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[15px] text-amber-700">route</span>
          <span>Full Route</span>
        </button>
      </div>

      {/* External Google Maps Navigation link for real rider on the road */}
      {isRiderView && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${customerLocation.latitude},${customerLocation.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-3 right-3 z-10 px-3 py-1.5 rounded-xl bg-[#38754A] hover:bg-[#285C38] text-white text-[11px] font-bold shadow-md flex items-center gap-1 pointer-events-auto transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]">navigation</span>
          <span>Turn-by-Turn</span>
        </a>
      )}
    </div>
  );
}
