# VentoryPoint Warehouse Operating System
## Module Documentation: Integration Framework, Self-Healing Pipeline & Shopify

**Module**: Sprint 12 — Integration Framework, Self-Healing & Shopify  
**Primary Route(s)**: `/dashboard/integrations`, `/dashboard/integrations/errors`, `/api/hooks/[channel]/[connection]`  
**Parent PRD**: Phase 1 — Sprint 12 — Integration Framework and Shopify  
**Status**: Planned (First Module of Sprints 12–13 Integrations v1)

---

### 1. Executive Summary

Sprint 12 builds the universal **Channel Integration Framework** and **Self-Healing Ingestion Pipeline**, proving both with a real-time, two-way **Shopify Connector**. Orders arrive via HMAC-verified webhooks in under 2 seconds, malformed addresses and unmapped SKUs are healed automatically or queued with one-click suggestions, inventory balances sync back to Shopify within 5 seconds of any warehouse scan, and shipment tracking numbers push back automatically on pack completion.

Key capabilities:
1. **OAuth Connection Wizard & Vault Storage**: Connect client Shopify stores in under 10 minutes, map Shopify locations to VentoryPoint facilities, and store tokens encrypted in Supabase Vault.
2. **Fast Webhook Ingestion & Raw Store**: Edge endpoint verifies HMAC, writes raw payload to `integration_messages`, returns `200 OK` immediately, and processes asynchronously with idempotent upsert.
3. **Self-Healing Order Pipeline**:
   * **Address Normalisation**: Auto-corrects high-confidence street/ZIP typos while preserving the original address; places low-confidence addresses on `Address Review` hold with a one-click suggested fix.
   * **Deterministic SKU Resolution**: Resolves channel SKUs via `sku_aliases` → exact SKU/barcode match → fuzzy separator/case suggestions. Confirming a suggestion creates the alias and auto-releases all held orders for that SKU.
4. **Real-Time Inventory & Fulfillment Sync (`channel_sync` consumer)**: Debounces inventory changes (250ms per SKU) and pushes available-to-sell counts to Shopify; pushes carrier + tracking number on `shipment.shipped`.
5. **15-Minute Reconciliation Poller & GDPR/Privacy Webhooks**: Recovers any missed webhooks automatically and implements mandatory Shopify privacy hooks (`customers/data_request`, `customers/redact`, `shop/redact`).

---

### 2. Database Schema Overview

| Table | Purpose |
| :--- | :--- |
| **`connections`** | Per-client storefront/channel connections, status, facility mappings, and Vault secret references. |
| **`integration_messages`** | Immutable raw webhook/API payload log for audit and one-click replay. |
| **`integration_errors`** | Unified self-healing error queue with suggested fixes and bulk resolution actions. |
| **`sync_cursors` & `inventory_sync_state`** | Tracks last-polled timestamps and last-pushed SKU quantities per channel location. |
| **`sku_aliases`** | Maps external channel SKU/variant IDs to internal VentoryPoint `sku_id` records. |
