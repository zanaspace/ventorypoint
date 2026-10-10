-- ====================================================================
-- Phase 1 · Sprint 2 · Step 4.1 — Configuration Audit Log
-- ====================================================================
-- A generic trigger records every insert/update/delete on configuration
-- tables with before/after values, the changed fields, the actor and time.
-- Secrets are redacted (the log shows that they changed, never their value),
-- and high-churn bookkeeping columns are ignored so routine activity such as
-- floor logins doesn't flood the log. The log is append-only and readable by
-- owners/admins of the organization.
-- ====================================================================

create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,                 -- no FK: entries must outlive deleted rows/orgs
  table_name      text not null,
  row_id          text,
  action          text not null,
  changed_fields  text[] not null default '{}',
  before          jsonb,
  after           jsonb,
  actor_user_id   uuid,
  actor_role      text,                 -- JWT role: authenticated, service_role, or null (migrations/SQL)
  created_at      timestamptz not null default clock_timestamp(),  -- distinct per row, even within one transaction (pagination)
  constraint audit_log_action_check check (action in ('insert', 'update', 'delete'))
);

comment on table public.audit_log is
  'Append-only configuration change history (Sprint 2 §3.6). Written only by audit_row_change().';

create index if not exists idx_audit_log_org_time on public.audit_log (organization_id, created_at desc);
create index if not exists idx_audit_log_org_table_time on public.audit_log (organization_id, table_name, created_at desc);
create index if not exists idx_audit_log_org_actor_time on public.audit_log (organization_id, actor_user_id, created_at desc);

alter table public.audit_log enable row level security;
drop policy if exists "Owners and admins read their audit log" on public.audit_log;
create policy "Owners and admins read their audit log" on public.audit_log
  for select to authenticated
  using (get_user_role(organization_id) in ('owner', 'admin'));

revoke all on public.audit_log from public, anon, authenticated, service_role;
grant select on public.audit_log to authenticated, service_role;

-- Append-only, for everyone (including service_role and the owner)
create or replace function public.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'the audit log is append-only: % is not allowed', tg_op
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_audit_log_immutable on public.audit_log;
create trigger trg_audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.prevent_audit_mutation();
drop trigger if exists trg_audit_log_no_truncate on public.audit_log;
create trigger trg_audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.prevent_audit_mutation();

-- --------------------------------------------------------------------
-- Generic trigger
-- TG_ARGV[0]: comma-separated columns to redact (secrets)
-- TG_ARGV[1]: comma-separated columns to ignore (bookkeeping; changes to only
--             these columns are not logged)
-- --------------------------------------------------------------------
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redact  text[] := coalesce(string_to_array(nullif(tg_argv[0], ''), ','), '{}');
  v_ignore  text[] := coalesce(string_to_array(nullif(tg_argv[1], ''), ','), '{}') || array['updated_at'];
  v_old     jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row     jsonb := coalesce(v_new, v_old);
  v_changed text[] := '{}';
  v_key     text;
  v_org     uuid;
  v_role    text;
begin
  -- Which fields changed (ignoring bookkeeping columns)
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from jsonb_object_keys(v_new) k
    where not (k = any (v_ignore)) and (v_old -> k) is distinct from (v_new -> k);
    if cardinality(v_changed) = 0 then
      return null;  -- only bookkeeping changed
    end if;
  else
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from jsonb_object_keys(v_row) k
    where not (k = any (v_ignore));
  end if;

  -- Redact secrets in both snapshots
  foreach v_key in array v_redact loop
    if v_old ? v_key and v_old -> v_key <> 'null'::jsonb then
      v_old := jsonb_set(v_old, array[v_key], '"[redacted]"');
    end if;
    if v_new ? v_key and v_new -> v_key <> 'null'::jsonb then
      v_new := jsonb_set(v_new, array[v_key], '"[redacted]"');
    end if;
  end loop;

  -- Owning organization
  if tg_table_name = 'organizations' then
    v_org := (v_row ->> 'id')::uuid;
  elsif v_row ? 'organization_id' then
    v_org := (v_row ->> 'organization_id')::uuid;
  elsif tg_table_name = 'client_facilities' then
    select organization_id into v_org from client_accounts where id = (v_row ->> 'client_id')::uuid;
  elsif tg_table_name = 'member_facility_access' then
    select organization_id into v_org from organization_members where id = (v_row ->> 'member_id')::uuid;
  end if;

  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v_role := null;
  end;

  insert into audit_log (organization_id, table_name, row_id, action, changed_fields, before, after, actor_user_id, actor_role)
  values (v_org, tg_table_name, v_row ->> 'id', lower(tg_op), v_changed, v_old, v_new, auth.uid(), v_role);

  return null;
end;
$$;

revoke all on function public.audit_row_change() from public, anon, authenticated;

-- --------------------------------------------------------------------
-- Attach to the Sprint 1/2 configuration tables
-- --------------------------------------------------------------------
do $$
declare
  v_spec record;
begin
  for v_spec in
    select * from (values
      ('organizations',            '',                               ''),
      ('facilities',               '',                               ''),
      ('client_accounts',          '',                               ''),
      ('client_facilities',        '',                               ''),
      ('organization_members',     '',                               ''),
      ('member_facility_access',   '',                               ''),
      ('invitations',              'token,invite_code,code_hash',    ''),
      ('floor_worker_credentials', 'badge_token,pin_hash',           'failed_attempts,last_signed_in_at'),
      ('floor_devices',            'device_token',                   'last_active_at')
    ) as t(table_name, redact, ignore)
  loop
    execute format('drop trigger if exists trg_audit on public.%I', v_spec.table_name);
    execute format(
      'create trigger trg_audit after insert or update or delete on public.%I
         for each row execute function public.audit_row_change(%L, %L)',
      v_spec.table_name, v_spec.redact, v_spec.ignore
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
