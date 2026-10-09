-- ====================================================================
-- Phase 1 · Sprint 2 · Step 3 — Realtime Fan-Out & Durable Consumer Queue
-- ====================================================================
-- On every warehouse_events insert (same transaction):
--   1. Broadcast to Supabase Realtime on `facility:{facility_id}` (or
--      `org:{organization_id}` for organization-level events). Subscriptions
--      are private and authorized by a policy on realtime.messages that
--      mirrors the warehouse_events read rules.
--   2. Enqueue one event_deliveries row per consumer registered for the type.
--
-- Workers (service_role) claim deliveries with SKIP LOCKED and a lease,
-- then complete or fail them. Failures retry with exponential backoff and
-- become 'dead' after max_attempts; admins can replay dead deliveries.
-- Consumers record (consumer, event_id) in consumer_processed_events in the
-- same transaction as their side effect, giving exactly-once effects on top
-- of at-least-once delivery.
-- ====================================================================

-- --------------------------------------------------------------------
-- Consumers
-- --------------------------------------------------------------------
create table if not exists public.event_consumers (
  name          text primary key,
  description   text not null,
  is_enabled    boolean not null default false,  -- disabled consumers still receive deliveries (backlog), but are not processed
  max_attempts  integer not null default 8,
  lag_alert_seconds integer not null default 5,
  created_at    timestamptz not null default now(),
  constraint event_consumers_name_format check (name ~ '^[a-z][a-z0-9_]*$'),
  constraint event_consumers_max_attempts check (max_attempts between 1 and 50)
);

comment on table public.event_consumers is
  'Back-end consumers of warehouse events. Deliveries are queued for every registered consumer; workers only process enabled ones.';

alter table public.event_consumers enable row level security;
drop policy if exists "Authenticated users can read consumers" on public.event_consumers;
create policy "Authenticated users can read consumers" on public.event_consumers
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.event_consumers from public, anon, authenticated;

insert into public.event_consumers (name, description, is_enabled, lag_alert_seconds) values
  ('test_consumer',        'No-op consumer that proves the pipeline (developer console, load tests).', true, 5),
  ('inventory_projection', 'Updates on-hand inventory projections (Sprint 5).',                       false, 5),
  ('billing_capture',      'Captures billable activity (Sprint 14).',                                 false, 60),
  ('channel_sync',         'Pushes inventory and shipments to sales channels (Sprint 12).',            false, 60),
  ('usage_metering',       'Counts shipped orders for subscription tiers (Sprint 02A).',               false, 300),
  ('notifications',        'Raises in-app and email notifications (Sprint 02A).',                      false, 60)
on conflict (name) do update set description = excluded.description;

-- --------------------------------------------------------------------
-- Deliveries
-- --------------------------------------------------------------------
create table if not exists public.event_deliveries (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null,
  event_occurred_at timestamptz not null,
  organization_id   uuid not null references public.organizations(id),
  consumer          text not null references public.event_consumers(name),
  status            text not null default 'pending',
  attempts          integer not null default 0,
  next_attempt_at   timestamptz not null default now(),
  locked_until      timestamptz,
  locked_by         text,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  completed_at      timestamptz,
  unique (event_id, consumer),
  foreign key (event_id, event_occurred_at) references public.warehouse_events(id, occurred_at),
  constraint event_deliveries_status_check check (status in ('pending', 'processing', 'succeeded', 'dead'))
);

comment on table public.event_deliveries is
  'One row per (event, consumer). pending -> processing -> succeeded, or back to pending with backoff, or dead after max_attempts.';

-- Claim path: due work per consumer in event order
create index if not exists idx_event_deliveries_due
  on public.event_deliveries (consumer, next_attempt_at, event_occurred_at)
  where status in ('pending', 'processing');
create index if not exists idx_event_deliveries_org_status
  on public.event_deliveries (organization_id, consumer, status);

alter table public.event_deliveries enable row level security;
drop policy if exists "Owners and admins read their deliveries" on public.event_deliveries;
create policy "Owners and admins read their deliveries" on public.event_deliveries
  for select to authenticated
  using (get_user_role(organization_id) in ('owner', 'admin'));
revoke insert, update, delete, truncate on public.event_deliveries from public, anon, authenticated;

-- Consumer-side idempotency: insert in the same transaction as the side effect
create table if not exists public.consumer_processed_events (
  consumer     text not null references public.event_consumers(name),
  event_id     uuid not null,
  processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

comment on table public.consumer_processed_events is
  'Exactly-once effects: a consumer applies an event only if it can insert (consumer, event_id) here in the same transaction.';

alter table public.consumer_processed_events enable row level security;
revoke all on public.consumer_processed_events from public, anon, authenticated;

-- --------------------------------------------------------------------
-- Realtime authorization
-- --------------------------------------------------------------------
create or replace function public.can_subscribe_event_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kind text := split_part(coalesce(p_topic, ''), ':', 1);
  v_id   uuid;
  v_org  uuid;
  v_role member_role;
begin
  if auth.uid() is null then
    return false;
  end if;
  begin
    v_id := split_part(p_topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;

  if v_kind = 'facility' then
    select organization_id into v_org from facilities where id = v_id;
  elsif v_kind = 'org' then
    v_org := v_id;
  else
    return false;
  end if;
  if v_org is null then
    return false;
  end if;

  v_role := get_user_role(v_org);
  if v_role is null or v_role = 'client_user' then
    return false;
  end if;
  return v_kind = 'org' or user_has_facility(v_id);
end;
$$;

comment on function public.can_subscribe_event_topic(text) is
  'Realtime channel authorization for facility:{id} and org:{id} topics. Mirrors warehouse_events RLS.';

revoke all on function public.can_subscribe_event_topic(text) from public, anon;
grant execute on function public.can_subscribe_event_topic(text) to authenticated;

-- Policy on Supabase's realtime.messages (skipped where Realtime isn't installed)
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "Members receive events for their facilities" on realtime.messages';
    execute $p$
      create policy "Members receive events for their facilities" on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and public.can_subscribe_event_topic((select realtime.topic()))
        )
    $p$;
  else
    raise notice 'realtime.messages not found; skipping Realtime authorization policy.';
  end if;
end;
$$;

-- --------------------------------------------------------------------
-- Insert trigger: broadcast + enqueue
-- --------------------------------------------------------------------
create or replace function public.on_warehouse_event_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_consumers text[];
  v_topic     text;
begin
  -- 1. Enqueue a delivery per registered consumer of this event type
  select consumers into v_consumers
  from event_type_registry
  where event_type = new.event_type and version = new.event_version;

  insert into event_deliveries (event_id, event_occurred_at, organization_id, consumer)
  select new.id, new.occurred_at, new.organization_id, c.name
  from event_consumers c
  where c.name = any (coalesce(v_consumers, '{}'))
  on conflict (event_id, consumer) do nothing;

  -- 2. Realtime broadcast (private channel). Never let a Realtime problem block the write.
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is not null then
    v_topic := case when new.facility_id is not null
                    then 'facility:' || new.facility_id
                    else 'org:' || new.organization_id end;
    begin
      perform realtime.send(
        jsonb_build_object(
          'id', new.id,
          'sequence', new.sequence,
          'organization_id', new.organization_id,
          'facility_id', new.facility_id,
          'client_account_id', new.client_account_id,
          'event_type', new.event_type,
          'event_version', new.event_version,
          'entity_type', new.entity_type,
          'entity_id', new.entity_id,
          'payload', new.payload,
          'actor_user_id', new.actor_user_id,
          'actor_worker_id', new.actor_worker_id,
          'device_id', new.device_id,
          'source', new.source,
          'correlation_id', new.correlation_id,
          'occurred_at', new.occurred_at,
          'received_at', new.received_at
        ),
        'warehouse_event',
        v_topic,
        true
      );
    exception when others then
      raise warning 'Realtime broadcast failed for event %: %', new.id, sqlerrm;
    end;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_warehouse_events_fan_out on public.warehouse_events;
create trigger trg_warehouse_events_fan_out
  after insert on public.warehouse_events
  for each row execute function public.on_warehouse_event_inserted();

-- --------------------------------------------------------------------
-- Worker API (service_role)
-- --------------------------------------------------------------------

-- Claims up to p_limit due deliveries for one enabled consumer. Expired leases
-- (a worker that crashed mid-batch) are reclaimed. Returns the event with each delivery.
create or replace function public.claim_event_deliveries(
  p_consumer      text,
  p_worker        text,
  p_limit         integer  default 50,
  p_lease_seconds integer  default 60
)
returns table (
  delivery_id     uuid,
  attempt         integer,
  event_id        uuid,
  organization_id uuid,
  facility_id     uuid,
  event_type      text,
  event_version   integer,
  entity_type     text,
  entity_id       uuid,
  payload         jsonb,
  occurred_at     timestamptz,
  sequence        bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from event_consumers where name = p_consumer and is_enabled) then
    return;
  end if;

  return query
  with due as (
    select d.id
    from event_deliveries d
    where d.consumer = p_consumer
      and d.next_attempt_at <= now()
      and (d.status = 'pending' or (d.status = 'processing' and d.locked_until < now()))
    order by d.event_occurred_at, d.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 500))
    for update skip locked
  ),
  claimed as (
    update event_deliveries d
    set status = 'processing',
        attempts = d.attempts + 1,
        locked_until = now() + make_interval(secs => greatest(5, coalesce(p_lease_seconds, 60))),
        locked_by = left(p_worker, 100),
        updated_at = now()
    from due
    where d.id = due.id
    returning d.id, d.attempts, d.event_id, d.event_occurred_at
  )
  select c.id, c.attempts, e.id, e.organization_id, e.facility_id, e.event_type, e.event_version,
         e.entity_type, e.entity_id, e.payload, e.occurred_at, e.sequence
  from claimed c
  join warehouse_events e on e.id = c.event_id and e.occurred_at = c.event_occurred_at
  order by e.occurred_at, e.sequence;
end;
$$;

-- Marks a claimed delivery as done. Only the worker holding the lease can complete it.
create or replace function public.complete_event_delivery(p_delivery_id uuid, p_worker text)
returns boolean
language sql
security definer
set search_path = public
as $$
  with done as (
    update event_deliveries
    set status = 'succeeded', completed_at = now(), locked_until = null, last_error = null, updated_at = now()
    where id = p_delivery_id and status = 'processing' and locked_by = left(p_worker, 100)
    returning 1
  )
  select exists (select 1 from done)
$$;

-- Records a failure: retry with exponential backoff (5s, 10s, 20s … capped at 1h)
-- plus jitter, or dead-letter after the consumer's max_attempts.
create or replace function public.fail_event_delivery(p_delivery_id uuid, p_worker text, p_error text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery event_deliveries;
  v_max      integer;
  v_status   text;
begin
  select * into v_delivery from event_deliveries
  where id = p_delivery_id and status = 'processing' and locked_by = left(p_worker, 100)
  for update;
  if v_delivery.id is null then
    return null;
  end if;

  select max_attempts into v_max from event_consumers where name = v_delivery.consumer;
  v_status := case when v_delivery.attempts >= v_max then 'dead' else 'pending' end;

  update event_deliveries
  set status = v_status,
      last_error = left(coalesce(p_error, 'unknown error'), 2000),
      locked_until = null,
      next_attempt_at = case when v_status = 'pending'
        then now() + least(interval '1 hour', interval '5 seconds' * power(2, v_delivery.attempts - 1))
                   + make_interval(secs => random() * 2)
        else next_attempt_at end,
      updated_at = now()
  where id = p_delivery_id;

  return v_status;
end;
$$;

-- Consumer-side idempotency helper: true the first time (consumer, event) is seen.
create or replace function public.mark_event_processed(p_consumer text, p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into consumer_processed_events (consumer, event_id) values (p_consumer, p_event_id);
  return true;
exception when unique_violation then
  return false;
end;
$$;

-- --------------------------------------------------------------------
-- Admin API (owners/admins of the organization)
-- --------------------------------------------------------------------
create or replace function public.replay_event_delivery(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery event_deliveries;
begin
  select * into v_delivery from event_deliveries where id = p_delivery_id;
  if v_delivery.id is null then
    perform _event_error('unknown_delivery', 'Delivery not found', '22023');
  end if;
  if coalesce(get_user_role(v_delivery.organization_id)::text, '') not in ('owner', 'admin') then
    perform _event_error('scope_denied', 'Only owners and admins can replay deliveries', '42501');
  end if;
  if v_delivery.status <> 'dead' then
    perform _event_error('not_replayable', 'Only dead deliveries can be replayed', '22023');
  end if;

  update event_deliveries
  set status = 'pending', attempts = 0, next_attempt_at = now(), locked_until = null, locked_by = null, updated_at = now()
  where id = p_delivery_id;
end;
$$;

create or replace function public.replay_dead_deliveries(p_organization_id uuid, p_consumer text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(get_user_role(p_organization_id)::text, '') not in ('owner', 'admin') then
    perform _event_error('scope_denied', 'Only owners and admins can replay deliveries', '42501');
  end if;

  update event_deliveries
  set status = 'pending', attempts = 0, next_attempt_at = now(), locked_until = null, locked_by = null, updated_at = now()
  where organization_id = p_organization_id and consumer = p_consumer and status = 'dead';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Per-consumer health for one organization (admin view)
create or replace function public.get_event_delivery_stats(p_organization_id uuid)
returns table (
  consumer         text,
  description      text,
  is_enabled       boolean,
  pending          bigint,
  processing       bigint,
  retrying         bigint,
  dead             bigint,
  succeeded_24h    bigint,
  lag_seconds      integer,
  lag_alert_seconds integer,
  last_success_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(get_user_role(p_organization_id)::text, '') not in ('owner', 'admin') then
    perform _event_error('scope_denied', 'Only owners and admins can view event deliveries', '42501');
  end if;

  return query
  select c.name, c.description, c.is_enabled,
         count(*) filter (where d.status = 'pending' and d.attempts = 0),
         count(*) filter (where d.status = 'processing'),
         count(*) filter (where d.status = 'pending' and d.attempts > 0),
         count(*) filter (where d.status = 'dead'),
         count(*) filter (where d.status = 'succeeded' and d.completed_at > now() - interval '24 hours'),
         coalesce(extract(epoch from now() - min(d.created_at) filter (where d.status in ('pending', 'processing')))::integer, 0),
         c.lag_alert_seconds,
         max(d.completed_at)
  from event_consumers c
  left join event_deliveries d on d.consumer = c.name and d.organization_id = p_organization_id
  group by c.name, c.description, c.is_enabled, c.lag_alert_seconds
  order by c.is_enabled desc, c.name;
end;
$$;

-- Platform-wide health for monitoring/alerts (service_role)
create or replace function public.event_pipeline_health()
returns table (consumer text, is_enabled boolean, backlog bigint, dead bigint, lag_seconds integer, lag_alert_seconds integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.name, c.is_enabled,
         count(*) filter (where d.status in ('pending', 'processing')),
         count(*) filter (where d.status = 'dead'),
         coalesce(extract(epoch from now() - min(d.created_at) filter (where d.status in ('pending', 'processing')))::integer, 0),
         c.lag_alert_seconds
  from event_consumers c
  left join event_deliveries d on d.consumer = c.name
  group by c.name, c.is_enabled, c.lag_alert_seconds
$$;

-- --------------------------------------------------------------------
-- Privileges
-- --------------------------------------------------------------------
revoke all on function public.on_warehouse_event_inserted() from public, anon, authenticated;

revoke all on function public.claim_event_deliveries(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.complete_event_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.fail_event_delivery(uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_event_processed(text, uuid) from public, anon, authenticated;
revoke all on function public.event_pipeline_health() from public, anon, authenticated;
grant execute on function public.claim_event_deliveries(text, text, integer, integer) to service_role;
grant execute on function public.complete_event_delivery(uuid, text) to service_role;
grant execute on function public.fail_event_delivery(uuid, text, text) to service_role;
grant execute on function public.mark_event_processed(text, uuid) to service_role;
grant execute on function public.event_pipeline_health() to service_role;

revoke all on function public.replay_event_delivery(uuid) from public, anon;
revoke all on function public.replay_dead_deliveries(uuid, text) from public, anon;
revoke all on function public.get_event_delivery_stats(uuid) from public, anon;
grant execute on function public.replay_event_delivery(uuid) to authenticated;
grant execute on function public.replay_dead_deliveries(uuid, text) to authenticated;
grant execute on function public.get_event_delivery_stats(uuid) to authenticated;

notify pgrst, 'reload schema';
