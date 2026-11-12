# VentoryPoint Warehouse Operating System
## Module Documentation: Inventory Ledger, LPNs, Expiry & 'Where Is It?' Traceability

**Module**: Sprint 5 — Inventory Core (Physical Ledger & Traceability)  
**Route**: `/dashboard/inventory`  
**Parent PRD**: Phase 1 — Sprint 05 — Inventory Ledger, LPNs, Expiry & 'Where Is It?' Traceability  
**Status**: 100% Implemented & Verified against Live Database  
**Database Test Suite**: `supabase/tests/sprint05_ledger_suite.sql` (Passed 9/9 test groups)  

---

### 1. Executive Summary

Following physical location storage (Sprint 3) and product catalog tracking rules (Sprint 4), Sprint 5 delivers the core operational heartbeat of VentoryPoint: the **Inventory Ledger**.

In a multi-client 3PL warehouse, inventory cannot simply be a generic &ldquo;quantity&rdquo; counter. Warehouse operators, supervisors, and brand clients must know the real-time answer to:
> **&ldquo;Exactly where is this item?&rdquo;** &mdash; which location (full hierarchy path), which container (pallet/case/tote LPN), which lot with which manufacturing/expiry dates, which unique serial number, and in what status (available, allocated, hold, damaged, or expired).

Sprint 5 provides:
1. **Physical Balance Projection (`inventory_balances`)**: Multi-dimensional balance matrix by `facility × location × container (LPN) × SKU × lot × serial × status`.
2. **Append-Only Transaction History (`inventory_transactions`)**: Strictly immutable transaction ledger protected by PostgreSQL triggers (`VP001`) preventing `UPDATE` and `DELETE`.
3. **Container License Plates (LPNs)**: Pallets, master cases, picking totes, and mobile carts. Moving a pallet LPN relocates all contained SKU lines and serial units in a single atomic database operation.
4. **Lot & Expiry Management (FEFO)**: Shelf-life tracking with automated evaluation of near-expiry warnings and automatic segregation of expired stock to non-allocatable `expired` status.
5. **Supervisor Approval Queue**: Adjustments exceeding 10 units or classified as discrepancies are enqueued for review before impacting live balances.
6. **Unified &ldquo;Where Is It?&rdquo; Search**: Fast fuzzy and barcode scanner lookup across SKUs, barcodes, lots, serials, and LPNs, returning breadcrumb paths (`Building > Wing > Area > Aisle > Bay > Level > Position`).
7. **Complete Item Timeline**: End-to-end movement audit trail for any SKU, lot, serial, or container.

---

### 2. Database Architecture

#### 2.1 Schema Diagram

```
                        ┌───────────────────────────────────────┐
                        │             organizations             │
                        └───────────────────┬───────────────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
        ┌─────────────────────────┐                   ┌─────────────────────────┐
        │       facilities        │                   │     client_accounts     │
        └────────────┬────────────┘                   └────────────┬────────────┘
                     │                                             │
                     ▼                                             ▼
        ┌─────────────────────────┐                   ┌─────────────────────────┐
        │        locations        │                   │          skus           │
        └────────────┬────────────┘                   └────────────┬────────────┘
                     │                                             │
                     ├──────────────────────┬──────────────────────┤
                     │                      │                      │
                     ▼                      ▼                      ▼
        ┌─────────────────────────┐ ┌───────────────┐ ┌─────────────────────────┐
        │       containers        │ │     lots      │ │         serials         │
        │         (LPNs)          │ │ (Mfg/Expiry)  │ │   (Unique Device IDs)   │
        └────────────┬────────────┘ └───────┬───────┘ └────────────┬────────────┘
                     │                      │                      │
                     └──────────────────────┼──────────────────────┘
                                            │
                                            ▼
                             ┌─────────────────────────────┐
                             │     inventory_balances      │
                             │  (Real-Time Mass Balances)  │
                             └──────────────┬──────────────┘
                                            │
                                            ▼
                             ┌─────────────────────────────┐
                             │   inventory_transactions    │
                             │    (Append-Only Ledger)     │
                             └─────────────────────────────┘
```

#### 2.2 Table Specifications

* **`lots`**:
  * Scoped to client and SKU (`UNIQUE(sku_id, lot_number)`).
  * Tracks `mfg_date`, `expiry_date`, `first_received_at`, and `expiry_status` (`'ok'`, `'near_expiry'`, `'expired'`).
* **`containers`**:
  * Universal License Plate Numbers (`lpn`, unique per org).
  * Supports nesting (`parent_container_id`) for pallets containing cases/totes.
  * Tracks `container_type` (`'pallet'`, `'case'`, `'tote'`, `'cart'`) and `current_location_id`.
* **`serials`**:
  * Tracks individual unique units (`UNIQUE(client_account_id, sku_id, serial_number)`).
  * Maintains live pointers to `current_facility_id`, `current_location_id`, and `current_container_id`.
* **`inventory_balances`**:
  * Unique natural composite key: `(facility_id, location_id, container_id, sku_id, lot_id, serial_id, status)`.
  * Check constraints enforce non-negativity (`on_hand_qty >= 0`) and serialized unity (`chk_serial_qty`: on-hand qty must be $\in \{0, 1\}$).
  * Serial uniqueness invariant enforced via partial index (`uq_active_serial_balance`).
* **`inventory_transactions`**:
  * Append-only ledger recording all physical transfers, adjustments, receipts, and status changes.
  * Trigger `trg_block_inventory_transactions_mod` enforces immutability.
* **`inventory_adjustments`**:
  * Supervisor approval queue for count corrections exceeding 10 units.

---

### 3. Atomic PL/pgSQL Operations

All mutations occur through atomic, security-definer PostgreSQL functions ensuring conservation of mass and deterministic row locking:

| Function | Signature Summary | Operational Effect |
| :--- | :--- | :--- |
| **`move_inventory`** | `(facility, from_loc, to_loc, sku, lot, serial, qty, status, reason, actor)` | Atomically decrements source, credits destination balance, updates serial pointers, logs transaction, and writes `inventory.moved` event. |
| **`move_container`** | `(lpn, to_location, to_parent_container, notes, actor)` | Moves a container and all contained child balances and serials in a single atomic transaction. |
| **`adjust_inventory`** | `(facility, loc, container, sku, lot, serial, delta, reason, notes, actor)` | Applies delta immediately if $\le 10$ units; enqueues into `inventory_adjustments` for supervisor review if $> 10$ units. |
| **`approve_inventory_adjustment`**| `(adjustment_id, reviewer_id, reviewer_role, notes)` | Supervisor authorization that commits the queued delta to live balances. |
| **`change_inventory_status`** | `(facility, loc, sku, qty, from_status, to_status, reason, actor)` | Segregates inventory between Available, Hold, Damaged, and Expired. |
| **`where_is_it`** | `(query, facility_id, client_id)` | Fast lookup matching SKU, barcode, lot, serial, LPN, or location code. |
| **`get_item_timeline`** | `(item_type, item_id, limit)` | Returns chronological physical movement history. |
| **`evaluate_expiry_statuses`**| `()` | Nightly and on-demand job flagging near-expiry lots and auto-moving expired stock to `expired` status. |
| **`reconcile_inventory_balances`**| `(facility_id)` | Integrity check validating live balances against event projections. |

---

### 4. Verification & Automated Test Suite

The test suite in [`supabase/tests/sprint05_ledger_suite.sql`](file:///c:/Users/CI-STAFF/Documents/ventorypoint/supabase/tests/sprint05_ledger_suite.sql) was executed against the live Supabase PostgreSQL database:

* **Test Group 1 (Inbound Receiving)**: Verified non-unique, lot-tracked, and serialized receipt primitives.
* **Test Group 2 (Ledger Immutability)**: Verified trigger `trg_block_inventory_transactions_mod` blocks `UPDATE` and `DELETE` (`VP001`).
* **Test Group 3 (Constraint Invariants)**: Verified over-drawing balance rejection (`VP016`) and missing lot rejection (`VP013`).
* **Test Group 4 (Atomic Move & Mass Conservation)**: Verified source balance decremented and destination balance incremented with exact quantity conservation.
* **Test Group 5 (Container LPN Move)**: Verified moving pallet `LPN-TEST-99001` automatically relocated all contained inventory lines.
* **Test Group 6 (Adjustment Queue & Approval)**: Verified delta $= 5$ auto-applied, delta $= 25$ enqueued for supervisor review, and approved by supervisor.
* **Test Group 7 (Expiry Evaluation)**: Verified expired lot auto-flagged and stock moved to `status = 'expired'`.
* **Test Group 8 ('Where Is It?' Search)**: Verified LPN search, location path resolution, and item timeline retrieval.
* **Test Group 9 (Reconciliation)**: Verified clean balance reconciliation.
* **Result**: **100% Passed (9/9 Test Groups)**.
