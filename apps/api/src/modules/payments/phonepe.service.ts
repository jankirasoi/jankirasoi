import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'crypto';

export interface InitiatePhonePePaymentParams {
  orderNumber: string;
  attemptNumber: number;
  amountPaise: number;
  customerPhone: string;
  trackingToken: string;
}

export interface PhonePeInitiateResult {
  redirectUrl: string;
  merchantTransactionId: string;
}

@Injectable()
export class PhonePeService {
  private readonly logger = new Logger(PhonePeService.name);
  private readonly isProd: boolean;
  private readonly merchantId: string;
  private readonly saltKey: string;
  private readonly saltIndex: string;
  private readonly hostUrl: string;
  private readonly callbackHost: string;

  constructor(private readonly configService: ConfigService) {
    const env = this.configService.get<string>('PHONEPE_ENV', 'UAT');
    this.isProd = env.toUpperCase() === 'PROD';
    this.merchantId = this.configService.get<string>('PHONEPE_MERCHANT_ID', 'PGTESTPAYUAT');
    this.saltKey = this.configService.get<string>(
      'PHONEPE_SALT_KEY',
      '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399',
    );
    this.saltIndex = this.configService.get<string>('PHONEPE_SALT_INDEX', '1');
    this.callbackHost = this.configService.get<string>(
      'PHONEPE_CALLBACK_HOST',
      'https://jankirasoi.in',
    );

    this.hostUrl = this.isProd
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  /**
   * Generates SHA-256 checksum with salt index suffix
   */
  private generateChecksum(concatenatedString: string): string {
    const hash = createHash('sha256').update(concatenatedString).digest('hex');
    return `${hash}###${this.saltIndex}`;
  }

  /**
   * Verifies PhonePe S2S Webhook Checksum securely using constant-time comparison
   */
  verifyWebhookChecksum(rawBase64Response: string, receivedXVerify: string): boolean {
    if (!rawBase64Response || !receivedXVerify) return false;

    const expectedChecksum = this.generateChecksum(rawBase64Response + this.saltKey);

    try {
      const expectedBuffer = Buffer.from(expectedChecksum, 'utf8');
      const receivedBuffer = Buffer.from(receivedXVerify, 'utf8');
      if (expectedBuffer.length !== receivedBuffer.length) return false;
      return timingSafeEqual(expectedBuffer, receivedBuffer);
    } catch {
      return false;
    }
  }

  /**
   * 1. Initiates Pay Page Checkout with PhonePe
   */
  async initiatePayment(params: InitiatePhonePePaymentParams): Promise<PhonePeInitiateResult> {
    // Generate unique transaction ID for each attempt to avoid duplicate ID errors on retry
    const merchantTransactionId = `${params.orderNumber}-P${params.attemptNumber}`;
    const cleanPhone = (params.customerPhone || '').replace(/\D/g, '').slice(-10);

    const payload = {
      merchantId: this.merchantId,
      merchantTransactionId,
      merchantUserId: `CUST_${cleanPhone || 'GUEST'}`,
      amount: params.amountPaise,
      redirectUrl: `${this.callbackHost}/api/v1/payments/phonepe/return?token=${params.trackingToken}&orderNumber=${params.orderNumber}&txnId=${merchantTransactionId}`,
      redirectMode: 'REDIRECT',
      callbackUrl: `${this.callbackHost}/api/v1/webhooks/phonepe`,
      mobileNumber: cleanPhone,
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const checksum = this.generateChecksum(base64Payload + '/pg/v1/pay' + this.saltKey);

    const endpoint = `${this.hostUrl}/pg/v1/pay`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          accept: 'application/json',
        },
        body: JSON.stringify({ request: base64Payload }),
      });

      const body = await response.json();

      if (!response.ok || !body.success) {
        this.logger.error(`PhonePe pay initiation failed: ${JSON.stringify(body)}`);
        throw new BadRequestException(
          body.message || 'Unable to initiate PhonePe payment session.',
        );
      }

      const redirectUrl = body.data?.instrumentResponse?.redirectInfo?.url;
      if (!redirectUrl) {
        throw new InternalServerErrorException(
          'PhonePe response missing payment redirect URL.',
        );
      }

      return {
        redirectUrl,
        merchantTransactionId,
      };
    } catch (err: any) {
      this.logger.error(`Error connecting to PhonePe: ${err.message}`);
      throw new BadRequestException(
        err.message || 'Payment gateway connection error. Please try again.',
      );
    }
  }

  /**
   * 2. Checks transaction status with PhonePe server-to-server
   */
  async checkTransactionStatus(merchantTransactionId: string) {
    const path = `/pg/v1/status/${this.merchantId}/${merchantTransactionId}`;
    const checksum = this.generateChecksum(path + this.saltKey);
    const endpoint = `${this.hostUrl}${path}`;

    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': checksum,
          'X-MERCHANT-ID': this.merchantId,
          accept: 'application/json',
        },
      });

      return await response.json();
    } catch (err: any) {
      this.logger.error(`PhonePe status check error: ${err.message}`);
      throw new InternalServerErrorException('Failed to check transaction status with PhonePe.');
    }
  }

  /**
   * 3. Executes Full or Partial Refund via PhonePe
   */
  async initiateRefund(params: {
    refundTransactionId: string;
    originalTransactionId: string;
    amountPaise: number;
    reason: string;
  }) {
    const refundHost = this.isProd
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    const path = '/v3/credit/backToSource';
    const payload = {
      merchantId: this.merchantId,
      merchantTransactionId: params.refundTransactionId,
      originalTransactionId: params.originalTransactionId,
      amount: params.amountPaise,
      callbackUrl: `${this.callbackHost}/api/v1/webhooks/phonepe/refund`,
      message: params.reason.slice(0, 100),
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const checksum = this.generateChecksum(base64Payload + path + this.saltKey);

    const response = await fetch(`${refundHost}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        accept: 'application/json',
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    return await response.json();
  }

  /**
   * 4. Checks status of an in-flight refund
   */
  async checkRefundStatus(merchantRefundTransactionId: string) {
    const refundHost = this.isProd
      ? 'https://api.phonepe.com/apis/pg'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';

    const path = `/v3/status/${this.merchantId}/${merchantRefundTransactionId}`;
    const checksum = this.generateChecksum(path + this.saltKey);

    const response = await fetch(`${refundHost}${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
        accept: 'application/json',
      },
    });

    return await response.json();
  }
}
