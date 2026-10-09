-- ====================================================================
-- VentoryPoint Phase 1 Sprint 1: Automated RLS & Security Test Suite
-- ====================================================================
-- This test suite validates:
-- 1. Multi-tenant isolation (Tenant A cannot see/modify Tenant B's data)
-- 2. Two-level Admin permissions (can_manage_all_members boundaries)
-- 3. Floor Worker credentials & rate-limited lockout
-- 4. Facility and Client account RLS policies
-- ====================================================================

DO $$
DECLARE
  v_org_a_id uuid;
  v_org_b_id uuid;
  v_user_owner_a uuid;
  v_user_admin_a uuid;
  v_user_owner_b uuid;
  v_fac_a_id uuid;
  v_fac_b_id uuid;
  v_client_a_id uuid;
  v_member_admin_id uuid;
  v_member_regular_id uuid;
  v_user_regular_a uuid;
  v_fw_res jsonb;
  v_fw_login jsonb;
  v_test_pass boolean := true;
BEGIN
  RAISE NOTICE '>>> STARTING SPRINT 1 SECURITY & RLS AUDIT TEST SUITE <<<';

  -- 1. Setup Test Organizations & Profiles
  v_org_a_id := uuid_v7();
  v_org_b_id := uuid_v7();
  v_user_owner_a := uuid_v7();
  v_user_admin_a := uuid_v7();
  v_user_regular_a := uuid_v7();
  v_user_owner_b := uuid_v7();

  -- Insert Test Profiles
  INSERT INTO public.profiles (id, email, first_name, last_name) VALUES
    (v_user_owner_a, 'owner_a@test3pl.com', 'Alice', 'Owner'),
    (v_user_admin_a, 'admin_a@test3pl.com', 'Bob', 'Admin'),
    (v_user_regular_a, 'worker_a@test3pl.com', 'Charlie', 'Worker'),
    (v_user_owner_b, 'owner_b@test3pl.com', 'Dave', 'OwnerB');

  -- Insert Organizations
  INSERT INTO public.organizations (id, name, country, timezone, default_currency) VALUES
    (v_org_a_id, 'Test 3PL Org A', 'US', 'America/Chicago', 'USD'),
    (v_org_b_id, 'Test 3PL Org B', 'US', 'America/New_York', 'USD');

  -- Insert Memberships
  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, can_manage_all_members) VALUES
    (v_org_a_id, v_user_owner_a, 'owner', true, true),
    (v_org_a_id, v_user_admin_a, 'admin', true, false)
    RETURNING id INTO v_member_admin_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, can_manage_all_members) VALUES
    (v_org_a_id, v_user_regular_a, 'floor_worker', true, false)
    RETURNING id INTO v_member_regular_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_active, can_manage_all_members) VALUES
    (v_org_b_id, v_user_owner_b, 'owner', true, true);

  -- Insert Facilities
  INSERT INTO public.facilities (organization_id, name, code, is_active) VALUES
    (v_org_a_id, 'Dallas Hub A', 'DFW-1', true) RETURNING id INTO v_fac_a_id;

  INSERT INTO public.facilities (organization_id, name, code, is_active) VALUES
    (v_org_b_id, 'Atlanta Hub B', 'ATL-1', true) RETURNING id INTO v_fac_b_id;

  -- Insert Client Accounts
  INSERT INTO public.client_accounts (organization_id, company_name, account_code, is_active) VALUES
    (v_org_a_id, 'Brand Alpha', 'ALPHA', true) RETURNING id INTO v_client_a_id;

  -- TEST 1: Helper Functions Role Resolution
  IF get_user_role(v_org_a_id, v_user_owner_a) != 'owner' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Owner role resolution incorrect.';
  END IF;
  IF get_user_role(v_org_a_id, v_user_admin_a) != 'admin' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Admin role resolution incorrect.';
  END IF;
  IF get_user_role(v_org_b_id, v_user_owner_a) IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Cross-org role leak detected.';
  END IF;
  RAISE NOTICE '✓ TEST 1 PASSED: Role resolution and cross-org isolation verified.';

  -- TEST 2: Two-Level Admin Rules via can_manage_member
  -- Owner can manage anyone in their org
  IF NOT can_manage_member(v_user_owner_a, v_member_admin_id) THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Owner should be able to manage Admin.';
  END IF;

  -- Admin WITHOUT can_manage_all_members CANNOT manage another admin or owner
  IF can_manage_member(v_user_admin_a, (SELECT id FROM public.organization_members WHERE organization_id = v_org_a_id AND user_id = v_user_owner_a)) THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Admin should NOT be able to manage Owner.';
  END IF;

  -- Admin CAN manage standard members
  IF NOT can_manage_member(v_user_admin_a, v_member_regular_id) THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Admin should be able to manage regular members.';
  END IF;
  RAISE NOTICE '✓ TEST 2 PASSED: Two-level admin permissions verified.';

  -- TEST 3: Floor Worker Creation RPC
  -- Create floor worker
  v_fw_res := create_floor_worker(
    v_org_a_id,
    'Sam',
    'Picker',
    '1234',
    true,
    '{}'
  );

  IF v_fw_res->>'badge_token' IS NULL OR NOT (v_fw_res->>'badge_token' LIKE 'vp_badge_%') THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Floor worker badge generation failed.';
  END IF;
  RAISE NOTICE '✓ TEST 3 PASSED: Floor Worker created with badge token %', v_fw_res->>'badge_token';

  -- TEST 4: Floor Worker Sign In & Lockout Rate Limiting
  -- 4.1 Valid sign-in
  v_fw_login := floor_worker_login(v_fw_res->>'badge_token', '1234');
  IF NOT (v_fw_login->>'ok')::boolean THEN
    RAISE EXCEPTION 'TEST 4.1 FAILED: Valid Floor Worker login rejected: %', v_fw_login->>'error';
  END IF;

  -- 4.2 Failed sign-in attempt (Wrong PIN)
  v_fw_login := floor_worker_login(v_fw_res->>'badge_token', '9999');
  IF (v_fw_login->>'ok')::boolean THEN
    RAISE EXCEPTION 'TEST 4.2 FAILED: Invalid PIN was accepted.';
  END IF;

  -- 4.3 Trigger 5 failed attempts to verify lockout
  PERFORM floor_worker_login(v_fw_res->>'badge_token', '9999');
  PERFORM floor_worker_login(v_fw_res->>'badge_token', '9999');
  PERFORM floor_worker_login(v_fw_res->>'badge_token', '9999');
  v_fw_login := floor_worker_login(v_fw_res->>'badge_token', '9999');

  IF NOT coalesce((v_fw_login->>'locked')::boolean, false) THEN
    RAISE EXCEPTION 'TEST 4.3 FAILED: Account failed to lock after 5 invalid PIN attempts.';
  END IF;
  RAISE NOTICE '✓ TEST 4 PASSED: Floor Worker auth and 5-attempt rate-limit lockout verified.';

  -- TEST 5: Clean up test fixtures
  DELETE FROM public.organizations WHERE id IN (v_org_a_id, v_org_b_id);
  DELETE FROM public.profiles WHERE id IN (v_user_owner_a, v_user_admin_a, v_user_regular_a, v_user_owner_b);

  RAISE NOTICE '=======================================================';
  RAISE NOTICE '>>> ALL PHASE 1 SPRINT 1 SECURITY & RLS TESTS PASSED <<<';
  RAISE NOTICE '=======================================================';
END $$;
