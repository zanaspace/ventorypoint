# VentoryPoint Warehouse Operating System
## Module Documentation: Team Members, RBAC & Floor Worker Badges

**Module**: Sprint 1 — Tenancy & Access Control  
**Route**: `/dashboard/members`  
**Parent PRD**: Phase 1 — Sprint 01 — Auth, Tenant Hierarchy & Roles  
**Status**: 100% Implemented & Verified in Production  

---

### 1. Executive Summary

In a warehouse operation, team members span two completely different operational environments:
1. **Office Staff (Desk Users)**: 3PL Owners, General Managers, Account Managers, and Billing Clerks who work on laptops and sign in via Email + Password, Google, or Microsoft OAuth.
2. **Floor Staff (Warehouse Workers)**: Pickers, Packers, Material Handlers, and Forklift Operators who work on their feet, share warehouse tablets/scanners across shifts, and often do not have company email addresses.

This module provides a unified security and identity system that handles both types of workers:
* **Granular Role-Based Access Control (RBAC)** across 6 distinct role tiers.
* **Two-Level Admin Permissions**: An Owner-governed privilege system preventing unauthorized elevation of privilege.
* **Workspace Invite Codes**: Shareable alphanumeric codes with domain locks and admin approval gates.
* **Floor Worker Provisioning**: Fast creation of email-less accounts, 4–6 digit PINs, and printable physical ID badge cards with scannable barcodes.
* **Rate-Limit Lockout Security**: Automatic 15-minute lockout after 5 consecutive incorrect PIN entries.

---

### 2. Role Hierarchy & Permission Matrix

```
                ┌──────────────┐
                │    Owner     │  Full control, billing, transfers ownership
                └──────┬───────┘
                       │
                ┌──────┴───────┐
                │    Admin     │  Manages facilities, clients, orders, settings
                └──────┬───────┘  (Can manage members ONLY if granted by Owner)
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌──────────────────┐       ┌──────────────────┐
│ Operations Mgr   │       │    Supervisor    │  Oversees floor shifts, assigns waves,
└────────┬─────────┘       └────────┬─────────┘  approves inventory cycle count overrides
         │                          │
         └─────────────┬────────────┘
                       ▼
             ┌──────────────────┐
             │   Floor Worker   │  Floor Terminal only (Badges, picking, scanning)
             └──────────────────┘  Zero access to office dashboard or financials
```

| Role | Dashboard Access | Floor Terminal | Manage Clients / Facilities | Manage Members | Billing & Plan |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **`owner`** | Full | Yes | Full | Full | Full |
| **`admin`** | Full | Yes | Full | If Granted by Owner | View / Manage |
| **`operations_manager`** | Full | Yes | Yes | Floor Workers Only | None |
| **`supervisor`** | Shift / Floor | Yes | Read Only | View Shift Workers | None |
| **`floor_worker`** | None (Blocked) | Full | None | None | None |
| **`read_only`** | Read Only | None | Read Only | None | None |

#### Two-Level Admin Security (`can_manage_all_members`)
In conventional software, making someone an "Admin" gives them the power to delete the owner or remove other admins. In VentoryPoint:
* An Admin cannot manage other Admins or change membership roles **unless the Organization Owner explicitly toggles the `can_manage_all_members` grant**.
* Database RPCs (`can_manage_member`, `remove_member`, `set_admin_privilege`) strictly enforce this hierarchy at the PostgreSQL level, making it impossible to bypass via the frontend.

---

### 3. Invitation System

VentoryPoint provides two flexible methods to onboard office team members:

#### 3.1 Direct Link Invitations
* Administrators invite a colleague via email and choose their role and facility scope (e.g., *Access to Dallas 1 and Chicago 2 only*).
* A cryptographic token link (`/invite?token=...`) is generated.
* Upon redemption, the user's Supabase auth ID is bound to `organization_members` and facility junction tables in a single atomic transaction.

#### 3.2 Workspace Invite Codes (`/join`)
For onboarding larger teams or cohort groups:
* Admins can generate a short, easy-to-read invite code formatted as `XXXX-XXXX` (using unambiguous characters, excluding `O`, `0`, `I`, `1`).
* **Security Controls**:
  * **Email Domain Restriction**: Enforces that only emails ending in `@your3pl.com` can redeem the code.
  * **Requires Admin Approval**: When checked, redeeming the code puts the user into a pending state (`/revoked`) until an Admin reviews and clicks "Approve".
  * **Expiry & Usage Limits**: Automatically expires after a set number of days or maximum uses.
  * **Brute-Force Rate Limiting**: After 5 invalid code attempts in 1 minute, the IP is placed on cooldown.

---

### 4. Floor Worker Credential & Badge System

Floor workers sign in at warehouse kiosks and pick-cart tablets via `/floor-login`. Because many workers do not have corporate email addresses, their accounts are created directly by managers without requiring Supabase Auth emails:

```
┌─────────────────────────────────────────────────────────────┐
│                    Floor Worker Creation                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   [Generate Credentials]                [Print Physical Badge]
   - Worker Code (e.g. W-104)            - High-contrast card layout
   - 4 to 6 digit PIN (bcrypt)           - Code 128 / QR barcode
   - Facility Assignment                 - Laminated clip-on badge
            │                                     │
            └──────────────────┬──────────────────┘
                               ▼
                   [Floor Terminal Sign-In]
                   1. Scan badge with camera or laser gun
                   2. Type PIN on touch keypad
                   3. Shift starts (12-hour session)
```

#### 4.1 Key Security Mechanics
* **Database Table**: `floor_worker_credentials`
  * `badge_token` (`text`, unique): A high-entropy random token encoded into the worker's barcode.
  * `pin_hash` (`text`): Salted bcrypt hash of the worker's 4–6 digit PIN.
  * `failed_attempts` (`int`): Counter tracking consecutive failed logins.
  * `locked_until` (`timestamptz`): Set to `now() + interval '15 minutes'` when `failed_attempts >= 5`.
* **Badge Reissue & PIN Reset**:
  * If a worker forgets their PIN, a supervisor can reset it in 2 clicks.
  * If a physical badge card is lost on the warehouse floor, clicking **Reissue Badge** immediately invalidates the old `badge_token`, rendering the lost card useless.
* **Printable ID Badges**:
  * The **Badge Modal** generates an ID card formatted for PVC card printers or standard label sheets with the worker's photo placeholder, worker code, facility name, and scannable barcode.

---

### 5. Code Architecture & Server Actions

* **UI Page**: `apps/web/src/app/dashboard/members/page.tsx`
* **Components**:
  * `members-client.tsx`: Main members table with role badges, facility tags, and search/filter.
  * `invite-member-modal.tsx`: Email and code invitation creation.
  * `create-floor-worker-modal.tsx`: Quick provisioning form for floor staff.
  * `badge-modal.tsx`: Printable ID badge renderer with vector barcode and QR code.
* **Server Actions**:
  * `apps/web/src/app/dashboard/members/actions.ts`: Office user invitations, role changes, and member removals.
  * `apps/web/src/app/dashboard/members/floor-actions.ts`: Floor worker PIN resets, token reissues, and badge generation.
