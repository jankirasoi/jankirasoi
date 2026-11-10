import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { VerifyPaymentDto, RefundOrderDto } from './dto/payments.dto';
import { PhonePeService } from './phonepe.service';
const Razorpay = require('razorpay');

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpayClient: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly outboxService: OutboxService,
    private readonly configService: ConfigService,
    private readonly phonePeService: PhonePeService,
  ) {
    const key_id = this.configService.get<string>('RAZORPAY_KEY_ID');
    const key_secret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    if (key_id && key_secret) {
      this.razorpayClient = new Razorpay({ key_id, key_secret });
    }
  }

  async verifyPayment(dto: VerifyPaymentDto) {
    const secret = this.configService.get<string>('RAZORPAY_KEY_SECRET');
    if (!secret) {
      throw new BadRequestException('RAZORPAY_KEY_SECRET is not configured on the server.');
    }

    const generatedSignature = createHmac('sha256', secret)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== dto.razorpaySignature) {
      throw new BadRequestException({
        code: 'PAYMENT_SIGNATURE_MISMATCH',
        message: 'Razorpay cryptographic payment signature verification failed.',
      });
    }

    // Atomically update Order and PaymentAttempt
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: dto.orderId },
      });
      if (!order) throw new NotFoundException('Order not found');

      // Idempotency guard: If payment already captured, return success without duplicate writes/SMS
      if (order.paymentStatus === 'CAPTURED') {
        return {
          verified: true,
          orderId: order.id,
          status: order.status,
          message: 'Payment already verified and order confirmed.',
        };
      }

      // Update payment attempt
      await tx.paymentAttempt.updateMany({
        where: { orderId: dto.orderId, providerOrderId: dto.razorpayOrderId },
        data: {
          providerPaymentId: dto.razorpayPaymentId,
          status: 'CAPTURED',
          signatureVerified: true,
        },
      });

      // Update Order Status
      const updatedOrder = await tx.order.update({
        where: { id: dto.orderId },
        data: {
          status: 'PLACED',
          paymentStatus: 'CAPTURED',
        },
      });

      await tx.orderStatusEvent.create({
        data: {
          orderId: dto.orderId,
          fromStatus: order.status,
          toStatus: 'PLACED',
          actorType: 'SYSTEM',
          reason: `Payment verified via Razorpay [${dto.razorpayPaymentId}]`,
        },
      });

      // Enqueue notification outbox
      await this.outboxService.enqueue(
        'PAYMENT_CONFIRMED',
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          phone: order.customerPhone,
          amountPaise: order.totalAmountPaise,
        },
        tx,
      );

      return {
        verified: true,
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        message: 'Payment verified and order successfully confirmed.',
      };
    });
  }

  async handleRazorpayWebhook(rawBody: string, signature: string, payload: any) {
    const secret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (secret) {
      const expectedSignature = createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        throw new BadRequestException('Webhook signature verification failed');
      }
    }

    const eventId = payload.event_id || payload.id || `evt_${Date.now()}`;
    const eventType = payload.event;

    // Deduplicate event via PaymentEvent table
    const existing = await this.prisma.paymentEvent.findUnique({
      where: { providerEventId: eventId },
    });
    if (existing) {
      this.logger.log(`Ignoring duplicate webhook event: ${eventId}`);
      return { status: 'ignored_duplicate' };
    }

    await this.prisma.paymentEvent.create({
      data: {
        providerEventId: eventId,
        eventType,
        payload,
      },
    });

    if (eventType === 'payment.captured') {
      const payment = payload.payload?.payment?.entity;
      const rzpOrderId = payment?.order_id;
      if (rzpOrderId) {
        const attempt = await this.prisma.paymentAttempt.findFirst({
          where: { providerOrderId: rzpOrderId },
          include: { order: true },
        });
        if (attempt && attempt.order && attempt.order.paymentStatus !== 'CAPTURED') {
          await this.prisma.$transaction(async (tx) => {
            await tx.order.update({
              where: { id: attempt.orderId },
              data: { status: 'PLACED', paymentStatus: 'CAPTURED' },
            });
            await tx.paymentAttempt.update({
              where: { id: attempt.id },
              data: {
                status: 'CAPTURED',
                providerPaymentId: payment?.id || attempt.providerPaymentId,
                signatureVerified: true,
              },
            });
            await tx.orderStatusEvent.create({
              data: {
                orderId: attempt.orderId,
                fromStatus: attempt.order.status,
                toStatus: 'PLACED',
                actorType: 'SYSTEM',
                reason: `Payment verified via webhook [${payment?.id || 'event'}]`,
              },
            });
          });
        }
      }
    }
    return { status: 'ok' };
  }

  async handlePhonePeWebhookPayload(decoded: any) {
    const data = decoded?.data;
    const merchantTransactionId = data?.merchantTransactionId;
    const phonepeTransactionId = data?.transactionId;
    const amount = data?.amount;
    const code = decoded?.code;
    const state = data?.state;

    if (!merchantTransactionId) {
      throw new BadRequestException('Missing merchantTransactionId in webhook payload');
    }

    // Event deduplication via providerEventId
    const eventId = `phonepe_${phonepeTransactionId || merchantTransactionId}_${Date.now()}`;
    const existing = await this.prisma.paymentEvent.findFirst({
      where: { providerEventId: { startsWith: `phonepe_${phonepeTransactionId || merchantTransactionId}` } },
    });
    if (existing) {
      this.logger.log(`Ignoring duplicate PhonePe webhook event for ${merchantTransactionId}`);
      return { status: 'already_processed', success: true };
    }

    await this.prisma.paymentEvent.create({
      data: {
        providerEventId: eventId,
        eventType: code || 'PHONEPE_WEBHOOK',
        payload: decoded,
      },
    }).catch(() => {});

    // Lookup payment attempt
    const paymentAttempt = await this.prisma.paymentAttempt.findFirst({
      where: { providerOrderId: merchantTransactionId },
      include: { order: true },
    });

    let order = paymentAttempt?.order;
    if (!order) {
      const baseOrderNumber = merchantTransactionId.split('-P')[0];
      order = await this.prisma.order.findFirst({
        where: { orderNumber: baseOrderNumber },
      });
    }

    if (!order) {
      this.logger.error(`Order not found for PhonePe transaction ${merchantTransactionId}`);
      throw new NotFoundException(`Order not found for transaction ${merchantTransactionId}`);
    }

    // Idempotency: if already CAPTURED, return 200 immediately
    if (order.paymentStatus === 'CAPTURED') {
      return { status: 'already_captured', success: true };
    }

    // Amount verification guard against tampering
    if (typeof amount === 'number' && amount !== order.totalAmountPaise) {
      this.logger.error(`Amount tampering detected for ${order.orderNumber}: expected ${order.totalAmountPaise}, got ${amount}`);
      throw new BadRequestException('Amount tampering detected');
    }

    const isSuccess = code === 'PAYMENT_SUCCESS' || state === 'COMPLETED';

    if (isSuccess) {
      return this.prisma.$transaction(async (tx) => {
        if (paymentAttempt) {
          await tx.paymentAttempt.update({
            where: { id: paymentAttempt.id },
            data: {
              status: 'CAPTURED',
              providerPaymentId: phonepeTransactionId,
              signatureVerified: true,
            },
          });
        }

        const updatedOrder = await tx.order.update({
          where: { id: order!.id },
          data: {
            status: 'PLACED',
            paymentStatus: 'CAPTURED',
          },
        });

        await tx.orderStatusEvent.create({
          data: {
            orderId: order!.id,
            fromStatus: order!.status,
            toStatus: 'PLACED',
            actorType: 'SYSTEM',
            reason: `Payment verified via PhonePe [${phonepeTransactionId || merchantTransactionId}]`,
          },
        });

        await this.outboxService.enqueue(
          'PAYMENT_CONFIRMED',
          {
            orderId: order!.id,
            orderNumber: order!.orderNumber,
            phone: order!.customerPhone,
            amountPaise: order!.totalAmountPaise,
          },
          tx,
        );

        return { success: true, status: 'confirmed', orderNumber: updatedOrder.orderNumber };
      });
    } else {
      if (paymentAttempt) {
        await this.prisma.paymentAttempt.update({
          where: { id: paymentAttempt.id },
          data: {
            status: 'FAILED',
            providerPaymentId: phonepeTransactionId,
          },
        }).catch(() => {});
      }

      await this.prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'FAILED' },
      }).catch(() => {});

      return { success: false, status: 'failed', code };
    }
  }

  async reconcilePhonePeOrder(merchantTransactionId: string) {
    const statusRes = await this.phonePeService.checkTransactionStatus(merchantTransactionId);
    if (!statusRes) return null;

    if (statusRes.code === 'PAYMENT_SUCCESS' || statusRes.data?.state === 'COMPLETED') {
      return this.handlePhonePeWebhookPayload(statusRes);
    }
    return statusRes;
  }

  async processRefund(orderId: string, dto: RefundOrderDto, adminId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { paymentAttempts: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const paymentAttempt = order.paymentAttempts.find((p) => p.status === 'CAPTURED');
    if (!paymentAttempt && (order.paymentMethod === 'RAZORPAY' || order.paymentMethod === 'PHONEPE')) {
      throw new BadRequestException('Cannot refund order without captured online payment');
    }

    let providerRefundId: string;
    if (order.paymentMethod === 'PHONEPE') {
      if (!paymentAttempt?.providerPaymentId) {
        throw new BadRequestException('Cannot process PhonePe refund: missing captured payment ID');
      }
      try {
        const refundTxnId = `REF_${order.orderNumber}_${Date.now()}`;
        const phonePeRefund = await this.phonePeService.initiateRefund({
          refundTransactionId: refundTxnId,
          originalTransactionId: paymentAttempt.providerPaymentId,
          amountPaise: dto.amountPaise,
          reason: dto.reason,
        });

        if (!phonePeRefund.success && phonePeRefund.code !== 'PAYMENT_PENDING') {
          throw new Error(phonePeRefund.message || 'PhonePe refund rejected');
        }
        providerRefundId = phonePeRefund.data?.transactionId || refundTxnId;
      } catch (err) {
        this.logger.error(`PhonePe refund failed: ${(err as Error).message}`);
        throw new BadRequestException(`PhonePe refund failed: ${(err as Error).message}`);
      }
    } else if (order.paymentMethod === 'RAZORPAY') {
      if (!this.razorpayClient || !paymentAttempt?.providerPaymentId) {
        throw new BadRequestException('Cannot process Razorpay refund: gateway not initialized or missing payment ID');
      }
      try {
        const rzpRefund = await this.razorpayClient.payments.refund(paymentAttempt.providerPaymentId, {
          amount: dto.amountPaise,
          notes: { reason: dto.reason },
        });
        providerRefundId = rzpRefund.id;
      } catch (err) {
        this.logger.error(`Razorpay refund failed: ${(err as Error).message}`);
        throw new BadRequestException(`Provider refund failed: ${(err as Error).message}`);
      }
    } else {
      providerRefundId = 'COD_REFUND_' + Date.now();
    }

    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          orderId,
          providerRefundId,
          amountPaise: dto.amountPaise,
          reason: dto.reason,
          status: 'COMPLETED',
          initiatedBy: adminId || 'ADMIN',
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'REFUNDED',
          status: 'CANCELLED',
        },
      });

      await this.auditService.log({
        actorId: adminId,
        actorRole: 'ADMIN',
        action: 'ORDER_REFUNDED',
        entity: 'Order',
        entityId: orderId,
        newValue: { amountPaise: dto.amountPaise, providerRefundId },
        reason: dto.reason,
      });

      return refund;
    });
  }
}
