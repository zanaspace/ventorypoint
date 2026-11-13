# VentoryPoint Warehouse Operating System
## Module Documentation: Amazon, WooCommerce, ShipStation, CSV/SFTP & Public API v1

**Module**: Sprint 13 — Amazon, WooCommerce, ShipStation, CSV/SFTP & Public API  
**Primary Route(s)**: `/dashboard/integrations`, `/dashboard/settings/api-keys`, `/api/v1/*`  
**Parent PRD**: Phase 1 — Sprint 13 — Amazon, WooCommerce, ShipStation and API  
**Status**: Planned (Completes Sprints 12–13 Integrations v1)

---

### 1. Executive Summary

Sprint 13 expands the Sprint 12 integration framework to complete the Phase 1 (MVP) connectivity suite: **Amazon Seller Central (SP-API MFN)**, **WooCommerce**, **ShipStation** as a live shipping label provider inside the Sprint 10 Pack Station, **Scheduled CSV/SFTP File Exchange**, and a documented **Public REST API v1** with OpenAPI 3.0 specifications.

Key capabilities:
1. **Amazon SP-API Adapter (MFN)**: Ingests merchant-fulfilled Amazon orders with Restricted Data Token (RDT) PII handling, pushes MFN inventory feeds, and confirms shipment tracking back to Amazon within 5 minutes of pack close.
2. **WooCommerce REST & Webhook Adapter**: Connects WooCommerce stores via API keys, registers order webhooks, syncs stock levels, and writes shipment tracking metadata on order completion.
3. **ShipStation `ShippingProvider`**: Plugs directly into the Sprint 10 Pack Station (`getRates`, `createLabel`, `voidLabel`, `getTracking`), buying and auto-printing carrier labels in `< 5s` upon carton close.
4. **Scheduled CSV / SFTP Channel**: Per-client SFTP drop folders (every 5–15 min pickup) and UI CSV dropzone for Orders and ASNs, routing malformed rows into the unified Sprint 12 Error Queue.
5. **Public REST API v1 (`/api/v1/*`)**: Scoped, hashed API keys (`org` or `client_account` level) supporting `Idempotency-Key` headers, cursor pagination, rate limiting, and OpenAPI reference docs.

---

### 2. Public REST API v1 Surface

| Endpoint | Method | Scope & Capability |
| :--- | :---: | :--- |
| **`/api/v1/orders`** | `GET`, `POST` | List orders or create new outbound orders idempotently via `Idempotency-Key`. |
| **`/api/v1/orders/{id}/cancel`** | `POST` | Cancel an unshipped order before packing completes. |
| **`/api/v1/asns`** | `GET`, `POST` | Create or query inbound Advance Shipping Notices (ASNs). |
| **`/api/v1/inventory`** | `GET` | Real-time balances filterable by SKU, lot, expiry window, status, and location path. |
| **`/api/v1/serials/{serial}`** | `GET` | Full lifecycle traceability and current location/shipment for a unique serial number. |
| **`/api/v1/lots/{lot}`** | `GET` | Batch quantities, locations, manufacture/expiry dates, and quarantine status. |
| **`/api/v1/shipments`** | `GET` | Outbound shipments with carrier tracking numbers, cartons, and packed lots/serials. |
