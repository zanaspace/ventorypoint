# VentoryPoint Master Documentation Directory

Welcome to the comprehensive technical and operational documentation for the **VentoryPoint Warehouse Operating System**.

This directory contains in-depth documentation covering all implemented modules across **Phase 1 (Sprints 1 through 3)**. Each document includes database schemas, Row Level Security (RLS) rules, UI workflows, and practical warehouse operational context.

---

### Master Module Index

| Module | Sprint | Primary Route(s) | Focus Area | Documentation Link |
| :--- | :---: | :--- | :--- | :--- |
| **Multi-Client 3PL Architecture** | 1 | `/dashboard/clients` | Brand client accounts, inventory segregation, serving facilities, billing terms | [MultiClientManagement_Sprint01.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/MultiClientManagement_Sprint01.md) |
| **Warehouse Facilities** | 1 | `/dashboard/facilities` | Physical warehouse hubs, short codes, geocoding, operating hours, carrier cutoffs | [FacilityManagement_Sprint01.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/FacilityManagement_Sprint01.md) |
| **Team Members & RBAC** | 1 | `/dashboard/members` | 6-tier RBAC, two-level admin delegation, invite codes, floor worker accounts | [MembersAndRBAC_Sprint01.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/MembersAndRBAC_Sprint01.md) |
| **Floor Terminal Station** | 1 | `/floor-login` | High-contrast touch terminal, hardware barcode scanner, touch PIN keypad, 12h shifts | [FloorTerminal.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/FloorTerminal.md) |
| **Device & Terminal Registry** | 2 | `/dashboard/settings/devices` | Warehouse tablets, scanners (Zebra/Honeywell), pairing tokens, emergency remote lock | [DeviceManagement_Sprint02.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/DeviceManagement_Sprint02.md) |
| **Event Backbone & Audit Log** | 2 | `/dashboard/settings/audit-log` | Partitioned append-only event store, trigger-enforced immutability, CDC audit trail | [AuditLogAndEventBackbone_Sprint02.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/AuditLogAndEventBackbone_Sprint02.md) |
| **Platform Operations & Billing** | 02A | `/internal`, `/dashboard/settings/billing` | Internal admin console, zero-standing support access, Stripe billing tiers, notifications | [PlatformOperations_Sprint02A.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/PlatformOperations_Sprint02A.md) |
| **Location Hierarchy & Storage** | 3 | `/dashboard/facilities/[id]/locations` | Racks, bins, floor grids, bulk lanes, naming conventions, bulk generator, barcodes/ZPL | [LocationHierarchy_Sprint03.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/LocationHierarchy_Sprint03.md) |
| **SKU Catalog & Tracking Rules** | 4 | `/dashboard/catalog` | Multi-client item master, packaging tiers (each/case/pallet), tracking classes, FEFO/FIFO, barcode lookup | [SKUCatalogAndTrackingRules_Sprint04.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/SKUCatalogAndTrackingRules_Sprint04.md) |
| **Inventory Ledger & Traceability** | 5 | `/dashboard/inventory` | Real-time physical balances, LPN license plates, FEFO rotation, supervisor approval queue, 'Where Is It?' scan | [InventoryLedgerAndTraceability_Sprint05.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/InventoryLedgerAndTraceability_Sprint05.md) |

---

### Architecture Overview

```
                               ┌─────────────────────────────────────────────────────────────┐
                               │                    VentoryPoint Platform                    │
                               └──────────────────────────────┬──────────────────────────────┘
                                                              │
                    ┌─────────────────────────────────────────┴─────────────────────────────────────────┐
                    ▼                                                                                   ▼
┌───────────────────────────────────────┐                                           ┌───────────────────────────────────────┐
│     Office & Admin (/dashboard)       │                                           │        Warehouse Floor Terminal       │
│                                       │                                           │             (/floor-login)            │
│  - Multi-Client Accounts              │                                           │                                       │
│  - Facility & Cutoff Config           │                                           │  - Badge Barcode Scanner              │
│  - RBAC & Member Directory            │                                           │  - On-Screen PIN Pad                  │
│  - Device Authorization & Remote Lock │                                           │  - High-Contrast Glow UI              │
│  - Immutable Change Audit Trail       │                                           │  - 12-Hour Shift Session              │
│  - Precise Physical Locations (S3)    │                                           │  - Bound to Floor Device Registry     │
└───────────────────┬───────────────────┘                                           └───────────────────┬───────────────────┘
                    │                                                                                   │
                    └─────────────────────────────────────────┬─────────────────────────────────────────┘
                                                              │
                                                              ▼
                                            ┌───────────────────────────────────┐
                                            │      Append-Only Event Store      │
                                            │       (warehouse_events)          │
                                            │                                   │
                                            │  - Monthly Partitioned Tables     │
                                            │  - Trigger-Blocked UPDATE/DELETE  │
                                            │  - Idempotent Event Deduplication │
                                            └───────────────────────────────────┘
```

---

### Guidelines for Extending Documentation

When implementing upcoming sprints (e.g., Sprint 4 Stock Units, Sprint 5 Lot/Expiry, Sprint 6 Floor Workspace):
1. Create a dedicated markdown document in `HOWITWORSDOC/` using the convention `[FeatureName]_Sprint[XX].md`.
2. Follow the established standard structure: Executive Summary, Database Schema & RLS, Operational Workflows, UI Components, and Server Actions.
3. Update this `README.md` index table with the new entry.
