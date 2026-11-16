import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const SAGORE_KITCHEN_LAT = 22.6288;
export const SAGORE_KITCHEN_LNG = 75.5684;

export interface PlacePrediction {
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
  coordinates: [number, number][]; // [lat, lng] array for Leaflet polyline
}

const SAGORE_PRESETS_DATA: PlacePrediction[] = [
  {
    placeId: 'preset-sagore-main',
    description: 'Sagore Main Market, Pithampur, Dhar, Madhya Pradesh 454774',
    mainText: 'Sagore Main Market',
    secondaryText: 'Pithampur, Dhar, MP 454774',
    lat: 22.6288,
    lng: 75.5684,
    pincode: '454774',
    city: 'Sagore, Pithampur',
  },
  {
    placeId: 'preset-sagore-bus-stand',
    description: 'Sagore Bus Stand & Kuti, Dhar-Indore Road, MP 454774',
    mainText: 'Sagore Bus Stand',
    secondaryText: 'Dhar-Indore Road, Sagore 454774',
    lat: 22.6312,
    lng: 75.5715,
    pincode: '454774',
    city: 'Sagore, Pithampur',
  },
  {
    placeId: 'preset-chatrachhaya',
    description: 'Chatrachhaya Colony, Sagore, Dhar, MP 454774',
    mainText: 'Chatrachhaya Colony',
    secondaryText: 'Near Hanuman Temple, Sagore 454774',
    lat: 22.6254,
    lng: 75.5642,
    pincode: '454774',
    city: 'Sagore, Pithampur',
  },
  {
    placeId: 'preset-pithampur-sec-1',
    description: 'Sector 1 Industrial Area, Pithampur, Dhar, MP 454774',
    mainText: 'Pithampur Sector 1',
    secondaryText: 'Near Cipla / Eicher Square, Pithampur',
    lat: 22.6085,
    lng: 75.5921,
    pincode: '454774',
    city: 'Pithampur, Dhar',
  },
  {
    placeId: 'preset-pithampur-sec-2',
    description: 'Sector 2 Industrial Area, Pithampur, Dhar, MP 454775',
    mainText: 'Pithampur Sector 2',
    secondaryText: 'Industrial Area, Pithampur 454775',
    lat: 22.615,
    lng: 75.608,
    pincode: '454775',
    city: 'Pithampur, Dhar',
  },
  {
    placeId: 'preset-pithampur-sec-3',
    description: 'Sector 3 Smart Industrial Zone, Pithampur, Dhar, MP 454774',
    mainText: 'Pithampur Sector 3',
    secondaryText: 'Near NATRAX Hub, Pithampur 454774',
    lat: 22.5891,
    lng: 75.5412,
    pincode: '454774',
    city: 'Pithampur, Dhar',
  },
  {
    placeId: 'preset-kheda-outer',
    description: 'Kheda Industrial Outer, Pithampur, Dhar, MP 454775',
    mainText: 'Kheda Industrial Outer',
    secondaryText: 'Pithampur Outer, Dhar 454775',
    lat: 22.605,
    lng: 75.62,
    pincode: '454775',
    city: 'Pithampur Outer, Dhar',
  },
  {
    placeId: 'preset-mhow-cantt',
    description: 'Mhow Cantonment, Dr. Ambedkar Nagar, Indore, MP 453331',
    mainText: 'Mhow (Dr. Ambedkar Nagar)',
    secondaryText: 'Indore, Madhya Pradesh 453331',
    lat: 22.5534,
    lng: 75.7634,
    pincode: '453331',
    city: 'Mhow, Indore',
  },
  {
    placeId: 'preset-rau-bypass',
    description: 'Rau Circle & Pithampur Link, Indore, MP 453001',
    mainText: 'Rau Circle',
    secondaryText: 'Pithampur Link Road, Indore 453001',
    lat: 22.628,
    lng: 75.805,
    pincode: '453001',
    city: 'Rau, Indore',
  },
];

/**
 * Decodes an encoded polyline string (Google / Ola format) into [latitude, longitude] pairs.
 */
function decodePolyline(str: string, precision = 5): [number, number][] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];
  let shift = 0;
  let result = 0;
  let byte: number | null = null;
  const factor = Math.pow(10, precision);

  while (index < str.length) {
    byte = null;
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const latChange = (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const lngChange = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += latChange;
    lng += lngChange;
    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

@Injectable()
export class OlaMapsService {
  private readonly logger = new Logger(OlaMapsService.name);
  private readonly apiKey: string | null;
  private readonly autocompleteCache = new Map<string, { data: PlacePrediction[]; expiresAt: number }>();
  private readonly reverseGeocodeCache = new Map<string, { data: ReverseGeocodeResult; expiresAt: number }>();
  private readonly directionsCache = new Map<string, { data: DirectionsResult; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {
    this.apiKey =
      this.config.get<string>('OLA_MAPS_API_KEY') ||
      this.config.get<string>('OLAMAPS_API_KEY') ||
      process.env.OLA_MAPS_API_KEY ||
      process.env.OLAMAPS_API_KEY ||
      null;
    if (this.apiKey) {
      this.logger.log('Ola Maps service initialized with configured API key');
    } else {
      this.logger.warn('Ola Maps API key not found in environment; operating in resilient fallback mode');
    }
  }

  /**
   * Places Autocomplete via Ola Maps with Sagore location biasing and local preset fallback.
   */
  async autocomplete(
    query: string,
    biasLat: number = SAGORE_KITCHEN_LAT,
    biasLng: number = SAGORE_KITCHEN_LNG,
    radiusMeters = 15000,
  ): Promise<PlacePrediction[]> {
    const cleanQuery = query.trim();
    if (!cleanQuery || cleanQuery.length < 2) {
      return [];
    }

    const cacheKey = `auto_${cleanQuery.toLowerCase()}_${biasLat.toFixed(3)}_${biasLng.toFixed(3)}`;
    const cached = this.autocompleteCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // 1. Try Ola Maps Places Autocomplete if API key is configured
    if (this.apiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const url = new URL('https://api.olamaps.io/places/v1/autocomplete');
        url.searchParams.set('input', cleanQuery);
        url.searchParams.set('api_key', this.apiKey);
        url.searchParams.set('location', `${biasLat},${biasLng}`);
        url.searchParams.set('radius', radiusMeters.toString());

        const res = await fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
          },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          let predictions = (json.predictions || []).map((p: any) => {
            const loc = p.geometry?.location;
            const main = p.structured_formatting?.main_text || p.name || p.description;
            const secondary = p.structured_formatting?.secondary_text || '';
            const pinMatch = (p.description || '').match(/\b[1-9][0-9]{5}\b/);
            const latVal = loc ? Number(loc.lat) : null;
            const lngVal = loc ? Number(loc.lng) : null;

            // Distance in meters from Ola Maps or calculated Haversine
            let distMeters = typeof p.distance_meters === 'number' ? p.distance_meters : null;
            if (distMeters === null && latVal !== null && lngVal !== null) {
              const dLat = ((latVal - biasLat) * Math.PI) / 180;
              const dLon = ((lngVal - biasLng) * Math.PI) / 180;
              const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos((biasLat * Math.PI) / 180) * Math.cos((latVal * Math.PI) / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
              const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
              distMeters = Math.round(6371000 * c);
            }

            return {
              placeId: p.place_id || `ola-${Math.random()}`,
              description: p.description || main,
              mainText: main,
              secondaryText: secondary,
              lat: latVal,
              lng: lngVal,
              distanceMeters: distMeters,
              pincode: pinMatch ? pinMatch[0] : null,
              city: secondary.includes('Indore') ? 'Indore' : secondary.includes('Dhar') ? 'Dhar' : 'Sagore, Pithampur',
            } as PlacePrediction & { distanceMeters?: number | null };
          });

          // Sort predictions by distance ascending so local results are always top
          predictions.sort((a: any, b: any) => {
            const dA = a.distanceMeters ?? 9999999;
            const dB = b.distanceMeters ?? 9999999;
            return dA - dB;
          });

          // Prepend any matching local Sagore/Pithampur presets
          const queryLower = cleanQuery.toLowerCase();
          const localPresetMatches = SAGORE_PRESETS_DATA.filter(
            (p) =>
              p.mainText.toLowerCase().includes(queryLower) ||
              p.secondaryText.toLowerCase().includes(queryLower) ||
              p.description.toLowerCase().includes(queryLower),
          );

          // Merge presets and deduplicate
          const combined = [...localPresetMatches, ...predictions];
          const seen = new Set<string>();
          const deduped: PlacePrediction[] = [];
          for (const item of combined) {
            const key = `${item.mainText.toLowerCase()}_${item.lat?.toFixed(3)}_${item.lng?.toFixed(3)}`;
            if (!seen.has(key)) {
              seen.add(key);
              deduped.push(item);
            }
          }

          if (deduped.length > 0) {
            // Cache for 1 hour
            this.autocompleteCache.set(cacheKey, {
              data: deduped,
              expiresAt: Date.now() + 3600_000,
            });
            return deduped;
          }
        } else {
          const errText = await res.text().catch(() => '');
          this.logger.warn(`Ola Maps Autocomplete HTTP ${res.status}: ${errText.substring(0, 100)}`);
        }
      } catch (err: any) {
        this.logger.warn(`Ola Maps Autocomplete failed, falling back: ${err.message}`);
      }
    }

    // 2. Fallback: Filter Local Sagore / Pithampur Presets
    const queryLower = cleanQuery.toLowerCase();
    const localMatches = SAGORE_PRESETS_DATA.filter(
      (p) =>
        p.mainText.toLowerCase().includes(queryLower) ||
        p.secondaryText.toLowerCase().includes(queryLower) ||
        p.description.toLowerCase().includes(queryLower) ||
        (p.pincode && p.pincode.includes(queryLower)),
    );

    if (localMatches.length > 0) {
      return localMatches;
    }

    // 3. Last-resort OSM Nominatim search with 2s timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const q = encodeURIComponent(`${cleanQuery}, Madhya Pradesh`);
      const osmRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=5`, {
        signal: controller.signal,
        headers: { 'Accept-Language': 'en', 'User-Agent': 'JankiRasoiFoodDelivery/1.0' },
      });
      clearTimeout(timeoutId);

      if (osmRes.ok) {
        const osmData = await osmRes.json();
        const osmResults: PlacePrediction[] = (osmData || []).map((item: any, idx: number) => {
          const parts = (item.display_name || '').split(',');
          const mainText = parts[0]?.trim() || cleanQuery;
          const secondaryText = parts.slice(1, 4).join(',').trim();
          const pinMatch = (item.display_name || '').match(/\b[1-9][0-9]{5}\b/);
          return {
            placeId: `osm-${item.place_id || idx}`,
            description: item.display_name,
            mainText,
            secondaryText,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            pincode: pinMatch ? pinMatch[0] : null,
            city: 'Madhya Pradesh',
          };
        });

        if (osmResults.length > 0) {
          this.autocompleteCache.set(cacheKey, {
            data: osmResults,
            expiresAt: Date.now() + 1800_000,
          });
          return osmResults;
        }
      }
    } catch {
      // Return empty if external fails
    }

    return SAGORE_PRESETS_DATA.slice(0, 3);
  }

  /**
   * Reverse Geocode via Ola Maps with caching and resilient fallback.
   */
  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult> {
    const latRounded = Number(lat.toFixed(4));
    const lngRounded = Number(lng.toFixed(4));
    const cacheKey = `rev_${latRounded}_${lngRounded}`;

    const cached = this.reverseGeocodeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // 1. Try Ola Maps Reverse Geocoding
    if (this.apiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${latRounded},${lngRounded}&api_key=${this.apiKey}`;
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          const first = json.results?.[0];
          if (first) {
            const comps = first.address_components || [];
            let pincode = '';
            let suburb = '';
            let district = 'Dhar';
            let state = 'Madhya Pradesh';

            for (const c of comps) {
              if (c.types?.includes('postal_code')) pincode = c.long_name;
              if (c.types?.includes('sublocality') || c.types?.includes('neighbourhood')) suburb = c.long_name;
              if (c.types?.includes('administrative_area_level_2')) district = c.long_name;
              if (c.types?.includes('administrative_area_level_1')) state = c.long_name;
            }

            const result: ReverseGeocodeResult = {
              formattedAddress: first.formatted_address || `${suburb || 'Sagore'}, ${district}`,
              name: first.name || suburb || 'Delivery Location',
              suburb: suburb || 'Sagore Central',
              city: `${district}, ${state}`,
              district,
              state,
              pincode: pincode || '454774',
              lat: latRounded,
              lng: lngRounded,
            };

            // Cache for 24 hours
            this.reverseGeocodeCache.set(cacheKey, {
              data: result,
              expiresAt: Date.now() + 86400_000,
            });
            return result;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Ola Maps Reverse Geocode failed, using fallback: ${err.message}`);
      }
    }

    // 2. Resilient Fallback via Nominatim OSM
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latRounded}&lon=${lngRounded}`,
        {
          signal: controller.signal,
          headers: { 'Accept-Language': 'en', 'User-Agent': 'JankiRasoiFoodDelivery/1.0' },
        },
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const pin = addr.postcode || '454774';
        const suburb = addr.suburb || addr.neighbourhood || addr.road || 'Sagore Main Area';
        const city = addr.city || addr.town || addr.village || 'Sagore, Pithampur';
        const district = addr.state_district || 'Dhar';
        const state = addr.state || 'Madhya Pradesh';

        const fallbackResult: ReverseGeocodeResult = {
          formattedAddress: data.display_name || `${suburb}, ${city} ${pin}`,
          name: suburb,
          suburb,
          city,
          district,
          state,
          pincode: pin,
          lat: latRounded,
          lng: lngRounded,
        };

        this.reverseGeocodeCache.set(cacheKey, {
          data: fallbackResult,
          expiresAt: Date.now() + 86400_000,
        });
        return fallbackResult;
      }
    } catch {
      // Ignore network error and fall to default
    }

    // 3. Default Safe Fallback
    return {
      formattedAddress: `Sagore Main Market, Pithampur, Dhar, Madhya Pradesh 454774, India`,
      name: 'Sagore Main Market',
      suburb: 'Sagore Central',
      city: 'Sagore, Pithampur',
      district: 'Dhar',
      state: 'Madhya Pradesh',
      pincode: '454774',
      lat: latRounded,
      lng: lngRounded,
    };
  }


  /**
   * Routing Directions via Ola Maps Directions API with Polyline points.
   */
  async getDirections(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<DirectionsResult> {
    const cacheKey = `dir_${originLat.toFixed(3)}_${originLng.toFixed(3)}_${destLat.toFixed(3)}_${destLng.toFixed(3)}`;
    const cached = this.directionsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    if (this.apiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const url = `https://api.olamaps.io/routing/v1/directions?origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=driving&api_key=${this.apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'X-Request-Id': `jr-route-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          const route = json.routes?.[0];
          if (route) {
            const leg = route.legs?.[0];
            const distanceMeters =
              typeof leg?.distance === 'number'
                ? leg.distance
                : leg?.distance?.value || route.distance || 0;
            const durationSeconds =
              typeof leg?.duration === 'number'
                ? leg.duration
                : leg?.duration?.value || route.duration || 0;

            let coordinates: [number, number][] = [];
            if (route.overview_polyline) {
              coordinates = decodePolyline(route.overview_polyline);
            } else if (leg?.steps?.length > 0) {
              coordinates = leg.steps
                .flatMap((s: any) => s.geometry?.coordinates || [])
                .map(([lng, lat]: [number, number]) => [lat, lng]);
            }

            const result: DirectionsResult = {
              distanceMeters,
              durationSeconds,
              distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
              durationMinutes: Math.round(durationSeconds / 60),
              coordinates:
                coordinates.length > 0
                  ? coordinates
                  : [
                      [originLat, originLng],
                      [destLat, destLng],
                    ],
            };

            this.directionsCache.set(cacheKey, {
              data: result,
              expiresAt: Date.now() + 3600_000,
            });
            return result;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Ola Maps Directions failed, using straight-line fallback: ${err.message}`);
      }
    }

    // Straight-line fallback distance calculation
    const R = 6371;
    const dLat = ((destLat - originLat) * Math.PI) / 180;
    const dLon = ((destLng - originLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((originLat * Math.PI) / 180) *
        Math.cos((destLat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = Math.round(R * c * 10) / 10;
    const roadKm = Math.round(distKm * 1.25 * 10) / 10; // road network multiplier

    return {
      distanceMeters: Math.round(roadKm * 1000),
      durationSeconds: Math.round(roadKm * 3 * 60),
      distanceKm: roadKm,
      durationMinutes: Math.max(5, Math.round(roadKm * 3)),
      coordinates: [
        [originLat, originLng],
        [destLat, destLng],
      ],
    };
  }

  /**
   * Snaps GPS telemetry coordinates to nearest road segments via Ola Maps Roads API.
   * If API key is absent or request fails, returns original coordinates.
   */
  async snapToRoad(points: [number, number][]): Promise<[number, number][]> {
    if (!points || points.length === 0) return [];
    if (points.length === 1) return points;

    if (this.apiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const pointsParam = points.map(([lat, lng]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join('|');
        const url = `https://api.olamaps.io/routing/v1/snapToRoad?points=${encodeURIComponent(pointsParam)}&enhancePath=true&api_key=${this.apiKey}`;
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'X-Request-Id': `jr-snap-${Date.now()}`,
          },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          const snapped = json.snappedPoints || json.data || [];
          if (Array.isArray(snapped) && snapped.length > 0) {
            return snapped.map((sp: any) => {
              if (Array.isArray(sp)) return [Number(sp[0]), Number(sp[1])];
              const loc = sp.location || sp;
              return [Number(loc.latitude || loc.lat), Number(loc.longitude || loc.lng)];
            });
          }
        }
      } catch (err: any) {
        this.logger.warn(`Ola Maps SnapToRoad failed, using raw points: ${err.message}`);
      }
    }

    return points;
  }

  /**
   * Optimizes multi-stop delivery sequence using Ola Maps Route Optimizer or greedy TSP fallback.
   */
  async optimizeRoute(
    origin: { lat: number; lng: number },
    stops: { id: string; lat: number; lng: number; title?: string }[],
  ): Promise<{
    orderedStops: { id: string; lat: number; lng: number; title?: string }[];
    totalDistanceKm: number;
    estimatedDurationMinutes: number;
  }> {
    if (!stops || stops.length <= 1) {
      return {
        orderedStops: stops || [],
        totalDistanceKm: 0,
        estimatedDurationMinutes: 0,
      };
    }

    // Try Ola Maps Route Optimizer if key is available
    if (this.apiKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const allLocs = [origin, ...stops];
        const locationsStr = allLocs.map((s) => `${s.lat},${s.lng}`).join('|');
        const url = `https://api.olamaps.io/routing/v1/routeOptimizer?locations=${encodeURIComponent(locationsStr)}&source=first&round_trip=false&mode=driving&api_key=${this.apiKey}`;

        const res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'X-Request-Id': `jr-opt-${Date.now()}`,
          },
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          const route = json.routes?.[0];
          const waypointOrder = route?.waypoint_order || json.waypoint_order;

          if (Array.isArray(waypointOrder)) {
            // Index 0 is origin; stop indices > 0 map to stops[idx - 1]
            const reorderedStops = waypointOrder
              .filter((idx: number) => idx > 0 && idx <= stops.length)
              .map((idx: number) => stops[idx - 1]);

            if (reorderedStops.length === stops.length) {
              const totalDistMeters = route?.legs?.reduce(
                (acc: number, l: any) => acc + (typeof l.distance === 'number' ? l.distance : l?.distance?.value || 0),
                0,
              ) || 0;
              const totalSecs = route?.legs?.reduce(
                (acc: number, l: any) => acc + (typeof l.duration === 'number' ? l.duration : l?.duration?.value || 0),
                0,
              ) || 0;

              return {
                orderedStops: reorderedStops,
                totalDistanceKm: Math.round((totalDistMeters / 1000) * 10) / 10,
                estimatedDurationMinutes: Math.round(totalSecs / 60),
              };
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Ola Maps Route Optimizer failed, using greedy TSP fallback: ${err.message}`);
      }
    }

    // Resilient Nearest-Neighbor (greedy TSP) fallback
    const unvisited = [...stops];
    const orderedStops: typeof stops = [];
    let currentLat = origin.lat;
    let currentLng = origin.lng;
    let totalDistKm = 0;

    const calcDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const d = calcDist(currentLat, currentLng, unvisited[i].lat, unvisited[i].lng);
        if (d < minDistance) {
          minDistance = d;
          nearestIdx = i;
        }
      }

      const nextStop = unvisited.splice(nearestIdx, 1)[0];
      totalDistKm += minDistance;
      currentLat = nextStop.lat;
      currentLng = nextStop.lng;
      orderedStops.push(nextStop);
    }

    const roadDistanceKm = Math.round(totalDistKm * 1.25 * 10) / 10;
    const estMinutes = Math.max(5, Math.round(roadDistanceKm * 3.2 + orderedStops.length * 3));

    return {
      orderedStops,
      totalDistanceKm: roadDistanceKm,
      estimatedDurationMinutes: estMinutes,
    };
  }
}

