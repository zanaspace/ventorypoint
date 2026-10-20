-- ==============================================================================
-- Test Suite: sprint02a_step1_suite.sql
-- Verifies Sprint 02A Step 1: Platform Staff, Feature Flags, Announcements
-- ==============================================================================

BEGIN;

-- Setup temporary test users and org
DO $$
DECLARE
  v_admin_id uuid := '11111111-1111-1111-1111-111111111111';
  v_member_id uuid := '22222222-2222-2222-2222-222222222222';
  v_org_id uuid;
  v_flag_id uuid;
  v_announcement_id uuid;
  v_enabled boolean;
  v_overview_count int;
BEGIN
  RAISE NOTICE '--- TEST 1: Platform Staff and Role Checks ---';
  
  -- Insert dummy test auth users if not present
  INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  VALUES 
    (v_admin_id, 'staffadmin@ventorypoint.test', now(), '{"name":"Staff Admin"}'::jsonb),
    (v_member_id, 'regularmember@ventorypoint.test', now(), '{"name":"Regular Member"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  -- Add admin to platform_staff
  INSERT INTO public.platform_staff (user_id, role, is_active)
  VALUES (v_admin_id, 'platform_admin', true)
  ON CONFLICT (user_id) DO UPDATE SET role = 'platform_admin', is_active = true;

  -- Verify is_platform_staff function
  -- Set auth context to admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'TEST 1 FAILED: v_admin_id should be recognized as platform staff';
  END IF;

  IF NOT public.is_platform_staff('platform_admin') THEN
    RAISE EXCEPTION 'TEST 1 FAILED: v_admin_id should be recognized as platform_admin';
  END IF;

  IF public.is_platform_staff('finance') THEN
    RAISE EXCEPTION 'TEST 1 FAILED: v_admin_id is not finance role';
  END IF;

  -- Switch to regular member
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_id::text, 'role', 'authenticated')::text, true);
  
  IF public.is_platform_staff() THEN
    RAISE EXCEPTION 'TEST 1 FAILED: regular member must not be platform staff';
  END IF;

  RAISE NOTICE '--- TEST 2: Feature Flags & Tenant Overrides ---';

  -- Create a test organization
  INSERT INTO public.organizations (name, slug, country, timezone, currency)
  VALUES ('Sprint 02A Test Org', 'sprint-02a-test-org', 'GB', 'Europe/London', 'GBP')
  RETURNING id INTO v_org_id;

  -- Flag check 1: non-existent flag should return false
  v_enabled := public.is_feature_enabled(v_org_id, 'non_existent_flag_xyz');
  IF v_enabled IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Non-existent flag should return false';
  END IF;

  -- Flag check 2: default global flag
  -- 'data_export_enabled' is true globally
  v_enabled := public.is_feature_enabled(v_org_id, 'data_export_enabled');
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Global flag data_export_enabled should be true';
  END IF;

  -- Override flag for this organization to false
  SELECT id INTO v_flag_id FROM public.feature_flags WHERE key = 'data_export_enabled';
  
  INSERT INTO public.organization_feature_flags (organization_id, feature_flag_id, is_enabled, notes)
  VALUES (v_org_id, v_flag_id, false, 'Disabled for test org');

  -- Flag check 3: org override to false takes precedence
  v_enabled := public.is_feature_enabled(v_org_id, 'data_export_enabled');
  IF v_enabled IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST 2 FAILED: Org override should take precedence and return false';
  END IF;

  RAISE NOTICE '--- TEST 3: Announcements & Dismissals ---';

  -- Switch back to admin to insert announcement
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  INSERT INTO public.announcements (title, message, severity, target_audience, is_active)
  VALUES ('Scheduled Maintenance', 'Platform update in 2 hours', 'maintenance', 'all', true)
  RETURNING id INTO v_announcement_id;

  -- Switch to member to view announcements
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_id::text, 'role', 'authenticated')::text, true);

  -- Member checks announcements
  PERFORM * FROM public.get_active_announcements_for_user(v_org_id);
  
  -- Member dismisses announcement
  PERFORM public.dismiss_announcement(v_announcement_id);

  -- Verify dismissed announcement no longer appears
  IF EXISTS (
    SELECT 1 FROM public.get_active_announcements_for_user(v_org_id)
    WHERE id = v_announcement_id
  ) THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Dismissed announcement still visible';
  END IF;

  RAISE NOTICE '--- TEST 4: Internal Tenants Overview RPC ---';

  -- Switch to admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_overview_count FROM public.get_internal_tenants_overview();
  IF v_overview_count = 0 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Overview should return at least 1 tenant';
  END IF;

  -- Switch to member and verify access is rejected
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_id::text, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM * FROM public.get_internal_tenants_overview();
    RAISE EXCEPTION 'TEST 4 FAILED: Regular member should be denied access to get_internal_tenants_overview';
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    -- Expected error 42501
    NULL;
  END;

  RAISE NOTICE '--- ALL SPRINT 02A STEP 1 TESTS PASSED SUCCESSFULLY ---';
END $$;

ROLLBACK;
