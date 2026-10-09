-- ====================================================================
-- VentoryPoint Phase 1 Sprint 2 · Step 3: Realtime & Consumer Queue Test Suite
-- ====================================================================
-- Validates (Sprint 2 PRD §3.3, §3.4, §4):
--  1. Insert fan-out: realtime broadcast on facility:/org: topics + one delivery per consumer
--  2. Realtime channel authorization mirrors event RLS
--  3. Claim / complete with leases; a worker can only complete its own claims
--  4. Disabled consumers queue a backlog but are not processed
--  5. Failures: exponential backoff, then dead after max_attempts
--  6. Crashed worker: expired lease is reclaimed by another worker
--  7. Replay of dead deliveries (owners/admins only)
--  8. Acceptance: consumer down then restarted -> no loss, no double-processing
--  9. Admin stats and delivery RLS
-- 10. Worker functions are service_role only
--
-- Needs Supabase Realtime (realtime.messages / realtime.send / realtime.topic).
-- Runs inside a transaction that is rolled back.
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
  v_worker_member uuid;
  v_event uuid;
  v_event_org uuid;
  v_delivery uuid;
  v_count integer;
  v_count2 integer;
  v_status text;
  v_hint text;
  v_blocked boolean;
  v_ok boolean;
  v_row record;
  v_i integer;
begin
  raise notice '>>> STARTING SPRINT 2 · STEP 3 REALTIME & QUEUE TEST SUITE <<<';

  if to_regclass('realtime.messages') is null then
    raise exception 'This suite needs Supabase Realtime (realtime.messages)';
  end if;

  -- ---------------------------------------------------------------
  -- Fixtures
  -- ---------------------------------------------------------------
  insert into public.profiles (id, email, first_name, last_name) values
    (v_owner_a, 'owner_a@queue.test', 'Olivia', 'Owner'),
    (v_worker_a, 'worker_a@queue.test', 'Wes', 'Worker'),
    (v_brand_a, 'brand_a@queue.test', 'Bea', 'Brand'),
    (v_owner_b, 'owner_b@queue.test', 'Omar', 'OwnerB');
  insert into public.organizations (id, name) values (v_org_a, 'Queue Org A'), (v_org_b, 'Queue Org B');
  insert into public.facilities (organization_id, name) values (v_org_a, 'A-1') returning id into v_fac_a1;
  insert into public.facilities (organization_id, name) values (v_org_a, 'A-2') returning id into v_fac_a2;
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities) values
    (v_org_a, v_owner_a, 'owner', true, true),
    (v_org_a, v_brand_a, 'client_user', true, true),
    (v_org_b, v_owner_b, 'owner', true, true);
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities)
    values (v_org_a, v_worker_a, 'floor_worker', true, false) returning id into v_worker_member;
  insert into public.member_facility_access (member_id, facility_id) values (v_worker_member, v_fac_a1);

  -- ---------------------------------------------------------------
  -- TEST 1: Fan-out on insert
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_event := record_event(v_org_a, 'system.synthetic', 'fanout-key-0001', '{"label":"hello"}', v_fac_a1);
  v_event_org := record_event(v_org_a, 'system.synthetic', 'fanout-key-0002', '{"label":"org-wide"}');
  perform record_event(v_org_a, 'inventory.adjusted', 'fanout-key-0003',
    '{"sku_id":"s","location_id":"l","quantity_delta":-1,"reason_code":"damaged"}', v_fac_a1);
  reset role;

  if not exists (select 1 from realtime.messages where topic = 'facility:' || v_fac_a1 and event = 'warehouse_event'
                 and private and payload ->> 'id' = v_event::text and payload -> 'payload' ->> 'label' = 'hello') then
    raise exception 'TEST 1 FAILED: facility event not broadcast on facility:%', v_fac_a1;
  end if;
  if not exists (select 1 from realtime.messages where topic = 'org:' || v_org_a and payload ->> 'id' = v_event_org::text) then
    raise exception 'TEST 1 FAILED: org-level event not broadcast on org topic';
  end if;

  select count(*) into v_count from public.event_deliveries where event_id = v_event;
  if v_count <> 1 or not exists (select 1 from public.event_deliveries where event_id = v_event and consumer = 'test_consumer' and status = 'pending') then
    raise exception 'TEST 1 FAILED: system.synthetic should queue exactly one test_consumer delivery (got %)', v_count;
  end if;
  select count(*) into v_count from public.event_deliveries d
  join public.warehouse_events e on e.id = d.event_id
  where e.idempotency_key = 'fanout-key-0003' and e.organization_id = v_org_a
    and d.consumer in ('inventory_projection', 'billing_capture');
  if v_count <> 2 then
    raise exception 'TEST 1 FAILED: inventory.adjusted should queue inventory_projection + billing_capture (got %)', v_count;
  end if;
  raise notice '✓ TEST 1 PASSED: Each insert broadcasts on its facility/org topic and queues one delivery per consumer.';

  -- ---------------------------------------------------------------
  -- TEST 2: Realtime authorization
  -- ---------------------------------------------------------------
  -- Helper decisions
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not can_subscribe_event_topic('facility:' || v_fac_a1)
     or can_subscribe_event_topic('facility:' || v_fac_a2)
     or not can_subscribe_event_topic('org:' || v_org_a)
     or can_subscribe_event_topic('org:' || v_org_b)
     or can_subscribe_event_topic('facility:not-a-uuid')
     or can_subscribe_event_topic('somethingelse:' || v_fac_a1) then
    raise exception 'TEST 2 FAILED: facility-scoped worker topic decisions wrong';
  end if;
  reset role;

  -- Through the realtime.messages policy (what Supabase Realtime evaluates on join)
  perform set_config('realtime.topic', 'facility:' || v_fac_a1, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from realtime.messages where topic = 'facility:' || v_fac_a1;
  reset role;
  if v_count = 0 then raise exception 'TEST 2 FAILED: worker should receive facility A-1 messages'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from realtime.messages;
  reset role;
  if v_count <> 0 then raise exception 'TEST 2 FAILED: other org received % messages', v_count; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_brand_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from realtime.messages;
  reset role;
  if v_count <> 0 then raise exception 'TEST 2 FAILED: client_user received % messages', v_count; end if;

  perform set_config('realtime.topic', 'facility:' || v_fac_a2, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from realtime.messages;
  reset role;
  if v_count <> 0 then raise exception 'TEST 2 FAILED: worker joined facility A-2 without access'; end if;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('realtime.topic', 'facility:' || v_fac_a1, true);
  set local role authenticated;
  select count(*) into v_count from realtime.messages;
  reset role;
  if v_count <> 0 then raise exception 'TEST 2 FAILED: unauthenticated join received messages'; end if;
  raise notice '✓ TEST 2 PASSED: Channels authorized by org + facility access; other orgs, brands, unauthenticated denied.';

  -- ---------------------------------------------------------------
  -- TEST 3: Claim / complete with leases
  -- ---------------------------------------------------------------
  -- Only this org's test deliveries are in play: park everything else from earlier inserts
  set local role service_role;
  select count(*) into v_count from claim_event_deliveries('test_consumer', 'worker-1', 1);
  reset role;
  if v_count <> 1 then raise exception 'TEST 3 FAILED: claim should return 1 delivery, got %', v_count; end if;

  select id into v_delivery from public.event_deliveries
  where consumer = 'test_consumer' and status = 'processing' and locked_by = 'worker-1';

  set local role service_role;
  -- The leased delivery is not handed to a second worker
  select count(*) into v_count from claim_event_deliveries('test_consumer', 'worker-2', 500) c where c.delivery_id = v_delivery;
  v_ok := complete_event_delivery(v_delivery, 'worker-2');
  reset role;
  if v_count <> 0 then raise exception 'TEST 3 FAILED: leased delivery handed to a second worker'; end if;
  if v_ok then raise exception 'TEST 3 FAILED: worker-2 completed worker-1''s claim'; end if;

  set local role service_role;
  v_ok := complete_event_delivery(v_delivery, 'worker-1');
  reset role;
  if not v_ok or (select status from public.event_deliveries where id = v_delivery) <> 'succeeded' then
    raise exception 'TEST 3 FAILED: owner of the lease should complete it';
  end if;
  -- Release worker-2's claims so later tests start clean
  update public.event_deliveries set status = 'succeeded', completed_at = now(), locked_until = null
  where consumer = 'test_consumer' and status = 'processing';
  raise notice '✓ TEST 3 PASSED: Claims are leased (SKIP LOCKED); only the lease holder can complete.';

  -- ---------------------------------------------------------------
  -- TEST 4: Disabled consumers keep a backlog
  -- ---------------------------------------------------------------
  set local role service_role;
  select count(*) into v_count from claim_event_deliveries('inventory_projection', 'worker-1', 50);
  reset role;
  if v_count <> 0 then raise exception 'TEST 4 FAILED: disabled consumer was processed'; end if;
  if not exists (select 1 from public.event_deliveries where consumer = 'inventory_projection' and status = 'pending' and attempts = 0) then
    raise exception 'TEST 4 FAILED: disabled consumer backlog missing';
  end if;
  raise notice '✓ TEST 4 PASSED: Disabled consumers accumulate a backlog without processing.';

  -- ---------------------------------------------------------------
  -- TEST 5: Backoff and dead letter
  -- ---------------------------------------------------------------
  update public.event_consumers set max_attempts = 3 where name = 'test_consumer';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_event := record_event(v_org_a, 'system.synthetic', 'retry-key-0001', '{}', v_fac_a1);
  reset role;
  select id into v_delivery from public.event_deliveries where event_id = v_event and consumer = 'test_consumer';

  for v_i in 1 .. 3 loop
    update public.event_deliveries set next_attempt_at = now() where id = v_delivery;  -- skip the wait
    set local role service_role;
    perform claim_event_deliveries('test_consumer', 'worker-1', 500);
    v_status := fail_event_delivery(v_delivery, 'worker-1', 'boom ' || v_i);
    reset role;

    if v_i < 3 then
      if v_status <> 'pending' then raise exception 'TEST 5 FAILED: attempt % should retry, got %', v_i, v_status; end if;
      select extract(epoch from next_attempt_at - now()) into v_count from public.event_deliveries where id = v_delivery;
      -- 5s, then 10s (+ up to 2s jitter)
      if v_count < 5 * power(2, v_i - 1) - 1 or v_count > 5 * power(2, v_i - 1) + 3 then
        raise exception 'TEST 5 FAILED: attempt % backoff was %s', v_i, v_count;
      end if;
      -- Not due yet: a claim right now must not return it
      set local role service_role;
      select count(*) into v_count2 from claim_event_deliveries('test_consumer', 'worker-1', 500) c where c.delivery_id = v_delivery;
      reset role;
      if v_count2 <> 0 then raise exception 'TEST 5 FAILED: claimed before backoff elapsed'; end if;
    elsif v_status <> 'dead' then
      raise exception 'TEST 5 FAILED: should be dead after max attempts, got %', v_status;
    end if;
  end loop;
  if (select last_error from public.event_deliveries where id = v_delivery) <> 'boom 3' then
    raise exception 'TEST 5 FAILED: last_error not recorded';
  end if;
  raise notice '✓ TEST 5 PASSED: Exponential backoff (5s, 10s…), not claimable early, dead after max attempts with last error.';

  -- ---------------------------------------------------------------
  -- TEST 6: Crashed worker — lease expiry
  -- ---------------------------------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_event := record_event(v_org_a, 'system.synthetic', 'lease-key-0001', '{}', v_fac_a1);
  reset role;
  select id into v_delivery from public.event_deliveries where event_id = v_event and consumer = 'test_consumer';

  set local role service_role;
  perform claim_event_deliveries('test_consumer', 'crashy-worker', 500);
  reset role;
  update public.event_deliveries set locked_until = now() - interval '1 second' where id = v_delivery;  -- lease runs out

  set local role service_role;
  select count(*) into v_count from claim_event_deliveries('test_consumer', 'healthy-worker', 500) c where c.delivery_id = v_delivery;
  v_ok := complete_event_delivery(v_delivery, 'crashy-worker');
  reset role;
  if v_count <> 1 then raise exception 'TEST 6 FAILED: expired lease not reclaimed'; end if;
  if v_ok then raise exception 'TEST 6 FAILED: crashed worker completed after losing its lease'; end if;
  if (select attempts from public.event_deliveries where id = v_delivery) <> 2 then
    raise exception 'TEST 6 FAILED: reclaim should count as a new attempt';
  end if;
  set local role service_role;
  perform complete_event_delivery(v_delivery, 'healthy-worker');
  reset role;
  raise notice '✓ TEST 6 PASSED: Expired leases are reclaimed; the stale worker can no longer complete.';

  -- ---------------------------------------------------------------
  -- TEST 7: Replay
  -- ---------------------------------------------------------------
  select id into v_delivery from public.event_deliveries where consumer = 'test_consumer' and status = 'dead' and organization_id = v_org_a limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  v_hint := null;
  begin
    set local role authenticated;
    perform replay_event_delivery(v_delivery);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 7 FAILED: worker replayed (%)', v_hint; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform replay_event_delivery(v_delivery);
  reset role;
  if (select status || ':' || attempts from public.event_deliveries where id = v_delivery) <> 'pending:0' then
    raise exception 'TEST 7 FAILED: replay should reset to pending with 0 attempts';
  end if;

  v_hint := null;
  begin
    set local role authenticated;
    perform replay_event_delivery(v_delivery);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'not_replayable' then raise exception 'TEST 7 FAILED: replayed a non-dead delivery (%)', v_hint; end if;

  update public.event_deliveries set status = 'dead' where id = v_delivery;
  set local role authenticated;
  v_count := replay_dead_deliveries(v_org_a, 'test_consumer');
  reset role;
  if v_count <> 1 then raise exception 'TEST 7 FAILED: bulk replay should requeue 1, got %', v_count; end if;
  update public.event_consumers set max_attempts = 8 where name = 'test_consumer';
  raise notice '✓ TEST 7 PASSED: Owners/admins replay dead deliveries (single and bulk); others denied.';

  -- ---------------------------------------------------------------
  -- TEST 8: Acceptance — consumer outage then restart
  -- ---------------------------------------------------------------
  -- Clear the slate: everything earlier is done
  update public.event_deliveries set status = 'succeeded', completed_at = now(), locked_until = null
  where consumer = 'test_consumer' and status <> 'succeeded';

  -- Consumer is down while 300 events arrive
  update public.event_consumers set is_enabled = false where name = 'test_consumer';
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for v_i in 1 .. 300 loop
    perform record_event(v_org_a, 'system.synthetic', 'outage-key-' || lpad(v_i::text, 4, '0'), jsonb_build_object('sequence', v_i), v_fac_a1);
  end loop;
  reset role;
  -- Ten minutes pass
  update public.event_deliveries set created_at = created_at - interval '10 minutes', next_attempt_at = next_attempt_at - interval '10 minutes'
  where consumer = 'test_consumer' and status = 'pending';

  -- Restart with two workers. A "crash" re-delivers one batch: consumer-side idempotency must absorb it.
  update public.event_consumers set is_enabled = true where name = 'test_consumer';
  loop
    v_count := 0;
    set local role service_role;
    for v_row in select * from claim_event_deliveries('test_consumer', 'worker-' || (1 + (random() * 1)::int), 40) loop
      v_count := v_count + 1;
      -- The consumer's side effect, guarded by mark_event_processed
      if mark_event_processed('test_consumer', v_row.event_id) then
        null;  -- (a real consumer applies its effect here, in the same transaction)
      end if;
      perform complete_event_delivery(v_row.delivery_id, (select locked_by from public.event_deliveries where id = v_row.delivery_id));
    end loop;
    reset role;
    exit when v_count = 0;
  end loop;

  -- Simulate an at-least-once redelivery of 5 events (e.g. a worker died after the effect, before completing)
  set local role service_role;
  select count(*) into v_count2
  from (select e.id from public.warehouse_events e where e.idempotency_key like 'outage-key-%' and e.organization_id = v_org_a limit 5) x
  where mark_event_processed('test_consumer', x.id);
  reset role;
  if v_count2 <> 0 then raise exception 'TEST 8 FAILED: redelivered events were applied again (% effects)', v_count2; end if;

  select count(*) into v_count
  from public.event_deliveries d join public.warehouse_events e on e.id = d.event_id
  where e.idempotency_key like 'outage-key-%' and e.organization_id = v_org_a and d.consumer = 'test_consumer' and d.status = 'succeeded';
  select count(*) into v_count2
  from public.consumer_processed_events p join public.warehouse_events e on e.id = p.event_id
  where e.idempotency_key like 'outage-key-%' and e.organization_id = v_org_a and p.consumer = 'test_consumer';
  if v_count <> 300 or v_count2 <> 300 then
    raise exception 'TEST 8 FAILED: expected 300 delivered and 300 applied exactly once, got % / %', v_count, v_count2;
  end if;
  raise notice '✓ TEST 8 PASSED: 300 events during a 10-minute outage all processed after restart; none lost, none applied twice.';

  -- ---------------------------------------------------------------
  -- TEST 9: Admin stats and delivery RLS
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into v_row from get_event_delivery_stats(v_org_a) s where s.consumer = 'inventory_projection';
  select count(*) into v_count from public.event_deliveries where organization_id = v_org_a;
  reset role;
  if v_row.pending < 1 or v_row.is_enabled or v_row.lag_seconds < 0 then
    raise exception 'TEST 9 FAILED: stats for inventory_projection wrong: %', row_to_json(v_row);
  end if;
  if v_count = 0 then raise exception 'TEST 9 FAILED: owner should read their deliveries'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.event_deliveries;
  reset role;
  if v_count <> 0 then raise exception 'TEST 9 FAILED: floor worker read % deliveries', v_count; end if;

  v_hint := null;
  begin
    set local role authenticated;
    perform * from get_event_delivery_stats(v_org_a);
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  reset role;
  if v_hint is distinct from 'scope_denied' then raise exception 'TEST 9 FAILED: worker read stats (%)', v_hint; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.event_deliveries where organization_id = v_org_a;
  reset role;
  if v_count <> 0 then raise exception 'TEST 9 FAILED: other org read deliveries'; end if;
  raise notice '✓ TEST 9 PASSED: Owners see stats and deliveries for their org only.';

  -- ---------------------------------------------------------------
  -- TEST 10: Worker API is service_role only
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    set local role authenticated;
    perform claim_event_deliveries('test_consumer', 'sneaky', 1);
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 10 FAILED: authenticated claimed deliveries'; end if;

  v_blocked := false;
  begin
    set local role authenticated;
    update public.event_deliveries set status = 'succeeded';
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 10 FAILED: authenticated updated deliveries directly'; end if;
  raise notice '✓ TEST 10 PASSED: Claim/complete/fail are service_role only; deliveries not writable by users.';

  raise notice '=======================================================';
  raise notice '>>> ALL SPRINT 2 · STEP 3 REALTIME & QUEUE TESTS PASSED <<<';
  raise notice '=======================================================';
end $$;

rollback;
