# VentoryPoint Warehouse Operating System
## Module Documentation: Event Backbone, Immutability & Audit Log

**Module**: Sprint 2 — Event Backbone, Realtime & Audit Log  
**Routes**: `/dashboard/settings/audit-log`, `/internal/event-console`, `/internal/event-deliveries`  
**Parent PRD**: Phase 1 — Sprint 02 — Event Backbone Realtime and Audit Log  
**Status**: 100% Implemented & Verified in Production  

---

### 1. Executive Summary

In mission-critical supply chain and 3PL warehousing, **data integrity is non-negotiable**:
* When high-value inventory goes missing, operators must know exactly who moved what pallet, at what second, on which tablet.
* When client billing or storage charges are calculated, the history of every inventory movement must be cryptographically immutable.
* Enterprise 3PL clients require strict compliance audits (SOC 2 Type II, ISO 27001, FDA cGMP).

VentoryPoint solves this through a dual-layer architecture:
1. **The Event Backbone (`warehouse_events`)**: A high-throughput, partitioned, append-only event store capturing every atomic physical action in the warehouse.
2. **The Change History Audit Log (`audit_log`)**: An automated change-data-capture (CDC) ledger logging before/after state diffs on every table with full actor attribution.
3. **Internal Event Console & Webhooks**: Operational tooling for monitoring background events, dead-letter queues, and external webhook deliveries.

---

### 2. Database Architecture & Immutability

```
┌─────────────────────────────────────────────────────────────┐
│                 Physical Warehouse Action                   │
│         (Barcode Scan, Location Move, Status Change)        │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   [warehouse_events]                     [audit_log]
   - Monthly Partitioned Table            - Change-Data-Capture (CDC)
   - Append-Only (No UPDATE/DELETE)       - Before & After JSONB diffs
   - Idempotency Keys (No Duplicates)     - Actor User / Worker Badge
   - Triggers Block All Truncates         - Compliance Search UI
```

#### 2.1 The Append-Only Event Store (`warehouse_events`)
* **Partitioned by Month**: Sliced using PostgreSQL range partitioning (`PARTITION BY RANGE (occurred_at)`). Automatically maintains past and future month partitions via scheduled maintenance.
* **Core Columns**:
  * `sequence` (`bigserial`): Global monotonic sequence number.
  * `organization_id`, `facility_id`, `client_account_id`: Tenancy and client scoping.
  * `event_type`: Registered event type (e.g. `location.created`, `inventory.received`, `order.picked`).
  * `entity_type` & `entity_id`: Target object (e.g., `location`, `pallet`, `item`).
  * `payload` (`jsonb`): Validated structured event data.
  * `actor_user_id` & `actor_worker_id`: Differentiates office user vs floor worker.
  * `device_id`: Hardware tablet/scanner identifier where the event originated.
  * `occurred_at` vs `received_at`: Resolves clock drift for offline scanner syncing.
* **Idempotency Guard (`event_idempotency_keys`)**:
  Network drops are common on warehouse floors. Scanners retry submissions with a unique idempotency key. If a key is seen twice within the organization, the duplicate insert is safely rejected.

#### 2.2 Mathematical Immutability (Database Guard Triggers)
Traditional database users (even administrators) can accidentally run `UPDATE` or `DELETE` on log tables. In VentoryPoint:
* **Trigger `trg_warehouse_events_immutable`**: Raises an uncatchable PostgreSQL exception on any attempt to execute `UPDATE` or `DELETE` on `warehouse_events` or any of its monthly partitions.
* **Trigger `trg_warehouse_events_block_truncate`**: Strictly prohibits `TRUNCATE` commands.
* Even `service_role` (backend administrative credentials) cannot delete or tamper with historical records.

---

### 3. Change History Audit Log (`/dashboard/settings/audit-log`)

The Change History page provides 3PL Owners and Compliance Auditors with a transparent, searchable history of every system modification.

#### 3.1 What Is Logged:
Every configuration change, client record edit, facility update, membership alteration, and security setting is logged into `audit_log`:
* **Table & Row**: Identifies the exact entity modified (e.g., `facilities`, `client_accounts`, `organization_members`).
* **Action**: `INSERT`, `UPDATE`, `DELETE`.
* **Field Diffs**: The exact list of modified columns (e.g., `['operating_hours', 'timezone']`).
* **Before & After Snapshots**: Full JSONB states showing the previous value and the new value side-by-side.
* **Actor Attribution**: User ID, assigned role at the time of the action, IP address, and timestamp.

#### 3.2 Audit Log Search & Filters
* **Table Filter**: Filter changes to specific entities (e.g., *Show only changes to Billing Settings*).
* **Actor Filter**: Filter changes made by a specific team member.
* **Date Range**: Filter between specific calendar dates.
* **Export**: Export filtered audit records for external compliance auditors.

---

### 4. Internal Event Console & Deliveries (`/internal`)

Platform operators have access to the internal administration suite to inspect message queues and external integration health:

#### 4.1 Event Console (`/internal/event-console`)
* Live stream of warehouse events emitted across the entire platform.
* Filter by event type, entity ID, or facility.
* Inspect payload JSON schemas, consumer statuses, and timing metrics.

#### 4.2 Webhook Deliveries (`/internal/event-deliveries`)
* Monitors external webhook events sent to client ERPs, Shopify stores, and transportation management systems.
* Tracks delivery attempts, HTTP response status codes (e.g., 200 OK vs 500 Error), and retry backoff delays.
* Dead-letter queue inspection for retrying failed deliveries.

---

### 5. Code Architecture

* **Customer Audit Log**:
  * Page: `apps/web/src/app/dashboard/settings/audit-log/page.tsx`
  * Client: `apps/web/src/app/dashboard/settings/audit-log/components/audit-log-client.tsx`
  * Diff Viewer: Shows structured diffs highlighting changed values in green/red.
* **Internal Event Console**:
  * Pages: `apps/web/src/app/internal/event-console/` and `apps/web/src/app/internal/event-deliveries/`
  * Actions: `actions.ts` (Event replay, DLQ retries).
* **Event Lib**:
  * `apps/web/src/lib/events.ts`: Core event recording and idempotency utility.
