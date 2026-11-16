// Janki Rasoi — Zero-Latency Dynamic Delivery Timing & Distance Engine
// Computes real-time dynamic ETA using an urban transit physics model based on
// live GPS coordinates, status, and elapsed time with 0ms latency and 0 external API queries.

export const SAGORE_KITCHEN_LAT = 22.6288;
export const SAGORE_KITCHEN_LNG = 75.5684;

/**
 * High-performance Haversine formula (sub-microsecond execution time, 0 network calls).
 * Computes geodesic distance between two latitude/longitude points in kilometers.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    typeof lat1 !== 'number' ||
    typeof lon1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lon2 !== 'number' ||
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2)
  ) {
    return 2.5; // Default safe radius
  }

  const p = 0.017453292519943295; // Math.PI / 180
  const c = Math.cos;
  const a =
    0.5 -
    c((lat2 - lat1) * p) / 2 +
    (c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p))) / 2;
  const geodesic = 12742 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a)))); // 2 * R (6371 km)

  // Factor in actual road network curvature (typically 1.25x in local Indian city streets)
  const roadDistance = geodesic * 1.25;
  return Math.round(roadDistance * 10) / 10;
}

/**
 * Returns estimated distance from Sagore Kitchen given lat/lng or fallback pincode.
 */
export function getDistanceFromKitchen(
  destLat?: number | null,
  destLng?: number | null,
  pincode?: string | null
): number {
  if (
    typeof destLat === 'number' &&
    typeof destLng === 'number' &&
    !isNaN(destLat) &&
    !isNaN(destLng)
  ) {
    return calculateDistanceKm(SAGORE_KITCHEN_LAT, SAGORE_KITCHEN_LNG, destLat, destLng);
  }

  const cleanPin = pincode?.trim();
  if (cleanPin === '454774') return 2.0;
  if (cleanPin === '454775') return 6.5;
  if (cleanPin === '453331') return 11.0;
  return 2.5; // Default local Sagore core radius
}

export interface DynamicTimingResult {
  distanceKm: number;
  etaMins: number;
  etaHeadline: string; // e.g. "Arriving in ~8 mins (2.4 km)" or "Arriving any moment (~2-3 mins)"
  statusSubtitle: string; // e.g. "Out for delivery • 2.4 km"
  bubbleText: string;
  isNearby: boolean;
}

export interface DynamicTimingInput {
  status: string;
  createdAt?: string | Date | null;
  destCoordinates?: { latitude: number; longitude: number } | null;
  riderLocation?: { latitude: number; longitude: number } | null;
  kitchenCoordinates?: { latitude: number; longitude: number } | null;
  pincode?: string | null;
  riderName?: string | null;
}

/**
 * Dynamic Timing Engine
 *
 * Physics-based Transit Model:
 * - Geodesic street distance calculation (0ms, 0 external queries).
 * - Average two-wheeler transit speed: 20-25 km/h (~2.5 mins/km) + 2 min arrival/handoff buffer.
 * - Kitchen prep stages:
 *     - PLACED / ACCEPTED: ~8-12 mins prep remaining + transit.
 *     - PREPARING: ~5-9 mins prep remaining + transit.
 *     - READY_FOR_PICKUP: ~2-3 mins pickup buffer + transit.
 *     - OUT_FOR_DELIVERY: live rider-to-doorstep distance * transit speed.
 */
export function calculateDynamicDeliveryTiming(
  input: DynamicTimingInput
): DynamicTimingResult {
  const {
    status,
    createdAt,
    destCoordinates,
    riderLocation,
    kitchenCoordinates,
    pincode,
    riderName,
  } = input;

  const isDelivered = status === 'DELIVERED';
  const isOutForDelivery = status === 'OUT_FOR_DELIVERY';
  const isReady = status === 'READY_FOR_PICKUP';
  const isPreparing = status === 'PREPARING';
  const isAccepted = status === 'ACCEPTED';

  // 1. Compute Distance
  let distKm = 2.5;
  const destLat = destCoordinates?.latitude;
  const destLng = destCoordinates?.longitude;

  if (destLat && destLng) {
    if (isOutForDelivery && riderLocation?.latitude && riderLocation?.longitude) {
      // Dynamic live distance from rider GPS to customer doorstep
      distKm = calculateDistanceKm(
        riderLocation.latitude,
        riderLocation.longitude,
        destLat,
        destLng
      );
    } else {
      // Distance from kitchen to customer doorstep
      const kLat = kitchenCoordinates?.latitude ?? SAGORE_KITCHEN_LAT;
      const kLng = kitchenCoordinates?.longitude ?? SAGORE_KITCHEN_LNG;
      distKm = calculateDistanceKm(kLat, kLng, destLat, destLng);
    }
  } else {
    distKm = getDistanceFromKitchen(null, null, pincode);
  }

  // Constrain distance within reasonable bounds (0.3 km to 20 km)
  const cleanDistanceKm = Math.min(20, Math.max(0.3, distKm));

  // Rider travel time: ~2.5 mins per km + 2 mins arrival buffer
  const riderTravelMins = Math.round(cleanDistanceKm * 2.5 + 2);

  // 2. Elapsed time since order placement
  let elapsedMins = 0;
  if (createdAt) {
    const createdTs = new Date(createdAt).getTime();
    if (!isNaN(createdTs)) {
      elapsedMins = Math.max(0, Math.floor((Date.now() - createdTs) / 60000));
    }
  }

  // 3. Delivered State
  if (isDelivered) {
    return {
      distanceKm: cleanDistanceKm,
      etaMins: 0,
      etaHeadline: 'Delivered to your doorstep 🎉',
      statusSubtitle: 'Order delivered safely',
      bubbleText: 'Enjoy your hot homestyle pure veg meal!',
      isNearby: false,
    };
  }

  // 4. Out For Delivery State
  if (isOutForDelivery) {
    // Deduct transit progress as time elapses, maintaining minimum 2 mins
    const transitDeduction = Math.min(riderTravelMins - 2, Math.floor(elapsedMins * 0.3));
    const liveMins = Math.max(3, riderTravelMins - transitDeduction);
    const isNearby = cleanDistanceKm <= 1.0;

    let etaHeadline = `Arriving in ~${liveMins} mins`;
    if (cleanDistanceKm <= 0.8) {
      etaHeadline = 'Arriving any moment (~2-3 mins)';
    }

    const partnerName = riderName ? riderName.split(' ')[0] : 'Rider';
    const statusSubtitle = isNearby
      ? `${partnerName} is nearby (${cleanDistanceKm.toFixed(1)} km)`
      : `Out for delivery • ${cleanDistanceKm.toFixed(1)} km away`;

    const bubbleText = isNearby
      ? `${partnerName} is arriving right outside your location now!`
      : `I have picked up your order and am riding to your address (${cleanDistanceKm.toFixed(1)} km).`;

    return {
      distanceKm: cleanDistanceKm,
      etaMins: liveMins,
      etaHeadline,
      statusSubtitle,
      bubbleText,
      isNearby,
    };
  }

  // 5. Packed & Ready For Pickup State
  if (isReady) {
    const readyMins = Math.max(5, riderTravelMins + 2);
    return {
      distanceKm: cleanDistanceKm,
      etaMins: readyMins,
      etaHeadline: `Arriving in ~${readyMins} mins`,
      statusSubtitle: `Packed & ready • ${cleanDistanceKm.toFixed(1)} km away`,
      bubbleText: 'Insulated cask packed at kitchen, rider arriving for pickup',
      isNearby: false,
    };
  }

  // 6. Preparing in Kitchen State
  if (isPreparing) {
    const prepRemain = Math.max(4, 14 - elapsedMins);
    const totalMins = prepRemain + riderTravelMins;
    return {
      distanceKm: cleanDistanceKm,
      etaMins: totalMins,
      etaHeadline: `Arriving in ~${totalMins} mins`,
      statusSubtitle: `Fresh cooking on tawa • ${cleanDistanceKm.toFixed(1)} km`,
      bubbleText: 'Chef is cooking fresh rotis & packaging homestyle vegetables',
      isNearby: false,
    };
  }

  // 7. Confirmed / Placed State
  const queueRemain = Math.max(5, 18 - elapsedMins);
  const queueMins = queueRemain + riderTravelMins;
  const minRange = Math.max(10, queueMins - 3);
  const maxRange = queueMins + 3;

  return {
    distanceKm: cleanDistanceKm,
    etaMins: queueMins,
    etaHeadline: `Arriving in ~${minRange}–${maxRange} mins`,
    statusSubtitle: isAccepted
      ? `Chef confirmed • ${cleanDistanceKm.toFixed(1)} km`
      : `Order confirmed • ${cleanDistanceKm.toFixed(1)} km`,
    bubbleText: isAccepted
      ? 'Kitchen has accepted your order. Preparing fresh ingredients'
      : 'Order registered at Janki Rasoi kitchen station',
    isNearby: false,
  };
}
