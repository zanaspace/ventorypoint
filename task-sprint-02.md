# Sprint 2 & 02A — Event Backbone · Internal Admin · Billing · Notifications: Status Audit

Sources:
- `PRD/PRD/Phase 1 - The Wedge (MVP)/Phase 1 - Sprint 02 - Event Backbone Realtime and Audit Log.md`
- `PRD/PRD/Phase 1 - The Wedge (MVP)/Phase 1 - Sprint 02A - Internal Admin Platform Billing and Notifications.md`

Audited against the code in `apps/web/src`, `packages/`, and `supabase/migrations` (6 migrations, all Sprint 1) on 2026-10-09.

Legend: `[x]` done · `[~]` partial · `[ ]` not started

---

## Summary

| Sprint | Status | Tasks done | Partial | Acceptance criteria passing |
|---|---|---|---|---|
| **Sprint 2** — Event Backbone, Realtime & Audit Log | **Built — awaiting live measurement** | 13 of 14 | 2 (worker scheduling, load test run) | 4 of 5 (+1 needs live Supabase) |
| **Sprint 02A** — Internal Admin, Platform Billing, Notifications & Analytics | **Not started** | 0 of 15 | 1 (header bell placeholder) | 0 of 6 |

What already exists and can be reused:
- `floor_devices` table (Sprint 1 floor auth): org/facility scoped, `device_name`, `device_token`, `is_authorized`, `last_active_at`, with RLS. A starting point for the Sprint 2 device registry.
- `login_floor_worker(... p_device_token)` RPC already accepts a device token, but the client never sends one.
- Supabase Realtime is enabled in `supabase/config.toml`, but nothing uses it yet.
- Header notification bell in `components/app-shell.tsx` is a static placeholder (no data, no inbox).
- Sprint 1 helpers to build on: `get_user_role()`, `user_has_facility()`, `get_user_permissions()`, the immutable `organization_id` trigger pattern, and `supabase/tests/rls_security_suite.sql`.

Gate: Sprint 2 must be signed off before 02A starts, and 02A before Sprint 3. **Sprint 3 (locations) is blocked until both are done.**

---

# Sprint 2 — Event Backbone, Realtime & Audit Log

## Step 1 — Event Store Schema & Immutability ✅

Migration: `supabase/migrations/20261009120000_event_store.sql` · Tests: `supabase/tests/event_store_suite.sql` (6 tests, passing on Postgres 17)

- [x] **1.1 `warehouse_events` table**: partitioned by month (`PARTITION BY RANGE (occurred_at)`).
  - [x] Columns: `id`, `sequence`, `organization_id`, `facility_id`, `client_account_id`, `event_type`, `event_version`, `entity_type`, `entity_id`, `payload jsonb`, `actor_user_id`, `actor_worker_id`, `device_id`, `source`, `correlation_id`, `causation_id`, `idempotency_key`, `occurred_at`, `received_at`.
  - [x] Indexes: `(facility_id, occurred_at)`, `(entity_type, entity_id, occurred_at, sequence)`, `(organization_id, occurred_at)`, `(event_type, occurred_at)`, `correlation_id`.
  - [x] Idempotency: separate `event_idempotency_keys` table, unique per `(organization_id, idempotency_key)` and linked to its event by foreign key. A unique index on the partitioned table would have to include `occurred_at`, which would allow reuse.
  - [x] Initial partitions: previous month through +3 months.
  - [x] Checks: payload must be a JSON object, `source` from an allowed list, key length 8–200.
- [x] **1.2 `event_type_registry`**: `event_type`, `version`, `description`, `entity_type`, `payload_schema`, `consumers`, `is_floor_event`, `is_active`.
  - [x] Seeded: the 8 PRD types + `order.created`, `order.hold_placed`, `order.hold_released`, `system.synthetic` (for the dev console and load tests).
  - [ ] Add further event types as Sprints 3–16 define their producers.
- [x] **1.3 Immutability & RLS**
  - [x] Privileges: tenants get SELECT only; INSERT only for `service_role` (and the `record_event` definer function in Step 2).
  - [x] Guard triggers raise on UPDATE/DELETE (all roles, including owner and `service_role`) and on TRUNCATE (parent + every partition).
  - [x] `event_idempotency_keys` is append-only and invisible to tenants.
  - [x] SELECT policy: active org member + `user_has_facility(facility_id)`; org-level events (no facility) visible to all members.
  - [x] `client_user` excluded from events until per-client scoping exists (Sprint 11A).
  - [x] Partitions locked down: no direct access, RLS enabled.
- [x] **1.4 Partition maintenance**: `ensure_warehouse_event_partition(date)` (on demand, e.g. back-dated migration imports) + `ensure_warehouse_event_partitions(back, ahead)` scheduled daily by pg_cron (03:15).

## Step 2 — Event Write API & Devices ✅

Migration: `supabase/migrations/20261009130000_event_write_api.sql` · Tests: `supabase/tests/event_write_api_suite.sql` (10 tests, passing on Postgres 17) · App: `src/lib/events.ts`, `src/lib/device-id.ts`, `src/app/floor-login/actions.ts`, `src/app/dashboard/devices/`

- [x] **2.1 Write API**: three entry points sharing one validated, idempotent insert (`_insert_event`, not callable by clients).
  - [x] `record_event(...)` for signed-in members: org membership + `user_has_facility`; `client_user` and anonymous callers denied.
  - [x] `record_floor_event(token, event)` for floor terminals: org, worker, device (and default facility) come from the server-side session, never the client.
  - [x] `record_system_event(org, event, source)` for trusted server code (`service_role` only): integrations, API, system jobs, migration imports.
  - [x] Event type must be registered and active; payload validated against its schema by `validate_event_payload` (JSON Schema subset, no extension needed).
  - [x] Duplicate `idempotency_key` returns the **original** event ID, checked before time limits so offline retries always succeed. A concurrent duplicate loses the race cleanly.
  - [x] `occurred_at`: up to 2 min clock skew; > 72h rejected unless a supervisor+ gives `backdate_reason` (stored with `backdate_approved_by`). Floor terminals can't back-date. Migration imports keep historical timestamps. Missing month partitions are created on demand.
  - [x] Errors carry stable codes (`scope_denied`, `invalid_payload`, `device_not_authorized`, …) for the app.
- [x] **2.2 Batches**: `record_events` / `record_floor_events`, up to 100 events, each succeeds or fails on its own, with per-event `created` / `duplicate` / `error` results.
- [x] **2.3 Devices**
  - [x] `floor_devices` extended: `device_type`, `retired_at`, `registered_by`, `updated_at`; writes only through RPCs (direct table writes revoked); supervisors can view.
  - [x] **Trust on first use (Decision 1.2.4):** the first badge + PIN sign-in registers **and activates** a terminal, so workers scan immediately. Warehouse auto-assigned when the worker has one; otherwise the terminal asks once (`set_floor_device_facility`, can't be changed from the terminal afterwards). Optional per-org `require_device_approval` restores approve-first. Supervisors+ `register_device`, `update_device` (rename, facility, approve, block/unblock), `retire_device`; blocking or retiring ends that device's sessions. Migration `20261009170000_device_trust_on_first_use.sql`, write API TEST 12.
  - [x] Floor event types are rejected without an approved device of the same organization; `device_id` recorded on every floor event.
  - [x] Last seen updated at most once a minute per device.
  - [x] `useDeviceId()` hook: persistent browser UUID in `localStorage`, sent at floor login.
  - [x] Devices page at **Settings → Devices** (`/dashboard/settings/devices`; owner/admin/ops manager/supervisor): rename, assign warehouse, approve (strict mode), block/unblock, retire, register this browser; owners/admins toggle "Require approval for new terminals".
- [x] **Security fix: floor sessions.** The `vp_floor_session` cookie held unsigned JSON (worker/org IDs) that could be edited to impersonate any worker in any organization. It now holds an opaque 256-bit token; only its SHA-256 is stored in `floor_sessions` (12h expiry, revocable). The terminal reads identity through `get_floor_session`; logout calls `end_floor_session`.
- [x] Typed app helpers: `recordEvent`, `recordEvents`, `recordFloorEvent`, `recordFloorEvents` with an `EventErrorCode` union; `submitFloorEvents` server action for the Sprint 6 floor workspace.

## Step 3 — Realtime Fan-Out & Durable Consumer Queue ✅ (worker scheduling pending)

Migration: `supabase/migrations/20261009150000_realtime_and_queue.sql` · Tests: `supabase/tests/realtime_and_queue_suite.sql` (10 tests, passing on Postgres 17 with a Realtime stand-in) · App: `src/lib/realtime/use-facility-events.ts`, `src/lib/event-worker.ts`, `src/app/api/internal/event-worker/route.ts`, `src/app/dashboard/event-deliveries/`

- [x] **3.1 Realtime broadcast**
  - [x] Supabase Realtime enabled in config.
  - [x] Insert trigger broadcasts each event (`realtime.send`, private) on `facility:{facility_id}`, or `org:{organization_id}` for organization-level events. A Realtime failure never blocks the write.
  - [x] Channel authorization: policy on `realtime.messages` via `can_subscribe_event_topic()`, mirroring event RLS (org member, facility access, no `client_user`).
  - [x] `useFacilityEvents({ facilityIds, organizationId, eventTypes, onEvent })` hook with live/connecting/error status.
- [x] **3.2 Consumer queue & worker**
  - [x] `event_consumers` registry: `test_consumer` enabled; `inventory_projection`, `billing_capture`, `channel_sync`, `usage_metering`, `notifications` registered but **disabled**, so they collect a backlog until their sprint enables them.
  - [x] `event_deliveries`: one row per (event, consumer), enqueued in the insert transaction.
  - [x] `claim_event_deliveries` (SKIP LOCKED, 60s lease, expired leases reclaimed), `complete_event_delivery` (lease holder only), `fail_event_delivery` (backoff 5s → 10s → … capped at 1h, + jitter; dead after `max_attempts`, default 8).
  - [x] Consumer-side idempotency: `consumer_processed_events` + `mark_event_processed()`.
  - [x] Worker: `runEventWorker()` with a consumer handler registry; `/api/internal/event-worker` (GET/POST, `Authorization: Bearer $EVENT_WORKER_SECRET`, timing-safe check, 45s budget).
  - [ ] **Schedule the worker.** Set `EVENT_WORKER_SECRET` (≥ 32 chars) and call the endpoint from pg_cron + pg_net, Vercel Cron or another scheduler. A once-a-minute cron can't meet the 5s lag target. Decide the runtime (open question) before consumers with tight lag (inventory projection) go live.
- [x] **3.3 Event Deliveries view**: staff-only **Event pipeline** at `/internal/event-deliveries` (cross-customer, gated by `PLATFORM_ADMIN_EMAILS` until the Sprint 02A internal console): per-consumer queued / retrying / dead / lag (alert colour above the consumer's threshold) / processed in 24h, failed-delivery list with last error, **Replay** per delivery and **Replay all dead** per consumer. Auto-refreshes every 15s.

## Step 4 — Audit Log, Load Test & Sign-Off (built; live measurements pending)

Migration: `supabase/migrations/20261009160000_audit_log.sql` · Tests: `supabase/tests/audit_log_suite.sql` (7 tests) · App: `src/app/dashboard/audit-log/`, `src/app/dashboard/dev/events/`, `apps/web/scripts/load-test-events.mjs`

- [x] **4.1 Configuration audit log**
  - [x] `audit_log`: table, row, action, changed fields, before/after JSON, actor, JWT role, org, time. Append-only for everyone (incl. `service_role`); no FK so entries outlive deleted rows.
  - [x] Generic `audit_row_change()` trigger on `organizations`, `facilities`, `client_accounts`, `client_facilities`, `organization_members`, `member_facility_access`, `invitations`, `floor_worker_credentials`, `floor_devices`.
  - [x] Secrets redacted but still recorded as changed: invitation `token`/`invite_code`/`code_hash`, `badge_token`, `pin_hash`, `device_token`.
  - [x] Bookkeeping ignored (`updated_at`, device `last_active_at`, login `failed_attempts`/`last_signed_in_at`); lockouts (`locked_until`) still logged.
  - [x] Changes made through security definer RPCs keep the real actor.
  - [x] RLS: owners/admins of the org read; nobody writes directly.
  - [x] **Settings → Change history** (`/dashboard/settings/audit-log`, owners/admins): filter by setting, person and date range; shows old → new per field; paginated, URL-shareable filters.
- [ ] **4.2 Load & chaos tests**
  - [ ] 200 events/s sustained per facility, consumer lag ≤ 5s: run `apps/web/scripts/load-test-events.mjs` against staging (script reports throughput, batch/single p50/p95, duplicates and consumer lag). Needs a real Supabase project and the worker running continuously.
  - [x] Consumer outage/restart, no loss, no double-processing (queue TEST 8).
  - [x] 10,000 events with 5% duplicate keys → 9,500 (write API TEST 2).
- [x] **4.3 Developer event console**: staff-only at `/internal/event-console` (also off in production unless `ENABLE_DEV_CONSOLE=true`): emit 1–100 events of any type with a custom payload, live Realtime feed, end-to-end latency p50/p95 against the 500 ms target.
- [x] **4.4 RLS tests** for every new table: `warehouse_events`, `event_type_registry`, `event_idempotency_keys`, `floor_devices`, `floor_sessions`, `event_consumers`, `event_deliveries`, `consumer_processed_events`, `realtime.messages` policy, `audit_log`.

## Sprint 2 — Acceptance Criteria

- [x] 10,000 synthetic events with 5% duplicate idempotency keys → exactly 9,500 unique events (write API TEST 2).
- [~] Browser subscribed to Facility 1 receives an event in < 500ms (p95); a browser in another org receives nothing. Isolation passes (queue TEST 2); latency must be measured on live Supabase with the Event console.
- [x] Consumer stopped 10 min then restarted → all queued events processed, no loss, no double-processing (queue TEST 8).
- [x] Any UPDATE/DELETE on `warehouse_events` fails, **including via the service role** (TEST 3).
- [x] Editing a facility's cutoff time creates an audit entry with old value, new value and editor (audit TEST 1).

## Sprint 2 — Non-Functional Targets

- [ ] `record_event` p95 < 50ms · batch of 100 < 300ms · realtime p95 < 500ms (measured).
- [ ] 200 events/s per facility sustained, consumer lag < 5s.
- [x] Event reads and realtime channels both enforce org + facility isolation.
- [x] Monthly partitions pre-created by a scheduled job.
- [ ] Metrics (throughput, consumer lag, dead-letter count) exported with alerts.

## Sprint 2 — Open Questions (answer or defer before sign-off)

- [ ] Worker runtime: Supabase Edge Function cron vs. long-running Node worker (Day 1 spike recommended).
- [ ] Maximum back-dating for `occurred_at` (proposed 72h + supervisor override).
- [ ] Payloads: denormalised display data (SKU code, location code) or IDs only?

---

# Sprint 02A — Internal Admin Console, Platform Billing, Notifications & Analytics

## Step 1 — Internal Admin Console & Feature Flags

- [ ] **1.1 Internal roles & console shell**
  - [ ] `platform_staff` table with roles: Platform Admin, Support, Customer Success, Finance (separate from tenant roles).
  - [ ] `/internal` route group with its own layout, gated in `middleware.ts`/`proxy.ts` to platform staff.
  - [ ] Enforced MFA (Supabase Auth TOTP, `aal2` required for `/internal`).
- [ ] **1.2 Tenant views**
  - [ ] Tenant list: status, plan, facilities, clients, users, onboarding stage.
  - [ ] Tenant detail: usage (orders shipped, scans, storage), onboarding checklist stage, internal notes.
  - [ ] Read via audited server-side queries. Staff never bypass RLS for tenant content.
- [ ] **1.3 Feature flags**: `feature_flags` (global kill switches) + `organization_feature_flags`, an admin UI to toggle them, an audit trail, and a server-side `isFeatureEnabled(org, flag)` helper.
- [ ] **1.4 Announcements/banners**: `announcements` table (message, severity, audience, start/end), an internal editor, and a tenant-side banner in the app shell.

## Step 2 — Consented Support Access

- [ ] `support_access_grants` table: org, granted_by, scope (`read_only` | `read_write`), `expires_at`, `revoked_at`.
- [ ] Customer consent UI in Settings (grant 24h / custom, revoke).
- [ ] `support` role recognized by RLS helpers only while a grant is active; access ends automatically at expiry.
- [ ] Visible banner in the customer's app while support access is active.
- [ ] Every support action logged with the support user's identity (reuse the Sprint 2 `audit_log`) and visible to the customer.

## Step 3 — Platform Subscription Billing & Entitlements

- [ ] **3.1 Stripe products, Checkout & Portal**
  - [ ] Plans/prices in Stripe: Launch, Growth, Scale, plus design-partner custom prices (100% coupon until go-live, if approved).
  - [ ] `subscriptions` table (org, Stripe customer/subscription IDs, plan, status, period end).
  - [ ] Checkout session for signup; Customer Portal for card/ACH, invoices, cancellation.
  - [ ] Stripe secret keys only in environment stores (never in client components).
- [ ] **3.2 Webhooks**: idempotent handler (`stripe_webhook_events` dedupe table) for subscription and invoice events.
- [ ] **3.3 Entitlements**: plan → features and limits map, checked server-side in actions/API, with UI gates (hide/disable + upgrade prompt).
- [ ] **3.4 Usage metering**: monthly shipped orders from `shipment.shipped` events (live from Sprint 10), a trailing 3-month average for tier review, no overage penalties.
- [ ] **3.5 Dunning**: dunning emails, 14-day grace period, then restrict **configuration only**. Floor operations must never be blocked.

## Step 4 — Notification Service, Analytics & Data Export

- [~] **4.1 Notification service**
  - [~] In-app bell in the header (static placeholder, no data).
  - [ ] `notifications` (inbox) + `notification_templates` (versioned) + `notification_preferences` tables, with RLS.
  - [ ] `notify(event, recipients, template, data)` API in `packages/services`.
  - [ ] Email channel via Resend (API key in env only).
  - [ ] In-app channel: live bell count + inbox page (realtime via Sprint 2).
  - [ ] Per-user preferences per type/channel, daily digest, quiet hours.
  - [ ] At-least-once delivery with de-duplication.
  - [ ] Initial catalogue: invites, holds needing action, integration errors, near-expiry stock, count approvals, billing period ready, subscription/dunning.
- [ ] **4.2 Product analytics**
  - [ ] PostHog (US cloud) or the chosen alternative, wired client + server.
  - [ ] Event taxonomy: onboarding steps, floor task start/complete, time per step, feature usage.
  - [ ] Pseudonymous IDs (org/user hashed), no PII, opt-out respected.
  - [ ] Automated PII check (test fails if an event has email/name/address fields).
  - [ ] KPI dashboards: time to first receipt, 15-minute rule (first accurate pick), weekly active facilities, feature adoption.
- [ ] **4.3 Customer data export**
  - [ ] Owner-only export job (CSV/JSON zip of all tenant data).
  - [ ] Stored in a private Supabase Storage bucket with an expiring signed download link.
  - [ ] Export logged as an audit/event entry.
- [ ] **4.4 RLS tests** for every new 02A table (staff, flags, announcements, grants, subscriptions, notifications, preferences, exports).

## Sprint 02A — Acceptance Criteria

- [ ] Support user sees no tenant data until a grant exists and loses access automatically at expiry.
- [ ] Every support action appears in the tenant's audit view with the support user's identity.
- [ ] Stripe Checkout → plan entitlements active within 1 minute → a gated feature is blocked on a lower plan.
- [ ] Failed payment → dunning emails → after grace, configuration restricted, floor tasks still work.
- [ ] Simulated hold event → in-app notification + email per the user's preferences.
- [ ] Automated check: analytics events contain no email, name or address fields.

## Sprint 02A — Non-Functional Targets

- [ ] Internal console behind MFA with separate roles; staff never bypass RLS.
- [ ] Support access consent-based, time-boxed and logged.
- [ ] Notifications at-least-once with de-dupe; Stripe webhooks idempotent.
- [ ] Analytics pseudonymous, US-hosted, opt-out respected.

## Sprint 02A — Open Questions

- [ ] Analytics tool: PostHog (recommended, US cloud) vs. an existing tool.
- [ ] Put design partners on Stripe from day one with a 100% coupon? (Recommended: yes.)

---

## Suggested Build Order

1. **Sprint 2, Step 1 → 2** (event table, registry, immutability, `record_event`, devices). Everything else depends on it.
2. **Sprint 2, Step 4.1** (audit log). Small, high value, and 02A support access reuses it.
3. **Sprint 2, Step 3** (realtime + queue), then the load/chaos tests and the developer console.
4. **Sprint 02A, Steps 1 → 2** (internal console, flags, support access).
5. **Sprint 02A, Step 4.1** (notifications). It wires the existing header bell.
6. **Sprint 02A, Step 3** (Stripe). Needs Stripe test-mode accounts and products created first.
7. **Sprint 02A, Steps 4.2–4.3** (analytics, data export).

## Sprint 2 / 02A Sign-Off Status: IN PROGRESS

- Sprint 2: all four steps built. 4 of 5 acceptance criteria pass in tests. Remaining: realtime p95 < 500 ms and the 200 events/s load test must be measured on a real Supabase project (use the Event console and the load test script), then sign-off.
- Sprint 02A: 0 of 6 acceptance criteria pass.

## Found During Step 1

- `supabase/tests/rls_security_suite.sql` (Sprint 1) had never run successfully. Fixed: `currency` → `default_currency`. Still broken:
  - Inserts two members with `RETURNING id INTO` a single variable ("query returned more than one row").
  - Calls `get_user_role(org, user)` and `can_manage_member(user, member)`, but only one-argument versions exist (they read `auth.uid()`).
  - Needs a rewrite that switches role/JWT claims like `event_store_suite.sql` does, before Sprint 1 can claim an automated RLS suite.
- Tests run locally in an in-process Postgres 17 (PGlite) with Supabase auth/role stubs. Run them against a real Supabase instance (`supabase db reset` then `psql -f supabase/tests/event_store_suite.sql`) before sign-off.

## Navigation & Access (2026-10-09)

- Customer sidebar holds daily work only: Dashboard, Facilities, Clients, Members (+ Floor Terminal link, Settings).
- **Settings** sections, by role: Organization (owner/admin/billing), Devices (owner/admin/ops manager/supervisor), Change history (owner/admin).
- **`/internal`** is for platform staff only (Event pipeline, Event console). Interim gate: verified email in `PLATFORM_ADMIN_EMAILS` (comma-separated); everyone else gets a 404. Every internal page and action re-checks access. Replace with Sprint 02A staff roles + MFA.
- Environment variables to set: `PLATFORM_ADMIN_EMAILS`, `EVENT_WORKER_SECRET` (≥ 32 chars), optional `ENABLE_DEV_CONSOLE=true` for the console in production.
