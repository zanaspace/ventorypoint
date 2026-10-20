-- Migration: 20261020140000_sprint02a_platform_billing_and_entitlements.sql
-- Sprint 02A Step 3: Platform Subscription Billing & Entitlements
-- Implements:
--   1. public.subscriptions (plan_tier, status, billing_cycle, periods, grace periods)
--   2. public.stripe_webhook_events (idempotency, payload, processing audit)
--   3. public.subscription_usage (shipped orders count, scan events count, monthly periods)
--   4. Sync trigger from subscriptions to organizations.plan
--   5. Entitlement helpers: is_org_restricted(), get_org_subscription(), user_has_org()
--   6. Strict RLS and audit log integration

-- 1. Create subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_tier text not null default 'launch' check (plan_tier in ('launch', 'growth', 'scale', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  grace_period_ends_at timestamptz,
  custom_unit_discount_pct numeric(5,2) not null default 0.00 check (custom_unit_discount_pct >= 0 and custom_unit_discount_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_subscriptions_org unique (organization_id)
);

create index if not exists idx_subscriptions_org on public.subscriptions (organization_id);
create index if not exists idx_subscriptions_stripe_customer on public.subscriptions (stripe_customer_id);
create index if not exists idx_subscriptions_stripe_sub on public.subscriptions (stripe_subscription_id);
create index if not exists idx_subscriptions_status on public.subscriptions (status);

-- 2. Create stripe_webhook_events table for idempotency and audit
create table if not exists public.stripe_webhook_events (
  id text primary key, -- stripe event id (e.g. evt_...)
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  status text not null default 'processed' check (status in ('processed', 'failed', 'ignored')),
  error_message text
);

create index if not exists idx_stripe_webhook_type on public.stripe_webhook_events (event_type);
create index if not exists idx_stripe_webhook_processed on public.stripe_webhook_events (processed_at desc);

-- 3. Create subscription_usage table for monthly order tracking
create table if not exists public.subscription_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  shipped_orders_count integer not null default 0 check (shipped_orders_count >= 0),
  scan_events_count integer not null default 0 check (scan_events_count >= 0),
  last_calculated_at timestamptz not null default now(),
  constraint uq_org_usage_period unique (organization_id, period_start, period_end)
);

create index if not exists idx_subscription_usage_org_period on public.subscription_usage (organization_id, period_start desc);

-- 4. Trigger to sync subscriptions -> organizations.plan
create or replace function public.sync_subscription_to_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.organizations
  set plan = NEW.plan_tier
  where id = NEW.organization_id;
  
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists trg_sync_subscription_to_organization on public.subscriptions;
create trigger trg_sync_subscription_to_organization
before insert or update on public.subscriptions
for each row
execute function public.sync_subscription_to_organization();

-- 5. Helper function: user_has_org(org_id)
create or replace function public.user_has_org(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = p_org_id
      and om.user_id = auth.uid()
      and om.is_active = true
  );
$$;

grant execute on function public.user_has_org(uuid) to authenticated;

-- Safeguard: Stub for has_active_support_grant if migration 20261020130000 was not run yet
create or replace function public.has_active_support_grant(
  p_organization_id uuid,
  p_required_scope text default null
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if to_regclass('public.support_access_grants') is null then
    return false;
  end if;
  return exists (
    select 1 from public.support_access_grants
    where organization_id = p_organization_id
      and starts_at <= now()
      and expires_at > now()
      and revoked_at is null
      and (
        p_required_scope is null
        or scope = p_required_scope
        or (p_required_scope = 'read_only' and scope = 'read_write')
      )
  );
end;
$$;

grant execute on function public.has_active_support_grant(uuid, text) to authenticated;

-- 6. Helper function: is_org_restricted(org_id)
-- Checks whether a past-due subscription has exceeded its 14-day grace period
create or replace function public.is_org_restricted(p_org_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_sub record;
begin
  select status, grace_period_ends_at, current_period_end
  into v_sub
  from public.subscriptions
  where organization_id = p_org_id;

  if not found then
    return false;
  end if;

  if v_sub.status in ('past_due', 'unpaid', 'canceled') then
    if v_sub.grace_period_ends_at is not null and now() > v_sub.grace_period_ends_at then
      return true;
    end if;
  end if;

  return false;
end;
$$;

grant execute on function public.is_org_restricted(uuid) to authenticated;

-- 7. Helper function: get_org_subscription(org_id)
create or replace function public.get_org_subscription(p_org_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_res jsonb;
begin
  select jsonb_build_object(
    'organization_id', s.organization_id,
    'plan_tier', s.plan_tier,
    'status', s.status,
    'billing_cycle', s.billing_cycle,
    'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end,
    'cancel_at_period_end', s.cancel_at_period_end,
    'grace_period_ends_at', s.grace_period_ends_at,
    'custom_unit_discount_pct', s.custom_unit_discount_pct,
    'is_restricted', public.is_org_restricted(p_org_id),
    'in_grace_period', (
      s.status in ('past_due', 'unpaid') and 
      s.grace_period_ends_at is not null and 
      now() <= s.grace_period_ends_at
    ),
    'days_until_grace_expires', case
      when s.grace_period_ends_at is not null and now() <= s.grace_period_ends_at then
        extract(day from (s.grace_period_ends_at - now()))::int
      else 0
    end
  )
  into v_res
  from public.subscriptions s
  where s.organization_id = p_org_id;

  return v_res;
end;
$$;

grant execute on function public.get_org_subscription(uuid) to authenticated;

-- 8. Audit log triggers
drop trigger if exists trg_audit_subscriptions on public.subscriptions;
create trigger trg_audit_subscriptions
after insert or update or delete on public.subscriptions
for each row
execute function public.audit_row_change();

-- 9. Row Level Security policies
alter table public.subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.subscription_usage enable row level security;

-- Subscriptions RLS:
-- Org owners, admins, and billing role can view, as well as platform staff or active support
drop policy if exists "Members with billing access can view subscription" on public.subscriptions;
create policy "Members with billing access can view subscription"
on public.subscriptions for select
to authenticated
using (
  (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = subscriptions.organization_id
        and om.user_id = auth.uid()
        and om.is_active = true
        and om.role in ('owner', 'admin', 'billing')
    )
  )
  or public.is_platform_staff()
  or public.has_active_support_grant(subscriptions.organization_id)
);

drop policy if exists "Platform staff can insert and update subscriptions" on public.subscriptions;
create policy "Platform staff can insert and update subscriptions"
on public.subscriptions for all
to authenticated
using (public.is_platform_staff())
with check (public.is_platform_staff());

-- Stripe webhook events RLS:
drop policy if exists "Platform staff can view webhook events" on public.stripe_webhook_events;
create policy "Platform staff can view webhook events"
on public.stripe_webhook_events for select
to authenticated
using (public.is_platform_staff());

-- Subscription usage RLS:
drop policy if exists "Org members can view their usage" on public.subscription_usage;
create policy "Org members can view their usage"
on public.subscription_usage for select
to authenticated
using (
  (
    exists (
      select 1 from public.organization_members om
      where om.organization_id = subscription_usage.organization_id
        and om.user_id = auth.uid()
        and om.is_active = true
    )
  )
  or public.is_platform_staff()
  or public.has_active_support_grant(subscription_usage.organization_id)
);

drop policy if exists "Platform staff can manage usage" on public.subscription_usage;
create policy "Platform staff can manage usage"
on public.subscription_usage for all
to authenticated
using (public.is_platform_staff())
with check (public.is_platform_staff());

-- 10. Backfill initial subscription for existing organizations
insert into public.subscriptions (organization_id, plan_tier, status, billing_cycle)
select id, coalesce(plan, 'launch'), 'active', 'monthly'
from public.organizations
on conflict (organization_id) do nothing;
