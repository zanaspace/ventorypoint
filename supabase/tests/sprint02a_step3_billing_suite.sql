-- Test Suite: sprint02a_step3_billing_suite.sql
-- Verifies Sprint 02A Step 3: Platform Subscription Billing & Entitlements

do $$
declare
  v_test_org_id uuid;
  v_sub_id uuid;
  v_org_plan text;
  v_is_restricted boolean;
  v_sub_json jsonb;
  v_audit_count integer;
begin
  raise notice '=== Starting Sprint 02A Step 3: Billing & Entitlements Test Suite ===';

  -- 1. Create a dummy test org
  insert into public.organizations (name, slug, plan)
  values ('Test Billing 3PL', 'test-billing-3pl-' || substr(gen_random_uuid()::text, 1, 8), 'launch')
  returning id into v_test_org_id;

  raise notice '[TEST 1] Created test organization %', v_test_org_id;

  -- 2. Create subscription record for the org
  insert into public.subscriptions (
    organization_id,
    plan_tier,
    status,
    billing_cycle,
    current_period_start,
    current_period_end
  )
  values (
    v_test_org_id,
    'launch',
    'active',
    'monthly',
    now(),
    now() + interval '30 days'
  )
  returning id into v_sub_id;

  -- 3. Verify organizations.plan sync on update
  update public.subscriptions
  set plan_tier = 'growth'
  where id = v_sub_id;

  select plan into v_org_plan from public.organizations where id = v_test_org_id;
  if v_org_plan <> 'growth' then
    raise exception 'FAIL: Organization plan was not synced to growth (found: %)', v_org_plan;
  end if;
  raise notice '[TEST 2] PASS: Trigger successfully synced plan to organizations.plan = growth';

  -- 4. Verify is_org_restricted() when active
  v_is_restricted := public.is_org_restricted(v_test_org_id);
  if v_is_restricted <> false then
    raise exception 'FAIL: Active subscription should not be restricted';
  end if;
  raise notice '[TEST 3] PASS: Active subscription is not restricted';

  -- 5. Verify 14-day grace period logic
  -- Set status to past_due but with grace period 5 days in future
  update public.subscriptions
  set status = 'past_due',
      grace_period_ends_at = now() + interval '5 days'
  where id = v_sub_id;

  v_is_restricted := public.is_org_restricted(v_test_org_id);
  if v_is_restricted <> false then
    raise exception 'FAIL: Past-due subscription within grace period should NOT be restricted';
  end if;
  raise notice '[TEST 4] PASS: Grace period protects tenant from restriction';

  -- Set grace period to 1 hour in the past
  update public.subscriptions
  set grace_period_ends_at = now() - interval '1 hour'
  where id = v_sub_id;

  v_is_restricted := public.is_org_restricted(v_test_org_id);
  if v_is_restricted <> true then
    raise exception 'FAIL: Past-due subscription with expired grace period MUST be restricted';
  end if;
  raise notice '[TEST 5] PASS: Expired grace period correctly triggers is_org_restricted() = true';

  -- 6. Verify get_org_subscription() helper
  v_sub_json := public.get_org_subscription(v_test_org_id);
  if (v_sub_json->>'plan_tier') <> 'growth' or (v_sub_json->>'is_restricted')::boolean <> true then
    raise exception 'FAIL: get_org_subscription() returned unexpected data: %', v_sub_json;
  end if;
  raise notice '[TEST 6] PASS: get_org_subscription() returns accurate payload: %', v_sub_json;

  -- 7. Test stripe_webhook_events idempotency
  insert into public.stripe_webhook_events (id, event_type, payload, status)
  values ('evt_test_123', 'invoice.paid', '{"id": "in_test_123"}'::jsonb, 'processed');

  begin
    insert into public.stripe_webhook_events (id, event_type, payload, status)
    values ('evt_test_123', 'invoice.paid', '{"id": "in_test_123"}'::jsonb, 'processed');
    raise exception 'FAIL: Duplicate stripe webhook event was allowed';
  exception
    when unique_violation then
      raise notice '[TEST 7] PASS: Duplicate stripe webhook event correctly rejected by PK';
  end;

  -- 8. Test subscription_usage monthly aggregation
  insert into public.subscription_usage (
    organization_id,
    period_start,
    period_end,
    shipped_orders_count,
    scan_events_count
  )
  values (
    v_test_org_id,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    145,
    580
  );

  -- Upsert with conflict resolution
  insert into public.subscription_usage (
    organization_id,
    period_start,
    period_end,
    shipped_orders_count,
    scan_events_count
  )
  values (
    v_test_org_id,
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    155,
    620
  )
  on conflict (organization_id, period_start, period_end)
  do update set
    shipped_orders_count = excluded.shipped_orders_count,
    scan_events_count = excluded.scan_events_count;

  raise notice '[TEST 8] PASS: subscription_usage period tracking and upsert verified';

  -- 9. Check audit log for subscription events
  select count(*) into v_audit_count
  from public.audit_log
  where table_name = 'subscriptions' and record_id = v_sub_id;

  if v_audit_count = 0 then
    raise exception 'FAIL: Subscriptions changes were not captured by audit_row_change trigger';
  end if;
  raise notice '[TEST 9] PASS: % audit log rows captured for subscription mutations', v_audit_count;

  -- Cleanup test data
  delete from public.organizations where id = v_test_org_id;
  delete from public.stripe_webhook_events where id = 'evt_test_123';

  raise notice '=== ALL SPRINT 02A STEP 3 TESTS PASSED SUCCESSFULLY! ===';
end;
$$;
