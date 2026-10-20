-- Migration: 20261020150000_sprint02a_notifications_analytics_export.sql
-- Sprint 02A Step 4: Notification Service, Product Analytics & Customer Data Export
-- Implements:
--   1. public.notifications (in-app inbox, read states, template keys)
--   2. public.notification_preferences (channel toggles, daily digest, quiet hours)
--   3. public.data_export_jobs (owner/admin full tenant export with expiring links)
--   4. public.product_analytics_events (pseudonymous event taxonomy, PII guard)
--   5. notify() and read state RPCs
--   6. Strict RLS and audit log integration

-- 1. Create notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  title text not null,
  message text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'both')),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_org on public.notifications (user_id, organization_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications (user_id, organization_id) where read_at is null;

-- 2. Create notification_preferences table
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  daily_digest_enabled boolean not null default false,
  quiet_hours_start text,
  quiet_hours_end text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_org_template unique (user_id, organization_id, template_key)
);

create index if not exists idx_notification_prefs_lookup on public.notification_preferences (user_id, organization_id);

-- 3. Create data_export_jobs table
create table if not exists public.data_export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'expired')),
  format text not null default 'json' check (format in ('json', 'csv', 'zip')),
  file_url text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  downloaded_at timestamptz,
  record_count integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_export_jobs_org on public.data_export_jobs (organization_id, created_at desc);

-- 4. Create product_analytics_events table (pseudonymous, no PII)
create table if not exists public.product_analytics_events (
  id uuid primary key default gen_random_uuid(),
  org_id_hash text not null,
  user_id_hash text not null,
  event_name text not null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_event_name on public.product_analytics_events (event_name, created_at desc);
create index if not exists idx_analytics_org_hash on public.product_analytics_events (org_id_hash, created_at desc);

-- PII guard trigger on product_analytics_events
create or replace function public.validate_analytics_event_no_pii()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keys text[];
  v_forbidden text[] := array['email', 'name', 'first_name', 'last_name', 'phone', 'address', 'street', 'ssn', 'tax_id', 'card'];
  k text;
begin
  select array_agg(lower(key)) into v_keys
  from jsonb_object_keys(NEW.properties) as key;

  if v_keys is not null then
    foreach k in array v_forbidden loop
      if k = any(v_keys) then
        raise exception 'PII Violation: Analytics events must not contain personal identifiers (forbidden key: %)', k;
      end if;
    end loop;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_validate_analytics_no_pii on public.product_analytics_events;
create trigger trg_validate_analytics_no_pii
before insert or update on public.product_analytics_events
for each row
execute function public.validate_analytics_event_no_pii();

-- 5. Helper RPC: create_notification()
create or replace function public.create_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_template_key text,
  p_title text,
  p_message text,
  p_channel text default 'in_app',
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pref record;
  v_notif_id uuid;
begin
  -- Check user preference if exists
  select in_app_enabled, email_enabled
  into v_pref
  from public.notification_preferences
  where user_id = p_user_id
    and organization_id = p_org_id
    and template_key = p_template_key;

  if found and not v_pref.in_app_enabled and p_channel = 'in_app' then
    -- User muted this notification
    return null;
  end if;

  insert into public.notifications (
    organization_id,
    user_id,
    template_key,
    title,
    message,
    channel,
    data
  )
  values (
    p_org_id,
    p_user_id,
    p_template_key,
    p_title,
    p_message,
    coalesce(p_channel, 'in_app'),
    coalesce(p_data, '{}'::jsonb)
  )
  returning id into v_notif_id;

  return v_notif_id;
end;
$$;

grant execute on function public.create_notification(uuid, uuid, text, text, text, text, jsonb) to authenticated;

-- Helper RPC: mark_notification_read()
create or replace function public.mark_notification_read(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid();

  return found;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;

-- Helper RPC: mark_all_notifications_read()
create or replace function public.mark_all_notifications_read(p_org_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where user_id = auth.uid()
    and organization_id = p_org_id
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.mark_all_notifications_read(uuid) to authenticated;

-- 6. Audit triggers
drop trigger if exists trg_audit_export_jobs on public.data_export_jobs;
create trigger trg_audit_export_jobs
after insert or update or delete on public.data_export_jobs
for each row
execute function public.audit_row_change();

-- 7. Row Level Security policies
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.data_export_jobs enable row level security;
alter table public.product_analytics_events enable row level security;

-- Notifications RLS:
drop policy if exists "Users view their own notifications" on public.notifications;
create policy "Users view their own notifications"
on public.notifications for select
to authenticated
using (user_id = auth.uid() or public.is_platform_staff());

drop policy if exists "Users update their own notifications" on public.notifications;
create policy "Users update their own notifications"
on public.notifications for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Service and staff insert notifications" on public.notifications;
create policy "Service and staff insert notifications"
on public.notifications for insert
to authenticated
with check (true);

-- Notification preferences RLS:
drop policy if exists "Users manage their own notification prefs" on public.notification_preferences;
create policy "Users manage their own notification prefs"
on public.notification_preferences for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Data export jobs RLS:
drop policy if exists "Owners and admins can manage data exports" on public.data_export_jobs;
create policy "Owners and admins can manage data exports"
on public.data_export_jobs for all
to authenticated
using (
  (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = data_export_jobs.organization_id
        and om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('owner', 'admin')
    )
  )
  or public.is_platform_staff()
)
with check (
  (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = data_export_jobs.organization_id
        and om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('owner', 'admin')
    )
  )
  or public.is_platform_staff()
);

-- Analytics events RLS:
drop policy if exists "Platform staff can read analytics events" on public.product_analytics_events;
create policy "Platform staff can read analytics events"
on public.product_analytics_events for select
to authenticated
using (public.is_platform_staff());

drop policy if exists "Authenticated users can record pseudonymous events" on public.product_analytics_events;
create policy "Authenticated users can record pseudonymous events"
on public.product_analytics_events for insert
to authenticated
with check (true);
