-- ==============================================================================
-- Test Suite: sprint04_catalog_suite.sql
-- Verifies Sprint 4: SKU Catalog, Tracking Classes & Rotation Rules
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_org_id uuid;
  v_client_id uuid;
  v_sku_id uuid;
  v_sku_fefo_id uuid;
  v_sku_serial_id uuid;
  v_case_uom_id uuid;
  v_resolved record;
  v_completeness record;
  v_error_caught boolean := false;
BEGIN
  RAISE NOTICE '--- TEST 1: Setup Organization & Client Account ---';

  INSERT INTO public.organizations (name, slug, country, timezone, default_currency)
  VALUES ('Sprint 04 3PL Master', 'sprint-04-3pl-master', 'US', 'America/Chicago', 'USD')
  RETURNING id INTO v_org_id;

  INSERT INTO public.client_accounts (
    organization_id,
    name,
    short_code,
    status,
    primary_contact_name,
    primary_contact_email
  ) VALUES (
    v_org_id,
    'Acme Nutrition Inc',
    'ACME',
    'active',
    'Alice Smith',
    'alice@acmenutrition.com'
  ) RETURNING id INTO v_client_id;

  ASSERT v_client_id IS NOT NULL, 'Client account creation failed';

  RAISE NOTICE '--- TEST 2: Create SKU & Verify Auto-Default UoM Trigger ---';

  INSERT INTO public.skus (
    organization_id,
    client_account_id,
    code,
    name,
    description,
    tracking_class,
    rotation_rule,
    temperature_class
  ) VALUES (
    v_org_id,
    v_client_id,
    'ACME-VIT-C-1000',
    'Vitamin C 1000mg 60ct',
    'Immune support tablets',
    'non_unique',
    'fifo',
    'ambient'
  ) RETURNING id INTO v_sku_id;

  -- Verify that fn_sku_auto_default_uom created the 'each' level automatically
  PERFORM 1 FROM public.sku_uoms 
  WHERE sku_id = v_sku_id AND uom_level = 'each' AND conversion_factor = 1;
  ASSERT FOUND, 'Auto-default each UoM was not created by trigger';

  RAISE NOTICE '--- TEST 3: Consistency Constraints (FEFO & Serial) ---';

  -- Constraint 3a: FEFO without expiry_required must fail
  BEGIN
    INSERT INTO public.skus (
      organization_id,
      client_account_id,
      code,
      name,
      tracking_class,
      rotation_rule,
      expiry_required
    ) VALUES (
      v_org_id,
      v_client_id,
      'ACME-PROBIOTIC',
      'Probiotic 50B',
      'lot',
      'fefo',
      false -- Invalid: FEFO requires expiry_required = true
    );
  EXCEPTION WHEN check_violation THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught, 'Failed to block FEFO SKU without expiry_required';

  -- Constraint 3b: Valid FEFO with expiry_required succeeds
  INSERT INTO public.skus (
    organization_id,
    client_account_id,
    code,
    name,
    tracking_class,
    rotation_rule,
    expiry_required,
    shelf_life_days,
    min_shelf_life_receipt_days
  ) VALUES (
    v_org_id,
    v_client_id,
    'ACME-PROBIOTIC',
    'Probiotic 50B',
    'lot',
    'fefo',
    true,
    365,
    180
  ) RETURNING id INTO v_sku_fefo_id;

  ASSERT v_sku_fefo_id IS NOT NULL, 'Valid FEFO SKU creation failed';

  -- Constraint 3c: Serial without capture point must fail
  v_error_caught := false;
  BEGIN
    INSERT INTO public.skus (
      organization_id,
      client_account_id,
      code,
      name,
      tracking_class
    ) VALUES (
      v_org_id,
      v_client_id,
      'ACME-SMARTPHONE',
      'Smart Device',
      'serial'
      -- Missing serial_source and serial_capture_point
    );
  EXCEPTION WHEN check_violation THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught, 'Failed to block Serial SKU without serial rules';

  -- Valid Serial SKU succeeds
  INSERT INTO public.skus (
    organization_id,
    client_account_id,
    code,
    name,
    tracking_class,
    serial_source,
    serial_capture_point
  ) VALUES (
    v_org_id,
    v_client_id,
    'ACME-SMARTPHONE',
    'Smart Device',
    'serial',
    'manufacturer',
    'receipt'
  ) RETURNING id INTO v_sku_serial_id;

  ASSERT v_sku_serial_id IS NOT NULL, 'Valid Serial SKU creation failed';

  RAISE NOTICE '--- TEST 4: Packaging Hierarchy (Case UoM) & Barcodes ---';

  -- Add Master Case packaging tier (24 units per case)
  INSERT INTO public.sku_uoms (
    organization_id,
    sku_id,
    uom_level,
    uom_name,
    conversion_factor,
    length_cm,
    width_cm,
    height_cm,
    weight_kg
  ) VALUES (
    v_org_id,
    v_sku_id,
    'case',
    'Master Case (24ct)',
    24,
    40.0,
    30.0,
    25.0,
    12.500
  ) RETURNING id INTO v_case_uom_id;

  -- Add UPC barcode for Each level
  INSERT INTO public.sku_barcodes (
    organization_id,
    client_account_id,
    sku_id,
    barcode,
    barcode_type,
    is_primary
  ) VALUES (
    v_org_id,
    v_client_id,
    v_sku_id,
    '012345678905',
    'upc',
    true
  );

  -- Add GTIN-14 barcode for Master Case level
  INSERT INTO public.sku_barcodes (
    organization_id,
    client_account_id,
    sku_id,
    uom_id,
    barcode,
    barcode_type,
    is_primary
  ) VALUES (
    v_org_id,
    v_client_id,
    v_sku_id,
    v_case_uom_id,
    '10012345678902',
    'gtin14',
    true
  );

  -- Test duplicate barcode in same client must fail
  v_error_caught := false;
  BEGIN
    INSERT INTO public.sku_barcodes (
      organization_id,
      client_account_id,
      sku_id,
      barcode
    ) VALUES (
      v_org_id,
      v_client_id,
      v_sku_fefo_id,
      '012345678905' -- Already used by ACME-VIT-C-1000
    );
  EXCEPTION WHEN unique_violation THEN
    v_error_caught := true;
  END;
  ASSERT v_error_caught, 'Failed to prevent duplicate barcode within same client';

  RAISE NOTICE '--- TEST 5: Universal Barcode Resolution Service ---';

  -- Test 5a: Scan Master Case GTIN-14
  SELECT * INTO v_resolved FROM public.resolve_barcode(v_org_id, '10012345678902', v_client_id);
  ASSERT v_resolved.sku_code = 'ACME-VIT-C-1000', 'Barcode did not resolve to correct SKU';
  ASSERT v_resolved.uom_level = 'case', 'Barcode did not resolve to case UoM';
  ASSERT v_resolved.conversion_factor = 24, 'Barcode did not return conversion factor 24';

  -- Test 5b: Scan Each UPC
  SELECT * INTO v_resolved FROM public.resolve_barcode(v_org_id, '012345678905', v_client_id);
  ASSERT v_resolved.sku_code = 'ACME-VIT-C-1000', 'Barcode did not resolve to correct SKU';
  ASSERT v_resolved.uom_level = 'each', 'Barcode did not resolve to each UoM';
  ASSERT v_resolved.conversion_factor = 1, 'Barcode did not return conversion factor 1';

  -- Test 5c: Scan SKU Code Directly as Fallback
  SELECT * INTO v_resolved FROM public.resolve_barcode(v_org_id, 'ACME-PROBIOTIC', v_client_id);
  ASSERT v_resolved.sku_code = 'ACME-PROBIOTIC', 'Fallback failed to resolve direct SKU code';
  ASSERT v_resolved.rotation_rule = 'fefo', 'Resolved SKU rotation rule mismatch';

  RAISE NOTICE '--- TEST 6: Client Catalog Completeness Scoring ---';

  SELECT * INTO v_completeness FROM public.get_client_catalog_completeness(v_client_id);
  ASSERT v_completeness.total_skus = 3, 'Total SKUs count mismatch';
  ASSERT v_completeness.with_barcode >= 1, 'With barcode count mismatch';
  ASSERT v_completeness.completeness_score_pct > 0, 'Completeness score is 0%';

  RAISE NOTICE '=== ALL SPRINT 4 DATABASE TESTS PASSED SUCCESSFULLY! ===';
END $$;

ROLLBACK;
