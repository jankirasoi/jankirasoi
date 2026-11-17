# System Architecture — Janki Rasoi Tiffin Ordering Platform

**Status:** Active Architectural Baseline  
**Scope:** Customer Web Storefront, Admin Management Panel, Rider Web App, NestJS REST API, Background Worker, and Data Stores.  
**Target Infrastructure:** Vercel (Next.js Frontend) & Render Singapore (NestJS API, PostgreSQL, Outbox Worker).

---

## 1. Executive System Overview

Janki Rasoi is a production-grade tiffin and scheduled meal ordering service. The architecture is designed around three primary user touchpoints connected to a centralized, transaction-safe backend:

1. **Customer Web Storefront (`apps/web/(store)`)**: Public-facing, responsive web application for browsing daily/weekly menus, configuring portion variants and add-ons, validating delivery slots/pincodes, guest checkout with Razorpay, and tokenized real-time order tracking.
2. **Admin Management Panel (`apps/web/(admin)`)**: Kitchen operations hub for order lifecycle management (Accept -> Prepare -> Dispatch), dynamic catalog availability, delivery slot capacity planning, rider assignment, refunds, and append-only audit logging.
3. **Rider Web Application (`apps/web/(rider)`)**: Mobile-first, lightweight PWA-compatible browser interface for delivery personnel to view active assignments, launch Google Maps navigation, trigger customer OTP generation, submit verified 6-digit delivery OTPs, or report delivery exceptions.
4. **Core Backend Engine (`apps/api`)**: Modular NestJS application enforcing server-authoritative pricing in integer paise, transactional state machines, Razorpay signature and webhook verification, HMAC-SHA256 OTP management, and audit logging.
5. **Background Asynchronous Worker (`apps/api/src/worker.ts`)**: Render background worker polling a PostgreSQL transactional outbox (`SKIP LOCKED`) for decoupled, resilient execution of SMS notifications, webhook processing, external image indexing, and auto-cancellations.

---

## 2. High-Level Architecture Diagram (C4 Container View)

```mermaid
flowchart TB
    subgraph Clients ["Client Layer (Browsers & Devices)"]
        Customer["Customer Device\n(Mobile / Desktop Web)\napps/web/(store)"]
        Admin["Kitchen Manager / Staff\n(Desktop / Tablet Web)\napps/web/(admin)"]
        Rider["Delivery Rider\n(Mobile Web / PWA)\napps/web/(rider)"]
    end

    subgraph CDN_Edge ["Edge & Frontend Hosting (Vercel)"]
        NextServer["Next.js App Router (SSR & Static CDN)\n- Route Groups: (store), (admin), (rider)\n- Edge Routing / Asset Optimization"]
    end

    subgraph Backend_Infrastructure ["Backend Infrastructure (Render Singapore)"]
        API["NestJS REST API Service\n- Auth & RBAC Guards\n- State Machines (Order/Payment)\n- Authoritative Price Calculator\n- DTO Validation (Class-Validator)"]
        Worker["Render Background Worker\n- Outbox Consumer (SKIP LOCKED)\n- SMS Dispatch (MSG91)\n- Payment Reconciler\n- Expiry Cron Jobs"]
        DB[(PostgreSQL Primary Database\n- Relational Schema via Prisma\n- Strict Constraints & Indexes\n- Transactional Outbox Table)]
    end

    subgraph Third_Party ["Third-Party External Services"]
        Razorpay["Razorpay Payment Gateway\n- Orders API\n- Standard Checkout SDK\n- Signed Webhooks"]
        SMS["SMS Gateway (MSG91)\n- Indian DLT Approved Headers\n- Transactional Delivery OTP"]
        Cloudinary["Cloudinary Object Storage\n- Menu Item Images\n- Server-Signed Uploads"]
    end

    %% Client Interactions
    Customer -->|HTTPS / Assets| NextServer
    Admin -->|HTTPS / Assets| NextServer
    Rider -->|HTTPS / Assets| NextServer

    %% Frontend to Backend
    NextServer -->|Server-Side Rendering API Calls| API
    Customer -.->|Direct Client-Side REST API (HTTPS)| API
    Admin -.->|Direct Client-Side REST API (HTTPS + HttpOnly Cookie)| API
    Rider -.->|Direct Client-Side REST API (HTTPS + HttpOnly Cookie)| API

    %% Backend Interactions
    API <-->|Prisma Transactions & Queries| DB
    Worker <-->|Poll & Claim Outbox Tasks| DB
    API -->|Create Order & Verify Signature| Razorpay
    Razorpay -->|Asynchronous Webhooks (HMAC-SHA256)| API
    Worker -->|Send Transactional OTPs| SMS
    API -->|Generate Upload Signatures| Cloudinary
```

---

## 3. Data Flow & Sequence Architecture

### 3.1. Authoritative Checkout & Payment Workflow

To prevent client tampering and race conditions on slot capacity, the frontend is strictly treated as untrusted:

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer Browser
    participant API as NestJS API
    participant DB as PostgreSQL
    participant RZP as Razorpay Gateway

    Customer->>API: POST /api/v1/checkout/quote (items, slot_id, pincode)
    API->>DB: Query Catalog Prices, Slot Capacity & Zone Eligibility
    DB-->>API: Active Prices & Available Capacity
    API->>API: Server-side recalculation of Subtotal, Delivery Fee, Taxes (Paise)
    API-->>Customer: Validated Quote (Quote Token, Total Amount in Paise)

    Customer->>API: POST /api/v1/checkout/orders (Quote Token, Delivery Details, Idempotency-Key)
    API->>DB: BEGIN Transaction
    API->>DB: Lock & Increment Slot Capacity Reservation
    API->>DB: Create Order Record (Status: AWAITING_PAYMENT)
    API->>DB: Create PaymentAttempt Record (Status: PENDING)
    API->>RZP: POST /v1/orders (amount: totalPaise, currency: "INR", receipt: orderId)
    RZP-->>API: Razorpay Order ID (order_xyz123)
    API->>DB: Update PaymentAttempt with provider_order_id
    API->>DB: COMMIT Transaction
    API-->>Customer: 201 Created (order_id, razorpay_order_id, amount_paise, tracking_token)

    Customer->>RZP: Open Razorpay Standard Checkout Modal
    Customer->>RZP: Authorize Payment via UPI / Card / NetBanking
    RZP-->>Customer: Razorpay Response (payment_id, order_id, signature)

    Customer->>API: POST /api/v1/payments/verify (order_id, razorpay_payment_id, razorpay_signature)
    API->>API: HMAC-SHA256 Verification with RAZORPAY_KEY_SECRET
    alt Signature Valid
        API->>DB: Update PaymentAttempt (Status: CAPTURED)
        API->>DB: Transition Order (Status: PLACED)
        API->>DB: Enqueue Order Confirmation SMS in Outbox
        API-->>Customer: 200 OK (Status: PLACED, tracking_url)
    else Signature Invalid
        API-->>Customer: 400 Bad Request (Payment verification failed)
    end

    Note over RZP,API: Webhook Fallback in case Customer Closes Browser
    RZP->>API: POST /api/v1/webhooks/razorpay (event: payment.captured, signature)
    API->>API: Verify Raw Body HMAC Signature
    API->>DB: Idempotent Payment Reconciliation & State Transition
```

---

### 3.2. Rider Delivery & 6-Digit Cryptographic OTP Flow

To guarantee food handover without rider self-approval or SMS sniffing:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / Kitchen
    actor Rider as Rider Web Panel
    actor Customer as Delivery Customer
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Worker as Outbox Worker
    participant SMS as MSG91 DLT Gateway

    Admin->>API: PATCH /api/v1/admin/orders/:id/assign-rider (rider_id)
    API->>DB: Create RiderAssignment (Status: ASSIGNED)
    API-->>Admin: Assigned Successfully

    Rider->>API: PATCH /api/v1/rider/deliveries/:id/out-for-delivery
    API->>API: Generate Cryptographic 6-digit OTP (e.g. 583921)
    API->>API: Compute HMAC-SHA256(OTP, SERVER_SECRET)
    API->>DB: Insert DeliveryOtp record (hashed_verifier, max_attempts=5, expires_at=+2h)
    API->>DB: Update Order Status -> OUT_FOR_DELIVERY
    API->>DB: Insert OutboxMessage (SEND_DELIVERY_OTP, phone, masked_order_id)
    API-->>Rider: 200 OK (Status: OUT_FOR_DELIVERY, navigation_coords)

    Worker->>DB: Poll Outbox (SELECT FOR UPDATE SKIP LOCKED)
    Worker->>SMS: Send Template SMS with DLT Header: "Your Janki Rasoi OTP is 583921"
    SMS-->>Customer: SMS Delivered to Phone

    Rider->>Customer: Arrives at Doorstep
    Customer-->>Rider: Verbally Provides OTP
    Rider->>API: POST /api/v1/rider/deliveries/:id/verify-otp (code: "583921")
    API->>DB: Fetch Active DeliveryOtp for Rider & Order
    API->>API: Check Expiration & Failed Attempt Threshold (< 5)
    API->>API: Compare HMAC(submitted_code) === stored_hashed_verifier
    alt OTP Valid
        API->>DB: BEGIN Transaction
        API->>DB: Mark DeliveryOtp as USED
        API->>DB: Update Order Status -> DELIVERED
        API->>DB: Record DeliveryAttempt (Status: SUCCESS)
        API->>DB: Enqueue Delivery Completed SMS in Outbox
        API->>DB: COMMIT Transaction
        API-->>Rider: 200 OK (Delivery Completed)
    else OTP Invalid
        API->>DB: Increment failed_attempts
        API-->>Rider: 400 Bad Request ("Invalid OTP. 3 attempts remaining.")
    end
```

---

## 4. Subsystem Responsibility Matrix

| Subsystem | Primary Boundary | Technology & Runtime | Key Responsibilities |
| :--- | :--- | :--- | :--- |
| **Storefront Web** | `apps/web/src/app/(store)` | Next.js 15+ (App Router), Tailwind CSS, shadcn/ui | Menu catalog display, portion selection, cart persistence, slot picker, checkout orchestration, tokenized tracking. |
| **Admin Web** | `apps/web/src/app/(admin)` | Next.js 15+ (App Router), TanStack Table, React Hook Form | Kitchen KDS kanban board, order status controls, catalog price & sold-out toggling, delivery slot capacity limits, rider assignment, refunds. |
| **Rider Web** | `apps/web/src/app/(rider)` | Next.js 15+ (Mobile-optimized PWA layout), Lucide Icons | Authentication, delivery list, customer calling/directions trigger, out-for-delivery trigger, OTP numeric input, exception recording. |
| **Core API** | `apps/api/src/modules/*` | NestJS 11+, Prisma ORM, Class-Validator, Passport JWT/Session | Strict REST API, RBAC guards, authoritative billing in paise, state machines, Razorpay checkout and webhooks, OTP security engine. |
| **Async Worker** | `apps/api/src/worker.ts` | Node.js process on Render, Prisma Client | Outbox processor with transactional row locking, MSG91 SMS dispatch, stuck-order reconciliation, catalog availability reset. |
| **Database** | PostgreSQL 16+ on Render | Render Managed PostgreSQL (Singapore Region) | Source of truth, ACID transactions, check constraints, foreign keys, row-level locking for concurrency control. |

---

## 5. Security Architecture & Threat Mitigations

### 5.1. Authentication & Session Management
- **Customer:** Anonymous / Guest checkout is first-class. Orders are tracked via high-entropy `tracking_token` (UUIDv4/NanoID) returned at checkout.
- **Admin:** Authenticated via registered administrative email and secure password (`admin@jankirasoi.com`).
- **Rider:** Authenticated purely via 10-digit mobile phone number and shift PIN/password. Riders do not have, require, or display mock emails.
- **Session Tokens:** Issued as `HttpOnly`, `Secure`, `SameSite=Lax` cookies. No access tokens in browser `localStorage`.
- **RBAC Enforcement:** NestJS `@Roles('ADMIN', 'STAFF', 'RIDER')` guards applied at the controller and route level. UI visibility is cosmetic; server endpoints reject unauthorized requests unconditionally.

### 5.2. Financial Integrity (Integer Paise)
- Floating-point representations (`float`, `double`) are banned for monetary values across the entire stack.
- All amounts are computed, transmitted, and persisted as 64-bit integer paise (`100 paise = 1 INR`).
- Taxes, delivery surcharges, packaging fees, and discounts are recomputed by the server inside DB transactions. Client-submitted prices are discarded.

### 5.3. Webhook Security & Idempotency
- Razorpay webhook payloads are read as raw buffer streams for SHA256 signature verification before JSON deserialization.
- Every incoming webhook event ID (`event.id`) is recorded in the `PaymentEvent` table with a unique constraint. Duplicate webhook deliveries exit with `200 OK` without triggering duplicate state transitions.

### 5.4. Delivery OTP Protection (OWASP Compliance)
- Delivery OTPs are never stored in plaintext in the database; only a salted HMAC verifier is retained.
- OTPs are never returned in any API response to the rider or admin.
- Locked after 5 consecutive incorrect submissions.
- Hard expiration of 2 hours or the end of the delivery slot window.
- If an order is reassigned to another rider, existing active OTP records are immediately revoked.
- Administrative manual bypass requires an explicit `REASON` text and creates an immutable entry in the `AuditLog`.

---

## 6. Infrastructure & Deployment Topology

```text
[Internet Traffic]
       │
       ▼
 [Vercel Edge / CDN]
   ├── apps/web/(store)  --> Served with ISR / SSR (Vercel Singapore Node functions)
   ├── apps/web/(admin)  --> Dynamic SSR / Client SPA
   └── apps/web/(rider)  --> Dynamic SSR / Client PWA
       │
       │ HTTPS REST Calls (Header: X-Correlation-ID)
       ▼
 [Render Singapore Private Network]
   ├── Service 1: apps/api (Web Service)
   │     - NestJS REST API
   │     - Port 3000
   │     - Environment Group: prod-api-env
   │
   ├── Service 2: apps/worker (Background Worker)
   │     - Command: npm run start:worker
   │     - Environment Group: prod-api-env
   │
   └── Service 3: PostgreSQL Database
         - PostgreSQL 16
         - Internal Connection: postgresql://user:pass@dpg-xxx:5432/jankirasoi_db
         - Automated nightly logical backups
```

- **Region Co-location:** Render API, Worker, and PostgreSQL are deployed strictly in **Singapore (`sin-1`)** to minimize network latency (< 10ms database round-trips).
- **Vercel Function Region:** Configured to `sin1` (Singapore) for any Next.js Server Components / Server Actions communicating with the API.
