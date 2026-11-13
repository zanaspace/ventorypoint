# VentoryPoint Warehouse Operating System
## Module Documentation: Outbound Orders, Validation Holds & Atomic Allocation

**Module**: Sprint 8 — Orders, Holds & Allocation  
**Primary Route(s)**: `/dashboard/orders`, `/dashboard/orders/[id]`  
**Parent PRD**: Phase 1 — Sprint 08 — Orders, Holds and Allocation  
**Status**: Planned (Depends on Sprint 4 SKU Rules & Sprint 5 Inventory Balances)

---

### 1. Executive Summary

Sprint 8 introduces the unified **Outbound Order Engine** that all sales channels (Shopify, Amazon, WooCommerce, CSV, Public API) feed into. It enforces a strict server-side order state machine, automatically places problematic orders on actionable holds before they reach the warehouse floor, and runs a deterministic **Atomic Allocation Engine** respecting each SKU's rotation rule (`FIFO`, `FEFO`, `LIFO`, or `customer_lot`).

Key capabilities:
1. **Strict Order State Machine**: `imported → on_hold ↔ ready → allocated → released → picking → picked → packing → packed → shipped` (plus `cancelled` prior to packing).
2. **Automatic Validation Holds**: Catches unmapped SKU aliases, invalid/incomplete shipping addresses, inactive SKUs, insufficient inventory, and manual client/fraud holds.
3. **Set-Based Atomic Allocation Engine (`allocate_orders`)**:
   * Evaluates orders in priority order (`priority → ship_by_date → order_date`).
   * Selects eligible `available` inventory in pickable locations that is not expired and meets minimum remaining shelf-life days.
   * Orders candidate bins strictly by SKU rotation rule (`FEFO` earliest expiry first, `FIFO` oldest receipt first, `LIFO` newest receipt first, or exact `customer_lot`).
   * Atomically transitions balance status from `available` to `allocated` using deterministic row locking so two concurrent runs can never over-allocate the last unit.

---

### 2. Database Schema Overview

```
┌──────────────────────┐       ┌──────────────────────┐
│        orders        │1─────*│     order_lines      │
│ (Header & Lifecycle) │       │ (SKU, Qty Ordered)   │
└──────────┬───────────┘       └──────────┬───────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐       ┌──────────────────────┐
│     order_holds      │       │     allocations      │
│ (Reason & Resolution)│       │ (Loc × Lot × Serial) │
└──────────────────────┘       └──────────────────────┘
```

| Table | Purpose |
| :--- | :--- |
| **`orders`** | Outbound order header scoped by `organization_id`, `facility_id`, and `client_account_id`, with unique `(client_account_id, channel, external_id)`. |
| **`order_lines`** | Line items with `qty_ordered`, `qty_allocated`, `qty_picked`, `qty_packed`, `qty_shipped`, and optional `requested_lot_number`. |
| **`order_holds`** | Active and historical holds (`unmapped_sku`, `invalid_address`, `insufficient_stock`, `manual_hold`, `requested_lot_unavailable`). |
| **`allocations`** | Hard reservations linking an `order_line_id` to a specific `inventory_balance_id` (`location_id`, `container_id`, `lot_id`, `serial_id`, `qty`). |

---

### 3. Rotation Rule Enforcement Matrix

| SKU Rotation Rule | Candidate Balance Ordering | Tie-Breaker |
| :--- | :--- | :--- |
| **FEFO** (First-Expired, First-Out) | `lots.expiry_date ASC` (skipping lots below `min_shelf_life_days`) | `locations.walk_sequence ASC`, smallest bin qty first |
| **FIFO** (First-In, First-Out) | `COALESCE(lots.first_received_at, containers.received_at, balance.created_at) ASC` | `locations.walk_sequence ASC`, smallest bin qty first |
| **LIFO** (Last-In, First-Out) | `COALESCE(lots.first_received_at, containers.received_at, balance.created_at) DESC` | `locations.walk_sequence ASC` |
| **Customer-Specified Lot** | Filters strictly to `lots.lot_number = order_line.requested_lot_number` | Holds order if requested lot lacks stock |
