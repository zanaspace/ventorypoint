# VentoryPoint Warehouse Operating System
## Sprint 3 Documentation: Precise Location Hierarchy, Floor Storage & Naming Convention

**Module**: Sprints 3–5 — Inventory Core  
**Parent Document**: PRD — Modern 3PL Warehouse Operating System (v1.1), Section 6.2 (Phase 1 — The Wedge / MVP)  
**Status**: 100% Implemented & Verified against Live Database  
**Database Test Suite**: `supabase/tests/sprint03_locations_suite.sql` (Passed 5/5 test groups)  

---

### 1. Executive Summary

In a modern 3PL warehouse, item-level traceability requires giving every physical spot where goods can sit an unambiguous, unique, and scannable address. Whether goods sit on selective pallet racks, small-parts shelf bins, floor grid stacks, deep bulk lanes, secure cages, or cold rooms, every warehouse scan (receiving, putaway, wave picking, cycle counting, pack/ship) must validate against a physical address.

Sprint 3 implements this physical foundation:
1. **Configurable Location Hierarchy**: Multi-level tree ($Building \rightarrow Wing \rightarrow Floor \rightarrow Area \rightarrow Aisle \rightarrow Bay \rightarrow Level \rightarrow Position$).
2. **Every Storage Method**: Selective pallet racking, shelf bins, floor grid cells ($Row \times Col$), bulk floor lanes with slot depth ($LN \times Slot$), and special areas.
3. **Naming Convention Engine**: Zero-padding, fixed segment widths, uppercase alphanumeric, and strict elimination of ambiguous lookalike characters ($O/0$, $I/1$, $S/5$).
4. **Bulk Range Generators**: Generates thousands of locations in seconds with serpentine or one-way walk sequence assignment.
5. **Printable Barcode Labels & ZPL**: 2"×1" shelf bin labels, 4"×6" pallet rack labels with directional level arrows ($\uparrow / \downarrow$), and raw Zebra ZPL output.
6. **CSV Import/Export Engine**: Drag-and-drop CSV parser with row-by-row validation report.
7. **90-Day Rename Aliases**: Renamed locations still resolve using their historical code for 90 days.
8. **Inventory Hard-Delete Protection**: Database trigger guarantees locations that have ever held inventory can never be hard-deleted.

---

### 2. Database Architecture

#### 2.1 `location_nodes` (Hierarchy Tree)
Represents the structural nodes of the facility:
- `id` (uuid, primary key)
- `organization_id` (uuid, references `organizations`)
- `facility_id` (uuid, references `facilities`)
- `parent_id` (uuid, references `location_nodes`)
- `node_type`: `'building'`, `'wing'`, `'floor_level'`, `'area'`, `'aisle'`, `'bay'`, `'level'`, `'position'`
- `code` & `name`: Structured identifier and human display name
- `metadata`: JSONB containing bay width, shelf height, orientation, and rack side

#### 2.2 `locations` (Addressable Storage Leaf Nodes)
The scannable address where inventory sits:
- `id` (uuid, primary key)
- `facility_id` & `organization_id`
- `full_code`: Unique uppercase formatted code (e.g. `DAL1-W2-ZA-A04-B12-L3-P02`)
- `barcode`: Code 128 / QR scannable payload
- `short_pick_code`: Compact floor alias (e.g. `A04-12-3-02`)
- `human_path`: Formatted breadcrumbs (`Dallas 1 › Wing 2 › Area A › Aisle 04 › Bay 12 › Level 3 › Position 02`)
- `location_type`:
  - `rack_pallet_position`: Pallet racking (levels counted from floor beam up)
  - `shelf_bin`: Small-parts shelving
  - `floor_grid_cell`: Grid rows $\times$ columns with stack limits
  - `bulk_floor_lane`: Marked lanes with slot depth
  - `special_area`: Cages, cold rooms, hazmat, staging, docks, yard, pack stations
- `temperature_class`: `'ambient'`, `'chilled'`, `'frozen'`, `'deep_freeze'`, `'temperature_controlled'`
- `storage_rules`: `mixed_sku_allowed`, `mixed_lot_allowed`, `pickable`, `sellable`, `receivable`, `active`
- `has_held_inventory`: boolean flag triggering delete protection
- `walk_sequence`: Integer routing order for pick paths

#### 2.3 `facility_naming_conventions`
Facility-specific naming rules:
- `rack_template`: `{FAC}-{WING}-{AREA}-{AISLE}-{BAY}-{LEVEL}-{POS}`
- `floor_grid_template`: `{FAC}-{WING}-FLR-R{ROW}-C{COL}`
- `bulk_lane_template`: `{FAC}-{WING}-BLK-LN{LANE}-S{SLOT}`
- `special_area_template`: `{FAC}-{WING}-{AREA}-{NN}`
- `separator`: `-`
- `segment_widths`: Configurable segment length constraints
- `excluded_chars`: `['O', '0', 'I', '1', 'S', '5']`
- `odd_even_aisle_sides`: boolean (odd bay numbers on left, even on right)
- `bottom_up_levels`: boolean (level 1 is lowest ground beam)

#### 2.4 `location_code_history`
Maintains a 90-day lookup index for historical codes after a rename, preventing broken labels in the warehouse.

---

### 3. Naming Convention & Lookalike Prevention

To prevent errors on handheld scanners and human misreadings:
1. **Ambiguous Letters Excluded**: The letter `O` is disallowed (use digit `0`), the letter `I` is disallowed (use digit `1`), and the letter `S` is disallowed (use digit `5`) in letter segments.
2. **Fixed-Width Zero-Padding**:
   - Aisle 4 $\rightarrow$ `A04`
   - Bay 12 $\rightarrow$ `B12`
   - Level 3 $\rightarrow$ `L3`
   - Position 2 $\rightarrow$ `P02`
3. **Standard Syntax Examples**:
   - Selective Rack: `DAL1-W2-ZA-A04-B12-L3-P02`
   - Floor Grid: `DAL1-W1-FLR-R05-C03`
   - Bulk Lane: `DAL1-W1-BLK-LN07-S02`
   - Special Vault / Cold Room: `DAL1-W1-CAGE-01`, `DAL1-W3-COLD-04`

---

### 4. Bulk Range Generators

The web application provides an automated bulk range generator located at `/dashboard/facilities/[id]/locations`:
- **Racks**: Generates $Aisles \times Bays \times Levels \times Positions$.
- **Floor Grids**: Generates $Rows \times Columns$ with stack limits.
- **Bulk Lanes**: Generates $Lanes \times Slots$ with FIFO drive-through or LIFO single-entry rules.
- **Special Areas**: Generates staging bays, dock doors, pack stations, and mobile carts.
- **Walk Routing**: Calculates serpentine route (snaking up and down alternate aisles) to minimize worker travel time.
- **Live Preview**: Calculates exact count and shows the first 3 and last 3 codes before committing.

---

### 5. Barcode Labels & Zebra ZPL Printing

The label system supports both browser-based printing and industrial thermal printers:
1. **2" × 1" Shelf Bin Labels**: Compact format with scannable Code 128 SVG barcode, bold location code, and short pick code alias.
2. **4" × 6" Rack Pallet Labels**:
   - Directional level indicator with arrow ($\uparrow$ for upper levels, $\downarrow$ for ground beam).
   - High-contrast scannable Code 128 barcode.
   - Walk sequence number and rack side.
   - Full human-readable breadcrumbs.
3. **Zebra ZPL File Export**:
   - Emits raw ZPL (`^XA ... ^XZ`) formatted for 203 DPI thermal printers.
   - 1-click download of `.zpl` batch file for warehouse printer operators.

---

### 6. CSV Import & Export Engine

- **Export**: One-click download of all locations matching current active filters as CSV.
- **Import**:
  - Drag-and-drop or paste CSV.
  - Strict validation against naming convention regex.
  - Duplication check within CSV and against the facility's existing database.
  - Generates a row-by-row error report with exact failure reasons (e.g. `Row #14: Ambiguous character 'O' found`).
  - Sample CSV template download.

---

### 7. Code Resolution & Inventory Delete Protection

1. **RPC Function `public.resolve_location_by_code(p_facility_id, p_code)`**:
   - Step 1: Searches exact `full_code`.
   - Step 2: Searches `barcode`.
   - Step 3: Searches `short_pick_code` (case-insensitive).
   - Step 4: Searches `location_code_history` where `expires_at > now()`.
2. **Delete Protection Trigger `trg_locations_protect_delete`**:
   - If `has_held_inventory = true`, raises PostgreSQL exception `23503`:
     > *"Cannot delete location [CODE]: it has held inventory. Deactivate it instead."*

---

### 8. Verification & Test Suite

The test suite `supabase/tests/sprint03_locations_suite.sql` was executed directly against the live Supabase database and passed with 0 errors:
- `TEST 1: Hierarchy Nodes & Locations Schema` $\rightarrow$ **PASSED**
- `TEST 2: Inserting Rack, Floor Grid & Bulk Locations` $\rightarrow$ **PASSED**
- `TEST 3: Code Resolution (resolve_location_by_code)` $\rightarrow$ **PASSED**
- `TEST 4: Rename Tracking & 90-Day Alias Resolution` $\rightarrow$ **PASSED**
- `TEST 5: Inventory Hard-Delete Protection` $\rightarrow$ **PASSED**
