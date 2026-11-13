# VentoryPoint Master Documentation Directory

Welcome to the comprehensive technical and operational documentation for the **VentoryPoint Warehouse Operating System**.

This directory contains in-depth documentation covering all **19 Sprints of Phase 1 — The Wedge (MVP)** (`Sprint 00` through `Sprint 16`). Each document includes database schemas, Row Level Security (RLS) rules, UI workflows, atomic RPC specifications, and practical warehouse operational context.

---

### Master Module Index (Phase 1 — Sprints 00 through 16)

| Module | Sprint | Status | Primary Route(s) | Focus Area | Documentation Link |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **Foundations & Setup** | 00 | ✅ Built | Monorepo & CI | Turborepo, brand tokens, RLS test harness, Supabase environment pipeline | [FoundationsSetup_Sprint00.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/FoundationsSetup_Sprint00.md) |
| **Multi-Client 3PL Architecture** | 01 | ✅ Built | `/dashboard/clients` | Brand client accounts, inventory segregation, serving facilities, billing terms | [MultiClientManagement_Sprint01.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/MultiClientManagement_Sprint01.md) |
| **Warehouse Facilities** | 01 | ✅ Built | `/dashboard/facilities` | Physical warehouse hubs, short codes, geocoding, operating hours, carrier cutoffs | [FacilityManagement_Sprint01.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/FacilityManagement_Sprint01.md) |
| **Team Members & RBAC** | 01 | ✅ Built | `/dashboard/members` | 6-tier RBAC, two-level admin delegation, invite codes, floor worker accounts | [MembersAndRBAC_Sprint01.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/MembersAndRBAC_Sprint01.md) |
| **Floor Terminal Station** | 01 | ✅ Built | `/floor-login` | High-contrast touch terminal, hardware barcode scanner, touch PIN keypad, 12h shifts | [FloorTerminal.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/FloorTerminal.md) |
| **Device & Terminal Registry** | 02 | ✅ Built | `/dashboard/settings/devices` | Warehouse tablets, scanners (Zebra/Honeywell), pairing tokens, emergency remote lock | [DeviceManagement_Sprint02.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/DeviceManagement_Sprint02.md) |
| **Event Backbone & Audit Log** | 02 | ✅ Built | `/dashboard/settings/audit-log` | Partitioned append-only event store, trigger-enforced immutability, CDC audit trail | [AuditLogAndEventBackbone_Sprint02.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/AuditLogAndEventBackbone_Sprint02.md) |
| **Platform Operations & Billing** | 02A | ✅ Built | `/internal`, `/dashboard/settings/billing` | Internal admin console, zero-standing support access, Stripe billing tiers, notifications | [PlatformOperations_Sprint02A.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/PlatformOperations_Sprint02A.md) |
| **Location Hierarchy & Storage** | 03 | ✅ Built | `/dashboard/facilities/[id]/locations` | Racks, bins, floor grids, bulk lanes, naming conventions, bulk generator, barcodes/ZPL | [LocationHierarchy_Sprint03.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/LocationHierarchy_Sprint03.md) |
| **SKU Catalog & Tracking Rules** | 04 | ✅ Built | `/dashboard/catalog` | Multi-client item master, packaging tiers (each/case/pallet), tracking classes, FEFO/FIFO, barcode lookup | [SKUCatalogAndTrackingRules_Sprint04.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/SKUCatalogAndTrackingRules_Sprint04.md) |
| **Inventory Ledger & Traceability** | 05 | ✅ Built | `/dashboard/inventory` | Real-time physical balances, LPN license plates, FEFO rotation, supervisor approval queue, 'Where Is It?' scan | [InventoryLedgerAndTraceability_Sprint05.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/InventoryLedgerAndTraceability_Sprint05.md) |
| **Web Floor Workspace** | 06 | 📋 Planned | `/floor` | Touch task launcher, USB/Bluetooth wedge & GS1 scanner, audio/haptic feedback, offline queue, ZPL printing | [WebFloorWorkspace_Sprint06.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/WebFloorWorkspace_Sprint06.md) |
| **Inbound Receiving & Putaway** | 07 | 📋 Planned | `/dashboard/inbound`, `/floor/receive` | ASNs, dock check-in, lot/serial/LPN receiving, directed putaway suggestions, OS&D discrepancy reports | [InboundReceivingAndPutaway_Sprint07.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/InboundReceivingAndPutaway_Sprint07.md) |
| **Orders, Holds & Allocation** | 08 | 📋 Planned | `/dashboard/orders` | Outbound order state machine, automatic validation holds, atomic FIFO/FEFO/LIFO allocation engine | [OrdersHoldsAndAllocation_Sprint08.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/OrdersHoldsAndAllocation_Sprint08.md) |
| **Waves & Picking** | 09 | 📋 Planned | `/dashboard/waves`, `/floor/pick` | Single/batch/cutoff/zone waves, walk-sequenced pick paths, multi-picker locking, short-pick recovery | [WavesAndPicking_Sprint09.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/WavesAndPicking_Sprint09.md) |
| **Pack & Ship** | 10 | 📋 Planned | `/floor/pack`, `/dashboard/shipments` | Scan-verified carton packing, packaging materials, branded packing slips, `ShippingProvider`, ledger consumption | [PackAndShip_Sprint10.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/PackAndShip_Sprint10.md) |
| **Cycle Counting & Replenishment** | 11 | 📋 Planned | `/dashboard/counts`, `/floor/count` | Blind cycle counts, in-flight movement reconciliation, 2-worker recounts, min/max pick-face replenishment | [CycleCountingAndReplenishment_Sprint11.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/CycleCountingAndReplenishment_Sprint11.md) |
| **Brand Visibility Lite & Returns** | 11A | 📋 Planned | `/portal`, `/dashboard/returns` | Client-scoped read-only Brand Portal (`client_user`), scheduled CSV emails, RMA grading & restock/dispose | [BrandVisibilityAndReturns_Sprint11A.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/BrandVisibilityAndReturns_Sprint11A.md) |
| **Integration Framework & Shopify** | 12 | 📋 Planned | `/dashboard/integrations` | Channel adapter framework, self-healing address/SKU error queue, live 2-way Shopify OAuth connector | [IntegrationFrameworkAndShopify_Sprint12.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/IntegrationFrameworkAndShopify_Sprint12.md) |
| **Amazon, Woo, ShipStation & API** | 13 | 📋 Planned | `/api/v1/*`, `/dashboard/integrations` | Amazon SP-API (MFN), WooCommerce, ShipStation label provider, CSV/SFTP dropfolders, Public REST API v1 | [AmazonWooCommerceShipStationAndAPI_Sprint13.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/AmazonWooCommerceShipStationAndAPI_Sprint13.md) |
| **3PL Client Billing Foundation** | 14 | 📋 Planned | `/dashboard/billing` | Versioned client rate cards, real-time billable event capture, nightly storage snapshots, draft invoices | [BillingFoundation3PL_Sprint14.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/BillingFoundation3PL_Sprint14.md) |
| **Extensiv Migration Engine** | 15 | 📋 Planned | `/dashboard/migrations` | 1-Click Extensiv (3PL Central) API extractor, hierarchy normaliser, rate card builder, zero-impact dry run | [ExtensivMigrationEngine_Sprint15.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/ExtensivMigrationEngine_Sprint15.md) |
| **Weekend Cutover & Ops Dashboard** | 16 | 📋 Planned | `/dashboard`, `/dashboard/reports` | Production migration commit/rollback, weekend cutover runbook, live cutoff dashboard, 11 standard reports | [CutoverDashboardAndLaunchReadiness_Sprint16.md](file:///c:/Users/CI-STAFF/Documents/ventorypoint/HOWITWORSDOC/CutoverDashboardAndLaunchReadiness_Sprint16.md) |

---

### Architecture Overview

```
                               ┌─────────────────────────────────────────────────────────────┐
                               │                    VentoryPoint Platform                    │
                               └──────────────────────────────┬──────────────────────────────┘
                                                              │
                    ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
                    ▼                                         ▼                                         ▼
┌───────────────────────────────────────┐ ┌───────────────────────────────────────┐ ┌───────────────────────────────────────┐
│     Office & Admin (/dashboard)       │ │   Warehouse Floor Workspace (/floor)  │ │     Brand Client Portal (/portal)     │
│                                       │ │                                       │ │                                       │
│  - Multi-Client Accounts & 3PL Billing│ │  - Badge Barcode + Touch PIN Login    │ │  - Client-Scoped Inventory & Lots     │
│  - Facility, Cutoff & Location Config │ │  - GS1-128 & Hardware Wedge Scanner   │ │  - Live Outbound Order & Tracking     │
│  - SKU Catalog & Tracking/FEFO Rules  │ │  - Directed Receive, Putaway & Pick   │ │  - ASN Receipts & RMA Returns View    │
│  - Live Inventory Ledger & LPNs       │ │  - Scan-Verified Pack & Label Print   │ │  - Automated Daily CSV Email Reports  │
│  - Orders, Waves, Counts & Migrations │ │  - Offline Queue & Audio/Haptic Lock  │ │                                       │
└───────────────────┬───────────────────┘ └───────────────────┬───────────────────┘ └───────────────────┬───────────────────┘
                    │                                         │                                         │
                    └─────────────────────────────────────────┼─────────────────────────────────────────┘
                                                              │
                                                              ▼
                                            ┌───────────────────────────────────┐
                                            │      Append-Only Event Store      │
                                            │       (warehouse_events)          │
                                            │                                   │
                                            │  - Monthly Partitioned Tables     │
                                            │  - Trigger-Blocked UPDATE/DELETE  │
                                            │  - Idempotent Event Deduplication │
                                            │  - Drives Ledger, Sync & Billing  │
                                            └───────────────────────────────────┘
```
