# VentoryPoint Warehouse Operating System
## Module Documentation: Blind Cycle Counting, Variance Reconciliation & Replenishment

**Module**: Sprint 11 — Cycle Counting & Replenishment  
**Primary Route(s)**: `/dashboard/counts`, `/dashboard/replenishment`, `/floor/count`  
**Parent PRD**: Phase 1 — Sprint 11 — Cycle Counting and Replenishment  
**Status**: Planned (Depends on Sprint 5 Adjustments & Sprint 9 Short-Pick Hook)

---

### 1. Executive Summary

Sprint 11 maintains 99.9%+ warehouse inventory accuracy without ever freezing operations for weekend wall-to-wall shutdowns. It introduces **Blind Cycle Counting** (where counters never see expected system quantities), **Movement-Reconciled Variance Detection**, automatic recount assignment to a second worker, and **Min/Max Forward Pick-Face Replenishment**.

Key capabilities:
1. **Flexible Count Task Planner**: Schedule or trigger counts by Location, Zone/Aisle, SKU, Lot (e.g., pre-recall check), ABC velocity schedule, or automatically from a Sprint 9 Short Pick.
2. **True Blind Floor Counting**: System snapshots `expected_qty` at count start but hides it on the floor terminal so workers count what is physically present.
3. **Live Movement Reconciliation**: If a picker picks 5 units from a bin while a counter is counting it, the variance engine reconciles in-flight movements against the snapshot so valid picks are never misreported as shrinkage.
4. **Two-Worker Recount & Supervisor Approval**: Out-of-tolerance variances automatically assign a recount task to a *different* floor worker before routing to the Supervisor Approval Queue (`adjust_inventory`).
5. **Min/Max Pick-Face Replenishment**: Monitors forward pick bins and automatically generates FEFO/FIFO replenishment tasks from reserve pallet locations when stock drops below `min_qty`.

---

### 2. Database Schema Overview

```
┌────────────────────────┐       ┌────────────────────────┐
│      count_tasks       │1─────*│      count_lines       │
│ (Blind / Recount / ABC)│       │ (Snapshot vs Counted)  │
└────────────────────────┘       └────────────────────────┘

┌────────────────────────┐       ┌────────────────────────┐
│  replenishment_rules   │1─────*│  replenishment_tasks   │
│ (Pick Bin Min / Max)   │       │ (Reserve → Pick Face)  │
└────────────────────────┘       └────────────────────────┘
```

| Table | Purpose |
| :--- | :--- |
| **`count_tasks`** | Cycle count assignments (`scheduled`, `ad_hoc`, `short_pick_triggered`, `recount`) scoped by facility and zone. |
| **`count_lines`** | Per-location/SKU/lot/serial count records storing `snapshot_expected_qty` (hidden from counter), `counted_qty`, `reconciled_delta`, and approval state. |
| **`replenishment_rules`** | Defines `min_qty`, `max_qty`, and preferred reserve zone for forward pickable locations per SKU. |
| **`replenishment_tasks`** | Directed floor tasks moving FEFO/FIFO reserve stock (`Pallet/Case`) down into forward pick bins. |
