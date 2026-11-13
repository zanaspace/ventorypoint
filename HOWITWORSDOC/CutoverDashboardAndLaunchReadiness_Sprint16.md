# VentoryPoint Warehouse Operating System
## Module Documentation: Weekend Cutover, Live Ops Dashboard & Launch Readiness

**Module**: Sprint 16 — Weekend Cutover, Ops Dashboard & Launch Readiness  
**Primary Route(s)**: `/dashboard`, `/dashboard/reports`, `/dashboard/migrations/[id]/cutover`, `/dashboard/privacy`  
**Parent PRD**: Phase 1 — Sprint 16 — Cutover Dashboard and Launch Readiness  
**Status**: Planned (Final Sprint of Phase 1 — The Wedge MVP)

---

### 1. Executive Summary

Sprint 16 completes **Phase 1 — The Wedge (MVP)**. It delivers the production commit, parity reconciliation, and 30-minute rollback engine for the Extensiv Migration tool, an interactive **Weekend Cutover Runbook**, the **Live Supervisor Operations Dashboard** with real-time carrier cutoff countdowns, 11 standard operational and billing reports, a consumer **Privacy Request Console (CCPA/GDPR)**, and final 5× peak load, WCAG 2.2 AA accessibility, and security hardening.

Key capabilities:
1. **Ordered Production Commit, Reconciliation & Rollback**: Commits staged migration records in strict dependency order (`Clients → SKUs → Locations → Opening Balances via Events → Open ASNs → Open Orders`), generates a 100% quantity parity sign-off report, and supports full run-scoped rollback in `< 30 minutes`.
2. **Interactive Weekend Cutover Runbook**: Step-by-step guided checklist from `T-7 Rehearsal` and `Friday 5 PM Legacy Freeze` through `15-Minute Floor Training`, `Channel Re-Pointing (Shopify/Amazon/Woo)`, and `Monday 7 AM Go/No-Go Sign-Off`.
3. **Real-Time Live Ops Dashboard (`/dashboard`)**: Live event-driven tiles showing Orders by Status/Client, Carrier Cutoff Countdowns (orders at risk), Wave Progress, Open Exceptions (holds, short picks, integration errors), Active Dock Receipts, and 7-Day Inventory Accuracy.
4. **11 Standard Operational & Billing Reports (`/dashboard/reports`)**: Filterable and CSV-exportable reports covering Inventory On Hand, Serial Register, Lot & Expiry (FEFO), Rotation Compliance, Location Accuracy, Location Utilisation, Receiving Log, Order Throughput, Picker/Packer Productivity (Units/Hour), Cycle Count Variance, and Billing Activity.
5. **Privacy Request Console & GEO/Public Surfaces**: Tracks consumer data access/deletion requests across orders/shipments, and publishes indexable API docs, status page, `llms.txt`, and JSON-LD metadata.

---

### 2. Standard Reports Suite (Sprint 16)

| Report Name | Primary Audience | Key Metrics & Columns |
| :--- | :--- | :--- |
| **1. Inventory On Hand** | Ops / Brands | Client, SKU, Full Location Path, LPN, Lot, Status, Available/Allocated/On-Hand Qty |
| **2. Serial Register** | Ops / Compliance | Unique Serial/IMEI, SKU, Current Rack/LPN or Outbound Order + Carrier Tracking # |
| **3. Lot & Expiry (FEFO)** | Ops / Quality | Lot #, Mfg Date, Expiry Date, Remaining Days, Quarantine/Near-Expiry Status |
| **4. Rotation Compliance** | Supervisors | FIFO/FEFO/LIFO pick adherence rate and log of supervisor PIN lot overrides |
| **5. Location Accuracy** | Ops Managers | Bin-level audit accuracy % from Sprint 11 cycle counts and location audits |
| **6. Location Utilisation** | Ops / Billing | Occupied vs. empty rack positions, shelf bins, floor cells, and bulk lanes by zone |
| **7. Receiving Log** | Dock / Billing | ASN vs. received quantities, turnaround time, and Over/Short/Damaged (OS&D) counts |
| **8. Order Throughput** | Ops / Exec | Orders imported, allocated, picked, packed, and shipped by day, client, and channel |
| **9. Floor Productivity** | Supervisors | Units and lines received, put away, picked, and packed per worker hour |
| **10. Cycle Count Variance** | Inventory Control | Expected vs. counted quantities, net unit/value variance, and approval trail |
| **11. Billing Activity** | Finance / 3PL Owner | Priced billable events by client and charge category for month-end invoicing |
