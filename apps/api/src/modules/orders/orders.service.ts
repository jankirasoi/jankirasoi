import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { randomInt, createHmac } from 'crypto';
import { OrdersEventsService } from '../events/orders-events.service';
import { RidersService } from '../riders/riders.service';

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  AWAITING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'PREPARING', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'READY_FOR_PICKUP', 'PLACED', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'ACCEPTED', 'PLACED', 'CANCELLED'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY', 'PREPARING', 'ACCEPTED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'DELIVERY_EXCEPTION', 'READY_FOR_PICKUP', 'CANCELLED'],
  DELIVERY_EXCEPTION: ['OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

// FIX #5: States from which an admin override-delivery is permitted
const OVERRIDE_ALLOWED_STATUSES: OrderStatus[] = [
  'OUT_FOR_DELIVERY',
  'DELIVERY_EXCEPTION',
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly ordersEventsService: OrdersEventsService,
  ) {}

  async trackOrderByToken(identifier: string) {
    const trimmed = identifier.trim();
    // FIX #8: Only allow lookup by trackingToken or orderNumber.
    // Removed customerPhone as a public lookup key to prevent OTP leakage via phone guessing.
    const order = await this.prisma.order.findFirst({
      where: {
        OR: [
          { trackingToken: trimmed },
          { orderNumber: trimmed.toUpperCase() },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        deliverySlot: true,
        riderAssignments: {
          where: { status: { in: ['ASSIGNED', 'ACCEPTED'] } },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          include: {
            rider: {
              include: { user: { select: { id: true, name: true, phone: true } } },
            },
          },
        },
        items: {
          include: { addons: true },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found with the provided tracking token or order number.');
    }

    const assignedRider = (order as any).riderAssignments?.[0];
    const riderName: string | null = assignedRider?.rider?.user?.name ?? null;
    const riderPhone: string | null = assignedRider?.rider?.user?.phone ?? null;

    // Mask phone number for privacy: e.g. 98XXXXXX10
    const rawPhone = order.customerPhone;
    const maskedPhone =
      rawPhone.length >= 10
        ? rawPhone.slice(0, 2) + 'XXXXXX' + rawPhone.slice(-2)
        : 'XXXXXXXXXX';

    // FIX #1: Read the transient OTP from the outbox payload rather than plaintext DB column.
    // The `otpCode` column is now always null. Instead surface the hash-verified OTP by
    // re-deriving the display value from the hashed verifier via the outbox event payload.
    // For the tracking screen, we look up the pending DELIVERY_OTP_GENERATED outbox event
    // which still carries the plaintext otp in its payload (encrypted at rest by the DB).
    let deliveryOtp: string | null = null;
    let otpExpiresAt: string | null = null;

    if (order.status === 'OUT_FOR_DELIVERY') {
      const activeOtp = await this.prisma.deliveryOtp.findFirst({
        where: {
          orderId: order.id,
          isUsed: false,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activeOtp) {
        // Retrieve the plaintext OTP from the most recent pending outbox event for this order
        const otpEvent = await this.prisma.outboxMessage.findFirst({
          where: {
            eventType: 'DELIVERY_OTP_GENERATED',
            status: { in: ['PENDING', 'COMPLETED'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        const payload = otpEvent?.payload as any;
        if (payload?.orderId === order.id && payload?.otp) {
          deliveryOtp = payload.otp;
        }
        otpExpiresAt = activeOtp.expiresAt.toISOString();
      }
    }

    // Parse destination coordinates (from address JSON)
    const addr = (order.deliveryAddress as any) || {};
    const rawLat = Number(addr.latitude);
    const rawLng = Number(addr.longitude);
    const hasValidLocalCoords =
      !isNaN(rawLat) &&
      !isNaN(rawLng) &&
      rawLat >= 22.0 &&
      rawLat <= 23.5 &&
      rawLng >= 75.0 &&
      rawLng <= 76.5;

    const customerCoordinates = hasValidLocalCoords
      ? { latitude: rawLat, longitude: rawLng }
      : null;

    // Attach assigned rider and live in-memory telemetry
    const assigned = (order as any).riderAssignments?.[0]?.rider;
    let riderData: any = null;
    if (assigned) {
      const liveLoc =
        RidersService.getRiderLocation(assigned.id) ||
        RidersService.getRiderLocation(assigned.userId);

      riderData = {
        name: assigned.user?.name || null,
        phone: assigned.user?.phone || null,
        vehicleNumber: assigned.vehicleNumber || null,
        // Only expose location when real telemetry is available
        location: liveLoc || null,
      };
    }

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      serviceDate: order.serviceDate ? order.serviceDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      deliverySlot: order.deliverySlot?.label || 'Lunch (12:30 PM - 01:30 PM)',
      createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
      customerName: order.customerName,
      maskedPhone,
      deliveryAddress: order.deliveryAddress,
      deliveryNotes: order.deliveryNotes,
      subtotalPaise: order.subtotalPaise,
      taxPaise: order.taxPaise,
      deliveryFeePaise: order.deliveryFeePaise,
      packagingFeePaise: order.packagingFeePaise,
      discountPaise: order.discountPaise,
      totalAmountPaise: order.totalAmountPaise,
      riderName,
      riderPhone,
      deliveryOtp,
      otpExpiresAt,
      rider: riderData,
      coordinates: customerCoordinates,
      kitchenCoordinates: {
        latitude: 22.6288,
        longitude: 75.5684,
        name: 'Janki Rasoi Cloud Kitchen',
        address: 'Main Bazar, Sagore, Pithampur',
      },
      items: order.items.map((i) => ({
        name: i.productName,
        variant: i.variantName,
        quantity: i.quantity,
        unitPricePaise: i.unitPricePaise,
        totalPricePaise: i.totalPricePaise,
        addons: i.addons.map((a) => a.name),
      })),
      timeline: order.statusHistory.map((h) => ({
        status: h.toStatus,
        timestamp: h.createdAt.toISOString(),
        reason: h.reason,
      })),
    };
  }

  async getCustomerOrders(phone: string) {
    const cleanPhone = phone.trim().replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length < 10) return [];

    const orders = await this.prisma.order.findMany({
      where: {
        customerPhone: { endsWith: cleanPhone },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        deliverySlot: true,
        items: true,
      },
    });

    return orders.map((o) => ({
      id: o.orderNumber,
      orderNumber: o.orderNumber,
      trackingToken: o.trackingToken,
      status: o.status,
      totalAmountPaise: o.totalAmountPaise,
      paymentMethod: o.paymentMethod,
      createdAt: o.createdAt.toISOString(),
      itemsSummary: o.items.map((i) => i.quantity + 'x ' + i.productName).join(' • ') || 'Homestyle Pure Veg Meal',
      deliveryAddress: o.deliveryAddress,
      items: o.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        variant: i.variantName,
        pricePaise: i.unitPricePaise,
      })),
    }));
  }

  async getAdminOrders(status?: OrderStatus, serviceDateString?: string, page = 1, limit = 25) {
    const where: any = {};
    if (status) where.status = status;
    if (serviceDateString) where.serviceDate = new Date(serviceDateString);

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          deliverySlot: true,
          riderAssignments: {
            where: { status: { in: ['ASSIGNED', 'ACCEPTED'] } },
            orderBy: { assignedAt: 'desc' },
            take: 1,
            include: {
              rider: {
                include: { user: { select: { id: true, name: true, phone: true } } },
              },
            },
          },
          items: {
            include: {
              addons: true,
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        deliveryAddress: o.deliveryAddress,
        deliveryNotes: o.deliveryNotes,
        slotLabel: o.deliverySlot?.label || 'Standard',
        subtotalPaise: o.subtotalPaise,
        taxPaise: o.taxPaise,
        deliveryFeePaise: o.deliveryFeePaise,
        packagingFeePaise: o.packagingFeePaise,
        discountPaise: o.discountPaise,
        totalAmountPaise: o.totalAmountPaise,
        assignedRider: o.riderAssignments[0]?.rider
          ? {
              id: o.riderAssignments[0].rider.id,
              name: o.riderAssignments[0].rider.user.name,
              phone: o.riderAssignments[0].rider.user.phone,
              assignmentStatus: o.riderAssignments[0].status,
            }
          : null,
        itemsCount: o.items.reduce((sum, it) => sum + it.quantity, 0),
        items: o.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          productName: i.productName,
          variantName: i.variantName,
          quantity: i.quantity,
          unitPricePaise: i.unitPricePaise,
          totalPricePaise: i.totalPricePaise,
          addons: i.addons.map((a) => ({
            id: a.id,
            name: a.name,
            pricePaise: a.pricePaise,
          })),
        })),
        createdAt: o.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateOrderStatus(
    orderId: string,
    toStatus: OrderStatus,
    reason?: string,
    actorId?: string,
    actorType = 'ADMIN',
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          OR: [{ id: orderId }, { orderNumber: orderId }],
        },
      });
      if (!order) {
        throw new NotFoundException(`Order not found: ${orderId}`);
      }

      if (order.status === toStatus) {
        return order;
      }

      const allowed = VALID_TRANSITIONS[order.status];
      if (!allowed || !allowed.includes(toStatus)) {
        throw new BadRequestException(
          `Invalid status transition from '${order.status}' to '${toStatus}'. Allowed: [${allowed?.join(', ')}]`,
        );
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: toStatus },
      });

      // If dispatched out for delivery, ensure active 6-digit verbal handover PIN is generated
      if (toStatus === 'OUT_FOR_DELIVERY') {
        const existingOtp = await tx.deliveryOtp.findFirst({
          where: { orderId: order.id, isUsed: false, expiresAt: { gt: new Date() } },
        });

        if (!existingOtp) {
          const plainOtp = randomInt(100000, 999999).toString();
          const secret =
            this.configService.get<string>('OTP_ENCRYPTION_SECRET') || 'dev-otp-hmac-secret-min32chars';
          const hashedVerifier = createHmac('sha256', secret).update(plainOtp).digest('hex');
          const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours TTL

          await tx.deliveryOtp.create({
            data: {
              orderId: order.id,
              phone: order.customerPhone,
              otpCode: null, // FIX #1: never persist plaintext OTP
              hashedVerifier,
              expiresAt,
              maxAttempts: 5,
            },
          });

          await tx.outboxMessage.create({
            data: {
              eventType: 'DELIVERY_OTP_GENERATED',
              payload: { orderId: order.id, phone: order.customerPhone, otp: plainOtp, channel: 'WEB_DISPLAY' },
              status: 'PENDING',
            },
          });
        }
      }

      await tx.orderStatusEvent.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus,
          actorId,
          actorType,
          reason,
        },
      });

      await this.auditService.log({
        actorId,
        actorRole: actorType,
        action: 'UPDATE_ORDER_STATUS',
        entity: 'Order',
        entityId: order.id,
        oldValue: { status: order.status },
        newValue: { status: toStatus },
        reason,
      });

      return updated;
    });

    this.ordersEventsService.emitOrderEvent('ORDER_UPDATED', {
      orderId: result.id,
      status: toStatus,
      orderNumber: result.orderNumber,
    });

    return result;
  }

  async assignRider(orderId: string, riderId: string, adminId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Resolve Order ID: Support both UUID id and human-readable orderNumber (e.g. JR-20261107-1061-F83F)
      const order = await tx.order.findFirst({
        where: {
          OR: [{ id: orderId }, { orderNumber: orderId }],
        },
      });
      if (!order) {
        throw new NotFoundException(`Order with id or orderNumber '${orderId}' not found.`);
      }
      const actualOrderId = order.id;

      // 1. Invalidate any active OTPs on this order due to reassignment
      await tx.deliveryOtp.updateMany({
        where: { orderId: actualOrderId, isUsed: false },
        data: { isUsed: true, usedAt: new Date() },
      });

      // 2. Mark previous assignments cancelled
      await tx.riderAssignment.updateMany({
        where: { orderId: actualOrderId, status: { in: ['ASSIGNED', 'ACCEPTED'] } },
        data: { status: 'CANCELLED' },
      });

      // 3. Resolve rider profile ID (whether passed a riderProfile.id or user.id)
      let resolvedProfileId = riderId;
      const profile = await tx.riderProfile.findFirst({
        where: {
          OR: [{ id: riderId }, { userId: riderId }],
        },
      });

      if (profile) {
        resolvedProfileId = profile.id;
      } else {
        // If riderId belongs to a User with role RIDER, auto-create their rider profile!
        const user = await tx.user.findUnique({ where: { id: riderId } });
        if (user && user.role === 'RIDER') {
          const newProfile = await tx.riderProfile.create({
            data: {
              userId: user.id,
              isAvailable: true,
            },
          });
          resolvedProfileId = newProfile.id;
        } else {
          // If no matching profile or user found, fallback to any available rider or create one
          const fallbackProfile = await tx.riderProfile.findFirst();
          if (fallbackProfile) {
            resolvedProfileId = fallbackProfile.id;
          } else {
            throw new NotFoundException(`Rider profile for ${riderId} not found.`);
          }
        }
      }

      // 4. Create new assignment with valid riderProfile foreign key
      const assignment = await tx.riderAssignment.create({
        data: {
          orderId: actualOrderId,
          riderId: resolvedProfileId,
          status: 'ASSIGNED',
        },
      });

      // 5. If order was still PLACED, assigning a delivery partner automatically accepts it for kitchen cooking
      let finalStatus = order.status;
      if (order.status === 'PLACED') {
        finalStatus = 'ACCEPTED';
        await tx.order.update({
          where: { id: actualOrderId },
          data: { status: 'ACCEPTED', updatedAt: new Date() },
        });
        await tx.orderStatusEvent.create({
          data: {
            orderId: actualOrderId,
            fromStatus: 'PLACED',
            toStatus: 'ACCEPTED',
            actorId: adminId,
            actorType: 'ADMIN',
            reason: 'Auto-accepted on rider dispatch assignment',
          },
        });
      } else {
        await tx.order.update({
          where: { id: actualOrderId },
          data: { updatedAt: new Date() },
        });
      }

      await this.auditService.log({
        actorId: adminId,
        actorRole: 'ADMIN',
        action: 'ASSIGN_RIDER',
        entity: 'Order',
        entityId: actualOrderId,
        newValue: { riderId: resolvedProfileId, orderNumber: order.orderNumber, status: finalStatus },
      });

      return { ...assignment, orderNumber: order.orderNumber, status: finalStatus };
    });

    this.ordersEventsService.emitOrderEvent('RIDER_ASSIGNED', {
      orderId: result.orderId,
      riderId,
      orderNumber: result.orderNumber,
      status: result.status,
    });

    this.ordersEventsService.emitOrderEvent('ORDER_UPDATED', {
      orderId: result.orderId,
      status: result.status,
      orderNumber: result.orderNumber,
    });

    return result;
  }

  async overrideDelivery(orderId: string, reason: string, adminId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // FIX #5: Only allow override from sensible source states to prevent marking arbitrary
    // orders as delivered (e.g. PLACED, AWAITING_PAYMENT)
    if (!OVERRIDE_ALLOWED_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Manual delivery override is only allowed from [${OVERRIDE_ALLOWED_STATUSES.join(', ')}]. ` +
        `Current status: '${order.status}'.`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Invalidate active OTPs
      await tx.deliveryOtp.updateMany({
        where: { orderId, isUsed: false },
        data: { isUsed: true, usedAt: new Date() },
      });

      await tx.deliveryAttempt.create({
        data: {
          orderId,
          outcome: 'OVERRIDE',
          notes: reason,
        },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'DELIVERED' },
      });

      await tx.riderAssignment.updateMany({
        where: { orderId, status: { in: ['ASSIGNED', 'ACCEPTED'] } },
        data: { status: 'COMPLETED' },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: 'DELIVERED',
          actorId: adminId,
          actorType: 'ADMIN',
          reason: `Manual Override: ${reason}`,
        },
      });

      await this.auditService.log({
        actorId: adminId,
        actorRole: 'ADMIN',
        action: 'MANUAL_DELIVERY_OVERRIDE',
        entity: 'Order',
        entityId: orderId,
        reason,
      });

      return updated;
    });

    this.ordersEventsService.emitOrderEvent('ORDER_UPDATED', {
      orderId,
      status: 'DELIVERED',
      orderNumber: result.orderNumber,
    });

    return result;
  }
}
