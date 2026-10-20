# VentoryPoint Platform Operations & Shared Services (Sprint 02A)

VentoryPoint has two distinct web applications running side-by-side:

┌────────────┬──────────────────────────────────────────┬──────────────────────────────────────────┐
│            │ Customer Application (/dashboard)        │ Internal Admin Console (/internal)       │
├────────────┼──────────────────────────────────────────┼──────────────────────────────────────────┤
│ Who uses   │ 3PL warehouse operators (owners, admins, │ Your own company's platform operations   │
│  it        │ ops managers, floor workers, billing)    │ (Platform Admins, Support, CS, Finance)  │
├────────────┼──────────────────────────────────────────┼──────────────────────────────────────────┤
│ Where it   │ Laptop, mobile, desktop at               │ Restricted internal administration route │
│  lives     │ /dashboard                               │ at /internal                             │
├────────────┼──────────────────────────────────────────┼──────────────────────────────────────────┤
│ Auth &     │ Customer tenant membership via           │ Email allow-list + platform staff role;  │
│ Security   │ Row Level Security (RLS)                 │ blocked with 404 for non-platform users  │
├────────────┼──────────────────────────────────────────┼──────────────────────────────────────────┤
│ Access to  │ Full access to their own tenant's data   │ ZERO standing access to tenant data;     │
│ 3PL data   │ (strictly isolated from other 3PLs)      │ strictly consent-driven support access   │
└────────────┴──────────────────────────────────────────┴──────────────────────────────────────────┘

Sprint 02A built the foundation operating tools your company needs to run the platform from day one, plus four shared services every future sprint relies on:

1. **Internal Admin Console & Feature Flags** (`/internal`)
2. **Consented Support Access** (Time-boxed, audited support sessions)
3. **Platform Subscription Billing & Entitlements** (`/dashboard/settings/billing`)
4. **Universal Notification Service** (In-app bell + email pipeline)
5. **Pseudonymous Product Analytics** (`/internal/analytics`)
6. **Customer Data Export & Portability** (`/dashboard/settings`)

---

## 1. Internal Admin Console & Feature Flags (`/internal`)

The Internal Console gives your team full administrative oversight over every 3PL tenant on the platform without compromising customer privacy.

### How It Works:
- **Restricted Access**: Only emails configured in `PLATFORM_ADMIN_EMAILS` (or with a staff role in `platform_staff_roles`) can access `/internal`. Non-staff users get an immediate HTTP 404 `notFound()`.
- **Tenant Management**: Lists all 3PL organizations, their current plan tier, facility count, team size, operational timezone, and account status (Active vs Suspended).
- **Runtime Feature Flags**: Flags can be enabled globally or overridden for a specific tenant without deploying new code.
- **Platform Announcements**: Broadcast maintenance windows, new feature releases, or incident alerts across customer dashboards.

---

## 2. Consented Support Access (Zero Standing Access)

In traditional software, support staff have "god mode" database access. In VentoryPoint, **internal staff have zero standing access to 3PL inventory, orders, or client data under Row Level Security (RLS)**.

### How It Works:
```
[3PL Tenant Owner]
       │
       ▼ Grants Time-Boxed Consent (e.g. 4 Hours, Read-Only)
[support_access_grants table]
       │
       ▼ Dynamic RLS get_user_role(org_id)
[Platform Support Staff adopts temporary 'support' role]
       │
       ▼ When timer expires OR tenant clicks 'Revoke'
[Instant RLS Cut-Off — Zero Access Remaining]
```

1. **Customer Consent**: The 3PL owner opens `/dashboard/settings/support` and creates a grant:
   - **Scope**: `Read-Only` (inspect inventory/orders) or `Read & Write` (troubleshoot and fix configurations).
   - **Duration**: `1 hour`, `4 hours`, `8 hours`, `24 hours`, `3 days`, or `7 days`.
   - **Reason**: Optional ticket ID or context.
2. **Dynamic RLS Elevation**: While active, `public.get_user_role(org_id)` automatically resolves to `'support'` for authenticated platform staff.
3. **Persistent Warning Banner**: A prominent amber banner displays across the customer's dashboard shell while support access is active:
   `"Active Support Access Granted — Platform staff currently have temporary Read-Only access."`
4. **Instant Revocation**: The tenant owner can click **Revoke Access** at any second to immediately revoke all support permissions.
5. **Full Audit Trail**: Every grant, revocation, and inspection action is permanently logged in `public.audit_log` with the staff member's email.

---

## 3. Platform Subscription Billing & Entitlements

3PLs subscribe to VentoryPoint using volume-based public tiers via Stripe Billing.

### Pricing Tiers:
┌──────────────┬──────────────┬──────────────┬──────────────────┬────────────────────────────────────────┐
│ Plan Tier    │ Monthly      │ Annual (-20%)│ Shipped Cap      │ Included Resources & Features          │
├──────────────┼──────────────┼──────────────┼──────────────────┼────────────────────────────────────────┤
│ **Launch**   │ $499 / mo    │ $419 / mo    │ 5,000 orders/mo  │ 1 Facility, 5 Clients, Unlimited users │
│ **Growth**   │ $1,299 / mo  │ $1,099 / mo  │ 25,000 orders/mo │ 3 Facilities, 25 Clients, API & Roles  │
│ **Scale**    │ $2,499 / mo  │ $2,099 / mo  │ 100,000 orders/mo│ 10 Facilities, 100 Clients, Multi-node │
│ **Enterprise** Custom       │ Custom       │ Unlimited        │ Unlimited Facilities, Dedicated TAM    │
└──────────────┴──────────────┴──────────────┴──────────────────┴────────────────────────────────────────┘

### Key Operating Rules:
- **No Peak-Month Overage Penalties**: A core brand promise (*Core System Requirement 07*). Tier adjustments are evaluated on a **trailing 3-month average** rather than sudden holiday volume spikes.
- **14-Day Dunning Grace Period**: If an automatic monthly payment fails:
  1. The subscription enters `past_due` with a 14-day grace period.
  2. **Floor tasks are NEVER stopped mid-shift**: Warehouse pickers, packers, barcode scanners, and shipping trucks continue operating 100% uninterrupted.
  3. After the 14-day grace period expires, **only new configuration is locked** (e.g. adding new facilities or brand clients is blocked until payment is updated).

### Manage Card & Invoices Module:
Clicking **Manage Card & Invoices** opens the customer billing modal:
- **Active Card & ACH**: Displays current card details (e.g. Visa `•••• 4242`, Exp 12/28) with an inline **+ Update Card** form.
- **Dunning Clearance**: Updating a card automatically clears `past_due` dunning flags and restores account configuration access.
- **Invoices & Receipts**: Lists past statements (`INV-2026-003`, `INV-2026-002`, `INV-2026-001`) with **Download PDF Receipt** for tax and bookkeeping records.
- **Stripe Customer Portal**: When live Stripe credentials (`STRIPE_SECRET_KEY`) are connected, provides direct one-click redirect to Stripe's hosted Billing Portal.

### Entitlements Enforcement:
- The server-side entitlements service (`assertCanAddFacility`) automatically checks plan limits and dunning status before allowing operations like creating warehouse facilities.

---

## 4. Universal Notification Service

A unified notification service (`notify()`) used by every module in the platform.

### How It Works:
- **In-App Notification Center**: A bell icon in the dashboard header displays live unread badge counters and an interactive dropdown panel.
- **Notification Templates**:
  - `hold_action_needed`: Order on hold requiring address verification.
  - `near_expiry_stock`: Stock approaching expiration date.
  - `count_approval`: Cycle count variance requiring supervisor approval.
  - `billing_period_ready`: Monthly shipping volume statement ready.
  - `subscription_dunning`: Payment past due alert with grace period countdown.
  - `export_ready`: Data export compiled and ready for download.
- **User Channel Preferences**: Users can toggle notifications per type (In-App, Email, Both) and configure quiet hours.

---

## 5. Pseudonymous Product Analytics (`/internal/analytics`)

Measures platform adoption and operational efficiency without collecting customer personal data.

### Privacy & PII Guard:
- A database trigger (`validate_analytics_event_no_pii`) enforces that event payloads contain **no personal identifiers** (`email`, `name`, `phone`, `address`, `card`).
- Tenant and user identifiers are hashed using SHA-256 before storage.

### Tracked KPIs:
1. **The 15-Minute Pick Rule**: Measures the percentage of orders picked accurately within 15 minutes of release.
2. **Time to First Receipt**: Measures the median hours from tenant onboarding to their first verified ASN receipt scan.
3. **Weekly Active Facilities**: Counts warehouses performing live scans and transactions.
4. **Feature Adoption Matrix**: Tracks adoption across barcode scanning, support access, and multi-facility routing.

---

## 6. Customer Data Export & Portability

Provides complete data portability for 3PL owners (`/dashboard/settings`).

### How It Works:
- Owners and admins can click **Export Tenant Data (JSON)** at any time.
- The system packages organization settings, facilities, members, subscriptions, and recent audit logs into a clean, machine-readable JSON file.
- The export event is recorded in `data_export_jobs` with a 7-day expiring download record and logged in the customer audit trail.

---

## Try It Yourself (Step-by-Step Testing Guide)

### 1. Test Consented Support Access
1. Open `http://localhost:3000/dashboard/settings/support`.
2. Choose **Read-Only**, select **4 Hours**, enter a test reason (e.g., `Ticket #1049`), and click **Grant Support Access**.
3. Notice:
   - The live countdown timer starts ticking.
   - The prominent **Active Support Access** warning banner appears in the top navigation shell.
4. In another tab, open `http://localhost:3000/internal/tenants` and click on your tenant.
   - In the Overview card, observe the green **Support Access Active** badge showing the expiration time and reason.
5. Return to `/dashboard/settings/support` and click **Revoke Access Now**.
   - The banner vanishes immediately and staff access under RLS is cut off.

### 2. Test Platform Subscription Billing & Dunning
1. Open `http://localhost:3000/dashboard/settings/billing`.
2. Toggle between **Monthly** and **Annual** to see the 20% discount reflected across all cards.
3. Click **Upgrade to Growth** to test tier switching; observe the current plan updates and facility limits change from 1 to 3.
4. In the sandbox controls at the bottom, click **Simulate Past Due (In 14-Day Grace)**:
   - Notice the amber alert: *"Floor operations, scanners, and order picking will NEVER be stopped mid-shift."*
5. Click **Simulate Past Due (Grace Expired - Config Locked)**:
   - Notice the red alert: *"Configuration Paused: Floor tasks remain 100% operational."*
   - Navigate to `/dashboard/facilities` and attempt to add a new facility: observe the plan limit/grace period restriction error.
6. Click **Simulate Active Subscription** to return the account to good standing.

### 3. Test In-App Notifications
1. Look at the top navigation bar on any dashboard page.
2. Click the **Bell Icon**.
3. In the dropdown simulator, click **+ Order Hold Alert** or **+ Near-Expiry Alert**.
4. Notice the unread badge appear (`1`), click the notification to mark it read, or click **Mark all read**.

### 4. Test Customer Data Export
1. Open `http://localhost:3000/dashboard/settings`.
2. Scroll to the **Customer Data Export & Portability** section.
3. Click **Export Tenant Data (JSON)**:
   - A JSON export of your tenant is compiled and downloaded to your computer.
   - A confirmation banner displays the record count and 7-day expiry notice.

### 5. Test Product Analytics
1. Open `http://localhost:3000/internal/analytics`.
2. Inspect the **15-Minute Pick Rule**, **Time to First Receipt**, **Weekly Active Facilities**, and the live telemetry stream.
