-- ====================================================================
-- VentoryPoint Phase 1 Sprint 2 · Step 4: Configuration Audit Log Test Suite
-- ====================================================================
-- Validates (Sprint 2 PRD §3.6, §4):
--  1. Acceptance: editing a facility's cutoff time logs old/new values and the editor
--  2. Inserts and deletes are logged; org resolved for link tables
--  3. Secrets are redacted (but the change is still recorded)
--  4. Bookkeeping-only updates are not logged; security-relevant ones are
--  5. Changes made through security definer RPCs keep the real actor
--  6. Append-only for everyone, including service_role
--  7. RLS: owners/admins of the org only; nobody writes directly
--
-- Runs inside a transaction that is rolled back.
-- ====================================================================

begin;

do $$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_owner_a uuid := gen_random_uuid();
  v_admin_a uuid := gen_random_uuid();
  v_ops_a uuid := gen_random_uuid();
  v_super_a uuid := gen_random_uuid();
  v_worker_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_fac_a uuid;
  v_client_a uuid;
  v_worker_member uuid;
  v_cred uuid;
  v_device uuid;
  v_entry public.audit_log;
  v_count integer;
  v_blocked boolean;
begin
  raise notice '>>> STARTING SPRINT 2 · STEP 4 AUDIT LOG TEST SUITE <<<';

  -- Fixtures (inserted as the migration/owner role: actor is null for these)
  insert into public.profiles (id, email, first_name, last_name) values
    (v_owner_a, 'owner_a@audit.test', 'Olivia', 'Owner'),
    (v_admin_a, 'admin_a@audit.test', 'Ada', 'Admin'),
    (v_ops_a, 'ops_a@audit.test', 'Oscar', 'Ops'),
    (v_super_a, 'super_a@audit.test', 'Sam', 'Super'),
    (v_worker_a, null, 'Wes', 'Worker'),
    (v_owner_b, 'owner_b@audit.test', 'Omar', 'OwnerB');
  insert into public.organizations (id, name) values (v_org_a, 'Audit Org A'), (v_org_b, 'Audit Org B');
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities) values
    (v_org_a, v_owner_a, 'owner', true, true),
    (v_org_a, v_admin_a, 'admin', true, true),
    (v_org_a, v_ops_a, 'ops_manager', true, true),
    (v_org_a, v_super_a, 'supervisor', true, true),
    (v_org_b, v_owner_b, 'owner', true, true);
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities)
    values (v_org_a, v_worker_a, 'floor_worker', true, false) returning id into v_worker_member;
  insert into public.facilities (organization_id, name, carrier_cutoffs)
    values (v_org_a, 'Newark', '[{"carrier":"UPS","time":"17:00"}]') returning id into v_fac_a;
  insert into public.client_accounts (organization_id, name) values (v_org_a, 'Northwind') returning id into v_client_a;

  -- ---------------------------------------------------------------
  -- TEST 1: Acceptance — facility cutoff edit
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.facilities set carrier_cutoffs = '[{"carrier":"UPS","time":"16:30"}]', updated_at = now() where id = v_fac_a;
  reset role;

  select * into v_entry from public.audit_log
  where table_name = 'facilities' and row_id = v_fac_a::text and action = 'update'
  order by created_at desc limit 1;
  if v_entry.id is null
     or v_entry.changed_fields <> array['carrier_cutoffs']
     or v_entry.before -> 'carrier_cutoffs' -> 0 ->> 'time' <> '17:00'
     or v_entry.after -> 'carrier_cutoffs' -> 0 ->> 'time' <> '16:30'
     or v_entry.actor_user_id <> v_owner_a
     or v_entry.actor_role <> 'authenticated'
     or v_entry.organization_id <> v_org_a then
    raise exception 'TEST 1 FAILED: cutoff edit audit entry wrong: %', row_to_json(v_entry);
  end if;
  raise notice '✓ TEST 1 PASSED: Facility cutoff edit logged with old value, new value and editor (updated_at ignored).';

  -- ---------------------------------------------------------------
  -- TEST 2: Inserts, deletes and link tables
  -- ---------------------------------------------------------------
  insert into public.client_facilities (client_id, facility_id) values (v_client_a, v_fac_a);
  insert into public.member_facility_access (member_id, facility_id) values (v_worker_member, v_fac_a);
  delete from public.member_facility_access where member_id = v_worker_member;

  if not exists (select 1 from public.audit_log where table_name = 'client_facilities' and action = 'insert' and organization_id = v_org_a) then
    raise exception 'TEST 2 FAILED: client_facilities insert not logged against the client''s org';
  end if;
  select count(*) into v_count from public.audit_log
  where table_name = 'member_facility_access' and organization_id = v_org_a and action in ('insert', 'delete');
  if v_count <> 2 then raise exception 'TEST 2 FAILED: member_facility_access insert+delete expected 2, got %', v_count; end if;
  if not exists (select 1 from public.audit_log where table_name = 'member_facility_access' and action = 'delete'
                 and before ->> 'facility_id' = v_fac_a::text and after is null) then
    raise exception 'TEST 2 FAILED: delete should keep the before snapshot';
  end if;
  raise notice '✓ TEST 2 PASSED: Inserts and deletes logged; link tables resolved to their organization.';

  -- ---------------------------------------------------------------
  -- TEST 3: Secrets redacted
  -- ---------------------------------------------------------------
  insert into public.floor_worker_credentials (organization_id, member_id, worker_code, badge_token, pin_hash)
  values (v_org_a, v_worker_member, 'W-9', 'vp_badge_secret_value', hash_worker_pin('1234')) returning id into v_cred;
  update public.floor_worker_credentials set pin_hash = hash_worker_pin('9876') where id = v_cred;

  select * into v_entry from public.audit_log where table_name = 'floor_worker_credentials' and row_id = v_cred::text and action = 'insert';
  if v_entry.after ->> 'badge_token' <> '[redacted]' or v_entry.after ->> 'pin_hash' <> '[redacted]'
     or v_entry.after ->> 'worker_code' <> 'W-9' then
    raise exception 'TEST 3 FAILED: insert snapshot leaks secrets: %', v_entry.after;
  end if;
  select * into v_entry from public.audit_log where table_name = 'floor_worker_credentials' and row_id = v_cred::text and action = 'update';
  if v_entry.changed_fields <> array['pin_hash'] or v_entry.before ->> 'pin_hash' <> '[redacted]' or v_entry.after ->> 'pin_hash' <> '[redacted]' then
    raise exception 'TEST 3 FAILED: PIN change should be logged as a redacted pin_hash change: %', row_to_json(v_entry);
  end if;
  if exists (select 1 from public.audit_log where (before::text || coalesce(after::text, '')) like '%vp_badge_secret_value%') then
    raise exception 'TEST 3 FAILED: a badge token appears in the audit log';
  end if;
  raise notice '✓ TEST 3 PASSED: Badge tokens and PIN hashes redacted; the PIN change itself is still recorded.';

  -- ---------------------------------------------------------------
  -- TEST 4: Bookkeeping ignored, lockouts logged
  -- ---------------------------------------------------------------
  select count(*) into v_count from public.audit_log where table_name = 'floor_worker_credentials' and row_id = v_cred::text;
  update public.floor_worker_credentials set failed_attempts = 3, last_signed_in_at = now(), updated_at = now() where id = v_cred;
  if (select count(*) from public.audit_log where table_name = 'floor_worker_credentials' and row_id = v_cred::text) <> v_count then
    raise exception 'TEST 4 FAILED: bookkeeping-only update was logged';
  end if;
  update public.floor_worker_credentials set failed_attempts = 5, locked_until = now() + interval '15 minutes' where id = v_cred;
  if not exists (select 1 from public.audit_log where table_name = 'floor_worker_credentials' and row_id = v_cred::text
                 and changed_fields = array['locked_until']) then
    raise exception 'TEST 4 FAILED: lockout (locked_until) should be logged, without failed_attempts';
  end if;
  raise notice '✓ TEST 4 PASSED: Login counters and timestamps ignored; account lockouts recorded.';

  -- ---------------------------------------------------------------
  -- TEST 5: Actor preserved through security definer RPCs
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_super_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_device := register_device(v_org_a, 'audit-device-token-01', 'Dock 1 tablet', 'tablet', v_fac_a);
  perform update_device(v_device, null, null, false);
  reset role;

  select * into v_entry from public.audit_log where table_name = 'floor_devices' and row_id = v_device::text and action = 'update'
  order by created_at desc limit 1;
  if v_entry.actor_user_id <> v_super_a or not ('blocked_at' = any (v_entry.changed_fields))
     or not ('is_authorized' = any (v_entry.changed_fields)) then
    raise exception 'TEST 5 FAILED: device block should be attributed to the supervisor: %', row_to_json(v_entry);
  end if;
  if exists (select 1 from public.audit_log where table_name = 'floor_devices' and after::text like '%audit-device-token-01%') then
    raise exception 'TEST 5 FAILED: device token leaked';
  end if;
  update public.floor_devices set last_active_at = now() where id = v_device;
  if (select count(*) from public.audit_log where table_name = 'floor_devices' and row_id = v_device::text) <> 2 then
    raise exception 'TEST 5 FAILED: device heartbeat (last_active_at) should not be logged';
  end if;
  raise notice '✓ TEST 5 PASSED: RPC changes attributed to the caller; device tokens redacted; heartbeats ignored.';

  -- ---------------------------------------------------------------
  -- TEST 6: Append-only
  -- ---------------------------------------------------------------
  v_blocked := false;
  begin
    update public.audit_log set after = '{}' where organization_id = v_org_a;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 6 FAILED: owner updated the audit log'; end if;

  v_blocked := false;
  begin
    set local role service_role;
    delete from public.audit_log where organization_id = v_org_a;
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 6 FAILED: service_role deleted audit entries'; end if;

  v_blocked := false;
  begin
    truncate public.audit_log;
  exception when insufficient_privilege then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 6 FAILED: audit log truncated'; end if;
  raise notice '✓ TEST 6 PASSED: Audit log cannot be updated, deleted or truncated by anyone.';

  -- ---------------------------------------------------------------
  -- TEST 7: RLS
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.audit_log where organization_id = v_org_a;
  reset role;
  if v_count = 0 then raise exception 'TEST 7 FAILED: admin should read the org audit log'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ops_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.audit_log;
  reset role;
  if v_count <> 0 then raise exception 'TEST 7 FAILED: ops manager read % audit entries', v_count; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.audit_log where organization_id = v_org_a;
  reset role;
  if v_count <> 0 then raise exception 'TEST 7 FAILED: other org read % entries', v_count; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    set local role authenticated;
    insert into public.audit_log (organization_id, table_name, action) values (v_org_a, 'facilities', 'update');
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 7 FAILED: users can forge audit entries'; end if;
  raise notice '✓ TEST 7 PASSED: Only owners/admins of the org read it; nobody can write entries directly.';

  raise notice '=======================================================';
  raise notice '>>> ALL SPRINT 2 · STEP 4 AUDIT LOG TESTS PASSED <<<';
  raise notice '=======================================================';
end $$;

rollback;
