-- ==============================================================================
-- Test Suite: sprint02a_step2_support_suite.sql
-- Verifies Sprint 02A Step 2: Consented Support Access, RLS 'support' Role,
-- Expiry & Revocation, and Audit Trail Logging
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_owner_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_staff_id uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_outsider_id uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  v_org_id uuid;
  v_fac_id uuid;
  v_grant_id uuid;
  v_role public.member_role;
  v_has_fac boolean;
  v_is_active boolean;
  v_audit_count integer;
BEGIN
  RAISE NOTICE '--- TEST 1: Setup Test Users, Org, Facility & Platform Staff ---';

  -- Create test auth users
  INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  VALUES 
    (v_owner_id, 'tenantowner@test3pl.com', now(), '{"name":"Tenant Owner"}'::jsonb),
    (v_staff_id, 'supportstaff@ventorypoint.com', now(), '{"name":"Support Staff"}'::jsonb),
    (v_outsider_id, 'outsider@other3pl.com', now(), '{"name":"Outsider"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- Create test organization
  INSERT INTO public.organizations (name, slug, country, timezone, default_currency)
  VALUES ('Consent Test 3PL', 'consent-test-3pl', 'GB', 'Europe/London', 'GBP')
  RETURNING id INTO v_org_id;

  -- Add owner to organization_members
  INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
  VALUES (v_org_id, v_owner_id, 'owner', true);

  -- Add facility to organization
  INSERT INTO public.facilities (organization_id, name, short_code, country)
  VALUES (v_org_id, 'London Central Hub', 'LC-01', 'GB')
  RETURNING id INTO v_fac_id;

  -- Enroll staff in platform_staff
  INSERT INTO public.platform_staff (user_id, role, is_active)
  VALUES (v_staff_id, 'support', true)
  ON CONFLICT (user_id) DO UPDATE SET role = 'support', is_active = true;

  RAISE NOTICE '--- TEST 2: Standing Access Check (Staff MUST NOT have access without grant) ---';

  -- Set context to support staff
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);

  -- Support staff should have NO role on the tenant yet
  v_role := public.get_user_role(v_org_id);
  IF v_role IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Staff should have NULL role on tenant before grant, got %', v_role;
  END IF;

  -- Support staff cannot access facility
  v_has_fac := public.user_has_facility(v_fac_id);
  IF v_has_fac THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Staff must not access facility without active grant';
  END IF;

  -- Staff cannot grant themselves support access (must be owner/admin)
  BEGIN
    PERFORM public.grant_support_access(v_org_id, 'read_only', 24, 'Self grant test');
    RAISE EXCEPTION 'TEST 2 FAILED: Platform staff must not be able to self-grant access';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%TEST 2 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS: Staff self-grant was correctly rejected: %', SQLERRM;
  END;

  RAISE NOTICE '--- TEST 3: Tenant Owner Grants 24h Read-Only Support Access ---';

  -- Switch context to Tenant Owner
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text, true);

  -- Owner grants support access
  v_grant_id := public.grant_support_access(
    v_org_id,
    'read_only',
    24,
    'Need help with London warehouse inventory discrepancy'
  );

  IF v_grant_id IS NULL THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Grant ID was null';
  END IF;

  -- Verify active grant exists
  IF NOT public.has_active_support_grant(v_org_id) THEN
    RAISE EXCEPTION 'TEST 3 FAILED: has_active_support_grant returned false';
  END IF;

  RAISE NOTICE '--- TEST 4: Staff Sees Tenant with "support" Role During Active Grant ---';

  -- Switch context back to support staff
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);

  -- Staff role should now resolve to 'support'
  v_role := public.get_user_role(v_org_id);
  IF v_role IS DISTINCT FROM 'support'::public.member_role THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Expected role support, got %', v_role;
  END IF;

  -- Staff should now have facility visibility
  v_has_fac := public.user_has_facility(v_fac_id);
  IF NOT v_has_fac THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Staff should have facility access during active grant';
  END IF;

  -- Outsider still has NO access
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_outsider_id::text, 'role', 'authenticated')::text, true);
  IF public.get_user_role(v_org_id) IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Outsider must not have access';
  END IF;

  RAISE NOTICE '--- TEST 5: Revocation Immediately Cuts Off Access ---';

  -- Switch back to owner and revoke the grant
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id::text, 'role', 'authenticated')::text, true);
  PERFORM public.revoke_support_access(v_grant_id);

  -- Grant should no longer be active
  IF public.has_active_support_grant(v_org_id) THEN
    RAISE EXCEPTION 'TEST 5 FAILED: has_active_support_grant should be false after revocation';
  END IF;

  -- Switch back to staff: should immediately have NULL role and NO facility access
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff_id::text, 'role', 'authenticated')::text, true);
  v_role := public.get_user_role(v_org_id);
  IF v_role IS NOT NULL THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Staff role should be NULL after revocation, got %', v_role;
  END IF;

  v_has_fac := public.user_has_facility(v_fac_id);
  IF v_has_fac THEN
    RAISE EXCEPTION 'TEST 5 FAILED: Staff facility access should be false after revocation';
  END IF;

  RAISE NOTICE '--- TEST 6: Audit Log Verification ---';

  -- Check that audit log recorded the support grant creation and revocation
  SELECT count(*) INTO v_audit_count
  FROM public.audit_log
  WHERE organization_id = v_org_id
    AND table_name = 'support_access_grants';

  RAISE NOTICE 'Audit log entries for support grants: %', v_audit_count;
  IF v_audit_count < 2 THEN
    RAISE EXCEPTION 'TEST 6 FAILED: Expected at least 2 audit entries (insert + update/revoke), got %', v_audit_count;
  END IF;

  RAISE NOTICE 'All Sprint 02A Step 2 Support Access tests passed successfully!';
END$$;

ROLLBACK;
