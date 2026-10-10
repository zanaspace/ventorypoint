-- ====================================================================
-- Floor devices: trust on first use (Decision 1.2.4)
-- ====================================================================
-- Before: a new terminal waited for a supervisor's approval before any scan.
-- Now (default): the first badge + PIN sign-in registers AND approves the
-- terminal, so workers can scan straight away. Organizations that want the
-- old behaviour turn on organizations.require_device_approval.
--
-- The terminal's warehouse is assigned automatically when the worker (or the
-- organization) has exactly one facility; otherwise the terminal asks once
-- (set_floor_device_facility). Supervisors can still rename, re-assign,
-- block and retire devices at any time.
-- ====================================================================

alter table public.organizations
  add column if not exists require_device_approval boolean not null default false;

comment on column public.organizations.require_device_approval is
  'When true, new floor terminals need a supervisor''s approval before they can record scans. Default false (trust on first use).';

-- Facilities a member can work in (used for terminal facility assignment)
create or replace function public._member_facility_choices(p_member_id uuid)
returns table (id uuid, name text, short_code text)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.name, f.short_code
  from organization_members m
  join facilities f on f.organization_id = m.organization_id
  where m.id = p_member_id
    and m.is_active
    and (m.all_facilities or exists (
      select 1 from member_facility_access a where a.member_id = m.id and a.facility_id = f.id
    ))
  order by f.name
$$;

revoke all on function public._member_facility_choices(uuid) from public, anon, authenticated;

-- --------------------------------------------------------------------
-- Floor login: register + approve unknown terminals (unless the org is strict)
-- --------------------------------------------------------------------
create or replace function public.floor_worker_login(
  p_badge_token  text,
  p_pin          text,
  p_device_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cred    public.floor_worker_credentials;
  v_member  public.organization_members;
  v_profile public.profiles;
  v_org     public.organizations;
  v_device  public.floor_devices;
  v_token   text;
  v_expires timestamptz := now() + interval '12 hours';
  v_device_token text := nullif(trim(coalesce(p_device_token, '')), '');
  v_choices uuid[];
begin
  select * into v_cred from public.floor_worker_credentials
  where badge_token = trim(p_badge_token) and is_active = true
  limit 1;

  if v_cred.id is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid badge token. Please check your badge.');
  end if;

  if v_cred.locked_until is not null and v_cred.locked_until > now() then
    return jsonb_build_object(
      'ok', false,
      'locked', true,
      'error', 'Account is locked due to multiple failed attempts. Please ask a supervisor to unlock it.'
    );
  end if;

  select * into v_member from public.organization_members where id = v_cred.member_id;
  if v_member.id is null or not v_member.is_active then
    return jsonb_build_object('ok', false, 'error', 'Worker access has been revoked.');
  end if;

  if not verify_worker_pin(trim(p_pin), v_cred.pin_hash) then
    update public.floor_worker_credentials
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end,
        updated_at = now()
    where id = v_cred.id;

    if v_cred.failed_attempts + 1 >= 5 then
      return jsonb_build_object('ok', false, 'locked', true,
        'error', 'Too many failed attempts. Account locked for 15 minutes.');
    end if;
    return jsonb_build_object('ok', false,
      'error', 'Incorrect PIN. ' || (5 - (v_cred.failed_attempts + 1))::text || ' attempts remaining.');
  end if;

  select * into v_org from public.organizations where id = v_member.organization_id;

  if v_device_token is not null then
    if char_length(v_device_token) > 100 then
      return jsonb_build_object('ok', false, 'error', 'Invalid device identifier.');
    end if;

    select array_agg(c.id) into v_choices from _member_facility_choices(v_member.id) c;

    select * into v_device from public.floor_devices where device_token = v_device_token;
    if v_device.id is null then
      -- First sign-in on this terminal: register it; approve unless the org is strict.
      insert into public.floor_devices (organization_id, facility_id, device_name, device_token, is_authorized, device_type)
      values (
        v_member.organization_id,
        case when cardinality(v_choices) = 1 then v_choices[1] end,
        'Terminal ' || upper(left(v_device_token, 6)),
        v_device_token,
        not v_org.require_device_approval,
        'browser'
      )
      returning * into v_device;
    elsif v_device.organization_id <> v_member.organization_id then
      return jsonb_build_object('ok', false, 'error', 'This device is registered to another organization.');
    elsif v_device.retired_at is not null then
      return jsonb_build_object('ok', false, 'error', 'This device has been retired. Ask a supervisor to re-register it.');
    else
      -- Known terminal: approve a pending one if the org no longer requires approval
      -- (never a blocked one), and fill in a missing facility when there's only one choice.
      update public.floor_devices
      set is_authorized = case
            when not is_authorized and blocked_at is null and not v_org.require_device_approval then true
            else is_authorized end,
          facility_id = coalesce(facility_id, case when cardinality(v_choices) = 1 then v_choices[1] end),
          updated_at = now()
      where id = v_device.id
      returning * into v_device;
    end if;
    update public.floor_devices set last_active_at = now() where id = v_device.id;
  end if;

  update public.floor_worker_credentials
  set failed_attempts = 0, locked_until = null, last_signed_in_at = now(), updated_at = now()
  where id = v_cred.id;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.floor_sessions (token_hash, credential_id, member_id, organization_id, device_id, expires_at)
  values (_hash_session_token(v_token), v_cred.id, v_member.id, v_member.organization_id, v_device.id, v_expires);

  select * into v_profile from public.profiles where id = v_member.user_id;

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'session_expires_at', v_expires,
    'worker_code', v_cred.worker_code,
    'first_name', v_profile.first_name,
    'last_name', v_profile.last_name,
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'member_id', v_member.id,
    'all_facilities', v_member.all_facilities,
    'device', case when v_device.id is null then null else jsonb_build_object(
      'id', v_device.id, 'name', v_device.device_name,
      'is_authorized', v_device.is_authorized, 'is_blocked', v_device.blocked_at is not null,
      'facility_id', v_device.facility_id) end
  );
end;
$$;

-- --------------------------------------------------------------------
-- Session details: adds the facility choice when the terminal has none yet
-- --------------------------------------------------------------------
create or replace function public.get_floor_session(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.floor_sessions;
  v_result  jsonb;
begin
  begin
    v_session := _floor_session(p_session_token);
  exception when others then
    return null;
  end;

  select jsonb_build_object(
    'session_id', v_session.id,
    'started_at', v_session.created_at,
    'expires_at', v_session.expires_at,
    'member_id', m.id,
    'worker_code', c.worker_code,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'organization_id', o.id,
    'organization_name', o.name,
    'all_facilities', m.all_facilities,
    'device', case when d.id is null then null else jsonb_build_object(
      'id', d.id,
      'name', d.device_name,
      'is_authorized', d.is_authorized and d.retired_at is null,
      'is_blocked', d.blocked_at is not null,
      'facility_id', d.facility_id,
      'facility_name', f.name,
      'facility_choices', case when d.facility_id is null then (
        select coalesce(jsonb_agg(jsonb_build_object('id', ch.id, 'name', ch.name, 'code', ch.short_code)), '[]'::jsonb)
        from _member_facility_choices(m.id) ch
      ) end) end
  ) into v_result
  from organization_members m
  join floor_worker_credentials c on c.id = v_session.credential_id
  join organizations o on o.id = v_session.organization_id
  left join profiles p on p.id = m.user_id
  left join floor_devices d on d.id = v_session.device_id
  left join facilities f on f.id = d.facility_id
  where m.id = v_session.member_id;

  return v_result;
end;
$$;

-- --------------------------------------------------------------------
-- One-time facility choice from the terminal itself
-- Only while the device has no facility; afterwards only supervisors can change it.
-- --------------------------------------------------------------------
create or replace function public.set_floor_device_facility(p_session_token text, p_facility_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.floor_sessions := _floor_session(p_session_token);
  v_device  public.floor_devices;
begin
  select * into v_device from floor_devices where id = v_session.device_id for update;
  if v_device.id is null then
    perform _event_error('device_required', 'This terminal is not registered', '42501');
  elsif v_device.retired_at is not null then
    perform _event_error('device_retired', 'This device has been retired', '42501');
  elsif v_device.blocked_at is not null then
    perform _event_error('device_blocked', 'This device has been blocked by a supervisor', '42501');
  elsif v_device.facility_id is not null then
    perform _event_error('facility_already_set', 'This terminal already has a warehouse. Ask a supervisor to change it.', '42501');
  end if;
  if not _member_has_facility(v_session.member_id, p_facility_id) then
    perform _event_error('scope_denied', 'You do not have access to this facility', '42501');
  end if;

  update floor_devices set facility_id = p_facility_id, updated_at = now() where id = v_device.id;
end;
$$;

revoke all on function public.set_floor_device_facility(text, uuid) from public;
grant execute on function public.set_floor_device_facility(text, uuid) to anon, authenticated;

-- --------------------------------------------------------------------
-- Platform staff tools (until the Sprint 02A internal console adds staff roles)
-- Server code calls these with the service role after checking the staff allow-list.
-- --------------------------------------------------------------------
create or replace function public.platform_replay_event_delivery(p_delivery_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with replayed as (
    update event_deliveries
    set status = 'pending', attempts = 0, next_attempt_at = now(), locked_until = null, locked_by = null, updated_at = now()
    where id = p_delivery_id and status = 'dead'
    returning 1
  )
  select exists (select 1 from replayed)
$$;

create or replace function public.platform_replay_dead_deliveries(p_consumer text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update event_deliveries
  set status = 'pending', attempts = 0, next_attempt_at = now(), locked_until = null, locked_by = null, updated_at = now()
  where consumer = p_consumer and status = 'dead';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.platform_replay_event_delivery(uuid) from public, anon, authenticated;
revoke all on function public.platform_replay_dead_deliveries(text) from public, anon, authenticated;
grant execute on function public.platform_replay_event_delivery(uuid) to service_role;
grant execute on function public.platform_replay_dead_deliveries(text) to service_role;

notify pgrst, 'reload schema';
