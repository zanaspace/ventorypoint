# VentoryPoint Warehouse Operating System
## Module Documentation: Wave Planning & Multi-Picker Floor Picking

**Module**: Sprint 9 — Waves & Picking  
**Primary Route(s)**: `/dashboard/waves`, `/floor/pick`  
**Parent PRD**: Phase 1 — Sprint 09 — Waves and Picking  
**Status**: Planned (Depends on Sprint 8 Allocations & Sprint 3 Walk Sequence)

---

### 1. Executive Summary

Sprint 9 transforms allocated orders into high-efficiency, collision-free floor picking tasks. Supervisors group orders into **Waves** by carrier cutoff, client, or order profile, and floor workers execute **Single-Order**, **Multi-Order Batch Cart (up to 24 totes)**, or **Zone Picking** guided strictly by `locations.walk_sequence` so pickers never backtrack.

Key capabilities:
1. **Wave Builder & Strategies**: Build waves using Single-Order, Batch Cart (up to 24 totes per cart), Carrier Cutoff Wave, or Zone Split strategies.
2. **Walk-Sequenced Pick Tasks**: Orders tasks along the physical serpentine aisle path (`walk_sequence ASC`).
3. **Concurrent Multi-Picker Claiming (`FOR UPDATE SKIP LOCKED`)**: Multiple pickers can work the same wave simultaneously with zero duplicate task assignments.
4. **Strict Rotation & Identity Verification**: Pickers must scan Location → LPN (if applicable) → SKU Barcode → Lot / Serial → Destination Tote. Scanning a wrong lot that violates FIFO/FEFO/LIFO locks the screen unless overridden by a Supervisor PIN.
5. **Short-Pick Self-Healing**: If a bin is short or damaged, the system records the found quantity, deallocates the missing units, attempts automatic reallocation from an alternate bin, and auto-triggers a Cycle Count task on the empty bin.

---

### 2. Database Schema Overview

```
┌──────────────────────┐       ┌──────────────────────┐
│        waves         │1─────*│      pick_tasks      │
│ (Strategy & Cutoff)  │       │ (Walk-Sequenced Work)│
└──────────┬───────────┘       └──────────┬───────────┘
           │                              │
           ▼                              ▼
┌──────────────────────┐       ┌──────────────────────┐
│    tote_bindings     │       │   pick_exceptions    │
│ (Cart Position→Order)│       │ (Short Pick / Damage)│
└──────────────────────┘       └──────────────────────┘
```

| Table | Purpose |
| :--- | :--- |
| **`waves`** | Groups allocated orders by strategy (`single`, `batch`, `wave`, `zone`), carrier cutoff time, and live completion percentage. |
| **`pick_tasks`** | Individual pick instructions (`location_id`, `sku_id`, `lot_id`, `serial_id`, `qty_to_pick`, `walk_sequence`, `claimed_by_worker_id`). |
| **`tote_bindings`** | Maps physical picking totes (`LPN-TOTE-*`) and cart slot positions (`Slot 1..24`) to specific orders during batch picking. |
| **`pick_exceptions`** | Logs short picks, damaged-at-pick discoveries, and supervisor lot-override reasons. |

---

### 3. Floor Pick Execution Flow

1. **Cart & Tote Setup**: Worker scans Cart LPN and scans totes into positions (for batch picking) or claims the next N tasks in their zone.
2. **Guided Walk**: Screen displays the full location hierarchy (`Wing › Area › Aisle › Bay › Level › Position`) ordered by `walk_sequence`.
3. **Scan Verification**:
   * Scan **Location Barcode**
   * Scan **Item Barcode** (and **Lot** / **each Serial Number** as required by SKU tracking class)
   * Scan **Target Tote LPN**
4. **Inventory Transition**: Atomically moves `allocated` balance from the storage bin into the active picking tote (`picked` status).
