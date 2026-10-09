-- ====================================================================
-- VentoryPoint Phase 1 Sprint 2 · Step 1: Event Store Test Suite
-- ====================================================================
-- Validates (Sprint 2 PRD §3.1, §4, §5):
--  1. Event catalogue seeded with valid schemas
--  2. Monthly partitions exist and are created on demand
--  3. Append-only: UPDATE / DELETE / TRUNCATE fail, including for service_role
--  4. Idempotency keys unique per organization and linked to their event
--  5. RLS: org + facility isolation, client_user excluded, no direct writes
--  6. Integrity: unknown event types, bad sources and non-object payloads rejected
--
-- Runs inside a transaction that is rolled back: events cannot be deleted,
-- so the suite must never commit fixtures.
-- ====================================================================

begin;

do $$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_owner_a uuid := gen_random_uuid();
  v_worker_a uuid := gen_random_uuid();
  v_brand_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_fac_a1 uuid;
  v_fac_a2 uuid;
  v_fac_b1 uuid;
  v_worker_member uuid;
  v_event_a1 uuid := gen_random_uuid();
  v_event_a2 uuid := gen_random_uuid();
  v_event_org uuid := gen_random_uuid();
  v_event_b1 uuid := gen_random_uuid();
  v_event_b2 uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_count integer;
  v_blocked boolean;
  v_partition text;
begin
  raise notice '>>> STARTING SPRINT 2 · STEP 1 EVENT STORE TEST SUITE <<<';

  -- ---------------------------------------------------------------
  -- Fixtures: two orgs, three facilities, owner / floor worker / brand user
  -- ---------------------------------------------------------------
  insert into public.profiles (id, email, first_name, last_name) values
    (v_owner_a,  'owner_a@events.test',  'Olivia', 'Owner'),
    (v_worker_a, 'worker_a@events.test', 'Wes',    'Worker'),
    (v_brand_a,  'brand_a@events.test',  'Bea',    'Brand'),
    (v_owner_b,  'owner_b@events.test',  'Omar',   'OwnerB');

  insert into public.organizations (id, name) values
    (v_org_a, 'Events Org A'),
    (v_org_b, 'Events Org B');

  insert into public.facilities (organization_id, name) values (v_org_a, 'A-1') returning id into v_fac_a1;
  insert into public.facilities (organization_id, name) values (v_org_a, 'A-2') returning id into v_fac_a2;
  insert into public.facilities (organization_id, name) values (v_org_b, 'B-1') returning id into v_fac_b1;

  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities) values
    (v_org_a, v_owner_a, 'owner', true, true),
    (v_org_a, v_brand_a, 'client_user', true, true),
    (v_org_b, v_owner_b, 'owner', true, true);
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities)
    values (v_org_a, v_worker_a, 'floor_worker', true, false)
    returning id into v_worker_member;
  -- Floor worker can only access facility A-1
  insert into public.member_facility_access (member_id, facility_id) values (v_worker_member, v_fac_a1);

  -- Events are inserted directly here (record_event arrives in Step 2)
  insert into public.warehouse_events
    (id, organization_id, facility_id, event_type, entity_type, payload, source, idempotency_key, occurred_at)
  values
    (v_event_a1,  v_org_a, v_fac_a1, 'system.synthetic', 'synthetic', '{"label":"a1"}',  'system', 'test-key-a1', v_now),
    (v_event_a2,  v_org_a, v_fac_a2, 'system.synthetic', 'synthetic', '{"label":"a2"}',  'system', 'test-key-a2', v_now),
    (v_event_org, v_org_a, null,     'system.synthetic', 'synthetic', '{"label":"org"}', 'system', 'test-key-org', v_now),
    (v_event_b1,  v_org_b, v_fac_b1, 'system.synthetic', 'synthetic', '{"label":"b1"}',  'system', 'test-key-b1', v_now);

  insert into public.event_idempotency_keys (organization_id, idempotency_key, event_id, occurred_at) values
    (v_org_a, 'test-key-a1', v_event_a1, v_now),
    (v_org_b, 'test-key-b1', v_event_b1, v_now);

  -- ---------------------------------------------------------------
  -- TEST 1: Catalogue seeded
  -- ---------------------------------------------------------------
  select count(*) into v_count from public.event_type_registry
  where event_type in ('receipt.line_received', 'putaway.completed', 'inventory.moved', 'inventory.adjusted',
                       'pick.confirmed', 'pack.carton_closed', 'shipment.shipped', 'count.submitted');
  if v_count <> 8 then
    raise exception 'TEST 1 FAILED: expected the 8 PRD event types in the registry, found %', v_count;
  end if;
  if exists (select 1 from public.event_type_registry where jsonb_typeof(payload_schema) <> 'object'
             or payload_schema ->> 'type' <> 'object') then
    raise exception 'TEST 1 FAILED: every payload_schema must describe a JSON object';
  end if;
  raise notice '✓ TEST 1 PASSED: Phase 1 event catalogue seeded with object schemas.';

  -- ---------------------------------------------------------------
  -- TEST 2: Partitions
  -- ---------------------------------------------------------------
  if to_regclass(format('public.warehouse_events_y%s', to_char(now(), 'YYYY"m"MM'))) is null
     or to_regclass(format('public.warehouse_events_y%s', to_char(now() + interval '3 months', 'YYYY"m"MM'))) is null then
    raise exception 'TEST 2 FAILED: current and +3 month partitions should exist';
  end if;

  v_blocked := false;
  begin
    insert into public.warehouse_events (organization_id, event_type, entity_type, idempotency_key, occurred_at)
    values (v_org_a, 'system.synthetic', 'synthetic', 'test-key-2019', '2019-06-15');
  exception when others then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST 2 FAILED: insert outside existing partitions should fail';
  end if;

  v_partition := public.ensure_warehouse_event_partition('2019-06-15');
  if v_partition <> 'warehouse_events_y2019m06' or public.ensure_warehouse_event_partition('2019-06-01') <> v_partition then
    raise exception 'TEST 2 FAILED: ensure_warehouse_event_partition should create and then reuse %', v_partition;
  end if;
  insert into public.warehouse_events (organization_id, event_type, entity_type, idempotency_key, occurred_at, source)
  values (v_org_a, 'system.synthetic', 'synthetic', 'test-key-2019', '2019-06-15', 'migration');
  raise notice '✓ TEST 2 PASSED: Monthly partitions pre-created and created on demand (back-dated migration import).';

  -- ---------------------------------------------------------------
  -- TEST 3: Append-only, even for the table owner and service_role
  -- ---------------------------------------------------------------
  v_blocked := false;
  begin
    update public.warehouse_events set payload = '{"label":"tampered"}' where id = v_event_a1;
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 3 FAILED: UPDATE by owner must fail'; end if;

  v_blocked := false;
  begin
    delete from public.warehouse_events where id = v_event_a1;
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 3 FAILED: DELETE by owner must fail'; end if;

  v_blocked := false;
  begin
    truncate public.warehouse_events;
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 3 FAILED: TRUNCATE of the parent must fail'; end if;

  v_blocked := false;
  begin
    execute format('truncate public.%I', 'warehouse_events_y' || to_char(now(), 'YYYY"m"MM'));
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 3 FAILED: TRUNCATE of a partition must fail'; end if;

  v_blocked := false;
  begin
    set local role service_role;
    update public.warehouse_events set payload = '{}' where id = v_event_a1;
  exception when others then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 3 FAILED: UPDATE via service_role must fail'; end if;

  v_blocked := false;
  begin
    set local role service_role;
    delete from public.warehouse_events where id = v_event_a1;
  exception when others then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 3 FAILED: DELETE via service_role must fail'; end if;

  v_blocked := false;
  begin
    delete from public.event_idempotency_keys where event_id = v_event_a1;
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 3 FAILED: idempotency keys must be append-only too'; end if;

  -- TRUNCATE is also blocked by the idempotency FK, so check the guard triggers directly:
  -- the parent and every partition must carry one (partitions don't inherit TRUNCATE triggers).
  if not exists (select 1 from pg_trigger where tgrelid = 'public.warehouse_events'::regclass
                 and tgname = 'trg_warehouse_events_no_truncate') then
    raise exception 'TEST 3 FAILED: parent TRUNCATE guard trigger missing';
  end if;
  select count(*) into v_count
  from pg_inherits i
  where i.inhparent = 'public.warehouse_events'::regclass
    and not exists (select 1 from pg_trigger t where t.tgrelid = i.inhrelid and t.tgname = 'trg_no_truncate');
  if v_count > 0 then
    raise exception 'TEST 3 FAILED: % partition(s) missing the TRUNCATE guard trigger', v_count;
  end if;

  if (select payload ->> 'label' from public.warehouse_events where id = v_event_a1) <> 'a1' then
    raise exception 'TEST 3 FAILED: event payload changed';
  end if;
  raise notice '✓ TEST 3 PASSED: UPDATE/DELETE/TRUNCATE rejected for owner and service_role.';

  -- ---------------------------------------------------------------
  -- TEST 4: Idempotency keys
  -- ---------------------------------------------------------------
  v_blocked := false;
  begin
    insert into public.event_idempotency_keys (organization_id, idempotency_key, event_id, occurred_at)
    values (v_org_a, 'test-key-a1', v_event_a2, v_now);
  exception when unique_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 4 FAILED: duplicate key within an org must be rejected'; end if;

  -- Same key text in another org is a different key
  insert into public.warehouse_events (id, organization_id, facility_id, event_type, entity_type, source, idempotency_key, occurred_at)
  values (v_event_b2, v_org_b, v_fac_b1, 'system.synthetic', 'synthetic', 'system', 'test-key-a1', v_now);
  insert into public.event_idempotency_keys (organization_id, idempotency_key, event_id, occurred_at)
  values (v_org_b, 'test-key-a1', v_event_b2, v_now);
  if (select count(*) from public.event_idempotency_keys where idempotency_key = 'test-key-a1') <> 2 then
    raise exception 'TEST 4 FAILED: the same key text should be allowed once per organization';
  end if;

  v_blocked := false;
  begin
    insert into public.event_idempotency_keys (organization_id, idempotency_key, event_id, occurred_at)
    values (v_org_a, 'test-key-ghost', gen_random_uuid(), v_now);
  exception when foreign_key_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 4 FAILED: key must reference a real event'; end if;
  raise notice '✓ TEST 4 PASSED: Idempotency keys unique per org and linked to their event.';

  -- ---------------------------------------------------------------
  -- TEST 5: Row Level Security
  -- ---------------------------------------------------------------
  -- 5.1 Owner A: all org A events (both facilities + org-level), nothing from org B
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.warehouse_events where id in (v_event_a1, v_event_a2, v_event_org, v_event_b1);
  reset role;
  if v_count <> 3 then raise exception 'TEST 5.1 FAILED: owner A should see 3 events, saw %', v_count; end if;

  -- 5.2 Floor worker A: facility A-1 + org-level only
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.warehouse_events where id in (v_event_a1, v_event_a2, v_event_org, v_event_b1);
  reset role;
  if v_count <> 2 then raise exception 'TEST 5.2 FAILED: facility-scoped worker should see 2 events, saw %', v_count; end if;

  -- 5.3 Brand (client_user) sees nothing until per-client scoping exists
  perform set_config('request.jwt.claims', json_build_object('sub', v_brand_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.warehouse_events;
  reset role;
  if v_count <> 0 then raise exception 'TEST 5.3 FAILED: client_user should see 0 events, saw %', v_count; end if;

  -- 5.4 Owner B: only org B
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.warehouse_events where organization_id = v_org_a;
  reset role;
  if v_count <> 0 then raise exception 'TEST 5.4 FAILED: org B owner saw % org A events', v_count; end if;

  -- 5.5 Signed-in users cannot write events or keys directly, or read keys
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    set local role authenticated;
    insert into public.warehouse_events (organization_id, facility_id, event_type, entity_type, idempotency_key, occurred_at)
    values (v_org_a, v_fac_a1, 'system.synthetic', 'synthetic', 'test-key-direct', now());
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 5.5 FAILED: direct INSERT by authenticated must be denied'; end if;

  v_blocked := false;
  begin
    set local role authenticated;
    perform 1 from public.event_idempotency_keys limit 1;
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 5.5 FAILED: authenticated must not read idempotency keys'; end if;

  v_blocked := false;
  begin
    set local role authenticated;
    execute format('select 1 from public.%I limit 1', 'warehouse_events_y' || to_char(now(), 'YYYY"m"MM'));
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 5.5 FAILED: partitions must not be readable directly'; end if;

  -- 5.6 Catalogue is readable by signed-in users but not writable
  set local role authenticated;
  select count(*) into v_count from public.event_type_registry;
  reset role;
  if v_count < 8 then raise exception 'TEST 5.6 FAILED: authenticated should read the catalogue'; end if;

  v_blocked := false;
  begin
    set local role authenticated;
    update public.event_type_registry set is_active = false;
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 5.6 FAILED: authenticated must not modify the catalogue'; end if;

  -- 5.7 Anonymous users see nothing
  perform set_config('request.jwt.claims', '', true);
  v_blocked := false;
  begin
    set local role anon;
    perform 1 from public.warehouse_events limit 1;
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 5.7 FAILED: anon must not read events'; end if;
  raise notice '✓ TEST 5 PASSED: Org/facility isolation, client_user excluded, no direct writes, anon denied.';

  -- ---------------------------------------------------------------
  -- TEST 6: Integrity constraints
  -- ---------------------------------------------------------------
  v_blocked := false;
  begin
    insert into public.warehouse_events (organization_id, event_type, entity_type, idempotency_key, occurred_at)
    values (v_org_a, 'made.up_event', 'synthetic', 'test-key-unknown', now());
  exception when foreign_key_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 6 FAILED: unregistered event type must be rejected'; end if;

  v_blocked := false;
  begin
    insert into public.warehouse_events (organization_id, event_type, entity_type, idempotency_key, occurred_at, payload)
    values (v_org_a, 'system.synthetic', 'synthetic', 'test-key-array', now(), '[1,2]');
  exception when check_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 6 FAILED: non-object payload must be rejected'; end if;

  v_blocked := false;
  begin
    insert into public.warehouse_events (organization_id, event_type, entity_type, idempotency_key, occurred_at, source)
    values (v_org_a, 'system.synthetic', 'synthetic', 'test-key-source', now(), 'carrier-pigeon');
  exception when check_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 6 FAILED: unknown source must be rejected'; end if;

  v_blocked := false;
  begin
    insert into public.warehouse_events (organization_id, event_type, entity_type, idempotency_key, occurred_at)
    values (v_org_a, 'system.synthetic', 'synthetic', 'short', now());
  exception when check_violation then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 6 FAILED: idempotency keys under 8 chars must be rejected'; end if;

  -- Ordering: sequence increases with insert order
  if (select sequence from public.warehouse_events where id = v_event_b1)
     <= (select sequence from public.warehouse_events where id = v_event_a1) then
    raise exception 'TEST 6 FAILED: sequence must increase with insert order';
  end if;
  raise notice '✓ TEST 6 PASSED: Unknown types, bad payloads/sources and short keys rejected; sequence ordered.';

  raise notice '=======================================================';
  raise notice '>>> ALL SPRINT 2 · STEP 1 EVENT STORE TESTS PASSED <<<';
  raise notice '=======================================================';
end $$;

rollback;
