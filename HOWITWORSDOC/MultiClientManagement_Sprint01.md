# VentoryPoint Warehouse Operating System
## Module Documentation: Multi-Client 3PL Architecture & Client Accounts

**Module**: Sprint 1 — Tenancy & Core Entities  
**Route**: `/dashboard/clients`  
**Parent PRD**: Phase 1 — Sprint 01 — Auth, Tenant Hierarchy & Roles  
**Status**: 100% Implemented & Verified in Production  

---

### 1. Executive Summary

VentoryPoint is purpose-built as a **multi-client Third-Party Logistics (3PL)** warehouse management system. 

In traditional single-tenant warehousing software, all inventory belongs to one company. In a 3PL warehouse, the warehouse operator stores, picks, packs, and ships inventory for dozens or hundreds of independent brand clients (e.g., e-commerce merchants, retail brands, B2B manufacturers) under one physical roof.

This module provides the foundation for:
1. **Strict Client Data Segregation**: Every client's inventory, orders, billing terms, and customer records are isolated.
2. **Multi-Facility Mapping**: A client can store goods across one, some, or all of the 3PL's facilities, with a designated primary fulfillment hub.
3. **Client Lifecycle Governance**: Instant suspension or reactivation of client operations with database-enforced integrity.
4. **Dual Perspective Architecture**: Clear separation between the 3PL Operator's administrative management view and the merchant's view.

---

### 2. Database Architecture

#### 2.1 `client_accounts` Table
Stores the brand client's master profile within the 3PL organization:
* `id` (`uuid`, primary key): Unique client identifier.
* `organization_id` (`uuid`, references `organizations`): The parent 3PL tenant. Protected by an immutable database trigger preventing cross-tenant transfer.
* `name` (`text`): Legal business / trading name of the client brand.
* `short_code` (`text`): 3–6 character uppercase prefix (e.g., `ACME`, `GLOW`) used as an inventory and SKU identifier prefix.
* `status` (`text`): Client operational state (`active`, `suspended`, `archived`).
* `primary_contact_name` & `primary_contact_email`: Main account point of contact for operational notifications.
* `billing_terms` (`text`): e.g., `Net 15`, `Net 30`, `Due on Receipt`, `Prepaid`.
* `default_facility_id` (`uuid`, references `facilities`): The primary warehouse where this client's inventory is staged and fulfilled.

#### 2.2 `client_facilities` (Junction Table)
Defines which physical warehouses in the 3PL network are authorized to store and process this client's inventory:
* `client_id` (`uuid`, references `client_accounts`, `on delete cascade`)
* `facility_id` (`uuid`, references `facilities`, `on delete cascade`)
* Primary key: `(client_id, facility_id)`

#### 2.3 Row Level Security (RLS) & Triggers
* **Tenant Isolation**: RLS ensures 3PL members can only view and edit client accounts belonging to their own `organization_id`.
* **Immutable Tenancy Trigger** (`trg_client_accounts_immutable_org`): Prevents malicious or accidental modification of `organization_id` on existing client records.
* **Integrity Validation**: When assigning a `default_facility_id`, server actions enforce that the default facility must be included in the client's authorized serving facilities list.

---

### 3. Key User Workflows

```
┌──────────────────────────────────────────────────────────────┐
│                    3PL Admin / Ops Manager                   │
└──────────────────────────────┬───────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   [Create Client Account]              [Manage Facilities]
   - Brand Name & Short Code            - Check Serving Warehouses
   - Primary Contacts                   - Designate Primary Hub
   - Billing Terms (Net 30)             - Auto-Sync Junction Table
            │                                     │
            └──────────────────┬──────────────────┘
                               ▼
                    [Client Status Controls]
                    - Active (Normal Operations)
                    - Suspended (Fulfillment Halted)
                    - Archive
```

#### 3.1 Creating a New Client Account
1. From `/dashboard/clients`, click **Add Client**.
2. Enter the **Brand Name** and unique **Short Code** (e.g., `LUMEN`).
3. Provide primary contact details (contact name, email, phone) for receiving fulfillment and billing alerts.
4. Select the **Serving Facilities** where this client is contracted to store inventory.
5. Select the **Default Facility** (the default routing node for inbound receiving and order allocation).
6. Enter **Billing Terms** and click **Create Client**.

#### 3.2 Suspending vs. Activating a Client
When a client has overdue storage invoices, unresolved disputes, or pending legal review, 3PL administrators can change their status in one click:
* **Active**: All warehouse operations (receiving POs, wave picking, shipping, portal logins) proceed normally.
* **Suspended**: Halts automated order releasing and inventory allocations for this client's goods while preserving all inventory location records and audit history.
* **Archived**: Read-only historical state for former clients who no longer store goods in the facility.

---

### 4. Code Structure & Server Actions

* **UI Page**: `apps/web/src/app/dashboard/clients/page.tsx`
  * Server component fetching clients with joined serving facilities and active inventory counts.
* **Interactive Client**: `apps/web/src/app/dashboard/clients/components/clients-client.tsx`
  * Provides real-time text search, status filters (`All`, `Active`, `Suspended`), quick stats banner, and action dropdowns.
* **Modals**:
  * `create-client-modal.tsx`: Multi-step form with facility multi-select and validation.
  * `edit-client-modal.tsx`: Edit contact details, billing terms, and facility bindings.
* **Server Actions** (`apps/web/src/app/dashboard/clients/actions.ts`):
  * `createClientAccount`: Atomically validates and inserts the client record and syncs `client_facilities`.
  * `updateClientAccount`: Updates metadata and reconciles facility additions/removals.
  * `toggleClientStatus`: Toggles between `active` and `suspended` with instant cache revalidation (`revalidatePath`).
  * `deleteClientAccount`: Enforces soft-check preventing deletion if client has active stock.
