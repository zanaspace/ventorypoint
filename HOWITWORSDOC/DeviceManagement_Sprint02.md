# VentoryPoint Warehouse Operating System
## Module Documentation: Warehouse Device & Terminal Registry

**Module**: Sprint 2 — Device Registry & Session Security  
**Route**: `/dashboard/settings/devices`  
**Parent PRD**: Phase 1 — Sprint 02 — Event Backbone, Realtime and Audit Log  
**Status**: 100% Implemented & Verified in Production  

---

### 1. Executive Summary

Because these devices are expensive, shared across rotating shifts, and frequently moved throughout a massive facility, warehouse operators need strict oversight.

This module provides:
1. **Device Registry & Inventory**: Central ledger of every authorized tablet, scanner gun, and kiosk.
2. **Terminal Pairing Tokens**: Secure registration tokens binding hardware to a specific physical warehouse.
3. **Emergency Remote Lock (Kill Switch)**: One-click blocking that instantly signs out all active workers and revokes API access if a tablet is lost or stolen.
4. **Heartbeat & Telemetry Tracking**: Real-time tracking of `last_active_at`, IP address, client user-agent, and device type.

---

### 2. Database Architecture

#### 2.1 `floor_devices` Table
* `id` (`uuid`, primary key): Unique device ID.
* `organization_id` (`uuid`, references `organizations`): Immutable parent tenant ID.
* `facility_id` (`uuid`, references `facilities`): The specific warehouse where this device is permanently stationed.
* `device_name` (`text`): Human-readable asset tag (e.g., *Aisle 04 Cart Tablet*, *Zebra Gun #12*, *Dock 3 Pack Terminal*).
* `device_token` (`text`, unique): Cryptographic token stored in the browser/app local storage.
* `device_type` (`text`):
  * `'tablet'`: Touch tablets on carts or handhelds.
  * `'scanner'`: Rugged laser/imager mobile computers.
  * `'kiosk'`: Standalone floor login terminals.
  * `'printer_station'`: Fixed shipping and packing benches.
  * `'browser'`: Standard desktop browsers.
* `is_authorized` (`boolean`): Master approval status (default `true`). Setting to `false` immediately blocks all access.
* `last_active_at` (`timestamptz`): Updated on every warehouse scan or heartbeat.
* `registered_by` (`uuid`, references `profiles`): Manager who approved the device.

#### 2.2 Security Policies & Stored Procedures
* **`register_device` RPC**:
  Enforces same-organization binding and generates/updates the device token securely.
* **`update_device` RPC**:
  Allows renaming, moving a device to a different facility, or toggling authorization.
* **Revocation Enforcement in Middleware**:
  When a floor worker signs in or submits a barcode scan, the server verifies `floor_devices.is_authorized`. If unauthorized, the request fails with `HTTP 403 Device Revoked` and clears the local session.

---

### 3. Key Operational Workflows

```
┌─────────────────────────────────────────────────────────────┐
│                 New Warehouse Tablet Setup                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   [Open Floor Terminal]                 [Admin Approval]
   - Navigate to /floor-login            - Assign Name ("Cart 04 Tablet")
   - Device generates unique token       - Select Facility ("Dallas 1")
   - Prompts for authorization           - Authorize in Device Settings
            │                                     │
            └──────────────────┬──────────────────┘
                               ▼
                    [Normal Shift Operations]
                    - Worker scans badge to begin
                    - Every scan logged with device_id
                    - Live heartbeat keeps status active
                               │
                               ▼ (If Device Lost / Stolen)
                    [Emergency Remote Lock]
                    - Admin toggles "Blocked"
                    - Instant sign-out of all sessions
                    - Zero data accessible on screen
```

#### 3.1 Onboarding a New Warehouse Tablet
1. Power on the new tablet or scanner and open the browser to `/floor-login`.
2. The terminal detects it is a newly registered browser context and requests approval.
3. An Ops Manager opens `/dashboard/settings/devices` on their desktop.
4. The manager enters the asset tag name (e.g. `Zebra Gun #08`), selects the **Device Type** and **Facility**, and clicks **Approve Device**.
5. The device is now authorized and ready for 24/7 warehouse floor operations.

#### 3.2 The Emergency Remote Lock (Lost Device Protocol)
If a worker leaves a tablet in the back of a delivery truck or misplaces a scanner gun:
1. Open `/dashboard/settings/devices`.
2. Locate the device in the registry table.
3. Toggle the status from **Authorized** to **Blocked**.
4. The system immediately revokes the device token. If the screen is active, the active floor session is terminated and redirected to `/revoked`. No inventory, client, or order data can be accessed.

---

### 4. Code Architecture & Actions

* **UI Page**: `apps/web/src/app/dashboard/settings/devices/page.tsx`
* **Components**:
  * `devices-client.tsx`: Device table with status badges (Active, Idle, Blocked), last heartbeat timestamps, and filter by facility/type.
  * `register-device-modal.tsx`: Modal for manual device onboarding or token pairing.
  * `edit-device-modal.tsx`: Modal for renaming devices, reassigning warehouse facilities, or blocking.
* **Server Actions** (`apps/web/src/app/dashboard/settings/devices/actions.ts`):
  * `registerDevice`: RPC-backed action to register hardware.
  * `updateDevice`: Updates authorization status, names, and facility bindings.
  * `deleteDevice`: Removes obsolete or decommissioned hardware.
