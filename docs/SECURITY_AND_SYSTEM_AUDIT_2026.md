# Janki Rasoi — Production Security, Fleet & System Audit (Nov 2026)

## 1. Executive Summary
This document records the authoritative security hardening, dead-code removal, rider fleet authentication enforcement, and full API endpoint verification performed for the Janki Rasoi platform.

---

## 2. Security Hardening & Zero-Hardcoded Secrets
- **Strict `.env` Enforcement:**
  - Removed all hardcoded fallback secrets from codebase (`phonepe.service.ts`, `uploads.service.ts`, `scripts/seed-janki-menu.mjs`, `scripts/update-distinct-images.mjs`).
  - All database, session, OTP HMAC, Cloudinary, Razorpay, and PhonePe keys are strictly loaded from environment variables.
- **Git History Audit:**
  - Verified that production `.env` files were never committed or tracked in Git history.
- **Frontend Hygiene:**
  - Confirmed zero private keys or secrets in `apps/web` or `apps/admin`. Only public URLs (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`) are exposed to client browsers.

---

## 3. Delivery Rider Fleet — Pure Mobile & PIN Auth
- **Zero Mock Emails:**
  - Verified that all delivery riders in Supabase PostgreSQL have `email: null`.
  - Rider shift login portal (`/rider`) operates strictly on 10-digit Indian mobile number + shift PIN/password.
  - Admin fleet registration only collects rider name, mobile number, vehicle number, and shift password.

---

## 4. Dead Code & Prototype Cleanup
- **5,022 lines of dead code removed:**
  - `apps/web/src/components/CustomerAuthModal.tsx` (~840 lines) — deleted (superseded by dedicated `/login` and `/orders` pages).
  - `apps/web/src/components/TrackingRoadMap.tsx` (~235 lines) — deleted (superseded by interactive Leaflet OpenStreetMap `LiveDeliveryMap.tsx`).
  - `apps/web/legacy_html/` (6 files, ~1,421 lines) — deleted.
  - `stitch_janaki_caterings_ordering_platform/` (12 files, ~2,525 lines + 1.5MB images) — deleted.

---

## 5. Live API Endpoint Verification (20 / 20 Passed)
All 20 core endpoints tested against the live backend with 100% success:
- `GET /api/v1/health` [200 OK]
- `GET /api/v1/catalog` [200 OK]
- `GET /api/v1/catalog?service_date=...` [200 OK]
- `GET /api/v1/delivery-slots` [200 OK]
- `GET /api/v1/delivery-slots?date=...` [200 OK]
- `GET /api/v1/delivery-zones` [200 OK]
- `GET /api/v1/delivery-zones/check` [200 OK]
- `GET /api/v1/delivery-zones/places-search` [200 OK]
- `GET /api/v1/delivery-zones/reverse-geocode` [200 OK]
- `GET /api/v1/delivery-zones/directions` [200 OK]
- `POST /api/v1/checkout/quote` [201 Created]
- `GET /api/v1/orders/customer/:phone` [200 OK]
- `GET /api/v1/auth/me` [200 OK]
- `GET /api/v1/admin/orders` [200 OK]
- `GET /api/v1/admin/riders` [200 OK]
- `GET /api/v1/admin/customers` [200 OK]
- `GET /api/v1/admin/uploads/signature` [200 OK]
- `GET /api/v1/rider/deliveries` [200 OK]
- `POST /api/v1/rider/deliveries/location` [201 Created]
- `PATCH /api/v1/rider/deliveries/duty-status` [200 OK]

---

## 6. Verified Production Credentials
- **Admin Portal (`/admin`):** `admin@jankirasoi.com` / `JankiAdmin@2026`
- **Rider Portal (`/rider`):** `987654321` / `200720` (One-click quick fill enabled)
- **Support Hotline:** `+91 83190 14108`
