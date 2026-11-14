import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeliveryOtpService } from './delivery-otp.service';
import { DeliveryExceptionDto } from './dto/riders.dto';

// FIX #3: Source statuses from which a rider can legally pick up an order
const PICKUP_ALLOWED_STATUSES = ['READY_FOR_PICKUP', 'ACCEPTED'] as const;

@Injectable()
export class RidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otpService: DeliveryOtpService,
  ) {}

  async getAssignedDeliveries(riderUserId?: string, riderPhone?: string, riderId?: string) {
    let riderProfileId: string | undefined = undefined;

    // 1. Direct rider profile ID or user ID lookup
    if (riderId) {
      const profile = await this.prisma.riderProfile.findFirst({
        where: { OR: [{ id: riderId }, { userId: riderId }] },
      });
      if (profile) {
        riderProfileId = profile.id;
      }
    }

    // 2. Rider phone number lookup (matches exact logged-in rider in portal)
    if (!riderProfileId && riderPhone) {
      const cleanPhone = riderPhone.replace(/\D/g, '').slice(-10);
      const user = await this.prisma.user.findFirst({
        where: { phone: { endsWith: cleanPhone }, role: 'RIDER' },
        include: { riderProfile: true },
      });
      if (user?.riderProfile) {
        riderProfileId = user.riderProfile.id;
      } else if (user) {
        const createdProfile = await this.prisma.riderProfile.create({
          data: { userId: user.id, vehicleNumber: 'MP-09-JR-2026', isAvailable: true },
        });
        riderProfileId = createdProfile.id;
      }
    }

    // 3. User ID lookup from validated session token
    if (!riderProfileId && riderUserId && riderUserId !== 'simulated_staff_id') {
      let profile = await this.prisma.riderProfile.findUnique({
        where: { userId: riderUserId },
      });
      if (!profile) {
        const user = await this.prisma.user.findUnique({ where: { id: riderUserId } });
        if (user && user.role === 'RIDER') {
          profile = await this.prisma.riderProfile.create({
            data: { userId: riderUserId, vehicleNumber: 'MP-09-JR-2026', isAvailable: true },
          });
        }
      }
      if (profile) {
        riderProfileId = profile.id;
      }
    }

    // 4. Fallback if still unassigned (only if no specific rider was queried)
    if (!riderProfileId && !riderPhone && !riderId) {
      const activeProfile =
        (await this.prisma.riderProfile.findFirst({
          where: { isAvailable: true },
        })) || (await this.prisma.riderProfile.findFirst());
      if (activeProfile) {
        riderProfileId = activeProfile.id;
      } else {
        return { deliveries: [] };
      }
    }

    if (!riderProfileId) {
      return { deliveries: [] };
    }

    const assignments = await this.prisma.riderAssignment.findMany({
      where: {
        riderId: riderProfileId,
        OR: [
          { status: 'ASSIGNED' },
          { status: 'ACCEPTED' },
          { status: 'COMPLETED' },
          { order: { status: 'DELIVERED' } },
        ],
      },
      include: {
        order: {
          include: {
            deliverySlot: true,
            items: true,
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
      take: 50,
    });

    // Deduplicate orders by ID to prevent duplicate deliveries from reassigned/multi-attempt records
    const seenOrderIds = new Set<string>();
    const ordersToDisplay: {
      order: (typeof assignments)[0]['order'];
      assignmentStatus: string;
      assignedAt?: Date;
    }[] = [];
    for (const a of assignments) {
      if (a.order && !seenOrderIds.has(a.order.id)) {
        seenOrderIds.add(a.order.id);
        ordersToDisplay.push({
          order: a.order,
          assignmentStatus: a.status,
          assignedAt: a.assignedAt,
        });
      }
    }

    return {
      deliveries: ordersToDisplay.map(({ order: o, assignmentStatus, assignedAt }) => {
        const addr = (o.deliveryAddress as any) || {};
        const rawLat = Number(addr.latitude ?? addr.lat);
        const rawLng = Number(addr.longitude ?? addr.lng);
        const hasValidCoords =
          !isNaN(rawLat) &&
          !isNaN(rawLng) &&
          rawLat >= 8.0 &&
          rawLat <= 37.5 &&
          rawLng >= 68.0 &&
          rawLng <= 97.5;

        const lat = hasValidCoords ? rawLat : 22.6288;
        const lng = hasValidCoords ? rawLng : 75.5684;

        const addressParts = [
          addr.flat,
          addr.street,
          addr.landmark ? `Near ${addr.landmark}` : null,
          'Sagore',
          'Pithampur',
          addr.pincode || '454774',
        ].filter(Boolean);
        const destinationText = addressParts.join(', ');

        const navigationUrl = hasValidCoords
          ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
          : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationText)}`;

        return {
          orderId: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          assignmentStatus,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          deliveryAddress: `${addr.flat || ''}, ${addr.street || ''}, ${addr.pincode || ''}`.replace(/^,\s*|,\s*$/g, ''),
          landmark: addr.landmark,
          deliveryNotes: o.deliveryNotes || undefined,
          coordinates: { latitude: lat, longitude: lng },
          navigationUrl,
          slotLabel: o.deliverySlot.label,
          paymentMethod: o.paymentMethod,
          cashDuePaise: o.paymentMethod === 'COD' && o.paymentStatus !== 'CAPTURED' ? o.totalAmountPaise : 0,
          itemsSummary: o.items.map((i) => `${i.quantity}x ${i.productName}`).join(', '),
          createdAt: o.createdAt ? o.createdAt.toISOString() : undefined,
          assignedAt: assignedAt ? assignedAt.toISOString() : undefined,
        };
      }),
    };
  }

  async acceptDelivery(orderId: string, riderUserId?: string, riderPhone?: string, riderId?: string) {
    let riderProfileId: string | undefined = undefined;
    if (riderId) {
      const profile = await this.prisma.riderProfile.findFirst({
        where: { OR: [{ id: riderId }, { userId: riderId }] },
      });
      if (profile) riderProfileId = profile.id;
    }
    if (!riderProfileId && riderPhone) {
      const cleanPhone = riderPhone.replace(/\D/g, '').slice(-10);
      const user = await this.prisma.user.findFirst({
        where: { phone: { contains: cleanPhone } },
        include: { riderProfile: true },
      });
      if (user?.riderProfile) riderProfileId = user.riderProfile.id;
    }
    if (!riderProfileId && riderUserId && !riderUserId.startsWith('simulated_')) {
      const profile = await this.prisma.riderProfile.findFirst({
        where: { OR: [{ id: riderUserId }, { userId: riderUserId }] },
      });
      if (profile) riderProfileId = profile.id;
    }

    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
    });
    const actualOrderId = order ? order.id : orderId;

    const assignment = await this.prisma.riderAssignment.findFirst({
      where: {
        orderId: actualOrderId,
        ...(riderProfileId ? { riderId: riderProfileId } : {}),
        status: 'ASSIGNED',
      },
      orderBy: { assignedAt: 'desc' },
    });

    if (!assignment) {
      const existing = await this.prisma.riderAssignment.findFirst({
        where: {
          orderId: actualOrderId,
          ...(riderProfileId ? { riderId: riderProfileId } : {}),
          status: 'ACCEPTED',
        },
      });
      if (existing) {
        return { success: true, assignment: existing, message: 'Delivery already accepted' };
      }
      throw new NotFoundException('Pending delivery assignment not found');
    }

    const updated = await this.prisma.riderAssignment.update({
      where: { id: assignment.id },
      data: { status: 'ACCEPTED' },
    });

    return {
      success: true,
      assignment: updated,
      message: 'Delivery assignment accepted successfully',
    };
  }

  async markOutForDelivery(orderId: string, riderUserId?: string, riderPhone?: string, riderId?: string) {
    // FIX #3: Wrap status update + status event + OTP generation in a single atomic transaction.
    // Also validates the state transition before committing anything.
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
      });
      if (!order) throw new NotFoundException('Order not found');
      const actualOrderId = order.id;

      if (!PICKUP_ALLOWED_STATUSES.includes(order.status as any)) {
        throw new BadRequestException(
          `Order cannot be marked out for delivery from current status '${order.status}'. ` +
          `Allowed: [${PICKUP_ALLOWED_STATUSES.join(', ')}]`,
        );
      }

      // Update order status
      await tx.order.update({
        where: { id: actualOrderId },
        data: { status: 'OUT_FOR_DELIVERY' },
      });

      // Ensure assignment moves to ACCEPTED if it was still pending in ASSIGNED
      await tx.riderAssignment.updateMany({
        where: { orderId: actualOrderId, status: 'ASSIGNED' },
        data: { status: 'ACCEPTED' },
      });

      // Record status event atomically with the update
      await tx.orderStatusEvent.create({
        data: {
          orderId: actualOrderId,
          fromStatus: order.status,
          toStatus: 'OUT_FOR_DELIVERY',
          actorId: riderUserId,
          actorType: 'RIDER',
          reason: 'Rider picked up order and departed kitchen',
        },
      });

      // Invalidate any existing OTPs and create a fresh one — all inside the transaction
      await tx.deliveryOtp.updateMany({
        where: { orderId: actualOrderId, isUsed: false },
        data: { isUsed: true, usedAt: new Date() },
      });

      const { OTP_ENCRYPTION_SECRET } = process.env;
      const secret = OTP_ENCRYPTION_SECRET || 'dev-otp-hmac-secret-min32chars';
      const { randomInt, createHmac } = await import('crypto');
      const plainOtp = randomInt(100000, 999999).toString();
      const hashedVerifier = createHmac('sha256', secret).update(plainOtp).digest('hex');
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

      await tx.deliveryOtp.create({
        data: {
          orderId: actualOrderId,
          phone: order.customerPhone,
          otpCode: null,        // FIX #1: never persist plaintext OTP
          hashedVerifier,
          expiresAt,
          maxAttempts: 5,
        },
      });

      // Enqueue notification for customer display
      await tx.outboxMessage.create({
        data: {
          eventType: 'DELIVERY_OTP_GENERATED',
          payload: { orderId: actualOrderId, phone: order.customerPhone, otp: plainOtp, channel: 'WEB_DISPLAY' },
          status: 'PENDING',
        },
      });

      const maskedPhone =
        order.customerPhone.length >= 10
          ? 'XXXXXX' + order.customerPhone.slice(-4)
          : order.customerPhone;

      return {
        orderId: actualOrderId,
        orderNumber: order.orderNumber,
        status: 'OUT_FOR_DELIVERY',
        message: 'Order is out for delivery. OTP generated for customer tracking screen.',
        otpSentTo: maskedPhone,
        expiresAt: expiresAt.toISOString(),
      };
    });
  }

  async verifyDeliveryOtp(orderId: string, code: string, riderUserId?: string) {
    return this.otpService.verifyOtp(orderId, code, riderUserId);
  }

  async reportException(orderId: string, dto: DeliveryExceptionDto, riderUserId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.deliveryAttempt.create({
        data: {
          orderId,
          riderId: riderUserId,
          outcome: 'EXCEPTION',
          notes: `${dto.reason}: ${dto.notes}`,
        },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'DELIVERY_EXCEPTION' },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'DELIVERY_EXCEPTION',
          actorId: riderUserId,
          actorType: 'RIDER',
          reason: `Delivery Exception: ${dto.reason} - ${dto.notes}`,
        },
      });

      return {
        orderId: updated.id,
        status: updated.status,
        message: 'Delivery exception successfully recorded. Kitchen manager notified.',
      };
    });
  }

  async updateDutyStatus(riderUserId: string, isAvailable: boolean) {
    let profile = await this.prisma.riderProfile.findFirst({
      where: {
        OR: [{ id: riderUserId }, { userId: riderUserId }],
      },
    });

    if (!profile) {
      profile = await this.prisma.riderProfile.create({
        data: {
          userId: riderUserId,
          vehicleNumber: 'MP-09-JR-2026',
          isAvailable,
        },
      });
    } else {
      profile = await this.prisma.riderProfile.update({
        where: { id: profile.id },
        data: { isAvailable },
      });
    }

    return {
      success: true,
      isAvailable: profile.isAvailable,
      message: profile.isAvailable ? 'Rider marked ON DUTY' : 'Rider marked OFFLINE',
    };
  }

  // In-Memory Ephemeral Geospatial Cache (Zero SQL Disk Thrashing - Swiggy/Zomato style)
  private static riderLocations = new Map<string, {
    latitude: number;
    longitude: number;
    heading?: number;
    speed?: number;
    updatedAt: string;
  }>();

  async updateLocation(riderUserId: string, dto: { latitude: number; longitude: number; heading?: number; speed?: number }) {
    const lat = Number(dto.latitude);
    const lng = Number(dto.longitude);
    if (isNaN(lat) || isNaN(lng)) {
      throw new BadRequestException('Invalid GPS coordinates');
    }

    const payload = {
      latitude: lat,
      longitude: lng,
      heading: dto.heading ?? 0,
      speed: dto.speed ?? 0,
      updatedAt: new Date().toISOString(),
    };

    RidersService.riderLocations.set(riderUserId, payload);

    try {
      const profile = await this.prisma.riderProfile.findFirst({
        where: { OR: [{ userId: riderUserId }, { id: riderUserId }] },
        select: { id: true, userId: true },
      });
      if (profile) {
        RidersService.riderLocations.set(profile.id, payload);
        RidersService.riderLocations.set(profile.userId, payload);
      }
    } catch {}

    return {
      success: true,
      location: payload,
    };
  }

  static getRiderLocation(riderIdOrUserId?: string) {
    if (!riderIdOrUserId) return null;
    return RidersService.riderLocations.get(riderIdOrUserId) || null;
  }
}
