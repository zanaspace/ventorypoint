# VentoryPoint Warehouse Operating System
## Module Documentation: Brand Visibility Lite & Basic Returns (RMA)

**Module**: Sprint 11A — Brand Visibility Lite & Basic Returns (Switching Essentials)  
**Primary Route(s)**: `/portal`, `/dashboard/returns`, `/floor/returns`  
**Parent PRD**: Phase 1 — Sprint 11A — Brand Visibility Lite and Basic Returns  
**Status**: Planned (Completes Warehouse Execution & Enables Extensiv Switching)

---

### 1. Executive Summary

3PLs migrating off legacy WMS platforms (such as Extensiv) must give their brand clients a live portal to view stock and orders, and must process daily customer returns (RMAs). Sprint 11A activates the `client_user` RBAC role with strict client-scoped Row Level Security, launches **Brand View Lite** (`/portal`), sets up automated daily CSV email digests, and delivers a guided **Floor Returns Receiving & Grading Workflow**.

Key capabilities:
1. **Scoped `client_user` Portal Access (`/portal`)**: Brand clients sign in to see *only* their own SKUs, real-time inventory balances, lot/expiry dates, serial register, outbound order statuses with tracking links, ASN receipts, and returns.
2. **Scheduled Client Email Reports**: Automated daily/weekly CSV email reports (Inventory Snapshot, Shipped Orders, Receipts, Returns) via the Sprint 02A notification service.
3. **Guided Floor Returns Flow (`/floor/returns`)**:
   * Scan return tracking number or original order number (or create blind return by client).
   * Scan returned SKU + verify Serial Number against the originally shipped serial (flagging serial swap fraud).
   * Grade item condition (`resellable`, `damaged`, `unsellable`) with optional photo capture.
   * Execute disposition: **Restock** (creates putaway task preserving original lot/expiry), **Quarantine/Hold**, **Damaged Segregation**, or **Dispose**.
4. **Billable Returns Capture**: Emits return events (`return.received`, `return.restocked`, `return.disposed`) for Sprint 14 3PL client billing.

---

### 2. Database Schema & Client Isolation

| Table / Policy | Purpose |
| :--- | :--- |
| **`client_user_memberships`** | Links `client_user` accounts to one or more specific `client_account_id` records within an organization. |
| **Client-Scoped RLS Policies** | Grants `SELECT` on `skus`, `inventory_balances`, `lots`, `serials`, `orders`, `shipments`, `asns`, and `returns` strictly where `client_account_id = ANY(user_client_ids())`. |
| **`returns` & `return_lines`** | Tracks inbound customer returns linked to original `order_id` / `shipment_id`, condition grade, serial verification result, and final disposition. |
