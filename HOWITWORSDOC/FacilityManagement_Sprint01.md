# VentoryPoint Warehouse Operating System
## Module Documentation: Facility & Physical Warehouse Management

**Module**: Sprint 1 — Tenancy & Physical Network  
**Route**: `/dashboard/facilities`  
**Parent PRD**: Phase 1 — Sprint 01 — Auth, Tenant Hierarchy & Roles  
**Status**: 100% Implemented & Verified in Production  

---

### 1. Executive Summary

A 3PL business may operate a single 50,000 sq. ft. building or a nationwide network of distribution centers across multiple regions. In VentoryPoint, a **Facility** represents an independent physical warehouse, logistics hub, or fulfillment depot.

Every physical barcode sticker, inventory putaway location, floor worker terminal, and carrier dispatch cutoff is anchored to a specific Facility.

This module provides:
1. **Facility Master Profiles**: Short codes, legal names, timezones, and address records.
2. **Automated Geocoding**: Address resolution via OpenStreetMap / Nominatim with interactive map pin verification and coordinate override.
3. **Operating Hours Engine**: Day-of-week open/close schedules and closed-day toggles used to calculate operational SLAs.
4. **Dynamic Carrier Cutoff Times**: Per-carrier daily dispatch deadlines (UPS, FedEx, DHL, USPS, LTL) powering order prioritization and shipping queues.
5. **Multi-Facility Context Switching**: Frictionless switching in the navigation sidebar, persisting the active facility in secure cookies.
6. **Entitlement Enforcement**: Enforces plan tier facility limits (e.g., Starter = 1 facility, Growth = 3 facilities, Enterprise = unlimited) via Stripe billing checks.

---

### 2. Database Architecture

#### 2.1 `facilities` Table
* `id` (`uuid`, primary key): Unique facility ID.
* `organization_id` (`uuid`, references `organizations`): Immutable parent tenant ID.
* `name` (`text`): Descriptive name (e.g., *Dallas Central Distribution Center*).
* `short_code` (`text`): 3–6 character uppercase identifier (e.g., `DAL1`, `MYA`). **Critical:** This short code is the primary prefix for all barcode labels, ZPL commands, and bin addresses generated in this building.
* `timezone` (`text`): Standard IANA timezone (e.g., `America/Chicago`, `America/New_York`, `Europe/London`). All local cutoffs and shift logs calculate against this timezone.
* `operating_hours` (`jsonb`): Day-by-day structured opening hours:
  ```json
  {
    "mon": { "closed": false, "open": "07:00", "close": "18:00" },
    "tue": { "closed": false, "open": "07:00", "close": "18:00" },
    "sat": { "closed": true,  "open": "08:00", "close": "14:00" },
    "sun": { "closed": true,  "open": "00:00", "close": "00:00" }
  }
  ```
* `carrier_cutoffs` (`jsonb`): Carrier-specific daily pickup deadlines:
  ```json
  [
    { "carrier": "FedEx Ground", "time": "16:30" },
    { "carrier": "UPS Next Day Air", "time": "17:15" },
    { "carrier": "USPS Priority", "time": "15:00" }
  ]
  ```
* **Geographical Fields**:
  * `street_address`, `city`, `state_province`, `postal_code`, `county`, `country`
  * `latitude` & `longitude` (`double precision`): Validated between $[-90, +90]$ and $[-180, +180]$.
  * `geocode_status`: `'verified'`, `'unverified'`, `'failed'`.
  * `geocoded_at`: Timestamp of latest geocoding lookup.

---

### 3. Key Operational Features

```
┌─────────────────────────────────────────────────────────────┐
│                    Physical Warehouse Hub                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
   [Facility Profile]    [Address & Map]     [Cutoffs & Hours]
   - Name & Short Code   - Street, City, ZIP - Day-by-Day Hours
   - Timezone (IANA)     - Auto-Geocoded GPS - Carrier Deadlines
   - Barcode Root        - Map Pin Check     - SLA Clock
```

#### 3.1 Facility Short Code Standard
The facility short code is the anchor for the entire physical storage hierarchy:
* When a warehouse manager generates barcode labels in Sprint 3, the code template starts with `{FAC}` (e.g. `MYA-W1-A01-B02-L1-P01`).
* Handheld scanners use this prefix to ensure a worker in Facility A never mistakenly scans a bin belonging to Facility B.

#### 3.2 Operating Hours & SLA Engine
Order fulfillment SLAs (e.g., "Same-Day Dispatch for orders placed before 2 PM") depend on physical facility operating hours.
* Operating hours are strictly validated on submission: closing times must be after opening times, and closed days bypass time validations.
* VentoryPoint's wave release engine uses operating hours to ensure order waves are not released to floor pickers when the warehouse is closed.

#### 3.3 Dynamic Carrier Cutoffs
Different shipping carriers arrive for dock pickup at different times throughout the afternoon:
* Operators can define custom cutoff times per carrier (e.g., USPS at 3:00 PM, FedEx at 4:30 PM, UPS at 5:15 PM).
* Orders assigned to carriers with earlier cutoffs are automatically prioritized to the top of the picking wave queue so packers meet the trucks before they leave.

#### 3.4 Address Geocoding & OpenStreetMap
When a facility address is entered, the server queries the OpenStreetMap Nominatim engine to resolve latitude and longitude coordinates:
* An interactive map displays the resolved pin.
* If a warehouse is in a newly developed industrial park where GPS addresses are slightly offset, managers can manually drag the pin or enter exact decimal coordinates.

---

### 4. Code Architecture & Server Actions

* **Page**: `apps/web/src/app/dashboard/facilities/page.tsx`
* **Sub-routes**: `apps/web/src/app/dashboard/facilities/[id]/locations/` (Sprint 3 Location Hierarchy)
* **Components**:
  * `facility-list.tsx`: Facility overview cards displaying active locations, operational hours status, and quick links.
  * `create-facility-modal.tsx`: Multi-tab modal (General, Address & Geocoding, Hours & Cutoffs).
  * `edit-facility-modal.tsx`: Edit existing facility settings with instant revalidation.
* **Server Actions** (`apps/web/src/app/dashboard/facilities/actions.ts`):
  * `createFacility`: Checks billing subscription facility quota (`assertCanAddFacility`), validates hours/cutoffs/coordinates, and creates the record.
  * `updateFacility`: Updates metadata and regenerates operational schedules without disrupting location trees.
  * `deleteFacility`: Blocks deletion if locations, active devices, or client inventory are linked to the facility.
