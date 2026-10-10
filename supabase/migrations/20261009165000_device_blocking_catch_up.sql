-- ====================================================================
-- Catch-up: device blocking (Sprint 2 · Step 2 follow-up)
-- ====================================================================
-- The blocked/unblocked device status was added to 20261009130000 after that
-- migration had already been applied to some databases, so those databases
-- never received it. This migration applies the same change on its own.
-- It is idempotent: on databases that already have it, it changes nothing.
-- Also switches audit_log timestamps to clock_timestamp() (same reason).
-- ====================================================================

alter table public.floor_devices
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid;

alter table public.audit_log
  alter column created_at set default clock_timestamp();

create or replace function public._insert_event(
  p_organization_id      uuid,
  p_event                jsonb,
  p_actor_user_id        uuid,
  p_actor_worker_id      uuid,
  p_device_id            uuid,
  p_source               text,
  p_allow_backdate       boolean,
  p_backdate_approved_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key          text := nullif(trim(p_event ->> 'idempotency_key'), '');
  v_type         text := p_event ->> 'event_type';
  v_version      integer := coalesce((p_event ->> 'event_version')::integer, 1);
  v_payload      jsonb := coalesce(p_event -> 'payload', '{}'::jsonb);
  v_facility_id  uuid := (p_event ->> 'facility_id')::uuid;
  v_client_id    uuid := (p_event ->> 'client_account_id')::uuid;
  v_occurred_at  timestamptz := coalesce((p_event ->> 'occurred_at')::timestamptz, now());
  v_registry     public.event_type_registry;
  v_device       public.floor_devices;
  v_errors       text[];
  v_existing     uuid;
  v_event_id     uuid := gen_random_uuid();
  v_partition    text;
begin
  -- 1. Idempotency first: a retried request returns the original event even if
  --    it would now fail time checks (e.g. a scan queued offline for hours).
  if v_key is null or char_length(v_key) not between 8 and 200 then
    perform _event_error('invalid_idempotency_key', 'idempotency_key must be 8 to 200 characters', '22023');
  end if;

  select event_id into v_existing
  from event_idempotency_keys
  where organization_id = p_organization_id and idempotency_key = v_key;
  if v_existing is not null then
    return jsonb_build_object('event_id', v_existing, 'status', 'duplicate');
  end if;

  -- 2. Event type and payload
  select * into v_registry
  from event_type_registry
  where event_type = v_type and version = v_version and is_active;
  if v_registry.event_type is null then
    perform _event_error('unknown_event_type', format('Unknown or inactive event type %s v%s', v_type, v_version), '22023');
  end if;

  if jsonb_typeof(v_payload) <> 'object' then
    perform _event_error('invalid_payload', 'payload must be a JSON object', '22023');
  end if;
  v_errors := validate_event_payload(v_registry.payload_schema, v_payload);
  if cardinality(v_errors) > 0 then
    perform _event_error('invalid_payload', 'Invalid payload: ' || array_to_string(v_errors, '; '), '22023');
  end if;

  -- 3. Time bounds (2 minutes of clock skew allowed)
  if v_occurred_at > now() + interval '2 minutes' then
    perform _event_error('occurred_in_future', 'occurred_at cannot be in the future', '22023');
  end if;
  if v_occurred_at < now() - interval '72 hours' and not coalesce(p_allow_backdate, false) then
    perform _event_error('occurred_too_old',
      'occurred_at is more than 72 hours ago; a supervisor must approve back-dated events', '22023');
  end if;

  -- 4. Scope integrity
  if v_facility_id is not null and not exists (
    select 1 from facilities where id = v_facility_id and organization_id = p_organization_id
  ) then
    perform _event_error('scope_denied', 'Facility does not belong to this organization', '42501');
  end if;
  if v_client_id is not null and not exists (
    select 1 from client_accounts where id = v_client_id and organization_id = p_organization_id
  ) then
    perform _event_error('scope_denied', 'Client account does not belong to this organization', '42501');
  end if;

  -- 5. Devices: floor events need a known, authorized, active device of this organization
  if p_device_id is not null then
    select * into v_device from floor_devices where id = p_device_id;
    if v_device.id is null or v_device.organization_id <> p_organization_id then
      perform _event_error('unknown_device', 'Device is not registered to this organization', '42501');
    elsif v_device.retired_at is not null then
      perform _event_error('device_retired', 'This device has been retired', '42501');
    elsif v_device.blocked_at is not null then
      perform _event_error('device_blocked', 'This device has been blocked by a supervisor', '42501');
    elsif not v_device.is_authorized then
      perform _event_error('device_not_authorized', 'This device is waiting for a supervisor to authorize it', '42501');
    end if;
  end if;
  if v_registry.is_floor_event and p_device_id is null then
    perform _event_error('device_required', format('%s must be recorded from a registered device', v_type), '42501');
  end if;

  -- 6. Partition for back-dated events (current months are pre-created)
  v_partition := format('warehouse_events_y%s', to_char(v_occurred_at at time zone 'UTC', 'YYYY"m"MM'));
  if to_regclass('public.' || v_partition) is null then
    perform ensure_warehouse_event_partition((v_occurred_at at time zone 'UTC')::date);
  end if;

  -- 7. Insert event + key together; a concurrent duplicate loses the race on the
  --    key's primary key, rolls back its event row and returns the winner's ID.
  begin
    insert into warehouse_events (
      id, organization_id, facility_id, client_account_id, event_type, event_version,
      entity_type, entity_id, payload, actor_user_id, actor_worker_id, device_id, source,
      correlation_id, causation_id, idempotency_key, occurred_at,
      backdate_reason, backdate_approved_by
    ) values (
      v_event_id, p_organization_id, v_facility_id, v_client_id, v_type, v_version,
      coalesce(nullif(p_event ->> 'entity_type', ''), v_registry.entity_type),
      (p_event ->> 'entity_id')::uuid, v_payload, p_actor_user_id, p_actor_worker_id, p_device_id, p_source,
      (p_event ->> 'correlation_id')::uuid, (p_event ->> 'causation_id')::uuid, v_key, v_occurred_at,
      case when p_backdate_approved_by is not null then p_event ->> 'backdate_reason' end,
      p_backdate_approved_by
    );

    insert into event_idempotency_keys (organization_id, idempotency_key, event_id, occurred_at)
    values (p_organization_id, v_key, v_event_id, v_occurred_at);
  exception when unique_violation then
    select event_id into v_existing
    from event_idempotency_keys
    where organization_id = p_organization_id and idempotency_key = v_key;
    if v_existing is null then
      raise;
    end if;
    return jsonb_build_object('event_id', v_existing, 'status', 'duplicate');
  end;

  -- 8. Last seen, throttled to one write per device per minute
  if p_device_id is not null then
    update floor_devices set last_active_at = now()
    where id = p_device_id and (last_active_at is null or last_active_at < now() - interval '1 minute');
  end if;

  return jsonb_build_object('event_id', v_event_id, 'status', 'created');
end;
$$;

create or replace function public._record_floor_event(p_session public.floor_sessions, p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facility_id uuid := (p_event ->> 'facility_id')::uuid;
  v_member      public.organization_members;
  v_device      public.floor_devices;
begin
  if p_session.device_id is null then
    perform _event_error('device_required', 'Floor events must come from a registered device', '42501');
  end if;

  -- Device status first: an unapproved terminal needs a supervisor, not a facility.
  select * into v_device from floor_devices where id = p_session.device_id;
  if v_device.retired_at is not null then
    perform _event_error('device_retired', 'This device has been retired', '42501');
  elsif v_device.blocked_at is not null then
    perform _event_error('device_blocked', 'This device has been blocked by a supervisor', '42501');
  elsif not v_device.is_authorized then
    perform _event_error('device_not_authorized', 'This device is waiting for a supervisor to authorize it', '42501');
  end if;

  v_facility_id := coalesce(v_facility_id, v_device.facility_id);
  if v_facility_id is null then
    perform _event_error('facility_required', 'Assign this device to a facility before recording floor events', '22023');
  end if;
  if not _member_has_facility(p_session.member_id, v_facility_id) then
    perform _event_error('scope_denied', 'You do not have access to this facility', '42501');
  end if;
  if nullif(trim(p_event ->> 'backdate_reason'), '') is not null then
    perform _event_error('backdate_not_allowed', 'Floor terminals cannot record back-dated events', '42501');
  end if;

  select * into v_member from organization_members where id = p_session.member_id;

  return _insert_event(
    p_session.organization_id,
    jsonb_set(p_event - 'device_id', '{facility_id}', to_jsonb(v_facility_id)),
    v_member.user_id, p_session.credential_id, p_session.device_id,
    'floor', false, null
  );
end;
$$;

create or replace function public.register_device(
  p_organization_id uuid,
  p_device_token    text,
  p_device_name     text,
  p_device_type     text default 'browser',
  p_facility_id     uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token  text := nullif(trim(coalesce(p_device_token, '')), '');
  v_name   text := nullif(trim(coalesce(p_device_name, '')), '');
  v_device public.floor_devices;
begin
  perform _require_device_manager(p_organization_id);

  if v_token is null or char_length(v_token) > 100 then
    perform _event_error('invalid_device', 'A device identifier is required', '22023');
  end if;
  if v_name is null or char_length(v_name) > 80 then
    perform _event_error('invalid_device', 'Device name must be 1 to 80 characters', '22023');
  end if;
  if p_facility_id is not null and not exists (
    select 1 from facilities where id = p_facility_id and organization_id = p_organization_id
  ) then
    perform _event_error('scope_denied', 'Facility does not belong to this organization', '42501');
  end if;

  select * into v_device from floor_devices where device_token = v_token;
  if v_device.id is not null and v_device.organization_id <> p_organization_id then
    perform _event_error('scope_denied', 'This device is registered to another organization', '42501');
  end if;

  insert into floor_devices (organization_id, facility_id, device_name, device_token, device_type,
                             is_authorized, registered_by, retired_at, updated_at)
  values (p_organization_id, p_facility_id, v_name, v_token, coalesce(p_device_type, 'browser'),
          true, auth.uid(), null, now())
  on conflict (device_token) do update
    set device_name   = excluded.device_name,
        facility_id   = coalesce(excluded.facility_id, floor_devices.facility_id),
        device_type   = excluded.device_type,
        is_authorized = true,
        registered_by = excluded.registered_by,
        retired_at    = null,
        blocked_at    = null,
        blocked_by    = null,
        updated_at    = now()
  returning * into v_device;

  return v_device.id;
end;
$$;

create or replace function public.update_device(
  p_device_id     uuid,
  p_device_name   text    default null,
  p_facility_id   uuid    default null,
  p_is_authorized boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device public.floor_devices;
  v_name   text := nullif(trim(coalesce(p_device_name, '')), '');
begin
  select * into v_device from floor_devices where id = p_device_id;
  if v_device.id is null then
    perform _event_error('unknown_device', 'Device not found', '22023');
  end if;
  perform _require_device_manager(v_device.organization_id);

  if v_device.retired_at is not null then
    perform _event_error('device_retired', 'Retired devices cannot be changed; register it again instead', '22023');
  end if;
  if v_name is not null and char_length(v_name) > 80 then
    perform _event_error('invalid_device', 'Device name must be 1 to 80 characters', '22023');
  end if;
  if p_facility_id is not null and not exists (
    select 1 from facilities where id = p_facility_id and organization_id = v_device.organization_id
  ) then
    perform _event_error('scope_denied', 'Facility does not belong to this organization', '42501');
  end if;

  update floor_devices
  set device_name   = coalesce(v_name, device_name),
      facility_id   = coalesce(p_facility_id, facility_id),
      is_authorized = coalesce(p_is_authorized, is_authorized),
      blocked_at    = case when p_is_authorized is false then now()
                         when p_is_authorized is true then null
                         else blocked_at end,
      blocked_by    = case when p_is_authorized is false then auth.uid()
                         when p_is_authorized is true then null
                         else blocked_by end,
      updated_at    = now()
  where id = p_device_id;

  -- De-authorizing a device ends its floor sessions immediately
  if p_is_authorized is false then
    update floor_sessions set revoked_at = now() where device_id = p_device_id and revoked_at is null;
  end if;
end;
$$;

notify pgrst, 'reload schema';
