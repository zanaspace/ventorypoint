# VentoryPoint Warehouse Operating System
## Module Documentation: Inbound Receiving, ASNs & Directed Putaway

**Module**: Sprint 7 — Inbound: ASNs, Receiving & Putaway  
**Primary Route(s)**: `/dashboard/inbound`, `/floor/receive`, `/floor/putaway`  
**Parent PRD**: Phase 1 — Sprint 07 — Inbound Receiving and Putaway  
**Status**: Planned (Depends on Sprint 5 Ledger & Sprint 6 Floor Workspace)

---

### 1. Executive Summary

Sprint 7 governs how physical goods enter the warehouse—from pre-advised supplier shipments (**ASNs — Advance Shipping Notices**) to dock check-in, tracking-class-aware floor receiving, LPN palletization, and **Directed Putaway** into optimal storage locations.

Key capabilities:
1. **ASN Lifecycle Management**: Create expected inbound shipments via UI or CSV import (`expected → arrived → receiving → received → closed`).
2. **Dock Arrival Check-In**: Record carrier, trailer/seal number, dock door, and arrival timestamp.
3. **Tracking-Class-Driven Floor Receiving**:
   * **Non-Unique SKUs**: Scan barcode + enter quantity (auto-converted by UoM: Each, Case, Pallet).
   * **Lot-Controlled SKUs**: Captures Lot/Batch number + Expiry/Mfg dates (auto-quarantines short-dated stock below `min_shelf_life_receipt_days`).
   * **Serialized SKUs**: Requires scanning each individual Serial/IMEI (rejecting duplicates) or auto-prints unique unit ID labels.
4. **Directed Putaway Engine**: Recommends the top 3 valid storage locations based on existing SKU+Lot consolidation, temperature class (`ambient`, `chilled`, `frozen`), security zone, and location capacity.
5. **Receipt Close & Discrepancy Reporting**: Compares expected vs. received quantities and generates Over/Short/Damaged (OS&D) discrepancy reports.

---

### 2. Database Schema Overview

```
┌──────────────────────┐       ┌──────────────────────┐
│         asns         │1─────*│      asn_lines       │
│ (Expected Shipments) │       │ (SKU, Expected Qty)  │
└──────────┬───────────┘       └──────────────────────┘
           │
           ▼
┌──────────────────────┐       ┌──────────────────────┐
│       receipts       │1─────*│    receipt_lines     │
│  (Dock Sessions)     │       │ (Lot, Serials, LPN)  │
└──────────┬───────────┘       └──────────┬───────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
               ┌──────────────────────┐
               │    putaway_tasks     │
               │ (Staging → Rack Bin) │
               └──────────────────────┘
```

| Table | Purpose |
| :--- | :--- |
| **`asns` & `asn_lines`** | Expected inbound deliveries per client and facility, including PO reference, carrier, expected arrival date, and expected SKU quantities. |
| **`receipts` & `receipt_lines`** | Actual dock receiving records linked to an ASN (or blind receipt), capturing UoM, lot, expiry, serials, condition (`good` / `damaged`), and staging LPN. |
| **`putaway_tasks`** | Directed movement tasks guiding floor workers from dock staging (`STG-*`) to permanent rack bins, floor cells, or bulk lanes. |

---

### 3. Putaway Suggestion Priority Chain

1. **Same SKU + Same Lot Consolidation**: Existing pickable bin holding the same SKU and lot with available capacity.
2. **Matching Zone Empty Pick Bin**: Empty pickable shelf/bin matching the SKU's `temperature_class` and hazmat/security rules.
3. **Reserve Rack / Floor Cell / Bulk Lane**: For full pallet LPNs, directs to pallet rack positions or floor storage cells respecting FIFO/LIFO lane rules.

---

### 4. Billable & Audit Events Emitted

* `receipt.line_received` (includes UoM level, carton count, unit count, client, and worker/device for Sprint 14 3PL billing)
* `putaway.completed` (records staging source, final rack destination, LPN, and override reason if worker chose an alternate bin)
* `receipt.closed` (locks receipt and emits OS&D variance summary)
