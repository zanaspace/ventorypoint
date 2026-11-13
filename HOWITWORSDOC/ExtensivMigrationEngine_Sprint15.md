# VentoryPoint Warehouse Operating System
## Module Documentation: 1-Click Extensiv (3PL Central) Migration Engine

**Module**: Sprint 15 — Extensiv Migration Engine (Extract, Map, Dry Run)  
**Primary Route(s)**: `/dashboard/migrations`, `/dashboard/migrations/[id]`  
**Parent PRD**: Phase 1 — Sprint 15 — Extensiv Migration Engine  
**Status**: Planned (First Module of Sprints 15–16 Migration & Launch)

---

### 1. Executive Summary

Sprint 15 eliminates the biggest barrier preventing 3PLs from leaving legacy WMS software (**Extensiv / 3PL Central**): data migration risk. It provides a guided **Extract → Normalise → Map → Dry-Run Engine** that connects to a 3PL's Extensiv REST API (or ingests CSV exports), stages all operational entities outside production tables, reconstructs client rate cards, and produces a comprehensive **Dry-Run Readiness Report** before cutover weekend.

Key capabilities:
1. **Vault-Secured Extensiv API Connector**: Authenticates using OAuth Client ID + Secret, automatically refreshes 30–60 minute bearer tokens, respects rate limits, and checkpoints progress so interrupted runs resume cleanly.
2. **Full & Delta Entity Extractors**: Extracts Customers (`client_accounts`), Items/Packages/Barcodes (`skus`, `sku_uoms`, `sku_barcodes`), Locations (`locations` + legacy barcode aliases), Inventory Stock Details (`inventory_balances`, `lots`, `serials`), Open Orders (`orders`), and Open Receivers (`asns`).
3. **Hierarchy Normaliser & Guided Mapping UI**: Parses legacy flat location strings into VentoryPoint's `Building › Wing › Area › Aisle › Bay › Level › Position` hierarchy while preserving the legacy code as a scannable alias so existing warehouse rack stickers keep working on Day 1.
4. **Automated Rate Card Reconstruction**: Ingests Extensiv billing setup data and automatically maps ≥ 80% of client billing lines to the Sprint 14 Charge Catalogue, listing any custom lines for human review.
5. **Zero-Impact Dry-Run Validator**: Runs all production validators against `staging_records` without writing a single row to production tables, outputting entity counts, catalog completeness scores, inventory reconciliation totals, and downloadable CSV issue lists.

---

### 2. Database Schema Overview

| Table | Purpose |
| :--- | :--- |
| **`migration_projects`** | Tracks target facility, source WMS connection (`extensiv_api` or `csv_bundle`), and overall readiness state. |
| **`migration_runs`** | Checkpointed extraction and dry-run executions (`full_extract`, `delta_extract`, `dry_run`, `production_commit`). |
| **`staging_records`** | Isolated holding table for extracted customers, SKUs, locations, balances, orders, and ASNs with validation status (`valid`, `warning`, `error`). |
| **`mapping_rules`** | Reusable translation rules for facilities, client accounts, location types, UoMs, and carrier service codes. |
| **`reconciliation_reports`** | Stores source-vs-staged unit, lot, serial, and location parity totals. |
