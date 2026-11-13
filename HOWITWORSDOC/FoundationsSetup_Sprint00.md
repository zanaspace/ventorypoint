# VentoryPoint Warehouse Operating System
## Module Documentation: Foundations Setup (Repo, CI/CD, Environments, Design Library, Specs)

**Module**: Sprint 00 — Foundations & Setup  
**Primary Paths**: `apps/web`, `packages/*`, `supabase/migrations`  
**Parent PRD**: Phase 1 — Sprint 00 — Foundations Setup  
**Status**: Implemented (Monorepo, Design Tokens, Supabase CLI & Auth Pipeline Active)

---

### 1. Executive Summary

Sprint 00 establishes the engineering, security, design-system, and database foundations required before any multi-tenant warehouse workflow is built. It ensures every subsequent sprint starts on top of a reproducible monorepo, strict TypeScript/RLS gates, and the Rillet-inspired VentoryPoint brand token system.

Key deliverables:
1. **pnpm + Turborepo Monorepo**: Workspace architecture separating `apps/web` (Next.js App Router), `supabase/migrations`, and shared packages.
2. **Design System & Brand Tokens**: High-contrast dark/light industrial palette, tabular monospace typography for SKUs/LPNs/barcodes, and responsive touch-friendly primitives.
3. **Database & RLS Test Harness**: Versioned PostgreSQL migrations and automated SQL security test suites (`supabase/tests/`).
4. **Security & Environment Separation**: Strict server-only isolation of `SUPABASE_SERVICE_ROLE_KEY`, Stripe secrets, and webhook signing keys.

---

### 2. Architecture & Directory Structure

```
ventorypoint/
├── apps/
│   └── web/                    # Next.js 16 App Router (Office Dashboard, Floor Terminal, Internal Console)
├── packages/                   # Shared domain, UI, and contract libraries
├── supabase/
│   ├── config.toml             # Local Supabase stack & Realtime configuration
│   ├── migrations/             # Ordered, immutable SQL schema & RPC migrations
│   └── tests/                  # Automated RLS, event store, location, catalog, and ledger test suites
├── PRD/                        # Master & per-sprint Product Requirements Documents
└── HOWITWORSDOC/               # Technical & operational module documentation
```

---

### 3. Security & Quality Gates

| Gate | Enforcement Mechanism | Purpose |
| :--- | :--- | :--- |
| **Row Level Security (RLS)** | Enabled on 100% of `public.*` tables | Guarantees zero cross-tenant data leakage at the PostgreSQL layer |
| **Service Role Isolation** | Server-only `src/utils/supabase/admin.ts` | Prevents `SUPABASE_SERVICE_ROLE_KEY` from ever entering client bundles |
| **Append-Only Ledgers** | PostgreSQL `BEFORE UPDATE OR DELETE` triggers | Protects `warehouse_events`, `audit_log`, and `inventory_transactions` |
| **Type Safety** | Next.js + TypeScript strict build verification | Catches contract mismatches across Server Actions and UI components |
