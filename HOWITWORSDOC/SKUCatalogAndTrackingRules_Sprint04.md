# VentoryPoint Warehouse Operating System
## Module Documentation: SKU Catalog, Tracking Classes & Rotation Rules

**Module**: Sprint 4 — Inventory Core (Item Master)  
**Route**: `/dashboard/catalog`  
**Parent PRD**: Phase 1 — Sprint 04 — SKU Catalog Tracking Classes and Rotation Rules  
**Status**: 100% Implemented & Verified against Live Database  
**Database Test Suite**: `supabase/tests/sprint04_catalog_suite.sql` (Passed 6/6 test groups)  

---

### 1. Executive Summary

Now that Sprint 3 has established the physical warehouse storage hierarchy (racks, bins, floor grids, cages), Sprint 4 defines **what products actually sit in those locations**.

In a multi-client 3PL warehouse, each brand client has their own distinct product catalog:
* A supplement brand needs strict **Lot Number** tracking and **FEFO (First-Expired, First-Out)** rotation.
* An electronics brand needs individual **Serial / IMEI** recording for warranty tracking.
* An apparel brand needs simple **Quantity (Non-Unique)** tracking with **FIFO** rotation.

Sprint 4 delivers this item master engine:
1. **Multi-Client Product Master (`skus`)**: SKU codes unique per client, titles, descriptions, categories, safety classes, and custom JSON attributes.
2. **Packaging Hierarchy (Units of Measure - UoM)**: Multi-tier packaging (`each` $\rightarrow$ `inner` $\rightarrow$ `case` $\rightarrow$ `pallet`) with conversion factors and dimensions ($L \times W \times H$ + weight).
3. **Tracking Classes**: Non-Unique (quantity), Lot/Batch, Unique (Serialized with manufacturer or system-generated UIDs), and Lot + Serial.
4. **Rotation Rules**: FIFO, FEFO (with database-enforced expiry dates), LIFO, and customer-specified lots.
5. **Universal Barcode Resolution Service (`resolve_barcode`)**: Instantly resolves UPCs, EANs, Case GTIN-14s, or SKU codes down to the exact SKU, packaging tier, and rotation rules.
6. **Bulk Catalog Importer & Completeness Scoring**: Drag-and-drop CSV importer with error reporting and a live data completeness gauge.

---

### 2. Database Architecture

#### 2.1 `skus` Table
* `id` (`uuid`, primary key): Unique SKU identifier.
* `organization_id` & `client_account_id` (`uuid`, references `client_accounts`): Strict client scoping.
* `code` (`text`): Master SKU code (e.g. `VIT-C-1000MG`, `SKU-TEE-BLK-M`). Unique per client (`UNIQUE(client_account_id, code)`).
* `name` & `description` (`text`): Product display title and description.
* `status` (`text`): `'active'`, `'inactive'`, `'discontinued'`.
* **Tracking Class & Serialization**:
  * `tracking_class`: `'non_unique'`, `'lot'`, `'serial'`, `'lot_serial'`.
  * `serial_source`: `'manufacturer'` (scanned IMEI/serial) or `'generated'` (system prints a unique item ID).
  * `serial_capture_point`: `'receipt'`, `'shipment'`, `'both'`.
  * `serial_pattern` (`text`): Optional regex pattern for scanner format validation.
* **Rotation & Shelf-Life Rules**:
  * `rotation_rule`: `'fifo'`, `'fefo'`, `'lifo'`, `'customer_lot'`.
  * `expiry_required` (`boolean`): Automatically required if `rotation_rule = 'fefo'`.
  * `shelf_life_days`, `min_shelf_life_receipt_days`, `min_shelf_life_ship_days`: Days thresholds.
* **Storage & Safety**:
  * `temperature_class`: `'ambient'`, `'chilled'`, `'frozen'`, `'deep_freeze'`, `'temperature_controlled'`.
  * `hazmat_class` (`text`): e.g. `'UN3481 Lithium Ion'`.
  * `fragile` (`boolean`): Flags special packaging/cushioning requirements.
* **Database Constraints**:
  * `chk_sku_fefo_expiry`: Enforces that `rotation_rule = 'fefo'` must have `expiry_required = true`.
  * `chk_sku_serial_rules`: Enforces that serial tracking classes must define `serial_source` and `serial_capture_point`.

#### 2.2 `sku_uoms` (Packaging Hierarchy)
* `id` (`uuid`, primary key)
* `sku_id` (`uuid`, references `skus`, on delete cascade)
* `uom_level`: `'each'`, `'inner'`, `'case'`, `'pallet'`. Unique per SKU (`UNIQUE(sku_id, uom_level)`).
* `conversion_factor` (`int`): Quantity of base units contained (e.g., Master Case = 24 units).
* `length_cm`, `width_cm`, `height_cm`, `weight_kg`: Physical dimensions.
* `volume_cbm`: Automatically generated stored column:
  $$\text{Volume (CBM)} = \frac{L \times W \times H}{1,000,000}$$
* **Trigger `trg_sku_auto_default_uom`**: Automatically creates the default `'each'` level on every SKU insert.

#### 2.3 `sku_barcodes` Table
* `id` (`uuid`, primary key)
* `client_account_id` & `sku_id`
* `uom_id` (`uuid`, references `sku_uoms`): Binds barcode to a specific packaging tier (e.g. UPC on Each, GTIN-14 on Case).
* `barcode` (`text`): Scanned barcode string.
* `barcode_type`: `'upc'`, `'ean'`, `'gtin14'`, `'code128'`, `'custom'`.
* `is_primary` (`boolean`): Identifies primary scan barcode.
* **Integrity Constraint**: `uq_client_barcode UNIQUE (client_account_id, barcode)`. No two SKUs of the same client can share a barcode.

---

### 3. Key Operational Workflows

```
┌─────────────────────────────────────────────────────────────┐
│                 Client Master Product Catalog               │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
   [Tracking Classes]   [Rotation Rules]     [Packaging UoM]
   - Non-Unique (Qty)   - FIFO (Standard)    - Each (UPC: 1 ct)
   - Lot / Batch        - FEFO (Expiry Req)  - Inner Pack (6 ct)
   - Serial (IMEI/UID)  - LIFO (Bulk Lane)   - Case (GTIN-14: 24 ct)
            │                  │                  │
            └──────────────────┼──────────────────┘
                               ▼
               [Universal Barcode Resolver]
               - Scan any UPC, GTIN, or SKU
               - Returns exact SKU, tier & rules
```

#### 3.1 Tracking Classes Explained
* **Non-Unique (Quantity)**: For commodity goods (plain apparel, accessories). Units are interchangeable and tracked by count per location.
* **Lot / Batch-Controlled**: For food, cosmetics, and pharmaceuticals. A lot number is required at inbound receipt, and inventory is partitioned by lot.
* **Unique (Serialized)**: For high-value electronics (laptops, phones). Every unit has a unique serial number or system-generated UID (`UID-ACME-2610-00412`).
* **Lot + Serial**: For regulated medical devices requiring both batch and unit serialization.

#### 3.2 Rotation Rules Explained
* **FIFO (First-In, First-Out)**: Goods received first are picked first based on inbound date.
* **FEFO (First-Expired, First-Out)**: Goods with the earliest expiration date are picked first, regardless of when they arrived. Crucial for perishable products.
* **LIFO (Last-In, First-Out)**: Used for deep bulk floor lanes or customer-specified contracts.

#### 3.3 Barcode Resolution Engine (`resolve_barcode`)
When a warehouse worker scans a barcode during receiving, putaway, or picking:
1. The scanner passes the barcode string to `resolve_barcode(p_organization_id, p_barcode, p_client_id)`.
2. The engine checks direct barcode mappings (`sku_barcodes`) and fallback SKU code matches.
3. It returns the exact SKU, packaging level (Each vs Case), conversion factor (e.g. 24 units), tracking class, and required dates.
4. If the barcode belongs to multiple clients (and no client is pre-selected), it returns all candidates for the operator to select.

---

### 4. Code Architecture

* **UI Route**: `/dashboard/catalog` (Page: `apps/web/src/app/dashboard/catalog/page.tsx`)
* **Components**:
  * `catalog-client.tsx`: Main catalog view with client switcher, search/filters, completeness meter, and table.
  * `create-sku-modal.tsx`: Tabbed creation modal (General, Tracking & Rotation, Dimensions & Barcode, Storage).
  * `edit-sku-modal.tsx`: Edit product details, rotation rules, and packaging dimensions.
  * `import-catalog-modal.tsx`: Drag-and-drop CSV importer with error reporting and downloadable template.
  * `barcode-lookup-modal.tsx`: Product barcode scanner with `<CameraScanner />` camera integration.
* **Server Actions** (`apps/web/src/app/dashboard/catalog/actions.ts`):
  * `getSkus`, `createSkuAction`, `updateSkuAction`, `deleteSkuAction`, `resolveBarcodeAction`, `importCatalogCsvAction`.
* **CSV Engine** (`apps/web/src/lib/catalog/csv-engine.ts`):
  * Parser and exporter with automatic formula injection neutralization (`=`, `+`, `-`, `@`).
