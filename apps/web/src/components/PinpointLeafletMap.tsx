'use client';

import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

interface PinpointLeafletMapProps {
  lat: number;
  lng: number;
  onPositionChange: (lat: number, lng: number) => void;
  height?: string;
}

// Ola Maps raster tile URL template (uses our API key from env)
const OLA_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY || 'NEKvcR5JMpiuzAisQ3cJXeXhtZpl7HIdVWo0kwfe';

// Ola Maps tile URL — standard XYZ slippy-map tiles
// Falls back to CartoDB Voyager if the key is unavailable at runtime
const OLA_TILE_URL = `https://api.olamaps.io/tiles/v1/styles/default-light-standard/static/{z}/{x}/{y}.png?api_key=${OLA_MAPS_API_KEY}`;
const OLA_TILE_RETINA_URL = `https://api.olamaps.io/tiles/v1/styles/default-light-standard/static/{z}/{x}/{y}@2x.png?api_key=${OLA_MAPS_API_KEY}`;
const FALLBACK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

export default function PinpointLeafletMap({
  lat,
  lng,
  onPositionChange,
  height = '100%',
}: PinpointLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const isInternalMoveRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    let isMounted = true;

    import('leaflet').then((L) => {
      if (!isMounted || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 16,
        zoomControl: false,
        attributionControl: true,
      });
      mapRef.current = map;

      // Try Ola Maps tiles; fall back to CartoDB Voyager on tile-load error
      const olaTile = L.tileLayer(OLA_TILE_URL, {
        maxZoom: 20,
        attribution: '© <a href="https://olamaps.io">Ola Maps</a>',
      });

      let usingFallback = false;
      olaTile.on('tileerror', () => {
        if (!usingFallback && mapRef.current) {
          usingFallback = true;
          olaTile.remove();
          L.tileLayer(FALLBACK_TILE_URL, {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: '© <a href="https://carto.com">CARTO</a>',
          }).addTo(mapRef.current);
        }
      });

      olaTile.addTo(map);

      // Zoom Control at bottom-right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Fire position change whenever user finishes dragging / panning
      map.on('moveend', () => {
        const center = map.getCenter();
        isInternalMoveRef.current = true;
        onPositionChange(center.lat, center.lng);
        setTimeout(() => {
          isInternalMoveRef.current = false;
        }, 100);
      });
    });

    return () => {
      isMounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external lat/lng changes (search result or GPS button)
  useEffect(() => {
    if (!mapRef.current || isInternalMoveRef.current) return;
    const currentCenter = mapRef.current.getCenter();
    const threshold = 0.0001; // ~10 m
    if (
      Math.abs(currentCenter.lat - lat) > threshold ||
      Math.abs(currentCenter.lng - lng) > threshold
    ) {
      mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 0.8 });
    }
  }, [lat, lng]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      {/* Map Canvas */}
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Center Fixed Pin Marker — Uber / Swiggy style */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center -translate-y-4">
        <div className="relative flex flex-col items-center">
          {/* Shadow ripple */}
          <div className="absolute -bottom-1 w-4 h-2 bg-black/25 rounded-full blur-[1px] animate-pulse" />
          {/* Pin head */}
          <div className="relative w-9 h-9 rounded-full bg-[#E25822] border-2 border-white shadow-xl flex items-center justify-center text-white">
            <span className="material-symbols-outlined text-[20px]">near_me</span>
          </div>
          {/* Pin stem */}
          <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[#E25822] -mt-[1px]" />
        </div>
      </div>
    </div>
  );
}
