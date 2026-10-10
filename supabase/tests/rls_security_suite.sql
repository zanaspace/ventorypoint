-- ====================================================================
-- VentoryPoint Phase 1 Sprint 1: RLS & Security Test Suite
-- ====================================================================
-- Validates:
--  1. Role resolution and cross-org isolation (get_user_role, as each user)
--  2. Two-level admin rules (can_manage_member, set_member_active_status, set_admin_privilege)
--  3. Floor worker creation permissions, PIN rules and badge format
--  4. Floor worker sign-in and the 5-attempt lockout
--  5. Tenant isolation on facilities and client accounts (read + write)
--  6. organization_id is immutable on facilities and client accounts
--  7. Profile visibility: co-members only; anonymous users see nothing
--  8. create_organization makes the caller the owner
--
-- Runs as each user via JWT claims + `set local role`, inside a transaction
-- that is rolled back. (Rewritten 2026-10-10: the previous version called
-- two-argument helper signatures that don't exist and never ran.)
-- ====================================================================

begin;

do $$
declare
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_owner_a uuid := gen_random_uuid();
  v_admin_a uuid := gen_random_uuid();
  v_admin2_a uuid := gen_random_uuid();
  v_ops_a uuid := gen_random_uuid();
  v_worker_a uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_new_user uuid := gen_random_uuid();
  v_fac_a uuid;
  v_fac_b uuid;
  v_client_a uuid;
  v_m_owner_a uuid;
  v_m_admin_a uuid;
  v_m_admin2_a uuid;
  v_m_worker_a uuid;
  v_m_added_by_admin uuid;
  v_fw jsonb;
  v_login jsonb;
  v_new_org uuid;
  v_count integer;
  v_ok boolean;
  v_blocked boolean;
  v_role text;
begin
  raise notice '>>> STARTING SPRINT 1 SECURITY & RLS TEST SUITE <<<';

  -- ---------------------------------------------------------------
  -- Fixtures
  -- ---------------------------------------------------------------
  insert into public.profiles (id, email, first_name, last_name) values
    (v_owner_a,  'owner_a@s1.test',  'Alice', 'Owner'),
    (v_admin_a,  'admin_a@s1.test',  'Bob',   'Admin'),
    (v_admin2_a, 'admin2_a@s1.test', 'Bea',   'Admin'),
    (v_ops_a,    'ops_a@s1.test',    'Oscar', 'Ops'),
    (v_worker_a, 'worker_a@s1.test', 'Carl',  'Worker'),
    (v_owner_b,  'owner_b@s1.test',  'Dave',  'OwnerB');

  insert into public.organizations (id, name, country, timezone, default_currency) values
    (v_org_a, 'S1 Org A', 'US', 'America/Chicago', 'USD'),
    (v_org_b, 'S1 Org B', 'US', 'America/New_York', 'USD');

  insert into public.organization_members (organization_id, user_id, role, is_active, can_manage_all_members, all_facilities)
    values (v_org_a, v_owner_a, 'owner', true, true, true) returning id into v_m_owner_a;
  insert into public.organization_members (organization_id, user_id, role, is_active, can_manage_all_members, all_facilities)
    values (v_org_a, v_admin_a, 'admin', true, false, true) returning id into v_m_admin_a;
  insert into public.organization_members (organization_id, user_id, role, is_active, can_manage_all_members, all_facilities)
    values (v_org_a, v_admin2_a, 'admin', true, false, true) returning id into v_m_admin2_a;
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities)
    values (v_org_a, v_ops_a, 'ops_manager', true, true);
  -- Worker added by the owner (not by Bob the admin)
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities, added_by)
    values (v_org_a, v_worker_a, 'floor_worker', true, false, v_owner_a) returning id into v_m_worker_a;
  insert into public.organization_members (organization_id, user_id, role, is_active, all_facilities)
    values (v_org_b, v_owner_b, 'owner', true, true);

  insert into public.facilities (organization_id, name, short_code) values (v_org_a, 'Dallas Hub A', 'DFW') returning id into v_fac_a;
  insert into public.facilities (organization_id, name, short_code) values (v_org_b, 'Atlanta Hub B', 'ATL') returning id into v_fac_b;
  insert into public.client_accounts (organization_id, name, short_code) values (v_org_a, 'Brand Alpha', 'ALPHA') returning id into v_client_a;

  -- ---------------------------------------------------------------
  -- TEST 1: Role resolution as each user
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if get_user_role(v_org_a) is distinct from 'owner' or get_user_role(v_org_b) is not null then
    raise exception 'TEST 1 FAILED: owner A should be owner of A and nothing in B';
  end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if get_user_role(v_org_a) is distinct from 'admin' then raise exception 'TEST 1 FAILED: admin role'; end if;
  reset role;
  raise notice '✓ TEST 1 PASSED: Roles resolve per signed-in user; no cross-org role leak.';

  -- ---------------------------------------------------------------
  -- TEST 2: Two-level admin rules
  -- ---------------------------------------------------------------
  -- Owner manages anyone (but never themselves)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not can_manage_member(v_m_admin_a) or can_manage_member(v_m_owner_a) then
    raise exception 'TEST 2 FAILED: owner should manage the admin but not themselves';
  end if;
  reset role;

  -- Admin without "manage all": not owners/admins, not members someone else added
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if can_manage_member(v_m_owner_a) or can_manage_member(v_m_admin2_a) or can_manage_member(v_m_worker_a) then
    raise exception 'TEST 2 FAILED: limited admin managed an owner, an admin, or a member added by someone else';
  end if;
  v_blocked := false;
  begin
    perform set_member_active_status(v_m_worker_a, false);
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 2 FAILED: limited admin deactivated a member they can''t manage'; end if;
  v_blocked := false;
  begin
    perform set_admin_privilege(v_m_admin2_a, true);
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 2 FAILED: admin changed admin privileges'; end if;
  reset role;

  -- A member Bob added himself is manageable by Bob
  insert into public.profiles (id, first_name) values (gen_random_uuid(), 'Added') returning id into v_new_org;  -- reuse var as a profile id
  insert into public.organization_members (organization_id, user_id, role, is_active, added_by)
    values (v_org_a, v_new_org, 'floor_worker', true, v_admin_a) returning id into v_m_added_by_admin;
  set local role authenticated;
  if not can_manage_member(v_m_added_by_admin) then
    raise exception 'TEST 2 FAILED: admin should manage members they added';
  end if;
  reset role;

  -- Owner grants "manage all members": now Bob can manage the owner-added worker, still not admins/owners
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform set_admin_privilege(v_m_admin_a, true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not can_manage_member(v_m_worker_a) or can_manage_member(v_m_admin2_a) then
    raise exception 'TEST 2 FAILED: "manage all" admin should manage regular members only';
  end if;
  perform set_member_active_status(v_m_worker_a, false);
  perform set_member_active_status(v_m_worker_a, true);
  reset role;
  raise notice '✓ TEST 2 PASSED: Two-level admin rules (owner > manage-all admin > limited admin) enforced.';

  -- ---------------------------------------------------------------
  -- TEST 3: Floor worker creation
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_ops_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_fw := create_floor_worker(v_org_a, 'Sam', 'Picker', '1234', true, '{}');
  reset role;
  if (v_fw ->> 'badge_token') !~ '^vp_badge_[0-9a-f]{48}$' then
    raise exception 'TEST 3 FAILED: badge token format wrong: %', v_fw ->> 'badge_token';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    set local role authenticated;
    perform create_floor_worker(v_org_a, 'Eve', 'Sneaky', '1234', true, '{}');
  exception when others then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 3 FAILED: floor worker created a floor worker'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    set local role authenticated;
    perform create_floor_worker(v_org_a, 'Mal', 'Other', '1234', true, '{}');
  exception when others then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 3 FAILED: other org created a worker in org A'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  v_blocked := false;
  begin
    set local role authenticated;
    perform create_floor_worker(v_org_a, 'Pat', 'Pin', '12a4', true, '{}');
  exception when others then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 3 FAILED: non-numeric PIN accepted'; end if;
  raise notice '✓ TEST 3 PASSED: Only owners/admins/ops managers of the org create workers; PIN rules; badge format.';

  -- ---------------------------------------------------------------
  -- TEST 4: Floor sign-in and lockout
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  v_login := floor_worker_login(v_fw ->> 'badge_token', '1234', null);
  if not (v_login ->> 'ok')::boolean then raise exception 'TEST 4 FAILED: valid sign-in rejected: %', v_login; end if;
  if (floor_worker_login(v_fw ->> 'badge_token', '9999', null) ->> 'ok')::boolean then
    raise exception 'TEST 4 FAILED: wrong PIN accepted';
  end if;
  perform floor_worker_login(v_fw ->> 'badge_token', '9999', null);
  perform floor_worker_login(v_fw ->> 'badge_token', '9999', null);
  perform floor_worker_login(v_fw ->> 'badge_token', '9999', null);
  v_login := floor_worker_login(v_fw ->> 'badge_token', '9999', null);
  if not coalesce((v_login ->> 'locked')::boolean, false) then
    raise exception 'TEST 4 FAILED: no lockout after 5 wrong PINs: %', v_login;
  end if;
  v_login := floor_worker_login(v_fw ->> 'badge_token', '1234', null);
  if (v_login ->> 'ok')::boolean then raise exception 'TEST 4 FAILED: correct PIN accepted while locked'; end if;
  reset role;
  raise notice '✓ TEST 4 PASSED: Badge + PIN sign-in works; 5 wrong PINs lock the badge, even for the right PIN.';

  -- ---------------------------------------------------------------
  -- TEST 5: Tenant isolation on facilities and clients
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.facilities where organization_id = v_org_a;
  if v_count <> 0 then raise exception 'TEST 5 FAILED: org B read org A facilities'; end if;
  select count(*) into v_count from public.client_accounts where organization_id = v_org_a;
  if v_count <> 0 then raise exception 'TEST 5 FAILED: org B read org A clients'; end if;
  update public.facilities set name = 'Hijacked' where id = v_fac_a;
  delete from public.client_accounts where id = v_client_a;
  reset role;
  if (select name from public.facilities where id = v_fac_a) <> 'Dallas Hub A'
     or not exists (select 1 from public.client_accounts where id = v_client_a) then
    raise exception 'TEST 5 FAILED: org B modified org A data';
  end if;

  set local role authenticated;
  v_blocked := false;
  begin
    insert into public.facilities (organization_id, name, short_code) values (v_org_a, 'Planted', 'PLT');
  exception when insufficient_privilege then v_blocked := true;
  end;
  reset role;
  if not v_blocked then raise exception 'TEST 5 FAILED: org B inserted a facility into org A'; end if;

  -- Floor worker without facility access sees no facilities; owner A can edit
  perform set_config('request.jwt.claims', json_build_object('sub', v_worker_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.facilities where organization_id = v_org_a;
  reset role;
  if v_count <> 0 then raise exception 'TEST 5 FAILED: worker without access saw % facilities', v_count; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.facilities set name = 'Dallas Hub A1' where id = v_fac_a;
  reset role;
  if (select name from public.facilities where id = v_fac_a) <> 'Dallas Hub A1' then
    raise exception 'TEST 5 FAILED: owner A could not edit their facility';
  end if;
  raise notice '✓ TEST 5 PASSED: Facilities and clients isolated per org (read, update, delete, insert); facility access respected.';

  -- ---------------------------------------------------------------
  -- TEST 6: organization_id can't be changed
  -- ---------------------------------------------------------------
  v_blocked := false;
  begin
    update public.facilities set organization_id = v_org_b where id = v_fac_a;
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 6 FAILED: facility moved to another org'; end if;
  v_blocked := false;
  begin
    update public.client_accounts set organization_id = v_org_b where id = v_client_a;
  exception when others then v_blocked := true;
  end;
  if not v_blocked then raise exception 'TEST 6 FAILED: client moved to another org'; end if;
  raise notice '✓ TEST 6 PASSED: organization_id is immutable on facilities and clients (even for the table owner).';

  -- ---------------------------------------------------------------
  -- TEST 7: Profile and member visibility
  -- ---------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.profiles where id in (v_owner_a, v_owner_b);
  reset role;
  if v_count <> 1 then raise exception 'TEST 7 FAILED: admin A should see owner A''s profile only (saw %)', v_count; end if;

  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  select count(*) into v_count from public.profiles;
  select v_count + count(*) into v_count from public.organization_members;
  select v_count + count(*) into v_count from public.facilities;
  reset role;
  if v_count <> 0 then raise exception 'TEST 7 FAILED: anonymous users read % rows', v_count; end if;
  raise notice '✓ TEST 7 PASSED: Profiles visible to co-members only; anonymous users read nothing.';

  -- ---------------------------------------------------------------
  -- TEST 8: create_organization
  -- ---------------------------------------------------------------
  insert into auth.users (id, email) values (v_new_user, 'founder@s1.test');
  perform set_config('request.jwt.claims', json_build_object('sub', v_new_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_new_org := create_organization('Founder 3PL', 'US', 'America/Denver', 'USD');
  v_role := get_user_role(v_new_org)::text;
  reset role;
  if v_role is distinct from 'owner' then raise exception 'TEST 8 FAILED: creator should be owner, got %', v_role; end if;
  raise notice '✓ TEST 8 PASSED: create_organization makes the caller the owner.';

  raise notice '=======================================================';
  raise notice '>>> ALL PHASE 1 SPRINT 1 SECURITY & RLS TESTS PASSED <<<';
  raise notice '=======================================================';
end $$;

rollback;
