'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

interface PinpointMapProps {
  lat: number;
  lng: number;
  onPositionChange: (lat: number, lng: number) => void;
  height?: string;
}

const OLA_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_OLA_MAPS_API_KEY || 'NEKvcR5JMpiuzAisQ3cJXeXhtZpl7HIdVWo0kwfe';

const OLA_VECTOR_STYLE = `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json?api_key=${OLA_MAPS_API_KEY}`;

// Fallback raster style for MapLibre in case of network or API outage
const FALLBACK_STYLE: any = {
  version: 8,
  sources: {
    'carto-tiles': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© CARTO © OpenStreetMap',
    },
  },
  layers: [
    {
      id: 'carto-layer',
      type: 'raster',
      source: 'carto-tiles',
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

export default function PinpointLeafletMap({
  lat,
  lng,
  onPositionChange,
  height = '100%',
}: PinpointMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const isInternalMoveRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return;
    let isMounted = true;

    import('maplibre-gl').then((maplibregl) => {
      if (!isMounted || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      // Initialize MapLibre GL with official Ola Maps Vector Style
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OLA_VECTOR_STYLE,
        center: [lng, lat],
        zoom: 16,
        attributionControl: false,
      });

      mapRef.current = map;

      // Add compact zoom navigation controls
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

      // Add attribution
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: '© <a href="https://olamaps.io" target="_blank" rel="noreferrer">Ola Maps</a>',
        }),
        'bottom-left'
      );

      // Gracefully handle style error by switching to fallback raster style
      let hasFallenBack = false;
      map.on('error', (e) => {
        if (!hasFallenBack && (e.error?.message?.includes('style') || e.error?.message?.includes('404') || e.error?.message?.includes('401'))) {
          hasFallenBack = true;
          try {
            map.setStyle(FALLBACK_STYLE);
          } catch {}
        }
      });

      map.on('movestart', () => {
        setIsDragging(true);
      });

      map.on('moveend', () => {
        setIsDragging(false);
        const center = map.getCenter();
        isInternalMoveRef.current = true;
        onPositionChange(center.lat, center.lng);
        setTimeout(() => {
          isInternalMoveRef.current = false;
        }, 150);
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

  // Sync external coordinate updates (e.g., GPS button or search pick)
  useEffect(() => {
    if (!mapRef.current || isInternalMoveRef.current) return;
    const currentCenter = mapRef.current.getCenter();
    const threshold = 0.0001; // ~10m
    if (
      Math.abs(currentCenter.lat - lat) > threshold ||
      Math.abs(currentCenter.lng - lng) > threshold
    ) {
      mapRef.current.flyTo({
        center: [lng, lat],
        zoom: 16,
        essential: true,
        duration: 800,
      });
    }
  }, [lat, lng]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      {/* Map Canvas */}
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Center Fixed Pin Marker — Swiggy / Uber delivery style */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
        <div
          className={`relative flex flex-col items-center transition-transform duration-200 ${
            isDragging ? '-translate-y-6 scale-105' : '-translate-y-4 scale-100'
          }`}
        >
          {/* Shadow ripple */}
          <div
            className={`absolute -bottom-1 w-4 h-2 bg-black/30 rounded-full blur-[1px] transition-all duration-200 ${
              isDragging ? 'scale-75 opacity-40' : 'scale-100 opacity-80'
            }`}
          />
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
