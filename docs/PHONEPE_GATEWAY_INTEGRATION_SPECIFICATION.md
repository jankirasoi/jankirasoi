# PhonePe Payment Gateway Integration Specification & Blueprint
**Project:** Janki Rasoi Cloud Kitchen  
**Date:** November 2026  
**Document Status:** Complete Architecture & Implementation Guide  
**File Location:** `docs/PHONEPE_GATEWAY_INTEGRATION_SPECIFICATION.md`

---

## Table of Contents
1. [Executive Overview](#1-executive-overview)
2. [PhonePe Gateway Environments & Credentials](#2-phonepe-gateway-environments--credentials)
3. [PhonePe Standard Checkout APIs (v2 & v1 Deep Dive)](#3-phonepe-standard-checkout-apis)
   - [v2 Standard Checkout (Latest OAuth 2.0 Flow)](#31-v2-standard-checkout-recommended)
   - [v1 Pay Page Checkout (Classic SHA-256 / Salt Key Flow)](#32-v1-pay-page-checkout-legacyfallback)
4. [Current Janki Rasoi Codebase Analysis](#4-current-janki-rasoi-codebase-analysis)
   - [Database Schema (Prisma)](#41-database-schema-prisma)
   - [Backend NestJS Architecture](#42-backend-nestjs-architecture)
   - [Frontend Next.js Cart & Checkout](#43-frontend-nextjs-cart--checkout)
5. [End-to-End PhonePe Payment Flow](#5-end-to-end-phonepe-payment-flow)
6. [Step-by-Step Code Changes Required](#6-step-by-step-code-changes-required)
7. [Security, Idempotency & Failure Recovery](#7-security-idempotency--failure-recovery)
8. [Testing & Sandbox Verification Checklist](#8-testing--sandbox-verification-checklist)

---

## 1. Executive Overview

This document provides complete, latest documentation for integrating the **PhonePe Payment Gateway** into the **Janki Rasoi** meal delivery platform.

PhonePe provides two standard integration protocols for web checkouts:
1. **PhonePe Checkout v2 (Latest / Recommended by PhonePe):** Uses OAuth 2.0 Bearer tokens (`O-Bearer`), RESTful JSON payloads, and basic auth / HMAC webhook callbacks.
2. **PhonePe PG v1 (Classic / Widely used by Indian merchants):** Uses Base64-encoded JSON payloads, salt-indexed SHA-256 checksums (`X-VERIFY` headers), and S2S POST webhooks.

This specification covers **both versions** so you can seamlessly plug in whichever credentials PhonePe Merchant Onboarding issues to your account (`client_id` / `client_secret` for v2 OR `merchantId` / `saltKey` for v1).

---

## 2. PhonePe Gateway Environments & Credentials

### 2.1 Environments & Base URLs

| Environment | Purpose | v2 Base URL | v1 Base URL |
| :--- | :--- | :--- | :--- |
| **Sandbox / UAT (Preprod)** | Development & testing | `https://api-preprod.phonepe.com/apis/pg-sandbox` | `https://api-preprod.phonepe.com/apis/pg-sandbox` |
| **Production (Live)** | Real customer payments | `https://api.phonepe.com/apis/pg` | `https://api.phonepe.com/apis/hermes` |
| **Identity Manager (Auth)** | OAuth token generation (v2) | `https://api.identity.phonepe.com` | N/A |

### 2.2 Credentials Needed

#### For v2 (OAuth Standard Checkout):
- `PHONEPE_CLIENT_ID`: Provided on PhonePe Business Dashboard
- `PHONEPE_CLIENT_SECRET`: Secret key for OAuth token generation
- `PHONEPE_CLIENT_VERSION`: Usually `1`
- `PHONEPE_WEBHOOK_USERNAME`: Configured for S2S webhook basic auth
- `PHONEPE_WEBHOOK_PASSWORD`: Configured for S2S webhook basic auth

#### For v1 (Salt Key / Checksum Checkout):
- `PHONEPE_MERCHANT_ID`: e.g. `PGTESTPAYUAT` (Sandbox) or live merchant ID (e.g., `JANKIRASOIONLINE`)
- `PHONEPE_SALT_KEY`: 36-character UUID string (e.g. `099eb0cd-02cf-4e2a-8aca-3e6c6aff0399`)
- `PHONEPE_SALT_INDEX`: Usually `1`

---

## 3. PhonePe Standard Checkout APIs

### 3.1 v2 Standard Checkout (Recommended)

#### Step 1: Generate OAuth Token
- **Endpoint:** `POST https://api.phonepe.com/apis/identity-manager/v1/oauth/token` (or preprod equivalent)
- **Headers:** `Content-Type: application/x-www-form-urlencoded`
- **Body:**
  ```http
  client_id=<YOUR_CLIENT_ID>&client_secret=<YOUR_CLIENT_SECRET>&client_version=1&grant_type=client_credentials
  ```
- **Response:**
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "Bearer",
    "expires_in": 3600
  }
  ```

#### Step 2: Create Checkout Session (Initiate Payment)
- **Endpoint:** `POST /checkout/v2/pay`
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: O-Bearer <access_token>`
- **Request Payload:**
  ```json
  {
    "merchantOrderId": "JR-20261110-1042-8F2B",
    "amount": 25000,
    "expireAfter": 900,
    "paymentFlow": {
      "type": "PG_CHECKOUT",
      "message": "Payment for Janki Rasoi Tiffin Order #JR-20261110-1042-8F2B",
      "merchantUrls": {
        "redirectUrl": "https://jankirasoi.in/api/v1/payments/phonepe/return"
      }
    },
    "metaInfo": {
      "customerPhone": "9755554774",
      "customerName": "Customer"
    }
  }
  ```
- **Response:**
  Returns a `redirectUrl` hosted by PhonePe where the user is redirected to select UPI (Google Pay, PhonePe, Paytm), Credit/Debit Card, or NetBanking.

#### Step 3: Check Order Status
- **Endpoint:** `GET /checkout/v2/order/{merchantOrderId}/status`
- **Headers:** `Authorization: O-Bearer <access_token>`
- **Response:**
  ```json
  {
    "state": "COMPLETED",
    "amount": 25000,
    "transactionId": "T2411102145123456",
    "paymentDetails": {
      "instrument": "UPI"
    }
  }
  ```

---

### 3.2 v1 Pay Page Checkout (Legacy / Fallback)

The v1 flow is widely used and requires **zero external SDKs**, as it uses standard Node.js native `crypto`:

#### Step 1: Construct JSON Payload
```json
{
  "merchantId": "PGTESTPAYUAT",
  "merchantTransactionId": "JR-20261110-1042-8F2B",
  "merchantUserId": "USR_9755554774",
  "amount": 25000,
  "redirectUrl": "https://jankirasoi.in/api/v1/payments/phonepe/return?orderNumber=JR-20261110-1042-8F2B",
  "redirectMode": "POST",
  "callbackUrl": "https://jankirasoi.in/api/v1/webhooks/phonepe",
  "mobileNumber": "9755554774",
  "paymentInstrument": {
    "type": "PAY_PAGE"
  }
}
```
*(Note: Amount is in **paise**, e.g., ₹250.00 = 25000 paise).*

#### Step 2: Base64 Encode & Compute `X-VERIFY` Checksum
```typescript
import { createHash } from 'crypto';

const payloadString = JSON.stringify(payload);
const base64Payload = Buffer.from(payloadString).toString('base64');

// Checksum formula: SHA256(base64Payload + "/pg/v1/pay" + saltKey) + "###" + saltIndex
const stringToHash = base64Payload + '/pg/v1/pay' + saltKey;
const sha256 = createHash('sha256').update(stringToHash).digest('hex');
const xVerify = `${sha256}###${saltIndex}`;
```

#### Step 3: POST to `/pg/v1/pay`
- **URL:** `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay`
- **Headers:**
  ```http
  Content-Type: application/json
  X-VERIFY: <xVerify>
  accept: application/json
  ```
- **Body:**
  ```json
  {
    "request": "<base64Payload>"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "code": "PAYMENT_INITIATED",
    "message": "Payment Initiated",
    "data": {
      "merchantId": "PGTESTPAYUAT",
      "merchantTransactionId": "JR-20261110-1042-8F2B",
      "instrumentResponse": {
        "type": "PAY_PAGE",
        "redirectInfo": {
          "url": "https://mercury-uat.phonepe.com/transact/pay?token=..."
        }
      }
    }
  }
  ```
The user is redirected to `data.instrumentResponse.redirectInfo.url`.

#### Step 4: Status Check API (`/pg/v1/status`)
- **Endpoint:** `GET /pg/v1/status/{merchantId}/{merchantTransactionId}`
- **Checksum formula:**
  ```typescript
  const stringToHash = `/pg/v1/status/${merchantId}/${merchantTransactionId}` + saltKey;
  const sha256 = createHash('sha256').update(stringToHash).digest('hex');
  const xVerify = `${sha256}###${saltIndex}`;
  ```
- **Headers:**
  - `X-VERIFY: <xVerify>`
  - `X-MERCHANT-ID: <merchantId>`
  - `Content-Type: application/json`

---

## 4. Current Janki Rasoi Codebase Analysis

### 4.1 Database Schema (Prisma)
File: `apps/api/prisma/schema.prisma`

1. **`PaymentMethod` Enum:**
   ```prisma
   enum PaymentMethod {
     RAZORPAY
     COD
   }
   ```
   *Action Needed:* Add `PHONEPE` to this enum:
   ```prisma
   enum PaymentMethod {
     PHONEPE
     RAZORPAY
     COD
   }
   ```
2. **`PaymentStatus` Enum:**
   ```prisma
   enum PaymentStatus {
     PENDING
     AUTHORIZED
     CAPTURED
     FAILED
     REFUND_PENDING
     REFUNDED
   }
   ```
   *Status:* Already 100% compatible with PhonePe states (`PENDING`, `CAPTURED`, `FAILED`).
3. **`PaymentAttempt` Model:**
   ```prisma
   model PaymentAttempt {
     id                String        @id @default(uuid())
     orderId           String        @map("order_id")
     provider          String        @default("RAZORPAY") // Set to "PHONEPE"
     providerOrderId   String?       @map("provider_order_id") // PhonePe merchantTransactionId
     providerPaymentId String?       @unique @map("provider_payment_id") // PhonePe transactionId
     amountPaise       Int           @map("amount_paise")
     currency          String        @default("INR")
     status            PaymentStatus @default(PENDING)
     signatureVerified Boolean       @default(false) @map("signature_verified")
     createdAt         DateTime      @default(now()) @map("created_at")
     updatedAt         DateTime      @updatedAt @map("updated_at")
   }
   ```
   *Status:* Ready without any structural schema changes!

### 4.2 Backend NestJS Architecture
- **Checkout Service (`apps/api/src/modules/checkout/checkout.service.ts`):**
  - When `dto.paymentMethod === 'PHONEPE'`, instead of Razorpay SDK, it will call `PhonePeService.createPayment({ orderNumber, amountPaise, customerPhone, trackingToken })`.
  - It saves the initial `PaymentAttempt` with `provider: 'PHONEPE'`, `providerOrderId: orderNumber`, `status: 'PENDING'`.
  - Returns `phonepeRedirectUrl` in the `PlaceOrderResponse`.
- **Payments Module (`apps/api/src/modules/payments`):**
  - Create `phonepe.service.ts` to handle:
    1. Checksum generation & payload packaging
    2. HTTP POST to PhonePe Pay endpoint
    3. Status inquiry API call
    4. S2S Webhook verification
  - In `payments.controller.ts`, add:
    - `@Post('webhooks/phonepe')`: Handles background S2S notifications.
    - `@All('payments/phonepe/return')`: Handles customer browser redirect return, checks status, and redirects customer to `/track?token=<trackingToken>`.

### 4.3 Frontend Next.js Cart & Checkout
- **Cart Page (`apps/web/src/app/cart/page.tsx`):**
  - Currently supports `paymentMethod: 'COD' | 'RAZORPAY'`.
  - Change or extend to include `'PHONEPE'`:
    - Display "PhonePe (UPI, GPay, Paytm, Cards, NetBanking)"
    - When placing an order with `PHONEPE`:
      1. Calls `api.placeOrder({ ...orderPayload, paymentMethod: 'PHONEPE' })`
      2. If response includes `phonepeRedirectUrl`:
         - Save order to recent orders in localStorage
         - Redirect customer: `window.location.href = res.phonepeRedirectUrl`
      3. For COD: redirects immediately to `/track?token=...` as usual.

---

## 5. End-to-End PhonePe Payment Flow

```
[ Customer ]             [ Next.js Web ]             [ NestJS API ]             [ PhonePe Gateway ]
     |                          |                          |                            |
     | 1. Selects "PhonePe"    |                          |                            |
     |    Clicks "Pay ₹250"     |                          |                            |
     |------------------------->|                          |                            |
     |                          | 2. POST /checkout/place  |                            |
     |                          |    method: 'PHONEPE'     |                            |
     |                          |------------------------->|                            |
     |                          |                          | 3. Create Order (AWAITING) |
     |                          |                          |    Build SHA256 Checksum   |
     |                          |                          | 4. POST /pg/v1/pay         |
     |                          |                          |--------------------------->|
     |                          |                          |                            |
     |                          |                          | 5. Return redirect URL     |
     |                          |                          |<---------------------------|
     |                          | 6. Return response with  |                            |
     |                          |    phonepeRedirectUrl    |                            |
     |                          |<-------------------------|                            |
     | 7. Browser redirects to  |                          |                            |
     |    PhonePe PayPage       |                          |                            |
     |<-------------------------|                          |                            |
     |                                                     |                            |
     | 8. Customer pays via UPI / QR / Card on PhonePe     |                            |
     |--------------------------------------------------------------------------------->|
     |                                                     |                            |
     |                                                     | 9. S2S Webhook (POST)      |
     |                                                     |    checkout.completed      |
     |                                                     |<---------------------------|
     |                                                     | 10. Verify signature       |
     |                                                     |     Update Order: PLACED   |
     |                                                     |     Status: CAPTURED       |
     | 11. Browser redirects back to returnUrl             |                            |
     |---------------------------------------------------->|                            |
     | 12. Redirect to /track?token=<trackingToken>        |                            |
     |<----------------------------------------------------|                            |
     |                                                     |                            |
     | 13. Customer sees Order Confirmed & Live Tracking   |                            |
```

---

## 6. Step-by-Step Code Changes Required

### Step 1: Add Environment Variables
Add to `.env` in `apps/api`:
```env
# PhonePe Payment Gateway Configuration
PHONEPE_ENV=UAT                     # 'UAT' for sandbox, 'PROD' for live
PHONEPE_MERCHANT_ID=PGTESTPAYUAT   # Your Merchant ID
PHONEPE_SALT_KEY=099eb0cd-02cf-4e2a-8aca-3e6c6aff0399 # Your Salt Key
PHONEPE_SALT_INDEX=1               # Your Salt Index
PHONEPE_CALLBACK_HOST=https://jankirasoi.in # Host domain for callbacks/redirects
```

### Step 2: Update Prisma Schema
In `apps/api/prisma/schema.prisma`:
```prisma
enum PaymentMethod {
  PHONEPE
  RAZORPAY
  COD
}
```
Run `npx prisma db push` or migration.

### Step 3: Implement `PhonePeService`
In `apps/api/src/modules/payments/phonepe.service.ts`:
```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

@Injectable()
export class PhonePeService {
  private readonly logger = new Logger(PhonePeService.name);
  private readonly env: string;
  private readonly merchantId: string;
  private readonly saltKey: string;
  private readonly saltIndex: string;
  private readonly baseUrl: string;
  private readonly callbackHost: string;

  constructor(private readonly config: ConfigService) {
    this.env = this.config.get<string>('PHONEPE_ENV', 'UAT');
    this.merchantId = this.config.get<string>('PHONEPE_MERCHANT_ID', 'PGTESTPAYUAT');
    this.saltKey = this.config.get<string>('PHONEPE_SALT_KEY', '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399');
    this.saltIndex = this.config.get<string>('PHONEPE_SALT_INDEX', '1');
    this.callbackHost = this.config.get<string>('PHONEPE_CALLBACK_HOST', 'https://jankirasoi.in');

    this.baseUrl = this.env === 'PROD'
      ? 'https://api.phonepe.com/apis/hermes'
      : 'https://api-preprod.phonepe.com/apis/pg-sandbox';
  }

  createPayChecksum(base64Payload: string): string {
    const stringToHash = base64Payload + '/pg/v1/pay' + this.saltKey;
    const sha256 = createHash('sha256').update(stringToHash).digest('hex');
    return `${sha256}###${this.saltIndex}`;
  }

  createStatusChecksum(merchantTransactionId: string): string {
    const stringToHash = `/pg/v1/status/${this.merchantId}/${merchantTransactionId}` + this.saltKey;
    const sha256 = createHash('sha256').update(stringToHash).digest('hex');
    return `${sha256}###${this.saltIndex}`;
  }

  async initiatePayment(params: {
    orderNumber: string;
    amountPaise: number;
    customerPhone: string;
    trackingToken: string;
  }) {
    const payload = {
      merchantId: this.merchantId,
      merchantTransactionId: params.orderNumber,
      merchantUserId: `CUST_${params.customerPhone.slice(-10)}`,
      amount: params.amountPaise,
      redirectUrl: `${this.callbackHost}/api/v1/payments/phonepe/return?token=${params.trackingToken}&orderNumber=${params.orderNumber}`,
      redirectMode: 'POST',
      callbackUrl: `${this.callbackHost}/api/v1/webhooks/phonepe`,
      mobileNumber: params.customerPhone.slice(-10),
      paymentInstrument: {
        type: 'PAY_PAGE',
      },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
    const checksum = this.createPayChecksum(base64Payload);

    const response = await fetch(`${this.baseUrl}/pg/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        accept: 'application/json',
      },
      body: JSON.stringify({ request: base64Payload }),
    });

    const result = await response.json();
    if (!result.success || !result.data?.instrumentResponse?.redirectInfo?.url) {
      throw new BadRequestException(result.message || 'PhonePe payment initiation failed');
    }

    return {
      redirectUrl: result.data.instrumentResponse.redirectInfo.url,
      merchantTransactionId: params.orderNumber,
    };
  }

  async checkStatus(merchantTransactionId: string) {
    const checksum = this.createStatusChecksum(merchantTransactionId);
    const url = `${this.baseUrl}/pg/v1/status/${this.merchantId}/${merchantTransactionId}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
      },
    });

    return res.json();
  }
}
```

### Step 4: Add Webhook & Return Endpoints in `PaymentsController`
```typescript
@Post('webhooks/phonepe')
async handlePhonePeWebhook(@Body() body: any, @Headers('x-verify') xVerify: string) {
  return this.paymentsService.handlePhonePeWebhook(body, xVerify);
}

@All('payments/phonepe/return')
async handlePhonePeReturn(
  @Req() req: Request,
  @Res() res: Response,
  @Query('token') trackingToken: string,
  @Query('orderNumber') orderNumber: string,
) {
  // Check transaction status on PhonePe
  await this.paymentsService.verifyPhonePeStatus(orderNumber);
  // Redirect customer straight to live tracking
  return res.redirect(`/track?token=${trackingToken}`);
}
```

### Step 5: Update `PlaceOrderResponse` & Frontend
In `apps/web/src/lib/api.ts`:
```typescript
export interface PlaceOrderResponse {
  orderId: string;
  orderNumber: string;
  trackingToken: string;
  status: string;
  totalAmountPaise: number;
  paymentMethod: string;
  phonepeRedirectUrl?: string; // Set when paymentMethod is PHONEPE
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  currency: string;
}
```

In `apps/web/src/app/cart/page.tsx`:
```typescript
if (orderResult.phonepeRedirectUrl) {
  showToast('Redirecting to PhonePe secure payment...');
  window.location.href = orderResult.phonepeRedirectUrl;
  return;
}
```

---

## 7. Security, Idempotency & Failure Recovery

1. **Double Verification (Webhook + Redirect):**
   - When user redirects back, the backend immediately calls `checkStatus` to update the DB.
   - When the S2S Webhook arrives, it verifies idempotency: if order status is already `CAPTURED`, it skips duplicate writes and avoids sending duplicate SMS.
2. **Checksum Integrity:**
   - Every status check and pay request verifies with SHA-256 using the secret `SALT_KEY`.
   - The salt key is kept exclusively on the server backend inside environment variables and never exposed to the frontend.
3. **Transaction Expiry & Slot Recovery:**
   - Orders placed with `AWAITING_PAYMENT` have a 15-minute window. If unfulfilled, a background cron frees booked slot capacity.

---

## 8. Testing & Sandbox Verification Checklist

- [ ] PhonePe UAT Merchant ID: `PGTESTPAYUAT`
- [ ] PhonePe UAT Salt Key: `099eb0cd-02cf-4e2a-8aca-3e6c6aff0399` (Salt Index: `1`)
- [ ] Test UPI ID on PhonePe Sandbox: `success@upi` (simulates instant success)
- [ ] Test UPI ID for failure: `failure@upi` (simulates user declined / failed payment)
- [ ] S2S Webhook URL reachable via HTTPS (e.g. via ngrok or production domain)
- [ ] Successful callback updates Order status from `AWAITING_PAYMENT` to `PLACED`
- [ ] Live tracking route opens immediately after payment completion
