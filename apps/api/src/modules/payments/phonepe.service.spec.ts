import { ConfigService } from '@nestjs/config';
import { PhonePeService } from './phonepe.service';
import { createHash } from 'crypto';

describe('PhonePeService Unit & Integration Tests', () => {
  let service: PhonePeService;
  let configService: ConfigService;

  const mockMerchantId = 'PGTESTPAYUAT';
  const mockSaltKey = '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399';
  const mockSaltIndex = '1';

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'PHONEPE_MERCHANT_ID') return mockMerchantId;
        if (key === 'PHONEPE_SALT_KEY') return mockSaltKey;
        if (key === 'PHONEPE_SALT_INDEX') return mockSaltIndex;
        if (key === 'PHONEPE_ENV') return 'UAT';
        if (key === 'APP_URL') return 'https://jankirasoi.in';
        if (key === 'API_URL') return 'https://api.jankirasoi.in';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new PhonePeService(configService);
  });

  describe('Checksum & Signature Validation', () => {
    it('should successfully verify a valid PhonePe webhook checksum', () => {
      const mockPayload = {
        success: true,
        code: 'PAYMENT_SUCCESS',
        message: 'Payment completed',
        data: {
          merchantId: mockMerchantId,
          merchantTransactionId: 'JR-20261110-0001-P1',
          transactionId: 'T2611102230001',
          amount: 25000,
          state: 'COMPLETED',
          responseCode: 'SUCCESS',
        },
      };

      const base64Response = Buffer.from(JSON.stringify(mockPayload)).toString('base64');
      const expectedHash = createHash('sha256')
        .update(base64Response + mockSaltKey)
        .digest('hex');
      const validXVerify = `${expectedHash}###${mockSaltIndex}`;

      const isValid = service.verifyWebhookChecksum(base64Response, validXVerify);
      expect(isValid).toBe(true);
    });

    it('should reject a tampered or forged webhook payload', () => {
      const originalPayload = {
        success: true,
        code: 'PAYMENT_SUCCESS',
        data: { amount: 25000 },
      };
      const base64Original = Buffer.from(JSON.stringify(originalPayload)).toString('base64');
      const validHash = createHash('sha256')
        .update(base64Original + mockSaltKey)
        .digest('hex');
      const validXVerify = `${validHash}###${mockSaltIndex}`;

      // Tampered payload with different amount
      const tamperedPayload = {
        success: true,
        code: 'PAYMENT_SUCCESS',
        data: { amount: 100 },
      };
      const base64Tampered = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64');

      const isValid = service.verifyWebhookChecksum(base64Tampered, validXVerify);
      expect(isValid).toBe(false);
    });

    it('should reject a signature with incorrect salt index or malformed header', () => {
      const base64Response = Buffer.from(JSON.stringify({ test: true })).toString('base64');
      const hash = createHash('sha256')
        .update(base64Response + mockSaltKey)
        .digest('hex');

      // Wrong salt index
      expect(service.verifyWebhookChecksum(base64Response, `${hash}###2`)).toBe(false);
      // Malformed header without ###
      expect(service.verifyWebhookChecksum(base64Response, hash)).toBe(false);
      // Completely empty header
      expect(service.verifyWebhookChecksum(base64Response, '')).toBe(false);
    });
  });

  describe('Payment Initiation Formatting', () => {
    it('should format transaction ID as {orderNumber}-P{attemptNumber} to maintain gateway uniqueness', async () => {
      // Mock global fetch to return success
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          code: 'PAYMENT_INITIATED',
          message: 'Payment initiated',
          data: {
            merchantId: mockMerchantId,
            merchantTransactionId: 'JR-20261110-0042-P1',
            instrumentResponse: {
              type: 'PAY_PAGE',
              redirectInfo: {
                url: 'https://mercury-uat.phonepe.com/transact/pg?token=mock_token_123',
                method: 'REDIRECT',
              },
            },
          },
        }),
      } as any);

      const res = await service.initiatePayment({
        orderNumber: 'JR-20261110-0042',
        attemptNumber: 1,
        amountPaise: 39900,
        customerPhone: '9876543210',
        trackingToken: 'trk_sample_token',
      });

      expect(res.merchantTransactionId).toBe('JR-20261110-0042-P1');
      expect(res.redirectUrl).toBe('https://mercury-uat.phonepe.com/transact/pg?token=mock_token_123');

      // Verify request payload sent to PhonePe
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const decodedInner = JSON.parse(Buffer.from(requestBody.request, 'base64').toString('utf8'));

      expect(decodedInner.merchantId).toBe(mockMerchantId);
      expect(decodedInner.merchantTransactionId).toBe('JR-20261110-0042-P1');
      expect(decodedInner.amount).toBe(39900);
      expect(decodedInner.paymentInstrument.type).toBe('PAY_PAGE');
      expect(decodedInner.redirectMode).toBe('REDIRECT');
    });
  });

  describe('Refund Initiation Formatting', () => {
    it('should format refund requests with unique merchant refund ID and call correct backToSource endpoint', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          code: 'PAYMENT_PENDING',
          message: 'Refund is initiated',
          data: {
            merchantId: mockMerchantId,
            merchantTransactionId: 'REF-JR-20261110-0042-1731234567890',
            transactionId: 'RF2611102235999',
            amount: 39900,
            state: 'PENDING',
          },
        }),
      } as any);

      const refundRes = await service.initiateRefund({
        refundTransactionId: 'REF-JR-20261110-0042-1731234567890',
        originalTransactionId: 'T2611102230001',
        amountPaise: 39900,
        reason: 'Customer requested cancellation',
      });

      expect(refundRes.success).toBe(true);
      expect(refundRes.code).toBe('PAYMENT_PENDING');
      expect(refundRes.data.transactionId).toBe('RF2611102235999');

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const endpoint = fetchCall[0];
      expect(endpoint).toContain('/v3/credit/backToSource');
    });
  });
});
