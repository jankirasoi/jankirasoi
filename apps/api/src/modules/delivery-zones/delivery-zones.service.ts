import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const SAGORE_KITCHEN_LAT = 22.6288;
export const SAGORE_KITCHEN_LNG = 75.5684;
export const SAGORE_DEFAULT_PINCODE = '454774';
export const FREE_DELIVERY_RADIUS_KM = 5.0;
export const MAX_DELIVERY_RADIUS_KM = 15.0;

export function calculateHaversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export interface SagoreZoneInfo {
  pincode: string;
  zoneName: string;
  city: string;
  district: string;
  state: string;
  approxDistanceKm: number;
  lat: number;
  lng: number;
}

export const SAGORE_LOCAL_PINCODES: Record<string, SagoreZoneInfo> = {
  '454774': {
    pincode: '454774',
    zoneName: 'Sagore Central & Pithampur Core',
    city: 'Sagore, Pithampur',
    district: 'Dhar',
    state: 'Madhya Pradesh',
    approxDistanceKm: 2.0,
    lat: 22.6288,
    lng: 75.5684,
  },
  '454775': {
    pincode: '454775',
    zoneName: 'Pithampur Industrial Outer / Kheda',
    city: 'Pithampur Outer, Dhar',
    district: 'Dhar',
    state: 'Madhya Pradesh',
    approxDistanceKm: 7.5,
    lat: 22.6050,
    lng: 75.6200,
  },
  '453331': {
    pincode: '453331',
    zoneName: 'Mhow (Dr. Ambedkar Nagar)',
    city: 'Mhow, Indore',
    district: 'Indore',
    state: 'Madhya Pradesh',
    approxDistanceKm: 12.0,
    lat: 22.5534,
    lng: 75.7634,
  },
  '453332': {
    pincode: '453332',
    zoneName: 'Mhow Cantonment',
    city: 'Mhow Cantt, Indore',
    district: 'Indore',
    state: 'Madhya Pradesh',
    approxDistanceKm: 13.5,
    lat: 22.5600,
    lng: 75.7800,
  },
  '453001': {
    pincode: '453001',
    zoneName: 'Rau / Pithampur Link',
    city: 'Rau, Indore',
    district: 'Indore',
    state: 'Madhya Pradesh',
    approxDistanceKm: 14.2,
    lat: 22.6280,
    lng: 75.8050,
  },
};

const PIN_PREFIX_MAP: Record<string, { city: string; district: string; state: string }> = {
  '11': { city: 'New Delhi, Delhi', district: 'South/Central Delhi', state: 'Delhi' },
  '12': { city: 'Gurugram / Faridabad', district: 'Gurugram', state: 'Haryana' },
  '13': { city: 'Ambala / Panipat', district: 'Ambala', state: 'Haryana' },
  '14': { city: 'Amritsar / Jalandhar', district: 'Amritsar', state: 'Punjab' },
  '16': { city: 'Chandigarh', district: 'Chandigarh', state: 'Chandigarh' },
  '20': { city: 'Noida / Ghaziabad', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh' },
  '22': { city: 'Lucknow', district: 'Lucknow', state: 'Uttar Pradesh' },
  '24': { city: 'Dehradun', district: 'Dehradun', state: 'Uttarakhand' },
  '30': { city: 'Jaipur', district: 'Jaipur', state: 'Rajasthan' },
  '38': { city: 'Ahmedabad', district: 'Ahmedabad', state: 'Gujarat' },
  '39': { city: 'Surat', district: 'Surat', state: 'Gujarat' },
  '40': { city: 'Mumbai', district: 'Mumbai', state: 'Maharashtra' },
  '41': { city: 'Pune', district: 'Pune', state: 'Maharashtra' },
  '45': { city: 'Indore', district: 'Indore', state: 'Madhya Pradesh' },
  '46': { city: 'Bhopal', district: 'Bhopal', state: 'Madhya Pradesh' },
  '50': { city: 'Hyderabad', district: 'Hyderabad', state: 'Telangana' },
  '56': { city: 'Bengaluru', district: 'Bengaluru', state: 'Karnataka' },
  '60': { city: 'Chennai', district: 'Chennai', state: 'Tamil Nadu' },
  '68': { city: 'Kochi', district: 'Ernakulam', state: 'Kerala' },
  '70': { city: 'Kolkata', district: 'Kolkata', state: 'West Bengal' },
  '80': { city: 'Patna', district: 'Patna', state: 'Bihar' },
};

@Injectable()
export class DeliveryZonesService {
  private readonly logger = new Logger(DeliveryZonesService.name);
  private readonly locationCache = new Map<string, { city: string; district: string; state: string }>();

  constructor(private readonly prisma: PrismaService) {}

  private async resolveLocation(pincode: string): Promise<{ city: string; district: string; state: string }> {
    const cached = this.locationCache.get(pincode);
    if (cached) return cached;

    if (pincode === '454774') {
      const sagoreLoc = { city: 'Sagore, Pithampur', district: 'Dhar', state: 'Madhya Pradesh' };
      this.locationCache.set(pincode, sagoreLoc);
      return sagoreLoc;
    }

    if (SAGORE_LOCAL_PINCODES[pincode]) {
      const loc = {
        city: SAGORE_LOCAL_PINCODES[pincode].city,
        district: SAGORE_LOCAL_PINCODES[pincode].district,
        state: SAGORE_LOCAL_PINCODES[pincode].state,
      };
      this.locationCache.set(pincode, loc);
      return loc;
    }

    // Try resolving via postal pincode API with strict 1.5s timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
          const po = data[0].PostOffice[0];
          const district = po.District || '';
          const state = po.State || '';
          const city = district && state && district !== state ? `${district}, ${state}` : (district || state || 'India');
          const loc = { city, district, state };
          this.locationCache.set(pincode, loc);
          return loc;
        }
      }
    } catch {
      // Ignore network / timeout errors and fall back to prefix map
    }

    // Fallback to prefix map
    const prefix2 = pincode.substring(0, 2);
    if (PIN_PREFIX_MAP[prefix2]) {
      const loc = PIN_PREFIX_MAP[prefix2];
      this.locationCache.set(pincode, loc);
      return loc;
    }

    return { city: '', district: '', state: '' };
  }

  async checkPincode(pincode: string, lat?: number, lng?: number) {
    const cleanPin = pincode.trim().replace(/\D/g, '');
    const location = await this.resolveLocation(cleanPin);

    // 1. Determine distance from Sagore Kitchen (22.6288, 75.5684)
    let distanceKm: number;
    const hasCoordinates = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

    if (hasCoordinates) {
      distanceKm = calculateHaversineDistanceKm(SAGORE_KITCHEN_LAT, SAGORE_KITCHEN_LNG, lat, lng);
    } else if (SAGORE_LOCAL_PINCODES[cleanPin]) {
      distanceKm = SAGORE_LOCAL_PINCODES[cleanPin].approxDistanceKm;
    } else if (cleanPin === '454774') {
      distanceKm = 2.0;
    } else {
      // Any other pincode without coordinates outside Sagore region (e.g. Indore 452001, Dhar 454001, Delhi 110017)
      // Estimate minimum distance based on location
      distanceKm = cleanPin.startsWith('454') ? 22.0 : cleanPin.startsWith('452') ? 28.0 : 45.0;
    }

    // 2. Beyond 15km: Delivery is strictly NOT available
    if (distanceKm > MAX_DELIVERY_RADIUS_KM) {
      return {
        serviceable: false,
        pincode: cleanPin,
        distanceKm,
        city: location.city || null,
        district: location.district || null,
        state: location.state || null,
        minOrderPaise: 0,
        deliveryFeePaise: 0,
        isFreeDelivery: false,
        message: `Delivery not available beyond 15 km from Sagore Kitchen. (Your location is ~${distanceKm} km away)`,
      };
    }

    // 3. Within 5km: FREE Delivery (Delivery Fee = ₹0)
    if (distanceKm <= FREE_DELIVERY_RADIUS_KM) {
      const zoneName = cleanPin === '454774' ? 'Sagore Central Zone' : `Sagore Zone (~${distanceKm} km)`;
      return {
        serviceable: true,
        zoneId: 'zone-sagore-454774',
        zoneName,
        pincode: cleanPin,
        city: location.city || 'Sagore, Pithampur',
        district: location.district || 'Dhar',
        state: location.state || 'Madhya Pradesh',
        distanceKm,
        minOrderPaise: 0,
        deliveryFeePaise: 0, // FREE DELIVERY within 5km!
        isFreeDelivery: true,
        freeDeliveryThresholdPaise: 0,
        estimatedDeliveryMinutes: 30,
        message: `✓ Delivering to Sagore (~${distanceKm} km) • Free Delivery (Within 5 km)`,
      };
    }

    // 4. Beyond 5km up to 15km: Free delivery is removed, standard delivery fee applies
    const zoneConfig = SAGORE_LOCAL_PINCODES[cleanPin];
    const deliveryFeePaise = distanceKm <= 10.0 ? 3500 : 4500; // ₹35 up to 10km, ₹45 up to 15km
    const feeRupees = (deliveryFeePaise / 100).toFixed(0);

    return {
      serviceable: true,
      zoneId: `zone-sagore-${cleanPin}`,
      zoneName: `${zoneConfig?.zoneName || 'Sagore Outer Zone'} (~${distanceKm} km)`,
      pincode: cleanPin,
      city: zoneConfig?.city || location.city || 'Pithampur Outer',
      district: zoneConfig?.district || location.district || 'Dhar',
      state: zoneConfig?.state || location.state || 'Madhya Pradesh',
      distanceKm,
      minOrderPaise: 0,
      deliveryFeePaise, // Fee applies!
      isFreeDelivery: false,
      freeDeliveryThresholdPaise: 49900,
      estimatedDeliveryMinutes: 45,
      message: `✓ Serviceable (~${distanceKm} km from Sagore Kitchen) • Delivery Fee ₹${feeRupees} (Beyond 5 km free zone)`,
    };
  }

  async getAllActiveZones() {
    return this.prisma.deliveryZone.findMany({
      where: { isActive: true },
    });
  }
}
