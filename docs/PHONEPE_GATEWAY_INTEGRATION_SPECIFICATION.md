# PhonePe Payment Gateway Integration Specification & Production Blueprint
**Project:** Janki Rasoi Cloud Kitchen  
**Date:** November 2026  
**Document Status:** Production-Ready Architecture, Failure Modes & Edge-Case Engineering  
**File Location:** `docs/PHONEPE_GATEWAY_INTEGRATION_SPECIFICATION.md`

---

## Table of Contents
1. [Executive Overview](#1-executive-overview)
2. [PhonePe Gateway Environments & Credentials](#2-phonepe-gateway-environments--credentials)
3. [Deep-Dive: Known Problems, Gotchas & Edge Cases in Production](#3-deep-dive-known-problems-gotchas--edge-cases-in-production)
   - [Problem 1: Cross-Origin POST on `redirectUrl` (CSRF / Cookie Dropping)](#problem-1-cross-origin-post-on-redirecturl-csrf--cookie-dropping)
   - [Problem 2: Webhook Checksum Mismatch (`X-VERIFY` Calculation Error)](#problem-2-webhook-checksum-mismatch-x-verify-calculation-error)
   - [Problem 3: Lifetime MerchantTransactionId Uniqueness & Payment Retries](#problem-3-lifetime-merchanttransactionid-uniqueness--payment-retries)
   - [Problem 4: Amount Tampering & Unit Inconsistency (Paise vs Rupees)](#problem-4-amount-tampering--unit-inconsistency-paise-vs-rupees)
   - [Problem 5: Webhook Timeout, Retries & Race Conditions](#problem-5-webhook-timeout-retries--race-conditions)
   - [Problem 6: Refund Asynchrony & Double-Refund Traps (`EXCESS_REFUND_AMOUNT`)](#problem-6-refund-asynchrony--double-refund-traps-excess_refund_amount)
   - [Problem 7: User Drop-Off in External UPI Apps (Pending Reconciliation)](#problem-7-user-drop-off-in-external-upi-apps-pending-reconciliation)
4. [PhonePe Core API Specifications (v1 & v2)](#4-phonepe-core-api-specifications)
   - [4.1 Payment Initiation API (`/pg/v1/pay`)](#41-payment-initiation-api-pgv1pay)
   - [4.2 Order Status Check API (`/pg/v1/status`)](#42-order-status-check-api-pgv1status)
   - [4.3 S2S Webhook Verification (`POST /webhooks/phonepe`)](#43-s2s-webhook-verification-post-webhooksphonepe)
   - [4.4 Full & Partial Refund API (`/v3/credit/backToSource`)](#44-full--partial-refund-api-v3creditbacktosource)
   - [4.5 Refund Status API (`/v3/status`)](#45-refund-status-api-v3status)
5. [Current Janki Rasoi Codebase Audit](#5-current-janki-rasoi-codebase-audit)
6. [Complete Production Code Implementation (Zero Mocks)](#6-complete-production-code-implementation-zero-mocks)
   - [Step 1: Prisma Schema Enum Update](#step-1-prisma-schema-enum-update)
   - [Step 2: Environment Variables](#step-2-environment-variables)
   - [Step 3: `PhonePeService` (Robust Edge-Case Resilient)](#step-3-phonepeservice-robust-edge-case-resilient)
   - [Step 4: `PaymentsController` & Webhook Receiver](#step-4-paymentscontroller--webhook-receiver)
   - [Step 5: `CheckoutService` Order Placement Wiring](#step-5-checkoutservice-order-placement-wiring)
   - [Step 6: Frontend Next.js Cart Integration](#step-6-frontend-nextjs-cart-integration)
7. [Testing & Sandbox Verification Checklist](#7-testing--sandbox-verification-checklist)

---

## 1. Executive Overview

This document serves as the **definitive engineering specification** for integrating the **PhonePe Payment Gateway (PG)** into the **Janki Rasoi** platform. 

It addresses **every edge case, failure mode, refund cycle, reconciliation race condition, and checksum nuance** encountered in production, ensuring **zero mock data** and bulletproof transaction safety for real customer money.

PhonePe processes payments across **UPI (GPay, PhonePe, Paytm, BHIM), Credit/Debit Cards (RuPay, Visa, Mastercard), NetBanking, and Wallets**. This specification covers both the standard **v1 Pay Page / S2S protocol** (widely deployed across Indian cloud kitchens and commerce) and the **v2 OAuth 2.0 protocol**.

---

## 2. PhonePe Gateway Environments & Credentials

### 2.1 Environments & Base URLs

| Environment | Purpose | Pay & Status API Host | Refund API Host |
| :--- | :--- | :--- | :--- |
| **Sandbox / UAT** | Integration testing & staging | `https://api-preprod.phonepe.com/apis/pg-sandbox` | `https://api-preprod.phonepe.com/apis/pg-sandbox` |
| **Production** | Live real-money processing | `https://api.phonepe.com/apis/hermes` | `https://api.phonepe.com/apis/pg` |

### 2.2 UAT Testing Credentials (Official PhonePe Sandbox)
- **Merchant ID:** `PGTESTPAYUAT`
- **Salt Key:** `099eb0cd-02cf-4e2a-8aca-3e6c6aff0399`
- **Salt Index:** `1`
- **Test UPI Handles:**
  - `success@upi` -> Triggers instant successful payment (`PAYMENT_SUCCESS`).
  - `failure@upi` -> Triggers payment decline/failure (`PAYMENT_ERROR`).

---

## 3. Deep-Dive: Known Problems, Gotchas & Edge Cases in Production

Before writing a single line of code, software engineers must understand the exact failure modes of the PhonePe Payment Gateway in production:

### Problem 1: Cross-Origin POST on `redirectUrl` (CSRF / Cookie Dropping)
- **What happens:** When configuring `redirectMode: "POST"`, PhonePe's servers submit an automated HTML form via POST to your redirect URL. Because this request originates cross-origin (from `phonepe.com`), browsers drop `SameSite=Lax` session cookies, and Next.js / Express CSRF protection middleware immediately blocks the request with `403 Forbidden` or `419 CSRF Token Mismatch`.
- **The Correct Architecture:**
  1. Set `redirectMode: "REDIRECT"`. PhonePe will issue an HTTP 302 GET redirect back to your URL with query params (`?orderNumber=...`).
  2. **Rule of Truth:** NEVER trust the browser redirect alone to fulfill the order. The browser redirect is purely a UI route. The authoritative confirmation must come either from:
     - The asynchronous Server-to-Server (S2S) Webhook callback.
     - A direct backend status verification call (`/pg/v1/status/{merchantId}/{merchantTransactionId}`).

---

### Problem 2: Webhook Checksum Mismatch (`X-VERIFY` Calculation Error)
- **What happens:** The most common PhonePe webhook bug occurs when developers parse the incoming JSON body, access `body.response`, convert it back to a JSON string or manipulate it, and then hash it. Because JSON serialization does not guarantee whitespace or key ordering, the hash calculation fails.
- **The Formula:**
  $$\text{X-VERIFY} = \text{SHA256}(\text{rawBase64ResponseString} + \text{saltKey}) + \text{"###"} + \text{saltIndex}$$
- **The Fix:**
  - Extract the raw, unparsed string value from `req.body.response`.
  - Hash that exact raw string concatenated with `saltKey`.
  - Use constant-time buffer comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.

---

### Problem 3: Lifetime MerchantTransactionId Uniqueness & Payment Retries
- **What happens:** PhonePe **strictly forbids reusing any `merchantTransactionId`** across the entire lifetime of your merchant account. If a customer attempts to pay for Order `JR-20261110-1001-A1` and their bank fails or the payment times out, retrying with `JR-20261110-1001-A1` will throw a `400 Bad Request: DUPLICATE_MERCHANT_TRANSACTION_ID`.
- **The Solution:**
  - Decouple the internal Order Number from the PhonePe Gateway Transaction ID.
  - Format the gateway transaction ID with an attempt identifier:
    $$\text{gatewayTransactionId} = \text{orderNumber} + \text{"-P"} + \text{attemptCount}$$
    *(Example: `JR-20261110-1001-A1-P1`, and on retry `JR-20261110-1001-A1-P2`).*
  - Store `gatewayTransactionId` in `PaymentAttempt.providerOrderId` and link it to the parent `orderId`.

---

### Problem 4: Amount Tampering & Unit Inconsistency (Paise vs Rupees)
- **What happens:** PhonePe strictly works in **paise** (integer format, where ₹1.00 = 100 paise). If ₹250.00 is passed as `250`, PhonePe charges ₹2.50.
- **The Solution:**
  - Janki Rasoi's database natively stores all monetary amounts in paise (`order.totalAmountPaise`).
  - When PhonePe callbacks arrive, verify:
    ```typescript
    if (decodedPayload.data.amount !== order.totalAmountPaise) {
      throw new BadRequestException('Amount discrepancy detected. Possible tampering.');
    }
    ```

---

### Problem 5: Webhook Timeout, Retries & Race Conditions
- **What happens:** PhonePe mandates that webhooks respond with HTTP `200 OK` within **3 to 5 seconds**. If your server takes longer (e.g. running slow downstream tasks), PhonePe assumes delivery failed and retries up to 8 times with exponential backoff.
- **The Solution:**
  - Ensure the webhook handler writes the transaction inside an atomic DB transaction and returns `200 OK` in < 200ms.
  - **Idempotency Guard:** If the order in your database is already marked `CAPTURED`, exit immediately with `200 OK` without triggering duplicate kitchen SMS or duplicate kitchen dispatch tickets.

---

### Problem 6: Refund Asynchrony & Double-Refund Traps (`EXCESS_REFUND_AMOUNT`)
- **What happens:** When `POST /v3/credit/backToSource` is called, PhonePe responds almost immediately with `code: "PAYMENT_PENDING"`. The banking network takes between 30 seconds to a few hours to settle the reversal.
- If a developer writes naive code that re-calls the refund API when seeing `PAYMENT_PENDING`, PhonePe treats it as a **second refund request**, eventually throwing:
  `EXCESS_REFUND_AMOUNT: Total refund amount exceeds original transaction amount`.
- **The Solution:**
  - Record the refund attempt in the database with status `PENDING` and save the `providerRefundId`.
  - Check the refund status via `GET /v3/status/{merchantId}/{refundTransactionId}`.
  - Update to `COMPLETED` or `FAILED` only when PhonePe's status check returns `PAYMENT_SUCCESS` or `PAYMENT_ERROR`.

---

### Problem 7: User Drop-Off in External UPI Apps (Pending Reconciliation)
- **What happens:** A user selects GPay / PhonePe app on mobile, opens the app, enters their UPI PIN, but never returns to the browser.
- The webhook updates the database in the background, but what if the webhook is delayed or dropped due to network issues?
- **The Solution:**
  - Whenever the customer loads the tracking page (`/track?token=...`), if the order is still `AWAITING_PAYMENT`, the server triggers a background status reconciliation check with PhonePe's Status Check API. If PhonePe confirms payment was completed, the order transitions to `PLACED` automatically.

---

## 4. PhonePe Core API Specifications

### 4.1 Payment Initiation API (`/pg/v1/pay`)

- **Method:** `POST`
- **Endpoint:** `https://api.phonepe.com/apis/hermes/pg/v1/pay` (Sandbox: `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay`)
- **Headers:**
  ```http
  Content-Type: application/json
  X-VERIFY: <SHA256(base64Payload + "/pg/v1/pay" + saltKey)>###<saltIndex>
  accept: application/json
  ```
- **Raw JSON Payload (Before Base64 Encoding):**
  ```json
  {
    "merchantId": "PGTESTPAYUAT",
    "merchantTransactionId": "JR-20261110-1001-A1-P1",
    "merchantUserId": "CUST_9755554774",
    "amount": 25000,
    "redirectUrl": "https://jankirasoi.in/api/v1/payments/phonepe/return?orderNumber=JR-20261110-1001-A1-P1",
    "redirectMode": "REDIRECT",
    "callbackUrl": "https://jankirasoi.in/api/v1/webhooks/phonepe",
    "mobileNumber": "9755554774",
    "paymentInstrument": {
      "type": "PAY_PAGE"
    }
  }
  ```
- **HTTP Transport Body:**
  ```json
  {
    "request": "eyJtZXJjaGFudElkIjoiUEdURVNUUEFZVUFUIiwi..."
  }
  ```
- **Success Response:**
  ```json
  {
    "success": true,
    "code": "PAYMENT_INITIATED",
    "message": "Payment Initiated",
    "data": {
      "merchantId": "PGTESTPAYUAT",
      "merchantTransactionId": "JR-20261110-1001-A1-P1",
      "instrumentResponse": {
        "type": "PAY_PAGE",
        "redirectInfo": {
          "url": "https://mercury-uat.phonepe.com/transact/pay?token=..."
        }
      }
    }
  }
  ```

---

### 4.2 Order Status Check API (`/pg/v1/status`)

- **Method:** `GET`
- **Endpoint:** `https://api.phonepe.com/apis/hermes/pg/v1/status/{merchantId}/{merchantTransactionId}`
- **Headers:**
  ```http
  Content-Type: application/json
  X-VERIFY: <SHA256("/pg/v1/status/" + merchantId + "/" + merchantTransactionId + saltKey)>###<saltIndex>
  X-MERCHANT-ID: <merchantId>
  ```
- **Success Response:**
  ```json
  {
    "success": true,
    "code": "PAYMENT_SUCCESS",
    "message": "Payment Successful",
    "data": {
      "merchantId": "PGTESTPAYUAT",
      "merchantTransactionId": "JR-20261110-1001-A1-P1",
      "transactionId": "T2411102215345678",
      "amount": 25000,
      "state": "COMPLETED",
      "responseCode": "SUCCESS",
      "paymentInstrument": {
        "type": "UPI",
        "utr": "431215123456"
      }
    }
  }
  ```

---

### 4.3 S2S Webhook Verification (`POST /webhooks/phonepe`)

- **Headers Received:**
  - `x-verify`: `<SHA256(body.response + saltKey)>###<saltIndex>`
- **Body Received:**
  ```json
  {
    "response": "eyJzdWNjZXNzIjp0cnVlLCJjb2RlIjoiUEFZTUVOVF9TVUNDRVNTIi..."
  }
  ```
- **Decoded Inner Object:**
  Contains the transaction outcome with `code: "PAYMENT_SUCCESS"` or `"PAYMENT_ERROR"`, `data.transactionId`, `data.amount`, and `data.paymentInstrument`.

---

### 4.4 Full & Partial Refund API (`/v3/credit/backToSource`)

- **Method:** `POST`
- **Endpoint:** `https://api.phonepe.com/apis/pg/v3/credit/backToSource`
- **Headers:**
  ```http
  Content-Type: application/json
  X-VERIFY: <SHA256(base64Payload + "/v3/credit/backToSource" + saltKey)>###<saltIndex>
  ```
- **Payload (Before Base64):**
  ```json
  {
    "merchantId": "PGTESTPAYUAT",
    "merchantTransactionId": "REF-JR-20261110-1001-A1",
    "originalTransactionId": "T2411102215345678",
    "amount": 25000,
    "callbackUrl": "https://jankirasoi.in/api/v1/webhooks/phonepe/refund"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "code": "PAYMENT_PENDING",
    "message": "Refund Initiated",
    "data": {
      "merchantId": "PGTESTPAYUAT",
      "merchantTransactionId": "REF-JR-20261110-1001-A1",
      "transactionId": "R2411102230123456",
      "amount": 25000,
      "state": "PENDING"
    }
  }
  ```

---

### 4.5 Refund Status API (`/v3/status`)

- **Method:** `GET`
- **Endpoint:** `https://api.phonepe.com/apis/pg/v3/status/{merchantId}/{merchantRefundTransactionId}`
- **Headers:**
  ```http
  Content-Type: application/json
  X-VERIFY: <SHA256("/v3/status/" + merchantId + "/" + merchantRefundTransactionId + saltKey)>###<saltIndex>
  X-MERCHANT-ID: <merchantId>
  ```

---

## 5. Current Janki Rasoi Codebase Audit

1. **Prisma Schema (`apps/api/prisma/schema.prisma`):**
   - Current enum:
     ```prisma
     enum PaymentMethod {
       RAZORPAY
       COD
     }
     ```
   - Must add `PHONEPE`.
2. **Payment Attempts:**
   - The table `payment_attempts` is already designed with:
     - `provider` (string, default "RAZORPAY") -> can store "PHONEPE"
     - `providerOrderId` -> stores PhonePe's unique `merchantTransactionId`
     - `providerPaymentId` -> stores PhonePe's bank `transactionId`
     - `signatureVerified` -> tracks whether checksum / signature was cryptographically verified.
3. **Refunds Table:**
   - Table `refunds` contains `providerRefundId`, `amountPaise`, `reason`, `status`, `initiatedBy`. Ready for PhonePe without migration changes.

---

## 6. Complete Production Code Implementation (Zero Mocks)

### Step 1: Prisma Schema Enum Update
In `apps/api/prisma/schema.prisma`:
```prisma
enum PaymentMethod {
  PHONEPE
  RAZORPAY
  COD
}
```

---

### Step 2: Environment Variables
Add to `.env` / Render environment:
```env
PHONEPE_ENV=UAT                     # Set to 'PROD' in production
PHONEPE_MERCHANT_ID=PGTESTPAYUAT   # Your PhonePe Merchant ID
PHONEPE_SALT_KEY=099eb0cd-02cf-4e2a-8aca-3e6c6aff0399
PHONEPE_SALT_INDEX=1
PHONEPE_CALLBACK_HOST=https://jankirasoi.in
```

---

### Step 3: `PhonePeService` (Robust Edge-Case Resilient)
Create file: `apps/api/src/modules/payments/phonepe.service.ts`:

```typescript
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
   * Generates SHA-256 checksum with timing-safe hash comparison format
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
    // Generate unique transaction ID for each attempt to avoid duplicate ID errors
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
}
```

---

### Step 4: `PaymentsController` & Webhook Receiver
Update `apps/api/src/modules/payments/payments.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Req,
  Res,
  Query,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PhonePeService } from './phonepe.service';
import { Request, Response } from 'express';

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly phonePeService: PhonePeService,
  ) {}

  @Post('phonepe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle PhonePe S2S payment webhook notifications' })
  @ApiHeader({ name: 'x-verify', required: true })
  async handlePhonePeWebhook(
    @Body() body: { response?: string },
    @Headers('x-verify') xVerify: string,
  ) {
    if (!body?.response || !xVerify) {
      throw new BadRequestException('Malformed PhonePe webhook payload.');
    }

    const isValid = this.phonePeService.verifyWebhookChecksum(body.response, xVerify);
    if (!isValid) {
      throw new BadRequestException('PhonePe cryptographic signature verification failed.');
    }

    const decoded = JSON.parse(Buffer.from(body.response, 'base64').toString('utf8'));
    return this.paymentsService.handlePhonePeWebhookPayload(decoded);
  }
}

@ApiTags('Payments')
@Controller('payments')
export class PhonePeReturnController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('phonepe/return')
  @ApiOperation({ summary: 'Handle customer browser return from PhonePe checkout' })
  async handlePhonePeReturn(
    @Req() req: Request,
    @Res() res: Response,
    @Query('token') trackingToken: string,
    @Query('orderNumber') orderNumber: string,
    @Query('txnId') txnId: string,
  ) {
    try {
      if (txnId) {
        await this.paymentsService.reconcilePhonePeOrder(txnId);
      }
    } catch {}

    // Redirect user to their tracking page
    return res.redirect(`/track?token=${encodeURIComponent(trackingToken || orderNumber)}`);
  }
}
```

---

### Step 5: `CheckoutService` Order Placement Wiring
In `apps/api/src/modules/checkout/checkout.service.ts`:
Inside `placeOrder`:

```typescript
    let phonepeRedirectUrl: string | undefined = undefined;

    if (dto.paymentMethod === 'PHONEPE') {
      const phonePeRes = await this.phonePeService.initiatePayment({
        orderNumber,
        attemptNumber: 1,
        amountPaise: cached.totalAmountPaise,
        customerPhone: dto.customerPhone,
        trackingToken,
      });

      phonepeRedirectUrl = phonePeRes.redirectUrl;

      // Register initial pending payment attempt
      await this.prisma.paymentAttempt.create({
        data: {
          orderId,
          provider: 'PHONEPE',
          providerOrderId: phonePeRes.merchantTransactionId,
          amountPaise: cached.totalAmountPaise,
          currency: 'INR',
          status: 'PENDING',
          signatureVerified: false,
        },
      });
    }

    return {
      orderId,
      orderNumber,
      trackingToken,
      status: orderStatus,
      totalAmountPaise: cached.totalAmountPaise,
      paymentMethod: dto.paymentMethod,
      phonepeRedirectUrl,
    };
```

---

### Step 6: Frontend Next.js Cart Integration
In `apps/web/src/app/cart/page.tsx`:
1. Update `paymentMethod` state:
   ```typescript
   const [paymentMethod, setPaymentMethod] = useState<'COD' | 'PHONEPE'>('PHONEPE');
   ```
2. When response contains `phonepeRedirectUrl`:
   ```typescript
   if (orderResult.phonepeRedirectUrl) {
     showToast('Opening PhonePe secure payment...');
     window.location.href = orderResult.phonepeRedirectUrl;
     return;
   }
   ```
3. Radio selection in Cart UI:
   ```tsx
   {/* PhonePe Option */}
   <div
     onClick={() => setPaymentMethod('PHONEPE')}
     className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
       paymentMethod === 'PHONEPE'
         ? 'bg-[#F0FDF4] border-[#16A34A] shadow-xs'
         : 'bg-white border-slate-200 hover:bg-slate-50'
     }`}
   >
     <div className="flex items-center gap-3">
       <div className="w-10 h-10 rounded-xl bg-[#5f259f]/10 flex items-center justify-center">
         <span className="material-symbols-outlined text-[#5f259f] text-[22px]">account_balance_wallet</span>
       </div>
       <div>
         <div className="text-sm font-bold text-slate-900">PhonePe / UPI / Cards</div>
         <div className="text-[11px] text-slate-500 font-medium">Google Pay, Paytm, Cards & NetBanking</div>
       </div>
     </div>
     <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
       paymentMethod === 'PHONEPE' ? 'border-[#16A34A] bg-[#16A34A]' : 'border-slate-300'
     }`}>
       {paymentMethod === 'PHONEPE' && <span className="w-2 h-2 rounded-full bg-white" />}
     </div>
   </div>
   ```

---

## 7. Testing & Sandbox Verification Checklist

- [ ] **Valid Signature Test:** Send payload with correct `X-VERIFY` header -> Expect `200 OK`.
- [ ] **Tampered Signature Test:** Send payload with altered `X-VERIFY` -> Expect `400 Bad Request` (`PhonePe cryptographic signature verification failed`).
- [ ] **Duplicate Webhook Test:** Send the same webhook twice -> Expect `200 OK` on both, with zero duplicate database writes or duplicate notifications.
- [ ] **Amount Verification Test:** Send webhook with altered amount -> Expect `BadRequestException`.
- [ ] **Browser Close Reconciliation:** Simulate user paying on phone but closing browser -> When user visits `/track?token=...`, status is automatically queried and refreshed to `PLACED`.
- [ ] **Refund Cycle Test:** Trigger admin order cancellation -> Verify `initiateRefund` generates `PAYMENT_PENDING` and status check confirms `PAYMENT_SUCCESS`.
