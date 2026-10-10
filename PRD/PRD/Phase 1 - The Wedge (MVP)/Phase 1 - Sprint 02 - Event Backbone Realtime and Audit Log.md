Product Requirements Document (PRD)

Phase 1 — The Wedge (MVP) · Sprint 2 of 19

Sprint 2: Event Backbone, Realtime & Audit Log

Item

Detail

Parent document

PRD — Modern 3PL Warehouse Operating System (v1.1), Section 6.2 (Phase 1 — The Wedge / MVP)

Module

Sprints 1–2 — Foundation

Duration

2 weeks (10 working days)

Must be complete before starting

Phase 1 · Sprint 1: Auth, Tenant Hierarchy & Roles

Unlocks next

Phase 1 · Sprint 02A: Internal Admin Console, Platform Billing, Notifications & Analytics

Version / Date / Status

1.0 (Draft) · September 26, 2026 · Draft for review



1. Objective & Scope

The objective of Sprint 2 is to build the warehouse event backbone, the single stream every later module writes to and reads from. When a scan happens on the floor in later sprints, it becomes one immutable event here. The inventory projection, billing capture, channel sync and live dashboards all consume that same event.

This sprint is deliberately headless: no warehouse features, only the event store, its write API, realtime delivery to browsers, a durable consumer queue, the device registry and the configuration audit log. It is validated with synthetic events before any real workflow depends on it.

By the end of this sprint:

Any server or client code path can record a typed, attributable, idempotent event.

Subscribed browsers receive facility-scoped events in real time.

Back-end consumers process every event exactly once, with retries and a dead-letter view.

Every configuration change is captured in an audit log with before/after values.

Out of scope for this sprint: business consumers (inventory projection in Sprint 5, billing capture in Sprint 14, channel sync in Sprint 12), and event-driven UI beyond a developer test console.

Dependency: Sprint 1 must be signed off before this sprint starts. Sprint 1 (tenancy tables and RLS helpers) must be complete. Every event carries organization/facility/client scope and is protected by the Sprint 1 policies.

2. User Stories

As an engineer, I need one canonical, append-only record of every warehouse action so that inventory, billing and client visibility can never disagree.

As a Supervisor, I want screens to update the instant something happens on the floor so that I never make decisions on stale information.

As a 3PL Owner, I want every charge and inventory change to be traceable to a person, a device and a timestamp so that I can defend my invoices.

As an Admin, I want to see who changed a facility, client or member setting and what it was before so that configuration mistakes can be traced and reversed.

3. Functional Requirements

3.1 Event Store

warehouse_events table with the columns defined in the Sprints 1–2 data model, partitioned by month.

event_type_registry with the event type, version, JSON schema for the payload, and the list of consumers.

Initial registry seeded with the Phase 1 (MVP) event catalogue (e.g. receipt.line_received, putaway.completed, inventory.moved, inventory.adjusted, pick.confirmed, pack.carton_closed, shipment.shipped, count.submitted), even though producers arrive in later sprints.

Immutability: UPDATE/DELETE revoked for all roles, plus a trigger that raises on any attempt.

3.2 Write API

record_event(...) RPC validates the membership/facility scope, event type and payload schema, and inserts with an idempotency_key unique constraint. A duplicate key returns the original event ID instead of an error.

Batch variant record_events([...]) for queued scans (up to 100 per call), atomic per event.

occurred_at accepted from the client (bounded: not in the future, not older than 72h without a supervisor override); received_at set by the server.

3.3 Realtime Fan-Out

Supabase Realtime broadcast on channel facility:{facility_id}, with authorization via RLS and a membership check.

Client SDK hook useFacilityEvents(filter) for later UI modules.

3.4 Consumer Queue

On insert, one delivery row per registered consumer is enqueued (Postgres queue / pgmq).

Worker runtime (Edge Function cron or a small Node worker) with at-least-once delivery, consumer-side idempotency, exponential backoff and max attempts → dead letter.

Admin Event Deliveries view: per-consumer lag, failures and a replay button.

3.5 Devices & Stations

Browser device registration: a persistent device UUID in local storage + a server devices row (name, type, facility, last_seen). A terminal registers itself on the first badge + PIN sign-in and can record scans immediately (trust on first use, Decision 1.2.4); its facility is assigned automatically when the worker has one facility, otherwise the terminal asks once. Organizations can require supervisor approval for new terminals instead. Supervisors can rename, re-assign, block and retire devices.

Every floor event records device_id. Floor event types are rejected from unregistered, blocked, retired or (when approval is required) unapproved devices.

3.6 Configuration Audit Log

Generic trigger audit_row_change() attached to all configuration tables, capturing table, row, action, before/after JSON, actor and timestamp.

Audit viewer for Admins, filterable by table, user and date.

4. Acceptance Criteria

Recording 10,000 synthetic events with 5% duplicate idempotency keys stores exactly 9,500 unique events.

A browser subscribed to Facility 1 receives an event within 500ms (p95). A browser in another organization receives nothing.

With a consumer stopped for 10 minutes and then restarted, all queued events are processed with no loss and no double-processing.

Any UPDATE/DELETE attempt on warehouse_events fails, including through the service role.

Editing a facility's cutoff time creates an audit entry showing the old and new values and the editor.

5. Non-Functional & Security Requirements

Requirement

Detail

Performance

record_event p95 <50ms. Batch of 100 <300ms. Realtime p95 <500ms.

Throughput

200 events/second sustained per facility in a load test with no consumer lag above 5 seconds.

Data isolation

Event reads go through RLS by organization + facility. Realtime channel authorization mirrors RLS.

Integrity

Append-only enforced by privileges and triggers. Monthly partitions are created ahead of time by a scheduled job.

Observability

Metrics for event throughput, consumer lag and dead-letter count, exported to monitoring with alerts.

6. Implementation Task Breakdown: Sprint 2

The work runs in the steps below, in order, from the data layer up to the web UI.

[Step 1: Event Schema] ──> [Step 2: Write API] ──> [Step 3: Realtime & Queue] ──> [Step 4: Audit & Validation]



Step 1: Event Store Schema & Immutability

Goal: Provision the partitioned, append-only event store and the type registry.

Task 1.1: Events Table Migration

Create partitioned warehouse_events with indexes on (facility_id, occurred_at), (entity_type, entity_id) and the unique idempotency_key.

Task 1.2: Type Registry & Seed Catalogue

Create event_type_registry. Seed the Phase 1 (MVP) event types with JSON schemas.

Task 1.3: Immutability & RLS

Revoke UPDATE/DELETE, add a guard trigger, and add org/facility-scoped SELECT policies.

Step 2: Event Write API

Goal: Give every producer one safe, validated way to record events.

Task 2.1: record_event RPC

Scope, type and schema validation, idempotent insert, returns the event ID.

Task 2.2: Batch Ingestion

record_events for the Sprint 6 reconnect queue, with per-event results.

Task 2.3: Device Registration

devices table, registration endpoint, device UUID hook on the client.

Step 3: Realtime Fan-Out & Durable Consumer Queue

Goal: Deliver events instantly to screens and reliably to back-end consumers.

Task 3.1: Realtime Broadcast

Insert trigger → broadcast on facility:{id}. Channel authorization policy. useFacilityEvents hook.

Task 3.2: Consumer Queue & Worker

Enqueue per consumer, worker with retries/backoff/dead letter, consumer idempotency table.

Task 3.3: Event Deliveries Admin View

Lag, failure list and replay action.

Step 4: Audit Log, Load Test & Sign-Off

Goal: Capture configuration history and prove the backbone at scale.

Task 4.1: Audit Trigger & Viewer

Generic trigger on Sprint 1 configuration tables. Admin audit viewer.

Task 4.2: Load & Chaos Tests

200 events/second load test. Consumer outage/restart test. Duplicate-key test.

Task 4.3: Developer Event Console

Internal page to emit synthetic events and watch fan-out, used by later sprints for testing.

7. Sprint Delivery Milestones

Milestone 1 — Event Store Live (Target: Day 3)

Partitioned, immutable event table and registry deployed. RLS verified.

Milestone 2 — Write API & Devices (Target: Day 5)

record_event/batch ingestion work idempotently. Devices register and are recorded on events.

Milestone 3 — Realtime & Queue (Target: Day 8)

Browser fan-out <500ms. Consumers process with retries and dead letter.

Milestone 4 — Audit, Load Test & Sign-Off (Target: Day 10)

Audit log live. 200 events/second load test and outage test pass.

8. Open Questions Carried Into This Sprint

Worker runtime: Supabase Edge Function cron vs. a long-running Node worker (e.g. on Fly/Render) for consumer throughput. Recommend a spike on Day 1.

Maximum allowed back-dating for occurred_at on queued scans (proposed 72h with supervisor override).

Should event payloads store denormalised display data (SKU code, location code) for audit readability, or IDs only?

9. Definition of Done (Gate to the Next Sprint)

All acceptance criteria in Section 4 pass and are demonstrated.

Row Level Security tests exist and pass for every new table.

Non-functional targets in Section 5 are measured and met.

Open questions in Section 8 are answered or explicitly deferred by the product owner.

Sign-off recorded, so Phase 1 · Sprint 02A can start.



End of Phase 1 · Sprint 2 PRD.

Phase 1 — The Wedge (MVP)  |  Sprint 2 of 19  |  Page