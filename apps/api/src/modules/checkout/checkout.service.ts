import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalculateQuoteDto, PlaceOrderDto } from './dto/checkout.dto';
import { randomBytes, randomUUID, createHmac } from 'crypto';
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
  private readonly zoneCache = new Map<string, { data: any; expiry: number }>();
  private readonly slotCache = new Map<string, { data: any; expiry: number }>();
  private readonly productCache = new Map<string, { data: any; expiry: number }>();
  private readonly idempotencyCache = new Map<string, { result: any; expiry: number }>();
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
    // 0ms instant in-memory quote registration
    this.quoteCache.set(quote.quoteToken, quote);
    // Non-blocking background persistence
    setImmediate(async () => {
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
    });
  }

  private async loadQuote(quoteToken: string): Promise<CachedQuote | null> {
    // 1. Fast in-memory lookup (0ms)
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
    // Instant in-memory removal
    this.quoteCache.delete(quoteToken);
  }

  async calculateQuote(dto: CalculateQuoteDto) {
    const serviceDate = new Date(dto.serviceDate);
    if (isNaN(serviceDate.getTime())) {
      throw new BadRequestException('Invalid service date. Format: YYYY-MM-DD');
    }

    const cleanPin = (dto.pincode || '454774').trim().replace(/\D/g, '');
    const serviceDateStr = dto.serviceDate.split('T')[0];

    // 1. Fast In-Memory Zone Check
    let zone = this.zoneCache.get(cleanPin)?.data;
    if (!zone || this.zoneCache.get(cleanPin)!.expiry < Date.now()) {
      const dbZone = await this.prisma.deliveryZone.findUnique({ where: { pincode: cleanPin } }).catch(() => null);
      const zoneCheck = await this.deliveryZonesService.checkPincode(cleanPin);
      if (!zoneCheck.serviceable) {
        throw new BadRequestException({
          code: 'UNSERVICEABLE_ZONE',
          message: zoneCheck.message || 'Delivery is only available within 15 km of Sagore Kitchen (MP 454774).',
        });
      }

      zone = {
        id: dbZone ? dbZone.id : null,
        name: dbZone?.name || zoneCheck.zoneName || 'Sagore Delivery Zone',
        pincode: cleanPin,
        deliveryFeePaise: dbZone ? dbZone.deliveryFeePaise : zoneCheck.deliveryFeePaise,
        freeDeliveryThresholdPaise: dbZone ? dbZone.freeDeliveryThresholdPaise : (zoneCheck.isFreeDelivery ? 0 : 49900),
        minOrderPaise: dbZone?.minOrderPaise || 0,
        isActive: true,
      };
      this.zoneCache.set(cleanPin, { data: zone, expiry: Date.now() + 10 * 60 * 1000 });
    }

    // 2. Fast In-Memory Slot Check
    const slotCacheKey = `${dto.deliverySlotId}_${serviceDateStr}`;
    let slot = this.slotCache.get(slotCacheKey)?.data;
    if (!slot || this.slotCache.get(slotCacheKey)!.expiry < Date.now()) {
      slot = await this.prisma.deliverySlot.findUnique({
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
      this.slotCache.set(slotCacheKey, { data: slot, expiry: Date.now() + 60 * 1000 });
    }

    const maxCapacity = slot.capacities?.[0] ? slot.capacities[0].maxCapacity : (slot.defaultCapacity || 35);
    const booked = slot.capacities?.[0] ? slot.capacities[0].bookedCount : 0;
    if (booked >= maxCapacity) {
      throw new BadRequestException({
        code: 'SLOT_CAPACITY_EXCEEDED',
        message: 'The selected delivery slot has reached full capacity for this date.',
      });
    }

    // 3. Fast In-Memory Multi-Tier Product Cache
    const productIds = dto.items.map((i) => i.productId);
    const now = Date.now();
    const productMap = new Map<string, any>();
    const missingProductIds: string[] = [];

    for (const pid of productIds) {
      const cached = this.productCache.get(pid);
      if (cached && cached.expiry > now) {
        productMap.set(pid, cached.data);
      } else {
        missingProductIds.push(pid);
      }
    }

    if (missingProductIds.length > 0) {
      const fetched = await this.prisma.product.findMany({
        where: { id: { in: missingProductIds } },
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
      for (const p of fetched) {
        this.productCache.set(p.id, { data: p, expiry: now + 5 * 60 * 1000 });
        productMap.set(p.id, p);
      }
    }

    let subtotalPaise = 0;
    const computedItems: CachedQuote['items'] = [];

    for (const item of dto.items) {
      const product = productMap.get(item.productId);

      if (!product || !product.isActive) {
        throw new NotFoundException(`Product not found or unavailable: ${item.productId}`);
      }

      const isSoldOut = product.availabilities?.[0]?.isSoldOut;
      if (isSoldOut) {
        throw new BadRequestException({
          code: 'ITEM_SOLD_OUT',
          message: `Item "${product.name}" is sold out for the selected date.`,
        });
      }

      let itemUnitPricePaise = product.basePricePaise;
      let variantName: string | undefined = undefined;

      if (item.variantId) {
        const variant = product.variants?.find((v: any) => v.id === item.variantId);
        if (!variant || !variant.isActive) {
          throw new BadRequestException(`Invalid variant for item "${product.name}"`);
        }
        itemUnitPricePaise += variant.priceModifierPaise;
        variantName = variant.name;
      }

      const selectedAddons: Array<{ addonOptionId: string; name: string; pricePaise: number }> = [];
      if (item.selectedAddonOptionIds && item.selectedAddonOptionIds.length > 0) {
        for (const optionId of item.selectedAddonOptionIds) {
          let foundOption: any = null;
          for (const pag of (product.addonGroups || [])) {
            const opt = pag.addonGroup?.options?.find((o: any) => o.id === optionId && o.isActive);
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

    let deliveryFeePaise = zone.deliveryFeePaise || 0;
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

    // 0ms instant save
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
    // 0. Fast In-Memory Idempotency Check (0ms)
    if (idempotencyKey) {
      const cachedResult = this.idempotencyCache.get(idempotencyKey);
      if (cachedResult && cachedResult.expiry > Date.now()) {
        return cachedResult.result;
      }
    }

    const cached = await this.loadQuote(dto.quoteToken);
    if (!cached || cached.expiresAt < new Date()) {
      throw new BadRequestException('Quotation has expired or is invalid. Please review your cart.');
    }

    // Customer Ban / Fraud Protection Check
    const cleanPhone = (dto.customerPhone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone) {
      const customerUser = await this.prisma.user.findUnique({
        where: { phone: cleanPhone },
        select: { id: true, isActive: true, name: true },
      });
      if (customerUser && customerUser.isActive === false) {
        throw new ForbiddenException(
          'Aapka mobile number / account past unfulfilled ya fake order ki wajah se blocked hai. Order place karne ya unblock karwane ke liye Janki Rasoi kitchen support (+91 9755554774) se sampark karein.'
        );
      }
    }

    // 1. Generate guaranteed collision-proof identifiers upfront (0ms, zero DB queries)
    const serviceDateStr = cached.serviceDate.toISOString().slice(0, 10);
    const dateStr = serviceDateStr.replace(/-/g, '');
    const orderSeq = Math.floor(1000 + Math.random() * 9000);
    const entropy = randomBytes(2).toString('hex').toUpperCase();
    const orderNumber = `JR-${dateStr}-${orderSeq}-${entropy}`;
    const trackingToken = 'trk_' + randomBytes(16).toString('hex');
    const orderId = randomUUID();
    const statusEventId = randomUUID();
    const capacityId = randomUUID();

    // 2. Prepare order items & addons with pre-generated UUIDs
    const itemsList: any[] = [];
    const addonsList: any[] = [];

    for (const item of cached.items) {
      const itemId = randomUUID();
      itemsList.push({
        id: itemId,
        productId: item.productId,
        productName: item.productName,
        variantName: item.variantName || null,
        unitPricePaise: item.unitPricePaise,
        quantity: item.quantity,
        totalPricePaise: item.totalPricePaise,
      });

      if (item.addons && item.addons.length > 0) {
        for (const addon of item.addons) {
          addonsList.push({
            id: randomUUID(),
            orderItemId: itemId,
            addonOptionId: addon.addonOptionId,
            name: addon.name,
            pricePaise: addon.pricePaise,
          });
        }
      }
    }

    const deliveryAddressJson = JSON.stringify(dto.deliveryAddress || {});
    const itemsJson = JSON.stringify(itemsList);
    const addonsJson = JSON.stringify(addonsList);
    const deliveryNotes = dto.deliveryNotes ? `'${dto.deliveryNotes.replace(/'/g, "''")}'` : 'NULL';
    const customerEmail = dto.customerEmail ? `'${dto.customerEmail.replace(/'/g, "''")}'` : 'NULL';
    const deliveryZoneId = cached.deliveryZoneId ? `'${cached.deliveryZoneId}'` : 'NULL';
    const customerNameSafe = (dto.customerName || 'Customer').replace(/'/g, "''");
    const customerPhoneSafe = (dto.customerPhone || '').replace(/'/g, "''");
    const idempotencyKeySql = idempotencyKey ? `'${idempotencyKey.replace(/'/g, "''")}'` : 'NULL';

    const orderStatus = dto.paymentMethod === 'COD' ? 'PLACED' : 'AWAITING_PAYMENT';
    const paymentStatus = dto.paymentMethod === 'COD' ? 'AUTHORIZED' : 'PENDING';

    // 3. EXECUTE ENTIRE ORDER CREATION IN 1 SINGLE UNIFIED ATOMIC SQL STATEMENT
    // Writes orders, order_items, order_item_addons, order_status_events, and slot capacity in 1 network roundtrip!
    await this.prisma.$executeRawUnsafe(`
      WITH new_order AS (
        INSERT INTO orders (
          id, order_number, tracking_token, status, payment_method, payment_status,
          service_date, delivery_slot_id, delivery_zone_id, customer_name, customer_phone,
          customer_email, delivery_address, delivery_notes, subtotal_paise, delivery_fee_paise,
          packaging_fee_paise, tax_paise, discount_paise, total_amount_paise, idempotency_key,
          created_at, updated_at
        )
        VALUES (
          '${orderId}', '${orderNumber}', '${trackingToken}', '${orderStatus}'::"OrderStatus", '${dto.paymentMethod}'::"PaymentMethod", '${paymentStatus}'::"PaymentStatus",
          '${serviceDateStr}'::date, '${cached.deliverySlotId}', ${deliveryZoneId}, '${customerNameSafe}', '${customerPhoneSafe}',
          ${customerEmail}, '${deliveryAddressJson.replace(/'/g, "''")}'::jsonb, ${deliveryNotes}, ${cached.subtotalPaise}, ${cached.deliveryFeePaise},
          ${cached.packagingFeePaise}, ${cached.taxPaise}, ${cached.discountPaise}, ${cached.totalAmountPaise}, ${idempotencyKeySql},
          NOW(), NOW()
        )
        RETURNING id
      ),
      ins_items AS (
        INSERT INTO order_items (id, order_id, product_id, product_name, variant_name, unit_price_paise, quantity, total_price_paise)
        SELECT 
          (elem->>'id')::text,
          new_order.id,
          (elem->>'productId')::text,
          (elem->>'productName')::text,
          (elem->>'variantName')::text,
          (elem->>'unitPricePaise')::int,
          (elem->>'quantity')::int,
          (elem->>'totalPricePaise')::int
        FROM new_order, json_array_elements('${itemsJson.replace(/'/g, "''")}'::json) AS elem
      ),
      ins_addons AS (
        INSERT INTO order_item_addons (id, order_item_id, addon_option_id, name, price_paise)
        SELECT 
          (addon->>'id')::text,
          (addon->>'orderItemId')::text,
          (addon->>'addonOptionId')::text,
          (addon->>'name')::text,
          (addon->>'pricePaise')::int
        FROM json_array_elements('${addonsJson.replace(/'/g, "''")}'::json) AS addon
      ),
      ins_status AS (
        INSERT INTO order_status_events (id, order_id, to_status, actor_type, reason, created_at)
        SELECT '${statusEventId}', new_order.id, '${orderStatus}'::"OrderStatus", 'CUSTOMER', 'Fast Checkout Order Placement', NOW()
        FROM new_order
      )
      INSERT INTO delivery_slot_capacities (id, delivery_slot_id, service_date, max_capacity, booked_count)
      VALUES ('${capacityId}', '${cached.deliverySlotId}', '${serviceDateStr}'::date, 35, 1)
      ON CONFLICT (delivery_slot_id, service_date)
      DO UPDATE SET booked_count = delivery_slot_capacities.booked_count + 1;
    `);

    // Invalidate slot capacity cache
    const slotCacheKey = `${cached.deliverySlotId}_${serviceDateStr}`;
    this.slotCache.delete(slotCacheKey);

    let razorpayOrderId: string | undefined = undefined;

    if (dto.paymentMethod === 'RAZORPAY') {
      if (!this.razorpayClient) {
        throw new BadRequestException('Razorpay payment gateway is not initialized on the server.');
      }
      try {
        const rzpOrder = await this.razorpayClient.orders.create({
          amount: cached.totalAmountPaise,
          currency: 'INR',
          receipt: orderId,
          notes: {
            orderNumber,
            customerPhone: dto.customerPhone,
          },
        });
        razorpayOrderId = rzpOrder.id;

        await this.prisma.paymentAttempt.create({
          data: {
            orderId,
            provider: 'RAZORPAY',
            providerOrderId: razorpayOrderId,
            amountPaise: cached.totalAmountPaise,
            currency: 'INR',
            status: 'PENDING',
          },
        });
      } catch (err) {
        this.logger.error(`Razorpay order creation failed: ${(err as Error).message}`);
        throw new BadRequestException(`Payment gateway error: ${(err as Error).message}`);
      }
    }

    const orderResult = {
      orderId,
      orderNumber,
      status: orderStatus,
      trackingToken,
      trackingUrl: `https://jankirasoi.in/orders/track/${trackingToken}`,
      payment: {
        method: dto.paymentMethod,
        amountPaise: cached.totalAmountPaise,
        currency: 'INR',
        razorpayOrderId,
        razorpayKeyId: this.configService.get<string>('RAZORPAY_KEY_ID') || undefined,
      },
    };

    // Cache idempotency for 10 minutes
    if (idempotencyKey) {
      this.idempotencyCache.set(idempotencyKey, {
        result: orderResult,
        expiry: Date.now() + 10 * 60 * 1000,
      });
    }

    // Expire quote in memory immediately
    this.expireQuote(dto.quoteToken);

    // Asynchronous non-blocking outbox notification
    setImmediate(async () => {
      try {
        await this.prisma.outboxMessage.create({
          data: {
            eventType: 'ORDER_CREATED',
            payload: { orderId, orderNumber, phone: dto.customerPhone },
            status: 'PENDING',
          },
        });
      } catch {}
    });

    // Real-time instant notification to kitchen admin console
    this.ordersEventsService.emitOrderEvent('ORDER_CREATED', {
      orderId,
      orderNumber,
      status: orderStatus,
    });

    return orderResult;
  }
}
