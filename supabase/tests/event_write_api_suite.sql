-- ====================================================================
-- VentoryPoint Phase 1 Sprint 2 · Step 2: Event Write API Test Suite
-- ====================================================================
-- Validates (Sprint 2 PRD §3.2, §3.5, §4):
--  1. record_event: idempotent; duplicates return the original ID
--  2. Acceptance: 10,000 events with 5% duplicate keys -> exactly 9,500 stored
--  3. Scope: org, facility, client_user and anonymous callers
--  4. Payload validation against the registry schema
--  5. occurred_at bounds and supervisor-approved back-dating
--  6. Floor sessions: login, device registration/authorization, session-derived actor
--  7. Session tampering, expiry, logout and device retirement
--  8. Batches: per-event results, atomic per event, 100-event limit
--  9. Device management permissions
-- 10. record_system_event is service_role only
--
-- Runs inside a transaction that is rolled back.
-- ====================================================================

begin;

do $$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_owner_a uuid := gen_random_uuid();
  v_super_a uuid := gen_random_uuid();
  v_worker_a uuid := gen_random_uuid();
  v_brand_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_fac_a1 uuid;
  v_fac_a2 uuid;
  v_fac_b1 uuid;
  v_worker_member uuid;
  v_cred uuid;
  v_id uuid;
  v_id2 uuid;
  v_count integer;
  v_blocked boolean;
  v_hint text;
  v_login jsonb;
  v_token text;
  v_device uuid;
  v_results jsonb;
  v_event public.warehouse_events;
  v_batch jsonb;
  v_i integer;
begin
  raise notice '>>> STARTING SPRINT 2 · STEP 2 EVENT WRITE API TEST SUITE <<<';

  -- ---------------------------------------------------------------
  -- Fixtures
  -- ---------------------------------------------------------------
  insert into public.profiles (id, email, first_name, last_name) values
    (v_owner_a,  'owner_a@write.test',  'Olivia', 'Owner'),
    (v_super_a,  'super_a@write.test',  'Sam',    'Super'),
    (v_worker_a, null,                  'Wes',    'Worker'),
    (v_brand_a,  'brand_a@write.test',  'Bea',    'Brand'),
    (v_owner_b,  'owner_b@write.test',  'Omar',   'OwnerB');

  insert into public.organizations (id, name) values (v_org_a, 'Write Org A'), (v_org_b, 'Write Org B');
  insert into public.facilities (organization_id, name) values (v_org_a, 'A-1') returning id into v_fac_a1;
  insert into public.facilities (organization_id, name) values (v_org_a, 'A-2') returning id into v_fac_a2;
  insert into public.facilities (organization_id, name) values (v_org_b, 'B-1') returning id into v_fac_b1;

  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities) values
    (v_org_a, v_owner_a, 'owner', true, true),
    (v_org_a, v_super_a, 'supervisor', true, true),
    (v_org_a, v_brand_a, 'client_user', true, true),
    (v_org_b, v_owner_b, 'owner', true, true);
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities)
    values (v_org_a, v_worker_a, 'floor_worker', true, false) returning id into v_worker_member;
  insert into public.member_facility_access (member_id, facility_id) values (v_worker_member, v_fac_a1);

  insert into public.floor_worker_credentials (organization_id, member_id, worker_code, badge_token, pin_hash)
  values (v_org_a, v_worker_member, 'W-001', 'vp_badge_test_wes', hash_worker_pin('1234'))
  returning id into v_cred;

  -- ---------------------------------------------------------------
  -- TEST 1: record_event is idempotent
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_id := record_event(v_org_a, 'system.synthetic', 'idem-key-0001', '{"label":"first"}', v_fac_a1);
  v_id2 := record_event(v_org_a, 'system.synthetic', 'idem-key-0001', '{"label":"retry with different body"}', v_fac_a1);
  reset role;

  if v_id is null or v_id <> v_id2 then
    raise exception 'TEST 1 FAILED: duplicate key should return the original ID (% vs %)', v_id, v_id2;
  end if;
  select * into v_event from public.warehouse_events where id = v_id;
  if v_event.payload ->> 'label' <> 'first' or v_event.actor_user_id <> v_owner_a or v_event.source <> 'web'
     or v_event.entity_type <> 'synthetic' or v_event.received_at is null then
    raise exception 'TEST 1 FAILED: stored event has wrong actor/source/defaults: %', row_to_json(v_event);
  end if;
  raise notice '✓ TEST 1 PASSED: record_event stores actor/source/defaults and dedupes by key.';

  -- ---------------------------------------------------------------
  -- TEST 2: Acceptance — 10,000 events, 5% duplicate keys -> 9,500 stored
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for v_i in 1 .. 10000 loop
    -- Every 20th event reuses the previous event's key (500 duplicates)
    perform record_event(
      v_org_a, 'system.synthetic',
      'load-' || lpad((case when v_i % 20 = 0 then v_i - 1 else v_i end)::text, 5, '0'),
      jsonb_build_object('sequence', v_i), v_fac_a1
    );
  end loop;
  reset role;

  select count(*) into v_count from public.warehouse_events where organization_id = v_org_a and idempotency_key like 'load-%';
  if v_count <> 9500 then
    raise exception 'TEST 2 FAILED: expected 9,500 unique events, stored %', v_count;
  end if;
  raise notice '✓ TEST 2 PASSED: 10,000 events with 5%% duplicate keys stored exactly 9,500.';

  -- ---------------------------------------------------------------
  -- TEST 3: Scope checks
  -- ---------------------------------------------------------------
  -- 3.1 Worker without access to facility A-2
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'system.synthetic', 'scope-key-a2', '{}', v_fac_a2);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 3.1 FAILED: got %', v_hint; end if;

  -- 3.2 Owner B into org A
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'system.synthetic', 'scope-key-xorg', '{}', v_fac_a1);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 3.2 FAILED: got %', v_hint; end if;

  -- 3.3 Owner A cannot point an event at org B's facility
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'system.synthetic', 'scope-key-fac-b', '{}', v_fac_b1);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 3.3 FAILED: got %', v_hint; end if;

  -- 3.4 Brand users cannot write warehouse events
  perform set_config('request.jwt.claims', json_build_object('sub', v_brand_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'system.synthetic', 'scope-key-brand', '{}', v_fac_a1);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 3.4 FAILED: got %', v_hint; end if;

  -- 3.5 Anonymous callers cannot even execute record_event
  perform set_config('request.jwt.claims', '', true);
  v_blocked := false;
  begin
    set local role anon;
    perform record_event(v_org_a, 'system.synthetic', 'scope-key-anon', '{}', v_fac_a1);
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 3.5 FAILED: anon must not execute record_event'; end if;

  -- 3.6 Internal functions are not callable by clients
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    set local role authenticated;
    perform _insert_event(v_org_a, '{}'::jsonb, null, null, null, 'web', true, null);
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 3.6 FAILED: _insert_event must not be callable by authenticated'; end if;
  raise notice '✓ TEST 3 PASSED: Facility, cross-org, brand, anonymous and internal-function scope enforced.';

  -- ---------------------------------------------------------------
  -- TEST 4: Payload validation
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'inventory.adjusted', 'payload-key-missing', '{"sku_id":"s1","location_id":"l1"}', v_fac_a1);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'invalid_payload' then raise exception 'TEST 4 FAILED: missing fields accepted (%)', v_hint; end if;

  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'unknown.event', 'payload-key-type', '{}', v_fac_a1);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'unknown_event_type' then raise exception 'TEST 4 FAILED: unknown type accepted (%)', v_hint; end if;

  -- Validator unit checks (nested arrays, exclusiveMinimum, integer, enum, additionalProperties)
  if cardinality(validate_event_payload(
       (select payload_schema from event_type_registry where event_type = 'count.submitted'),
       '{"location_id":"l1","lines":[{"sku_id":"a","counted_quantity":3},{"sku_id":"b"}]}')) <> 1 then
    raise exception 'TEST 4 FAILED: nested array item missing counted_quantity should give 1 error';
  end if;
  if cardinality(validate_event_payload(
       (select payload_schema from event_type_registry where event_type = 'pick.confirmed'),
       '{"order_id":"o","sku_id":"s","quantity":0,"location_id":"l"}')) <> 1 then
    raise exception 'TEST 4 FAILED: quantity 0 must violate exclusiveMinimum';
  end if;
  if cardinality(validate_event_payload('{"type":"integer"}', '2.5')) <> 1
     or cardinality(validate_event_payload('{"type":"integer"}', '3')) <> 0
     or cardinality(validate_event_payload('{"enum":["a","b"]}', '"c"')) <> 1
     or cardinality(validate_event_payload('{"type":"object","properties":{"a":{}},"additionalProperties":false}', '{"a":1,"b":2}')) <> 1
     or cardinality(validate_event_payload('{"type":"string","maxLength":3}', '"abcd"')) <> 1 then
    raise exception 'TEST 4 FAILED: validator keyword checks';
  end if;
  raise notice '✓ TEST 4 PASSED: Registry schema enforced (required, types, nested items, bounds, enum).';

  -- ---------------------------------------------------------------
  -- TEST 5: occurred_at bounds and back-dating
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'system.synthetic', 'time-key-future', '{}', v_fac_a1, null, now() + interval '1 hour');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'occurred_in_future' then raise exception 'TEST 5 FAILED: future accepted (%)', v_hint; end if;

  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'system.synthetic', 'time-key-old', '{}', v_fac_a1, null, now() - interval '80 hours');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'occurred_too_old' then raise exception 'TEST 5 FAILED: 80h-old event accepted (%)', v_hint; end if;

  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'system.synthetic', 'time-key-old-reason', '{}', v_fac_a1, null,
                         now() - interval '80 hours', p_backdate_reason => 'Scanner offline over weekend');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'backdate_not_allowed' then raise exception 'TEST 5 FAILED: worker back-dated (%)', v_hint; end if;

  -- Within 72h is fine for anyone (offline queue)
  set local role authenticated;
  perform record_event(v_org_a, 'system.synthetic', 'time-key-48h', '{}', v_fac_a1, null, now() - interval '48 hours');
  reset role;

  -- Supervisor approves a back-dated event, including into a month with no partition yet
  perform set_config('request.jwt.claims', json_build_object('sub', v_super_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_id := record_event(v_org_a, 'system.synthetic', 'time-key-2020', '{}', v_fac_a1, null,
                       '2020-02-10 12:00+00', p_backdate_reason => 'Paper count keyed in late');
  reset role;
  select * into v_event from public.warehouse_events where id = v_id;
  if v_event.backdate_approved_by <> v_super_a or v_event.backdate_reason <> 'Paper count keyed in late'
     or to_regclass('public.warehouse_events_y2020m02') is null then
    raise exception 'TEST 5 FAILED: supervisor back-date not recorded correctly';
  end if;
  raise notice '✓ TEST 5 PASSED: Future and >72h events rejected; supervisor back-dating recorded with approver.';

  -- ---------------------------------------------------------------
  -- TEST 6: Floor sessions and devices
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  v_login := floor_worker_login('vp_badge_test_wes', '1234', 'device-uuid-terminal-01');
  reset role;
  v_token := v_login ->> 'session_token';
  v_device := (v_login -> 'device' ->> 'id')::uuid;
  if not (v_login ->> 'ok')::boolean or v_token is null or char_length(v_token) <> 64 or v_device is null
     or (v_login -> 'device' ->> 'is_authorized')::boolean then
    raise exception 'TEST 6 FAILED: login should return a session token and an unauthorized new device: %', v_login;
  end if;
  if exists (select 1 from public.floor_sessions where token_hash = v_token) then
    raise exception 'TEST 6 FAILED: raw session token must not be stored';
  end if;

  -- Unauthorized device is rejected
  v_hint := null;
  begin
    set local role anon;
    perform record_floor_event(v_token, '{"event_type":"system.synthetic","idempotency_key":"floor-key-0001"}');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'device_not_authorized' then raise exception 'TEST 6 FAILED: unauthorized device accepted (%)', v_hint; end if;

  -- Supervisor authorizes it and assigns facility A-1
  perform set_config('request.jwt.claims', json_build_object('sub', v_super_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform update_device(v_device, 'Dock 3 terminal', v_fac_a1, true);
  reset role;

  -- Floor event: org, actor, device and facility all come from the session/device
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  v_id := record_floor_event(v_token, jsonb_build_object(
    'event_type', 'inventory.moved', 'idempotency_key', 'floor-key-0002',
    'organization_id', v_org_b,            -- ignored: the session decides the org
    'device_id', gen_random_uuid(),        -- ignored: the session decides the device
    'payload', jsonb_build_object('sku_id', 's1', 'quantity', 2, 'from_location_id', 'l1', 'to_location_id', 'l2')));
  reset role;
  select * into v_event from public.warehouse_events where id = v_id;
  if v_event.organization_id <> v_org_a or v_event.facility_id <> v_fac_a1 or v_event.device_id <> v_device
     or v_event.actor_worker_id <> v_cred or v_event.actor_user_id <> v_worker_a or v_event.source <> 'floor' then
    raise exception 'TEST 6 FAILED: floor event scope/actor wrong: %', row_to_json(v_event);
  end if;

  -- Facility outside the worker's access
  v_hint := null;
  begin
    set local role anon;
    perform record_floor_event(v_token, jsonb_build_object('event_type', 'system.synthetic',
      'idempotency_key', 'floor-key-0003', 'facility_id', v_fac_a2));
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 6 FAILED: worker wrote to A-2 (%)', v_hint; end if;

  -- Floor event types need a device even from the web app
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform record_event(v_org_a, 'inventory.moved', 'web-floor-key-01',
      '{"sku_id":"s1","quantity":1,"from_location_id":"a","to_location_id":"b"}', v_fac_a1);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'device_required' then raise exception 'TEST 6 FAILED: floor type without device (%)', v_hint; end if;

  -- get_floor_session returns identity for the UI
  set local role anon;
  v_results := get_floor_session(v_token);
  reset role;
  if v_results ->> 'worker_code' <> 'W-001' or (v_results ->> 'organization_id')::uuid <> v_org_a
     or not (v_results -> 'device' ->> 'is_authorized')::boolean then
    raise exception 'TEST 6 FAILED: get_floor_session returned %', v_results;
  end if;
  raise notice '✓ TEST 6 PASSED: Floor login creates hashed session + pending device; events take org/actor/device/facility from the session.';

  -- ---------------------------------------------------------------
  -- TEST 7: Session tampering, logout, expiry and device retirement
  -- ---------------------------------------------------------------
  v_hint := null;
  begin
    set local role anon;
    perform record_floor_event(v_token || '0', '{"event_type":"system.synthetic","idempotency_key":"floor-key-tamper"}');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'session_invalid' then raise exception 'TEST 7 FAILED: forged token accepted (%)', v_hint; end if;

  set local role anon;
  if get_floor_session('not-a-real-token') is not null then
    raise exception 'TEST 7 FAILED: unknown token returned a session';
  end if;
  reset role;

  -- Retiring the device ends the session
  perform set_config('request.jwt.claims', json_build_object('sub', v_super_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform retire_device(v_device);
  reset role;
  perform set_config('request.jwt.claims', '', true);
  v_hint := null;
  begin
    set local role anon;
    perform record_floor_event(v_token, '{"event_type":"system.synthetic","idempotency_key":"floor-key-retired"}');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'session_invalid' then raise exception 'TEST 7 FAILED: retired device session still valid (%)', v_hint; end if;

  -- Retired device cannot log in again
  set local role anon;
  v_login := floor_worker_login('vp_badge_test_wes', '1234', 'device-uuid-terminal-01');
  reset role;
  if (v_login ->> 'ok')::boolean then raise exception 'TEST 7 FAILED: retired device logged in'; end if;

  -- Logout and expiry
  set local role anon;
  v_login := floor_worker_login('vp_badge_test_wes', '1234', null);
  v_token := v_login ->> 'session_token';
  perform end_floor_session(v_token);
  reset role;
  if exists (select 1 from public.floor_sessions where token_hash = _hash_session_token(v_token) and revoked_at is null) then
    raise exception 'TEST 7 FAILED: logout did not revoke the session';
  end if;

  set local role anon;
  v_login := floor_worker_login('vp_badge_test_wes', '1234', null);
  reset role;
  update public.floor_sessions set expires_at = now() - interval '1 minute'
  where token_hash = _hash_session_token(v_login ->> 'session_token');
  set local role anon;
  if get_floor_session(v_login ->> 'session_token') is not null then
    raise exception 'TEST 7 FAILED: expired session still valid';
  end if;
  reset role;
  raise notice '✓ TEST 7 PASSED: Forged, expired, logged-out and retired-device sessions rejected.';

  -- ---------------------------------------------------------------
  -- TEST 8: Batches
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_results := record_events(v_org_a, jsonb_build_array(
    jsonb_build_object('event_type', 'system.synthetic', 'idempotency_key', 'batch-key-0001', 'facility_id', v_fac_a1),
    jsonb_build_object('event_type', 'system.synthetic', 'idempotency_key', 'idem-key-0001', 'facility_id', v_fac_a1),
    jsonb_build_object('event_type', 'inventory.adjusted', 'idempotency_key', 'batch-key-0003', 'payload', '{}'::jsonb),
    jsonb_build_object('event_type', 'system.synthetic', 'idempotency_key', 'batch-key-0004', 'facility_id', v_fac_b1)
  ));
  reset role;

  if v_results -> 0 ->> 'status' <> 'created'
     or v_results -> 1 ->> 'status' <> 'duplicate'
     or v_results -> 2 ->> 'code' <> 'invalid_payload'
     or v_results -> 3 ->> 'code' <> 'scope_denied'
     or (v_results -> 1 ->> 'event_id')::uuid <> (select id from public.warehouse_events where idempotency_key = 'idem-key-0001') then
    raise exception 'TEST 8 FAILED: unexpected batch results %', v_results;
  end if;
  if not exists (select 1 from public.warehouse_events where idempotency_key = 'batch-key-0001') then
    raise exception 'TEST 8 FAILED: valid event rolled back by a failing sibling';
  end if;

  select jsonb_agg(jsonb_build_object('event_type', 'system.synthetic', 'idempotency_key', 'too-many-' || g))
    into v_batch from generate_series(1, 101) g;
  v_hint := null;
  begin
    set local role authenticated;
    perform record_events(v_org_a, v_batch);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'batch_too_large' then raise exception 'TEST 8 FAILED: 101-event batch accepted (%)', v_hint; end if;
  raise notice '✓ TEST 8 PASSED: Batch returns per-event created/duplicate/error results; failures are isolated; 100 max.';

  -- ---------------------------------------------------------------
  -- TEST 9: Device management permissions
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform register_device(v_org_a, 'device-uuid-sneaky', 'Sneaky');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 9 FAILED: floor worker registered a device (%)', v_hint; end if;

  -- Supervisor registers; owner B cannot touch it; direct table writes are blocked
  perform set_config('request.jwt.claims', json_build_object('sub', v_super_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_device := register_device(v_org_a, 'device-uuid-terminal-02', 'Pick cart 2', 'tablet', v_fac_a1);
  reset role;
  if not (select is_authorized from public.floor_devices where id = v_device) then
    raise exception 'TEST 9 FAILED: registered device should be authorized';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform update_device(v_device, 'Hijacked', null, true);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 9 FAILED: other org updated device (%)', v_hint; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform update_device(v_device, null, v_fac_b1, null);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 9 FAILED: assigned facility from another org (%)', v_hint; end if;

  v_blocked := false;
  begin
    set local role authenticated;
    update public.floor_devices set is_authorized = true where id = v_device;
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 9 FAILED: direct device update must be denied'; end if;
  raise notice '✓ TEST 9 PASSED: Only supervisors+ of the same org manage devices; direct writes denied.';

  -- ---------------------------------------------------------------
  -- TEST 10: record_system_event is service_role only
  -- ---------------------------------------------------------------
  v_blocked := false;
  begin
    set local role authenticated;
    perform record_system_event(v_org_a, '{"event_type":"system.synthetic","idempotency_key":"sys-key-0001"}');
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 10 FAILED: authenticated executed record_system_event'; end if;

  set local role service_role;
  v_results := record_system_event(v_org_a, jsonb_build_object('event_type', 'system.synthetic',
    'idempotency_key', 'sys-key-migration-01', 'occurred_at', '2021-07-04T10:00:00Z'), 'migration');
  reset role;
  select * into v_event from public.warehouse_events where id = (v_results ->> 'event_id')::uuid;
  if v_event.source <> 'migration' or v_event.actor_user_id is not null or v_event.occurred_at <> '2021-07-04T10:00:00Z' then
    raise exception 'TEST 10 FAILED: migration event stored incorrectly: %', row_to_json(v_event);
  end if;
  raise notice '✓ TEST 10 PASSED: System/migration events via service_role only, with historical timestamps.';

  -- ---------------------------------------------------------------
  -- TEST 11: Block / unblock lifecycle
  -- ---------------------------------------------------------------
  -- v_device is 'Pick cart 2' (approved, facility A-1) from TEST 9
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  v_login := floor_worker_login('vp_badge_test_wes', '1234', 'device-uuid-terminal-02');
  reset role;
  v_token := v_login ->> 'session_token';
  set local role anon;
  perform record_floor_event(v_token, '{"event_type":"system.synthetic","idempotency_key":"block-key-0001"}');
  reset role;

  -- Supervisor blocks: who/when recorded, session ended
  perform set_config('request.jwt.claims', json_build_object('sub', v_super_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform update_device(v_device, null, null, false);
  reset role;
  if (select blocked_by from public.floor_devices where id = v_device) is distinct from v_super_a
     or (select blocked_at from public.floor_devices where id = v_device) is null then
    raise exception 'TEST 11 FAILED: block should record blocked_by/blocked_at';
  end if;
  set local role anon;
  if get_floor_session(v_token) is not null then
    raise exception 'TEST 11 FAILED: blocking must end the device''s sessions';
  end if;

  -- Worker can still sign in (to see the message) but scans fail with device_blocked
  v_login := floor_worker_login('vp_badge_test_wes', '1234', 'device-uuid-terminal-02');
  reset role;
  if not (v_login -> 'device' ->> 'is_blocked')::boolean then
    raise exception 'TEST 11 FAILED: login should report the device as blocked: %', v_login;
  end if;
  v_token := v_login ->> 'session_token';
  v_hint := null;
  begin
    set local role anon;
    perform record_floor_event(v_token, '{"event_type":"system.synthetic","idempotency_key":"block-key-0002"}');
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'device_blocked' then raise exception 'TEST 11 FAILED: blocked device recorded (%)', v_hint; end if;

  -- Unblock clears the block and scans work again
  perform set_config('request.jwt.claims', json_build_object('sub', v_super_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform update_device(v_device, null, null, true);
  reset role;
  if (select blocked_at from public.floor_devices where id = v_device) is not null then
    raise exception 'TEST 11 FAILED: unblock should clear blocked_at';
  end if;
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  perform record_floor_event(v_token, '{"event_type":"system.synthetic","idempotency_key":"block-key-0003"}');
  reset role;
  raise notice '✓ TEST 11 PASSED: Block records who/when, ends sessions, rejects scans as device_blocked; unblock restores.';

  raise notice '=======================================================';
  raise notice '>>> ALL SPRINT 2 · STEP 2 EVENT WRITE API TESTS PASSED <<<';
  raise notice '=======================================================';
end $$;

rollback;
