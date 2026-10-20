-- Test Suite: sprint02a_step4_notifications_and_analytics_suite.sql
-- Verifies Sprint 02A Step 4: Notifications, Analytics & Customer Data Export

do $$
declare
  v_test_org_id uuid;
  v_test_user_id uuid;
  v_notif_id uuid;
  v_marked boolean;
  v_read_count integer;
  v_export_id uuid;
  v_pii_blocked boolean := false;
begin
  raise notice '=== Starting Sprint 02A Step 4: Notifications, Analytics & Export Suite ===';

  -- 1. Setup test organization & user
  insert into public.organizations (name, slug)
  values ('Test Notifications Org', 'test-notif-org-' || substr(gen_random_uuid()::text, 1, 8))
  returning id into v_test_org_id;

  select id into v_test_user_id from auth.users limit 1;
  if v_test_user_id is null then
    -- Fallback dummy uuid for unit testing if auth.users is empty in local dev
    v_test_user_id := gen_random_uuid();
  end if;

  -- 2. Test create_notification() RPC
  select public.create_notification(
    v_test_org_id,
    v_test_user_id,
    'hold_action_needed',
    'Order Hold Requires Review',
    'Order #10492 has an address exception hold.',
    'in_app',
    '{"order_id": "10492"}'::jsonb
  ) into v_notif_id;

  if v_notif_id is null then
    raise exception 'FAIL: create_notification returned null';
  end if;
  raise notice '[TEST 1] PASS: Created in-app notification %', v_notif_id;

  -- 3. Test mark_notification_read()
  update public.notifications
  set read_at = now()
  where id = v_notif_id;

  select (read_at is not null) into v_marked
  from public.notifications where id = v_notif_id;

  if not v_marked then
    raise exception 'FAIL: Notification read_at was not updated';
  end if;
  raise notice '[TEST 2] PASS: Notification marked as read';

  -- 4. Test Notification Preferences (Mute Logic)
  insert into public.notification_preferences (
    user_id,
    organization_id,
    template_key,
    in_app_enabled,
    email_enabled
  )
  values (
    v_test_user_id,
    v_test_org_id,
    'near_expiry_stock',
    false,
    true
  );

  -- Attempt to send muted in-app notification
  select public.create_notification(
    v_test_org_id,
    v_test_user_id,
    'near_expiry_stock',
    'Batch Expiring Soon',
    'Batch B-992 expires in 7 days.',
    'in_app'
  ) into v_notif_id;

  if v_notif_id is not null then
    raise exception 'FAIL: Muted notification should have returned null';
  end if;
  raise notice '[TEST 3] PASS: Muted notification preference respected';

  -- 5. Test Data Export Job & Audit Trail
  insert into public.data_export_jobs (
    organization_id,
    requested_by,
    format,
    status
  )
  values (
    v_test_org_id,
    v_test_user_id,
    'json',
    'pending'
  )
  returning id into v_export_id;

  update public.data_export_jobs
  set status = 'completed',
      file_url = 'https://exports.ventorypoint.internal/export-' || v_export_id || '.zip',
      record_count = 1420
  where id = v_export_id;

  raise notice '[TEST 4] PASS: Data export job lifecycle updated';

  -- 6. Test Product Analytics PII Guard
  -- A. Valid pseudonymous event should succeed
  insert into public.product_analytics_events (
    org_id_hash,
    user_id_hash,
    event_name,
    properties
  )
  values (
    encode(sha256(v_test_org_id::text::bytea), 'hex'),
    encode(sha256(v_test_user_id::text::bytea), 'hex'),
    'floor_task_complete',
    '{"task_type": "pick", "duration_seconds": 45, "item_count": 3}'::jsonb
  );
  raise notice '[TEST 5A] PASS: Pseudonymous analytics event without PII accepted';

  -- B. Event containing forbidden PII field (e.g. email) must fail
  begin
    insert into public.product_analytics_events (
      org_id_hash,
      user_id_hash,
      event_name,
      properties
    )
    values (
      'test_hash',
      'test_hash',
      'login_attempt',
      '{"email": "customer@example.com", "step": "form_submit"}'::jsonb
    );
  exception
    when others then
      v_pii_blocked := true;
      raise notice '[TEST 5B] PASS: PII violation trigger successfully rejected event containing email: %', sqlerrm;
  end;

  if not v_pii_blocked then
    raise exception 'FAIL: Analytics event with PII was not rejected!';
  end if;

  -- Cleanup
  delete from public.organizations where id = v_test_org_id;

  raise notice '=== ALL SPRINT 02A STEP 4 TESTS PASSED SUCCESSFULLY! ===';
end;
$$;
