-- ====================================================================
-- Phase 1 · Sprint 2 · Step 1 — Event Store Schema & Immutability
-- ====================================================================
-- The warehouse event is the spine (Doc 01, AP-1): every physical action is
-- written once to warehouse_events. Inventory, billing, channel sync and
-- dashboards consume these rows; nothing ever updates or deletes them.
--
-- This migration delivers:
--   1.1 warehouse_events, partitioned by month on occurred_at
--   1.2 event_type_registry + the Phase 1 (MVP) event catalogue
--   1.3 immutability (privileges + guard triggers) and org/facility RLS
--   1.4 partition maintenance (ensure_warehouse_event_partitions + pg_cron job)
--
-- Writes go exclusively through record_event / record_events (Step 2).
-- ====================================================================

create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------------
-- 1.2 Event type registry
-- --------------------------------------------------------------------
create table if not exists public.event_type_registry (
  event_type      text    not null,
  version         integer not null default 1,
  description     text    not null,
  entity_type     text    not null,                 -- what entity_id refers to (e.g. 'lpn', 'order')
  payload_schema  jsonb   not null default '{"type":"object"}'::jsonb,
  consumers       text[]  not null default '{}',    -- consumer names that receive a delivery (Step 3)
  is_floor_event  boolean not null default false,   -- floor events require a known device (Step 2)
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  primary key (event_type, version),
  constraint event_type_format check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint event_version_positive check (version > 0)
);

comment on table public.event_type_registry is
  'Catalogue of warehouse event types: payload JSON schema, consumers, and floor/device requirements. Read-only for tenants.';

alter table public.event_type_registry enable row level security;

-- The catalogue holds no tenant data: any signed-in user may read it. Only migrations / service role write it.
drop policy if exists "Authenticated users can read the event catalogue" on public.event_type_registry;
create policy "Authenticated users can read the event catalogue" on public.event_type_registry
  for select to authenticated using (true);

revoke insert, update, delete, truncate on public.event_type_registry from public, anon, authenticated;

-- --------------------------------------------------------------------
-- 1.1 Event store (partitioned by month)
-- --------------------------------------------------------------------
create sequence if not exists public.warehouse_events_sequence as bigint;

create table if not exists public.warehouse_events (
  id                 uuid        not null default gen_random_uuid(),
  sequence           bigint      not null default nextval('public.warehouse_events_sequence'),
  organization_id    uuid        not null references public.organizations(id),
  facility_id        uuid                 references public.facilities(id),
  client_account_id  uuid                 references public.client_accounts(id),
  event_type         text        not null,
  event_version      integer     not null default 1,
  entity_type        text        not null,
  entity_id          uuid,
  payload            jsonb       not null default '{}'::jsonb,
  actor_user_id      uuid,                       -- auth user (profiles.id) when a person acted
  actor_worker_id    uuid,                       -- floor_worker_credentials.id for badge/PIN sessions
  device_id          uuid                 references public.floor_devices(id),
  source             text        not null default 'web',
  correlation_id     uuid,                       -- groups events from one business action
  causation_id       uuid,                       -- the event that caused this one
  idempotency_key    text        not null,
  occurred_at        timestamptz not null,       -- when it happened (client-supplied, bounded in record_event)
  received_at        timestamptz not null default now(),
  primary key (id, occurred_at),
  foreign key (event_type, event_version) references public.event_type_registry(event_type, version),
  constraint warehouse_events_source_check
    check (source in ('web', 'floor', 'api', 'integration', 'system', 'migration')),
  constraint warehouse_events_idempotency_key_length
    check (char_length(idempotency_key) between 8 and 200),
  constraint warehouse_events_payload_is_object
    check (jsonb_typeof(payload) = 'object')
) partition by range (occurred_at);

comment on table public.warehouse_events is
  'Append-only warehouse event store (Sprint 2). Partitioned monthly on occurred_at. Never updated or deleted; written only via record_event(s).';
comment on column public.warehouse_events.sequence is
  'Global insert order. Per-entity ordering is (occurred_at, sequence).';

-- Indexes (created on the parent so every partition inherits them)
create index if not exists idx_warehouse_events_facility_time
  on public.warehouse_events (facility_id, occurred_at);
create index if not exists idx_warehouse_events_entity
  on public.warehouse_events (entity_type, entity_id, occurred_at, sequence);
create index if not exists idx_warehouse_events_org_time
  on public.warehouse_events (organization_id, occurred_at);
create index if not exists idx_warehouse_events_type_time
  on public.warehouse_events (event_type, occurred_at);
create index if not exists idx_warehouse_events_correlation
  on public.warehouse_events (correlation_id) where correlation_id is not null;

-- --------------------------------------------------------------------
-- Idempotency keys
-- A unique index on a partitioned table must include the partition key, which
-- would let the same key be reused with a different occurred_at. This small
-- non-partitioned table makes the key truly unique per organization and maps
-- it back to the original event (record_event returns that ID on duplicates).
-- Keys are scoped per organization so one tenant can never learn another
-- tenant's event IDs by guessing keys.
-- --------------------------------------------------------------------
create table if not exists public.event_idempotency_keys (
  organization_id  uuid        not null references public.organizations(id),
  idempotency_key  text        not null,
  event_id         uuid        not null,
  occurred_at      timestamptz not null,
  created_at       timestamptz not null default now(),
  primary key (organization_id, idempotency_key),
  unique (event_id),
  foreign key (event_id, occurred_at) references public.warehouse_events(id, occurred_at)
);

comment on table public.event_idempotency_keys is
  'One row per recorded event: guarantees idempotency_key uniqueness per organization across all partitions.';

alter table public.event_idempotency_keys enable row level security;
-- No policies: only security definer functions (record_event) touch this table.

-- --------------------------------------------------------------------
-- 1.3 Immutability
-- Privileges stop normal roles; the guard triggers stop everyone else,
-- including service_role and the table owner. Retention/archive works at the
-- partition level (DETACH/DROP PARTITION), never by row DELETE.
-- --------------------------------------------------------------------
create or replace function public.prevent_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'warehouse events are append-only: % on % is not allowed', tg_op, tg_table_name
    using errcode = '42501',
          hint = 'Record a new compensating event instead of changing history.';
end;
$$;

drop trigger if exists trg_warehouse_events_immutable on public.warehouse_events;
create trigger trg_warehouse_events_immutable
  before update or delete on public.warehouse_events
  for each row execute function public.prevent_event_mutation();

drop trigger if exists trg_warehouse_events_no_truncate on public.warehouse_events;
create trigger trg_warehouse_events_no_truncate
  before truncate on public.warehouse_events
  for each statement execute function public.prevent_event_mutation();

drop trigger if exists trg_event_idempotency_keys_immutable on public.event_idempotency_keys;
create trigger trg_event_idempotency_keys_immutable
  before update or delete on public.event_idempotency_keys
  for each row execute function public.prevent_event_mutation();

drop trigger if exists trg_event_idempotency_keys_no_truncate on public.event_idempotency_keys;
create trigger trg_event_idempotency_keys_no_truncate
  before truncate on public.event_idempotency_keys
  for each statement execute function public.prevent_event_mutation();

-- Tenants can only read events; inserts go through record_event (security definer).
revoke all on public.warehouse_events from public, anon, authenticated, service_role;
grant select on public.warehouse_events to authenticated, service_role;
grant insert on public.warehouse_events to service_role;

revoke all on public.event_idempotency_keys from public, anon, authenticated, service_role;
grant select, insert on public.event_idempotency_keys to service_role;

revoke all on sequence public.warehouse_events_sequence from public, anon, authenticated;

-- --------------------------------------------------------------------
-- 1.3 Row Level Security
-- Read: active member of the organization, with access to the event's
-- facility (org-level events with no facility are visible to all members).
-- client_user is excluded until per-client scoping lands (Sprint 11A).
-- --------------------------------------------------------------------
alter table public.warehouse_events enable row level security;

drop policy if exists "Members read events for their facilities" on public.warehouse_events;
create policy "Members read events for their facilities" on public.warehouse_events
  for select to authenticated
  using (
    get_user_role(organization_id) is not null
    and get_user_role(organization_id) <> 'client_user'
    and (facility_id is null or user_has_facility(facility_id))
  );

-- --------------------------------------------------------------------
-- 1.4 Partition maintenance
-- --------------------------------------------------------------------
create or replace function public.ensure_warehouse_event_partition(p_month date)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('warehouse_events_y%sm%s', to_char(v_start, 'YYYY'), to_char(v_start, 'MM'));
begin
  if to_regclass(format('public.%I', v_name)) is null then
    execute format(
      'create table public.%I partition of public.warehouse_events for values from (%L) to (%L)',
      v_name, v_start, v_end
    );
    -- Direct access to a partition must follow the same rules as the parent.
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', v_name);
    execute format('alter table public.%I enable row level security', v_name);
    -- TRUNCATE triggers are not inherited from the parent, so add the guard per partition.
    execute format(
      'create trigger trg_no_truncate before truncate on public.%I for each statement execute function public.prevent_event_mutation()',
      v_name
    );
  end if;
  return v_name;
end;
$$;

comment on function public.ensure_warehouse_event_partition(date) is
  'Creates the monthly warehouse_events partition containing p_month if it does not exist. Idempotent.';

create or replace function public.ensure_warehouse_event_partitions(
  p_months_back  integer default 1,
  p_months_ahead integer default 3
)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset integer;
begin
  for v_offset in -p_months_back .. p_months_ahead loop
    return next public.ensure_warehouse_event_partition(
      (date_trunc('month', now()) + make_interval(months => v_offset))::date
    );
  end loop;
end;
$$;

comment on function public.ensure_warehouse_event_partitions(integer, integer) is
  'Pre-creates monthly partitions around the current month. Run daily by pg_cron.';

revoke all on function public.ensure_warehouse_event_partition(date) from public, anon, authenticated;
revoke all on function public.ensure_warehouse_event_partitions(integer, integer) from public, anon, authenticated;
grant execute on function public.ensure_warehouse_event_partition(date) to service_role;
grant execute on function public.ensure_warehouse_event_partitions(integer, integer) to service_role;

-- Initial partitions: previous month through three months ahead
select public.ensure_warehouse_event_partitions(1, 3);

-- Daily job keeps three months of partitions ahead (idempotent).
-- pg_cron is available on Supabase; skip quietly where it isn't (e.g. some local test setups).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'ensure-warehouse-event-partitions';
  perform cron.schedule(
    'ensure-warehouse-event-partitions',
    '15 3 * * *',
    'select public.ensure_warehouse_event_partitions(1, 3)'
  );
exception when others then
  raise notice 'pg_cron not available (%); schedule ensure_warehouse_event_partitions manually.', sqlerrm;
end;
$$;

-- --------------------------------------------------------------------
-- 1.2 Phase 1 (MVP) event catalogue
-- Producers arrive in later sprints; schemas list the required fields now so
-- record_event can validate from day one. Additional fields are allowed.
-- --------------------------------------------------------------------
insert into public.event_type_registry
  (event_type, version, description, entity_type, is_floor_event, consumers, payload_schema)
values
  ('receipt.line_received', 1, 'Units received against an ASN/receipt line at the dock.', 'receipt_line', true,
    array['inventory_projection', 'billing_capture'],
    '{"type":"object","required":["receipt_id","sku_id","quantity","location_id"],"properties":{"receipt_id":{"type":"string"},"sku_id":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"location_id":{"type":"string"},"lpn_id":{"type":"string"},"lot_number":{"type":"string"},"expiry_date":{"type":"string"}}}'),
  ('putaway.completed', 1, 'Received stock moved from staging into a storage location.', 'lpn', true,
    array['inventory_projection'],
    '{"type":"object","required":["sku_id","quantity","from_location_id","to_location_id"],"properties":{"sku_id":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"from_location_id":{"type":"string"},"to_location_id":{"type":"string"},"lpn_id":{"type":"string"}}}'),
  ('inventory.moved', 1, 'Stock moved between two locations.', 'inventory', true,
    array['inventory_projection'],
    '{"type":"object","required":["sku_id","quantity","from_location_id","to_location_id"],"properties":{"sku_id":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"from_location_id":{"type":"string"},"to_location_id":{"type":"string"},"lpn_id":{"type":"string"},"reason":{"type":"string"}}}'),
  ('inventory.adjusted', 1, 'On-hand quantity adjusted with a reason code.', 'inventory', false,
    array['inventory_projection', 'billing_capture'],
    '{"type":"object","required":["sku_id","location_id","quantity_delta","reason_code"],"properties":{"sku_id":{"type":"string"},"location_id":{"type":"string"},"quantity_delta":{"type":"number"},"reason_code":{"type":"string"},"note":{"type":"string"}}}'),
  ('pick.confirmed', 1, 'Units picked for an order line.', 'pick_task', true,
    array['inventory_projection', 'billing_capture'],
    '{"type":"object","required":["order_id","sku_id","quantity","location_id"],"properties":{"order_id":{"type":"string"},"wave_id":{"type":"string"},"sku_id":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"location_id":{"type":"string"},"lpn_id":{"type":"string"}}}'),
  ('pack.carton_closed', 1, 'A shipping carton was packed and closed.', 'carton', true,
    array['billing_capture'],
    '{"type":"object","required":["order_id","carton_id"],"properties":{"order_id":{"type":"string"},"carton_id":{"type":"string"},"weight_lb":{"type":"number"},"dimensions_in":{"type":"object"}}}'),
  ('shipment.shipped', 1, 'A shipment left the building with a carrier.', 'shipment', false,
    array['inventory_projection', 'billing_capture', 'channel_sync', 'usage_metering'],
    '{"type":"object","required":["order_id","carrier","tracking_number"],"properties":{"order_id":{"type":"string"},"carrier":{"type":"string"},"service":{"type":"string"},"tracking_number":{"type":"string"}}}'),
  ('count.submitted', 1, 'A cycle count was submitted for a location.', 'count_task', true,
    array['inventory_projection'],
    '{"type":"object","required":["location_id","lines"],"properties":{"location_id":{"type":"string"},"count_id":{"type":"string"},"lines":{"type":"array","items":{"type":"object","required":["sku_id","counted_quantity"]}}}}'),
  ('order.created', 1, 'An order was created or imported.', 'order', false,
    array['channel_sync'],
    '{"type":"object","required":["order_number"],"properties":{"order_number":{"type":"string"},"channel":{"type":"string"},"external_id":{"type":"string"}}}'),
  ('order.hold_placed', 1, 'An order was put on hold.', 'order', false,
    array['notifications'],
    '{"type":"object","required":["reason_code"],"properties":{"reason_code":{"type":"string"},"note":{"type":"string"}}}'),
  ('order.hold_released', 1, 'An order hold was released.', 'order', false,
    array[]::text[],
    '{"type":"object","required":["reason_code"],"properties":{"reason_code":{"type":"string"},"note":{"type":"string"}}}'),
  ('system.synthetic', 1, 'Synthetic test event for the developer console and load tests. No business effect.', 'synthetic', false,
    array['test_consumer'],
    '{"type":"object","properties":{"label":{"type":"string"},"sequence":{"type":"integer"}}}')
on conflict (event_type, version) do update
  set description    = excluded.description,
      entity_type    = excluded.entity_type,
      is_floor_event = excluded.is_floor_event,
      consumers      = excluded.consumers,
      payload_schema = excluded.payload_schema;

notify pgrst, 'reload schema';
