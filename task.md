# Sprint 1 — Auth, Tenant Hierarchy & Roles: Status Audit

Source: `PRD/PRD/Phase 1 - The Wedge (MVP)/Phase 1 - Sprint 01 - Auth Tenant Hierarchy and Roles.md`
Audited against the code in `apps/web/src` and `supabase/migrations`.

Legend: `[x]` done · `[~]` partial · `[ ]` not started

---

## Step 1 — Database Schema & RLS

- [x] **1.1 Core tables**: `profiles`, `organizations`, `organization_members`, `member_facility_access`, `facilities`, `client_accounts`, `client_facilities`, `invitations`, `invitation_redemptions`, `invite_attempts`, plus role and invitation-status enums.
  - [x] Facility columns for geo: `latitude`, `longitude`, `zip_code`, `county`, `operating_hours`, `carrier_cutoffs`, `geocode_status`, `geocoded_at`.
  - [x] Composite indexes: `(organization_id, user_id)`, `(organization_id, facility_id)`, `member_facility_access`, `client_facilities`, `invitations`.
  - [x] Invitations schema: `code_hash`, `code_hint`, `domain_restriction`, `requires_approval`, `all_facilities`, `facility_ids`, `revoked_at`, and `invitation_redemptions` usage log.
  - [x] Floor Worker credential table (`floor_worker_credentials` with `badge_token`, `pin_hash`, `failed_attempts`, `locked_until`, `floor_devices`).
- [x] **1.2 Profile sync trigger**: `handle_new_user` on `auth.users`, with decoupled foreign key to support floor workers without email accounts.
- [x] **1.3 Helper functions**
  - [x] `get_user_role(org_id)` and `user_has_facility(fac_id)` (security definer).
  - [x] `get_user_permissions(org_id)` (role + facility list for middleware/API).
- [x] **1.4 RLS policies**
  - [x] RLS enabled on all tenancy and access tables.
  - [x] Org-scoped SELECT, plus insert/update/delete on facilities, client_accounts, client_facilities, member_facility_access, and invitations.
  - [x] Co-member `profiles` read policy (`shares_org_with`) allowing member directory lookups.
  - [x] Two-level admin rules enforced via security definer RPCs (`can_manage_member`, `set_member_active_status`, `remove_member`, `set_admin_privilege`).
  - [x] Field-tampering protection: immutable `organization_id` trigger on facilities/clients, role/status modifications restricted to RPCs.
  - [~] Automated RLS test suite: `supabase/tests/rls_security_suite.sql` exists but does not run (wrong function signatures, multi-row RETURNING INTO). See task-sprint-02.md "Found During Step 1".

## Step 2 — Auth & Middleware

- [x] **2.1 Supabase SSR**: `utils/supabase/{client,server,middleware,admin}.ts` and `proxy.ts`.
- [x] **2.2 Auth screens**
  - [x] Login and register pages with email + password, plus Google, GitHub, and Microsoft OAuth.
  - [x] "Enter Invite Code" button on login linking to `/join`.
  - [x] "Floor Terminal" button on login linking to `/floor-login`.
  - [x] `/forgot-password` request page and `/reset-password` submission page.
  - [x] `/join` invite code entry page and `/invite?token=` landing page.
- [x] **2.3 Social providers & account linking**: Google, GitHub, and Azure/Microsoft actions with Supabase OAuth provider configs.
- [x] **2.4 Route protection**
  - [x] Unauthenticated users redirected to `/login` with public route exceptions (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/floor-login`, `/join`, `/invite`).
  - [x] Membership gate in `middleware.ts`: authenticated users with no membership routed to `/onboarding`, inactive/revoked/pending routed to `/revoked`.
  - [x] Revoked/pending-approval access screen (`/revoked`) with self-sign-out and status messaging.
- [x] **2.5 Floor Worker badge + PIN login** (`/floor-login` terminal screen with hardware barcode scanner listener, on-screen touch keypad, 5-attempt rate-limit lockout, and 12-hour scoped session cookie `vp_floor_session`).

## Step 3 — Org, Facility & Client Setup

- [x] **3.1 Create organization**
  - [x] `/onboarding` page and `createOrganization` action using single-transaction `create_organization` RPC.
  - [x] Onboarding gate lists pending email invitations with instant-join buttons.
  - [x] Collects organization country, timezone, and default currency.
  - [x] "Join with invite code" shortcut link on onboarding.
- [x] **3.2 Facility management UI**
  - [x] List, create, update, and delete facilities.
  - [x] Structured address (street, city, state, ZIP, county, country).
  - [x] OpenStreetMap address geocoding with interactive map pin preview/confirmation, coordinate manual overrides, and unverified warning flag.
  - [x] Weekly operating hours editor with open/close time validations and closed-day toggles.
  - [x] Dynamic carrier cutoff times list.
- [x] **3.3 Client account management UI**
  - [x] List, create, update, and delete client accounts.
  - [x] Suspend / reactivate client action in dropdown menu.
  - [x] Assign serving facilities (`client_facilities`) and configure default facility.
- [x] **3.4 Org & facility switcher** (`WorkspaceSwitcher` in sidebar persisting `vp_active_org_id` and `vp_active_facility_id` in cookies with instant workspace/scope switching).

## Step 4 — Members, Invitations & Two-Level Admin Rules

- [x] **4.1 Link invitations**
  - [x] `/invite?token=` landing page with pre-auth validation via service role.
  - [x] Handles both authenticated instant-join and unauthenticated register/login redirects.
  - [x] Facility scope selection (all facilities vs specific facilities) stored on invite.
- [x] **4.2 Email & code invitations**
  - [x] Pre-configured invitation actions with domain locking and admin approval requirement.
- [x] **4.3 Workspace invite codes**
  - [x] Code generation with unambiguous alphabet (`XXXX-XXXX`) and SHA-256 hashed storage.
  - [x] Modal presents the plaintext code once upon creation; active code list shows masked `••••-HINT`.
  - [x] Configurable options: expiry days, max uses (or unlimited), email domain restriction (`@domain.com`), and admin approval requirement.
  - [x] Multi-tier redemption RPC (`redeem_invitation`) supporting both new & existing users with duplicate membership handling.
  - [x] Brute-force rate limiting (5 attempts/min cooldown) and `invitation_redemptions` audit log.
- [x] **4.4 Revoke / reactivate / remove**
  - [x] RPC-backed server actions `toggleMemberStatus`, `removeMember`, `setAdminPrivilege`, and `revokeInvite`.
  - [x] Owner vs. Admin two-level permission matrix (`can_manage_all_members` grant).
  - [x] `/revoked` screen with pending approval vs revoked states.
- [x] **4.5 Floor Worker creation & Badges**
  - [x] Ops Manager / Admin / Owner modal to create email-less Floor Worker accounts with 4-6 digit PIN.
  - [x] Printable physical ID badge cards (`BadgeModal`) with live client-side QR generation (`qrcode`) and Code 128 / worker code representation.
  - [x] One-click Badge Token reissue and PIN reset RPCs.
- [x] **4.6 Members panel UI**
  - [x] Members table with User, Role, Facilities, Invited By, Status badges, and Pagination.
  - [x] Action dropdowns enabled/disabled per the caller's two-level rights.
  - [x] Owner controls to toggle Admin `can_manage_all_members` privilege.

## Cross-cutting / UI & Settings

- [x] Reusable `Modal`, `SearchableSelect`, `ActionDropdown`, `TablePagination`.
- [x] Sidebar: collapsed by default, hover-to-expand, pin toggle, dark/light theme.
- [x] Role-aware navigation (configuration menus hidden from Floor Worker and restricted roles).
- [x] `/dashboard/settings` page for viewing and editing organization profile, country, timezone, and currency.
- [x] `/dashboard` overview dashboard with real-time KPI metrics (Facilities, Clients, Members, Floor Badges), operational status, and fast actions.
- [x] Clean TypeScript build (`npx tsc --noEmit` exits 0 with zero errors).

---

## Sprint 1 Sign-Off Status: COMPLETE (100%)
All Phase 1 Sprint 1 features, database migrations, RPCs, and UI flows are implemented and verified.