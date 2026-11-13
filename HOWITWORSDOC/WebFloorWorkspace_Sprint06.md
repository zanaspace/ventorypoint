# VentoryPoint Warehouse Operating System
## Module Documentation: Web Floor Workspace (Scanning, Feedback, Printing)

**Module**: Sprint 6 — Web Floor Workspace  
**Primary Route(s)**: `/floor`, `/floor-login`  
**Parent PRD**: Phase 1 — Sprint 06 — Web Floor Workspace  
**Status**: Planned (Next Up — Unlocks Sprints 7–11 Execution Flows)

---

### 1. Executive Summary

Sprint 6 builds the browser-based **Warehouse Floor Mode** (`/floor`) that powers the **15-Minute Rule** (a new temp worker becomes productive in under 15 minutes without classroom training). Every physical warehouse operation—Receiving, Putaway, Picking, Packing, Cycle Counting, and Ad-Hoc Moves—runs inside this high-contrast, scan-driven shell.

Key capabilities:
1. **Floor Mode Shell (`/floor`)**: Displays active worker badge, facility, online/offline indicator, and large touch tiles (`Receive`, `Put Away`, `Pick`, `Pack`, `Count`, `Move`) filtered by worker permissions.
2. **Hardware Wedge & GS1-128 Scanner Service**: Captures rapid keystroke bursts from Zebra/Honeywell handhelds and Bluetooth ring scanners, automatically parsing GS1 Application Identifiers (`01` GTIN, `10` Lot, `11` Mfg Date, `17` Expiry Date, `21` Serial).
3. **Unmistakable Audio-Visual & Haptic Feedback**: Instant green chime on valid scan; full-screen red error lock with buzzer sound and vibration on wrong SKU/location/lot scan until acknowledged.
4. **Offline Scan Queue & Safe Replay**: Persists floor events in `IndexedDB` when Wi-Fi drops in deep racking aisles and replays them idempotently via `record_floor_events` when connectivity returns.
5. **Browser Label Printing (ZPL / PDF)**: Sends LPN, SKU, and location barcode labels directly to station-bound Zebra thermal printers.

---

### 2. Operational Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Floor Workspace (/floor)                         │
├──────────────────────┬──────────────────────────┬───────────────────────┤
│  Scanner Wedge Hook  │   Step-by-Step Flow UI   │  Offline Queue Engine │
│  - USB / BT HID      │   - Big Location Card    │  - IndexedDB Store    │
│  - GS1 AI Parser     │   - Product Photo & UoM  │  - Idempotency Keys   │
│  - Focus Guard       │   - Audio/Haptic Lock    │  - Auto-Sync Worker   │
└──────────┬───────────┴─────────────┬────────────┴───────────┬───────────┘
           │                         │                        │
           ▼                         ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│       Supabase RPCs: record_floor_events · move_inventory · ZPL         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Core Functional Components

| Component | Responsibility |
| :--- | :--- |
| **Station Header & Quick-Switch** | Shows active worker name, station facility, Wi-Fi status, and 2-second Badge + PIN swap modal for shared packing/dock stations. |
| **Scanner Input Engine** | Distinguishes scanner bursts (`< 35ms` inter-key latency) from manual typing; parses GS1-128 barcodes into structured `{ gtin, lot, expiryDate, serial }`. |
| **Scan-to-Move Reference Flow** | Complete floor workflow: Scan Source Location → Scan Item/LPN → Enter Qty → Scan Destination Location → Atomic `move_inventory` / `move_container`. |
| **ZPL Print Service** | Station-to-printer binding with one-tap reprint of LPN (`LPN-*`), SKU, and Rack Location labels. |

---

### 4. Acceptance Criteria & Non-Functional Targets

* **15-Minute Onboarding Test**: First-time workers complete 10 scan-to-move tasks unaided in under 15 minutes with zero errors.
* **Scan Feedback Latency**: `< 50ms` client-side audio/visual response on every barcode scan.
* **Offline Resilience**: Disconnecting Wi-Fi mid-move queues scans locally and syncs 100% of events without duplicates upon reconnection.
