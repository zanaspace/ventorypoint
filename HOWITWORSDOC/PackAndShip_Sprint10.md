# VentoryPoint Warehouse Operating System
## Module Documentation: Pack Station Verification, Cartons & Ship Confirmation

**Module**: Sprint 10 — Pack & Ship  
**Primary Route(s)**: `/floor/pack`, `/dashboard/shipments`  
**Parent PRD**: Phase 1 — Sprint 10 — Pack and Ship  
**Status**: Planned (Depends on Sprint 9 Picked Totes & Sprint 6 Printing)

---

### 1. Executive Summary

Sprint 10 closes the outbound fulfillment loop at the **Pack Station**. Packers scan a picked tote (or order barcode), verify every item into one or more shipping cartons by barcode/serial scan, record packaging materials and weight, print branded packing slips and shipping labels via a pluggable `ShippingProvider` interface, and atomically consume inventory from the ledger.

Key capabilities:
1. **100% Scan-Verified Packing**: Scanning an item not on the order—or scanning one unit too many—locks the pack screen immediately so wrong items never leave the building.
2. **Multi-Carton & Multi-Tote Consolidation**: Supports splitting large orders across multiple boxes and consolidating multi-zone totes at the pack station.
3. **Packaging Material Tracking**: Records exact box/mailer type (`packaging_materials`) per carton so Sprint 14 3PL billing automatically charges the client for packaging consumed.
4. **Branded Packing Slips & Pluggable `ShippingProvider`**: Generates client-branded packing slips (with each Brand Client's logo) and shipping labels via `ShippingProvider` (`ManualProvider` in Sprint 10, `ShipStationProvider` in Sprint 13).
5. **Idempotent Inventory Consumption**: Transitions order status to `shipped`, marks each unique serial as `shipped` with carton and tracking number, and deducts inventory from the ledger exactly once.

---

### 2. Database Schema Overview

```
┌────────────────────────┐
│  packaging_materials   │
│ (Boxes, Mailers, Dims) │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐       ┌────────────────────────┐
│        cartons         │*─────1│       shipments        │
│ (Weight, Tracking, Box)│       │ (Order, Carrier, Date) │
└───────────┬────────────┘       └────────────────────────┘
            │1
            │*
┌───────────▼────────────┐
│    carton_contents     │
│ (SKU, Qty, Lot, Serial)│
└────────────────────────┘
```

| Table | Purpose |
| :--- | :--- |
| **`packaging_materials`** | Facility catalog of boxes, poly mailers, and void fill with dimensions, tare weight, unit cost, and billable flag. |
| **`shipments`** | Outbound shipment record tied to an `order_id`, carrier, service level, total weight, and shipped timestamp. |
| **`cartons`** | Individual parcels within a shipment, tracking `packaging_material_id`, gross weight, L×W×H, tracking number, and label URL/ZPL. |
| **`carton_contents`** | Exact SKU, quantity, lot number, and serial numbers packed inside each carton for full parcel-level traceability. |

---

### 3. Billable & Audit Events Emitted

* `pack.item_verified`
* `pack.carton_closed`
* `packaging.consumed` (feeds Sprint 14 packaging billing)
* `shipment.shipped` (triggers Sprint 02A monthly order usage metering, Sprint 12/13 ecommerce tracking sync, and Sprint 14 outbound fulfillment billing)
