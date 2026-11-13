# VentoryPoint Warehouse Operating System
## Module Documentation: 3PL Client Billing Foundation (Billable Events, Rate Cards, Invoices)

**Module**: Sprint 14 — 3PL Client Billing Foundation  
**Primary Route(s)**: `/dashboard/billing`, `/dashboard/clients/[id]/rate-cards`  
**Parent PRD**: Phase 1 — Sprint 14 — Billing Foundation  
**Status**: Planned (Depends on Sprints 7/9/10/11A Billable Events & Sprint 2 Consumer Queue)

---

### 1. Executive Summary

While Sprint 02A handles *platform subscription billing* (3PLs paying VentoryPoint via Stripe), **Sprint 14** powers **3PL Client Revenue Billing**—how the 3PL charges its Brand Clients for storage, receiving, picking, packing, shipping boxes, and returns. Every billable warehouse scan automatically produces an immutable, priced `billable_charges` record linked directly to the originating `warehouse_events` row, worker, device, and timestamp so client billing disputes can be answered in one click.

Key capabilities:
1. **Versioned Client Rate Cards**: Configure per-client pricing across Receiving (per pallet/case/unit), Storage (by location type: rack pallet position, shelf bin, floor cell, cold room, or cubic foot), Pick & Pack (per order + per unit/carton), Packaging Materials (cost + markup %), and Returns. Effective-date versioning ensures mid-month rate changes never corrupt historical billing.
2. **Real-Time `billing_capture` Event Consumer**: Listens to `receipt.line_received`, `pick.confirmed`, `pack.carton_closed`, `packaging.consumed`, `shipment.shipped`, and `return.*`, resolving the active rate card as of `occurred_at` and writing immutable charges idempotently.
3. **Unpriced Event Safety Net**: If an activity occurs without a configured rate line, it records a `$0.00` flagged `unpriced` charge rather than dropping the event silently.
4. **Nightly Storage Snapshots**: Captures end-of-day occupied pallets (by LPN), bin counts by location type, and cubic volume per client, supporting both Month-End Snapshot and Average Daily Balance (ADB) storage billing.
5. **Billing Periods, Drill-Down & Draft Invoice PDF/CSV**: Monthly client statements with one-click drill-down to the exact scan event, manual VAS/labor charge entry, formula-safe CSV exports, and branded Draft Invoice PDFs.

---

### 2. Database Schema Overview

```
┌────────────────────────┐       ┌────────────────────────┐
│  charge_type_catalog   │1─────*│    rate_card_lines     │
│ (Storage, Pick, Pack)  │       │ (Unit Price & Min Fee) │
└───────────┬────────────┘       └───────────┬────────────┘
            │                                │*
            ▼                                │1
┌────────────────────────┐       ┌───────────▼────────────┐
│  charge_mapping_rules  │       │       rate_cards       │
│ (Event → Charge Formula│       │ (Client + Effective Dt)│
└───────────┬────────────┘       └───────────┬────────────┘
            │                                │
            └───────────────┬────────────────┘
                            ▼
               ┌────────────────────────┐
               │    billable_charges    │
               │ (Append-Only Ledger)   │
               └────────────┬───────────┘
                            │*
                            ▼1
               ┌────────────────────────┐
               │    billing_periods     │
               │ (Open→Review→Exported) │
               └────────────────────────┘
```

| Table | Purpose |
| :--- | :--- |
| **`charge_type_catalog` & `charge_mapping_rules`** | Defines standard 3PL charge codes and maps `warehouse_events.event_type` payloads to billable quantities. |
| **`rate_cards` & `rate_card_lines`** | Versioned per-client pricing contracts with `effective_from` dates and diff history. |
| **`billable_charges`** | Append-only financial ledger (`UNIQUE(source_event_id, charge_type)`), protected against `UPDATE`/`DELETE` with reversal-only corrections. |
| **`storage_snapshots`** | Nightly per-facility, per-client occupancy counts by LPN, location type, and cubic volume. |
| **`billing_periods`** | Monthly statement lifecycle (`open → reviewing → exported`) with CSV and branded PDF generation. |
