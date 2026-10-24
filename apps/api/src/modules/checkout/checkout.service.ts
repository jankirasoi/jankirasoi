import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalculateQuoteDto, PlaceOrderDto } from './dto/checkout.dto';
import { randomBytes, createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { OrdersEventsService } from '../events/orders-events.service';
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
const Razorpay = require('razorpay');

interface CachedQuote {
  quoteToken: string;
  expiresAt: Date;
  serviceDate: Date;
  deliverySlotId: string;
  deliveryZoneId: string | null;
  items: Array<{
    productId: string;
    productName: string;
    variantId?: string;
    variantName?: string;
    unitPricePaise: number;
    quantity: number;
    totalPricePaise: number;
    addons: Array<{
      addonOptionId: string;
      name: string;
      pricePaise: number;
    }>;
  }>;
  subtotalPaise: number;
  deliveryFeePaise: number;
  packagingFeePaise: number;
  taxPaise: number;
  discountPaise: number;
  totalAmountPaise: number;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly quoteCache = new Map<string, CachedQuote>();
  private razorpayClient: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ordersEventsService: OrdersEventsService,
    private readonly deliveryZonesService: DeliveryZonesService,
  ) {
    const key_id = this.configService.get<string>('RAZORPAY_KEY_ID');
    const key_secret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    if (key_id && key_secret) {
      this.razorpayClient = new Razorpay({ key_id, key_secret });
    }
  }

  // ---------------------------------------------------------------------------
  // Quote persistence & caching — hybrid in-memory + DB storage.
  // Lookups check in-memory map first (0ms), falling back to DB for cluster/restart.
  // Expiring a quote only expires that specific token, preserving all other quotes.
  // ---------------------------------------------------------------------------

  private async saveQuote(quote: CachedQuote): Promise<void> {
    this.quoteCache.set(quote.quoteToken, quote);
    try {
      await this.prisma.outboxMessage.create({
        data: {
          eventType: 'QUOTE_CACHE',
          payload: quote as any,
          status: 'PENDING',
          scheduledFor: quote.expiresAt,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist quote to DB: ${(err as Error).message}`);
    }
  }

  private async loadQuote(quoteToken: string): Promise<CachedQuote | null> {
    // 1. Fast in-memory lookup
    const inMemory = this.quoteCache.get(quoteToken);
    if (inMemory && inMemory.expiresAt > new Date()) {
      return inMemory;
    }

    // 2. Fallback to DB lookup specifically matching quoteToken
    try {
      const records = await this.prisma.outboxMessage.findMany({
        where: {
          eventType: 'QUOTE_CACHE',
          status: 'PENDING',
          scheduledFor: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      for (const rec of records) {
        const payload = rec.payload as any;
        if (payload && payload.quoteToken === quoteToken) {
          const loaded: CachedQuote = {
            ...payload,
            expiresAt: new Date(payload.expiresAt),
            serviceDate: new Date(payload.serviceDate),
          };
          this.quoteCache.set(quoteToken, loaded);
          return loaded;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to load quote from DB: ${(err as Error).message}`);
    }

    return null;
  }

  private async expireQuote(quoteToken: string): Promise<void> {
    this.quoteCache.delete(quoteToken);
    try {
      const records = await this.prisma.outboxMessage.findMany({
        where: {
          eventType: 'QUOTE_CACHE',
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      for (const rec of records) {
        const payload = rec.payload as any;
        if (payload && payload.quoteToken === quoteToken) {
          await this.prisma.outboxMessage.update({
            where: { id: rec.id },
            data: { status: 'COMPLETED' },
          });
          break;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to expire quote in DB: ${(err as Error).message}`);
    }
  }

  async calculateQuote(dto: CalculateQuoteDto) {
    const serviceDate = new Date(dto.serviceDate);
    if (isNaN(serviceDate.getTime())) {
      throw new BadRequestException('Invalid service date. Format: YYYY-MM-DD');
    }

    // 1. Verify Delivery Zone from Sagore Kitchen (5km free delivery, 15km max boundary)
    const cleanPin = (dto.pincode || '454774').trim().replace(/\D/g, '');
    const zoneCheck = await this.deliveryZonesService.checkPincode(cleanPin);
    if (!zoneCheck.serviceable) {
      throw new BadRequestException({
        code: 'UNSERVICEABLE_ZONE',
        message: zoneCheck.message || 'Delivery is only available within 15 km of Sagore Kitchen (MP 454774).',
      });
    }

    let zone = await this.prisma.deliveryZone.findUnique({
      where: { pincode: cleanPin },
    });
    if (!zone) {
      zone = await this.prisma.deliveryZone.upsert({
        where: { pincode: cleanPin },
        update: {
          deliveryFeePaise: zoneCheck.deliveryFeePaise,
          freeDeliveryThresholdPaise: zoneCheck.isFreeDelivery ? 0 : 49900,
          isActive: true,
        },
        create: {
          name: zoneCheck.zoneName || 'Sagore Delivery Zone',
          pincode: cleanPin,
          deliveryFeePaise: zoneCheck.deliveryFeePaise,
          freeDeliveryThresholdPaise: zoneCheck.isFreeDelivery ? 0 : 49900,
          minOrderPaise: 0,
          isActive: true,
        },
      });
    }

    // 2. Verify Delivery Slot & Capacity
    const slot = await this.prisma.deliverySlot.findUnique({
      where: { id: dto.deliverySlotId },
      include: {
        capacities: {
          where: { serviceDate },
        },
      },
    });
    if (!slot || !slot.isActive) {
      throw new BadRequestException('Selected delivery slot is inactive or not found.');
    }
    const maxCapacity = slot.capacities[0] ? slot.capacities[0].maxCapacity : slot.defaultCapacity;
    const booked = slot.capacities[0] ? slot.capacities[0].bookedCount : 0;
    if (booked >= maxCapacity) {
      throw new BadRequestException({
        code: 'SLOT_CAPACITY_EXCEEDED',
        message: 'The selected delivery slot has reached full capacity for this date.',
      });
    }

    // 3. FIX #13: Batch-fetch all products in ONE query instead of N individual queries.
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        variants: true,
        availabilities: { where: { serviceDate } },
        addonGroups: {
          include: {
            addonGroup: {
              include: { options: true },
            },
          },
        },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotalPaise = 0;
    const computedItems: CachedQuote['items'] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);

      if (!product || !product.isActive) {
        throw new NotFoundException(`Product not found or unavailable: ${item.productId}`);
      }

      const isSoldOut = product.availabilities[0]?.isSoldOut;
      if (isSoldOut) {
        throw new BadRequestException({
          code: 'ITEM_SOLD_OUT',
          message: `Item "${product.name}" is sold out for the selected date.`,
        });
      }

      // Base price in integer paise
      let itemUnitPricePaise = product.basePricePaise;
      let variantName: string | undefined = undefined;

      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant || !variant.isActive) {
          throw new BadRequestException(`Invalid variant for item "${product.name}"`);
        }
        itemUnitPricePaise += variant.priceModifierPaise;
        variantName = variant.name;
      }

      // Addons in integer paise
      const selectedAddons: Array<{ addonOptionId: string; name: string; pricePaise: number }> = [];
      if (item.selectedAddonOptionIds && item.selectedAddonOptionIds.length > 0) {
        for (const optionId of item.selectedAddonOptionIds) {
          let foundOption: any = null;
          for (const pag of product.addonGroups) {
            const opt = pag.addonGroup.options.find((o) => o.id === optionId && o.isActive);
            if (opt) {
              foundOption = opt;
              break;
            }
          }
          if (!foundOption) {
            throw new BadRequestException(`Invalid addon option: ${optionId}`);
          }
          selectedAddons.push({
            addonOptionId: foundOption.id,
            name: foundOption.name,
            pricePaise: foundOption.pricePaise,
          });
          itemUnitPricePaise += foundOption.pricePaise;
        }
      }

      const totalItemPaise = itemUnitPricePaise * item.quantity;
      subtotalPaise += totalItemPaise;

      computedItems.push({
        productId: product.id,
        productName: product.name,
        variantId: item.variantId,
        variantName,
        unitPricePaise: itemUnitPricePaise,
        quantity: item.quantity,
        totalPricePaise: totalItemPaise,
        addons: selectedAddons,
      });
    }

    if (zone.minOrderPaise && subtotalPaise < zone.minOrderPaise) {
      throw new BadRequestException(
        `Minimum order amount for ${zone.name} is ₹${(zone.minOrderPaise / 100).toFixed(2)}. Current subtotal: ₹${(subtotalPaise / 100).toFixed(2)}.`,
      );
    }

    // 4. Calculate Delivery Fee, Packaging Fee & 5% GST
    // Sagore Rule: <= 5km is ₹0 (Free Delivery). > 5km <= 15km standard fee applies.
    let deliveryFeePaise = zoneCheck.deliveryFeePaise;
    if (zone.freeDeliveryThresholdPaise && zone.freeDeliveryThresholdPaise > 0 && subtotalPaise >= zone.freeDeliveryThresholdPaise) {
      deliveryFeePaise = 0;
    }

    const packagingFeePaise = 1500; // Flat ₹15 packaging fee per order
    const taxPaise = Math.round(subtotalPaise * 0.05); // 5% GST on food
    const discountPaise = 0;
    const totalAmountPaise = subtotalPaise + deliveryFeePaise + packagingFeePaise + taxPaise - discountPaise;

    const quoteToken = 'qtok_' + randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min TTL

    const cachedQuote: CachedQuote = {
      quoteToken,
      expiresAt,
      serviceDate,
      deliverySlotId: slot.id,
      deliveryZoneId: zone.id,
      items: computedItems,
      subtotalPaise,
      deliveryFeePaise,
      packagingFeePaise,
      taxPaise,
      discountPaise,
      totalAmountPaise,
    };

    // FIX #11: Persist to DB instead of in-memory map
    await this.saveQuote(cachedQuote);

    return {
      quoteToken,
      expiresAt: expiresAt.toISOString(),
      currency: 'INR',
      subtotalPaise,
      deliveryFeePaise,
      packagingFeePaise,
      taxPaise,
      discountPaise,
      totalAmountPaise,
      formattedTotal: `₹${(totalAmountPaise / 100).toFixed(2)}`,
    };
  }

  async placeOrder(dto: PlaceOrderDto, idempotencyKey?: string) {
    // FIX #11: Load quote from DB instead of in-process map
    const cached = await this.loadQuote(dto.quoteToken);
    if (!cached || cached.expiresAt < new Date()) {
      throw new BadRequestException('Quotation has expired or is invalid. Please review your cart.');
    }

    // Check for idempotency if key provided
    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey },
        include: { paymentAttempts: true },
      });
      if (existing) {
        return {
          orderId: existing.id,
          orderNumber: existing.orderNumber,
          status: existing.status,
          trackingToken: existing.trackingToken,
          trackingUrl: `https://jankirasoi.in/orders/track/${existing.trackingToken}`,
          payment: {
            method: existing.paymentMethod,
            amountPaise: existing.totalAmountPaise,
            currency: 'INR',
            razorpayOrderId: existing.paymentAttempts[0]?.providerOrderId,
            razorpayKeyId: this.configService.get<string>('RAZORPAY_KEY_ID'),
          },
        };
      }
    }

    // Atomic DB Transaction: Capacity Reservation + Order Creation + Payment Attempt
    const orderResult = await this.prisma.$transaction(async (tx) => {
      // 1. Lock and increment slot capacity
      const slot = await tx.deliverySlot.findUnique({
        where: { id: cached.deliverySlotId },
      });
      const defaultCap = slot?.defaultCapacity ?? 30;

      const capacity = await tx.deliverySlotCapacity.upsert({
        where: {
          deliverySlotId_serviceDate: {
            deliverySlotId: cached.deliverySlotId,
            serviceDate: cached.serviceDate,
          },
        },
        update: { bookedCount: { increment: 1 } },
        create: {
          deliverySlotId: cached.deliverySlotId,
          serviceDate: cached.serviceDate,
          maxCapacity: defaultCap,
          bookedCount: 1,
        },
      });

      // Strict boundary check: If bookedCount strictly exceeds maxCapacity (e.g. 31 > 30), reject and rollback
      if (capacity.bookedCount > capacity.maxCapacity) {
        throw new BadRequestException({
          code: 'SLOT_CAPACITY_EXCEEDED',
          message: 'Delivery slot capacity was filled by another order just now.',
        });
      }

      // Generate human-friendly order number: JR-YYYYMMDD-XXXX
      const dateStr = cached.serviceDate.toISOString().slice(0, 10).replace(/-/g, '');
      const countToday = await tx.order.count({ where: { serviceDate: cached.serviceDate } });
      const orderSeq = countToday + 1;
      let orderNumber = `JR-${dateStr}-${orderSeq.toString().padStart(4, '0')}`;
      
      // Concurrency collision protection: if another transaction picked this sequence simultaneously, append random entropy
      const existingOrderNum = await tx.order.findUnique({ where: { orderNumber } });
      if (existingOrderNum) {
        const entropy = randomBytes(2).toString('hex').toUpperCase();
        orderNumber = `JR-${dateStr}-${orderSeq.toString().padStart(4, '0')}-${entropy}`;
      }
      const trackingToken = 'trk_' + randomBytes(16).toString('hex');

      // Create Order Record
      const order = await tx.order.create({
        data: {
          orderNumber,
          trackingToken,
          status: dto.paymentMethod === 'COD' ? 'PLACED' : 'AWAITING_PAYMENT',
          paymentMethod: dto.paymentMethod,
          paymentStatus: dto.paymentMethod === 'COD' ? 'AUTHORIZED' : 'PENDING',
          serviceDate: cached.serviceDate,
          deliverySlotId: cached.deliverySlotId,
          deliveryZoneId: cached.deliveryZoneId,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,
          deliveryAddress: dto.deliveryAddress as any,
          deliveryNotes: dto.deliveryNotes,
          subtotalPaise: cached.subtotalPaise,
          deliveryFeePaise: cached.deliveryFeePaise,
          packagingFeePaise: cached.packagingFeePaise,
          taxPaise: cached.taxPaise,
          discountPaise: cached.discountPaise,
          totalAmountPaise: cached.totalAmountPaise,
          idempotencyKey,
          items: {
            create: cached.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              variantName: item.variantName,
              unitPricePaise: item.unitPricePaise,
              quantity: item.quantity,
              totalPricePaise: item.totalPricePaise,
              addons: {
                create: item.addons.map((a) => ({
                  addonOptionId: a.addonOptionId,
                  name: a.name,
                  pricePaise: a.pricePaise,
                })),
              },
            })),
          },
          statusHistory: {
            create: {
              toStatus: dto.paymentMethod === 'COD' ? 'PLACED' : 'AWAITING_PAYMENT',
              actorType: 'CUSTOMER',
              reason: 'Order submitted by customer',
            },
          },
        },
      });

      let razorpayOrderId: string | undefined = undefined;

      // If Razorpay, create order server-side
      if (dto.paymentMethod === 'RAZORPAY') {
        if (this.razorpayClient) {
          try {
            const rzpOrder = await this.razorpayClient.orders.create({
              amount: cached.totalAmountPaise, // in paise
              currency: 'INR',
              receipt: order.id,
              notes: {
                orderNumber: order.orderNumber,
                customerPhone: order.customerPhone,
              },
            });
            razorpayOrderId = rzpOrder.id;
          } catch (err) {
            this.logger.error(`Razorpay order creation failed: ${(err as Error).message}`);
            // Fallback for offline dev
            razorpayOrderId = 'order_mock_' + randomBytes(8).toString('hex');
          }
        } else {
          razorpayOrderId = 'order_mock_' + randomBytes(8).toString('hex');
        }

        await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            provider: 'RAZORPAY',
            providerOrderId: razorpayOrderId,
            amountPaise: cached.totalAmountPaise,
            currency: 'INR',
            status: 'PENDING',
          },
        });
      }

      // Auto-assign available active rider immediately upon order creation
      try {
        const availableRider = await tx.riderProfile.findFirst({
          where: {
            isAvailable: true,
            user: { isActive: true },
          },
        });
        if (availableRider) {
          await tx.riderAssignment.create({
            data: {
              orderId: order.id,
              riderId: availableRider.id,
              status: 'ASSIGNED',
            },
          });
          this.logger.log(`Auto-assigned rider ${availableRider.id} to new order #${order.orderNumber}`);
        }
      } catch (err: any) {
        this.logger.warn(`Could not auto-assign rider: ${err.message}`);
      }

      // Enqueue notification outbox
      await tx.outboxMessage.create({
        data: {
          eventType: 'ORDER_CREATED',
          payload: { orderId: order.id, orderNumber: order.orderNumber, phone: order.customerPhone },
          status: 'PENDING',
        },
      });

      // FIX #11: Expire the quote in the DB after use
      await this.expireQuote(dto.quoteToken);

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        trackingToken: order.trackingToken,
        trackingUrl: `https://jankirasoi.in/orders/track/${order.trackingToken}`,
        payment: {
          method: order.paymentMethod,
          amountPaise: order.totalAmountPaise,
          currency: 'INR',
          razorpayOrderId,
          razorpayKeyId: this.configService.get<string>('RAZORPAY_KEY_ID') || 'rzp_test_mock',
        },
      };
    });

    // Real-time instant notification to kitchen admin console
    this.ordersEventsService.emitOrderEvent('ORDER_CREATED', {
      orderId: orderResult.orderId,
      orderNumber: orderResult.orderNumber,
      status: orderResult.status,
    });

    return orderResult;
  }
}
