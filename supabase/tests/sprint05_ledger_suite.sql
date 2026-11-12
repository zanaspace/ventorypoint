-- ==============================================================================
-- Automated Test Suite: Sprint 5 Inventory Ledger, LPNs & Traceability
-- File: supabase/tests/sprint05_ledger_suite.sql
-- ==============================================================================

DO $$
DECLARE
  v_org_id uuid;
  v_facility_id uuid;
  v_client_id uuid;
  v_loc_a uuid;
  v_loc_b uuid;
  v_sku_general uuid;
  v_sku_lot uuid;
  v_sku_serial uuid;
  v_lot_id uuid;
  v_serial_id uuid;
  v_container_id uuid;
  v_res jsonb;
  v_bal RECORD;
  v_adj_id uuid;
  v_timeline jsonb;
  v_where jsonb;
BEGIN
  RAISE NOTICE '=== SPRINT 5: INVENTORY LEDGER TEST SUITE STARTING ===';

  -- ----------------------------------------------------------------------------
  -- Setup: Organization, Facility, Client, Locations & Test SKUs
  -- ----------------------------------------------------------------------------
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug)
    VALUES ('Sprint 5 3PL Logistics', 'sprint-5-3pl')
    RETURNING id INTO v_org_id;
  END IF;

  SELECT id INTO v_facility_id FROM public.facilities WHERE organization_id = v_org_id LIMIT 1;
  IF v_facility_id IS NULL THEN
    INSERT INTO public.facilities (organization_id, name, short_code, address_line1, city, state, postal_code, country, timezone)
    VALUES (v_org_id, 'Primary Distribution Center', 'PDC5', '500 Logistics Blvd', 'Dallas', 'TX', '75201', 'US', 'America/Chicago')
    RETURNING id INTO v_facility_id;
  END IF;

  SELECT id INTO v_client_id FROM public.client_accounts WHERE organization_id = v_org_id LIMIT 1;
  IF v_client_id IS NULL THEN
    INSERT INTO public.client_accounts (organization_id, name, short_code, status)
    VALUES (v_org_id, 'OmniHealth Supplements', 'OMNI', 'active')
    RETURNING id INTO v_client_id;
  END IF;

  -- Create two distinct locations: Staging A & Rack Bay B
  INSERT INTO public.locations (
    organization_id, facility_id, full_code, barcode, human_path, location_type, active
  ) VALUES 
    (v_org_id, v_facility_id, 'PDC5-STG-A1', 'LOC*PDC5-STG-A1', 'PDC5 > Staging Area > Bay A1', 'special_area', true)
  RETURNING id INTO v_loc_a;

  INSERT INTO public.locations (
    organization_id, facility_id, full_code, barcode, human_path, location_type, active
  ) VALUES 
    (v_org_id, v_facility_id, 'PDC5-A01-01-A', 'LOC*PDC5-A01-01-A', 'PDC5 > Main Rack > Aisle 01 > Bay 01 > Level A', 'rack_pallet_position', true)
  RETURNING id INTO v_loc_b;

  -- Create SKUs: Non-unique, Lot-tracked, Serial-tracked
  INSERT INTO public.skus (
    organization_id, client_account_id, code, name, tracking_class, rotation_rule
  ) VALUES 
    (v_org_id, v_client_id, 'TEST-SKU-NONUNIQUE', 'Standard Cardboard Box', 'non_unique', 'fifo')
  RETURNING id INTO v_sku_general;

  INSERT INTO public.skus (
    organization_id, client_account_id, code, name, tracking_class, rotation_rule, expiry_required
  ) VALUES 
    (v_org_id, v_client_id, 'TEST-SKU-LOT', 'Omega-3 Fish Oil 1000mg', 'lot', 'fefo', true)
  RETURNING id INTO v_sku_lot;

  INSERT INTO public.skus (
    organization_id, client_account_id, code, name, tracking_class, serial_source, serial_capture_point
  ) VALUES 
    (v_org_id, v_client_id, 'TEST-SKU-SERIAL', 'Industrial Barcode Scanner 5G', 'serial', 'manufacturer', 'both')
  RETURNING id INTO v_sku_serial;

  RAISE NOTICE 'Test Environment Provisioned: Org %, Facility %, Client %', v_org_id, v_facility_id, v_client_id;

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 1: Inbound Receiving Primitives (receive_into)
  -- ----------------------------------------------------------------------------
  -- 1.1 Non-unique SKU receiving
  v_res := public.receive_into(
    p_facility_id => v_facility_id,
    p_location_id => v_loc_a,
    p_container_id => NULL,
    p_sku_id => v_sku_general,
    p_quantity => 100,
    p_notes => 'Initial test stock receiving'
  );
  ASSERT (v_res->>'success')::boolean = true, 'Failed to receive non-unique stock';
  ASSERT (v_res->>'quantity_received')::numeric = 100, 'Received quantity mismatch';

  -- Verify balance exists with qty = 100
  SELECT * INTO v_bal FROM public.inventory_balances 
  WHERE facility_id = v_facility_id AND location_id = v_loc_a AND sku_id = v_sku_general;
  ASSERT v_bal.on_hand_qty = 100, 'Balance on-hand qty should be 100';

  -- 1.2 Lot-tracked SKU receiving (FEFO)
  v_res := public.receive_into(
    p_facility_id => v_facility_id,
    p_location_id => v_loc_a,
    p_container_id => NULL,
    p_sku_id => v_sku_lot,
    p_lot_number => 'LOT-2026-OMNI-01',
    p_mfg_date => '2026-01-15'::date,
    p_expiry_date => '2027-01-15'::date,
    p_quantity => 50,
    p_notes => 'Fresh lot receipt'
  );
  ASSERT (v_res->>'success')::boolean = true, 'Failed to receive lot stock';
  v_lot_id := (v_res->>'lot_id')::uuid;

  SELECT * INTO v_bal FROM public.inventory_balances
  WHERE facility_id = v_facility_id AND location_id = v_loc_a AND sku_id = v_sku_lot AND lot_id = v_lot_id;
  ASSERT v_bal.on_hand_qty = 50, 'Lot balance on-hand qty should be 50';

  -- 1.3 Serialized SKU receiving
  v_res := public.receive_into(
    p_facility_id => v_facility_id,
    p_location_id => v_loc_a,
    p_container_id => NULL,
    p_sku_id => v_sku_serial,
    p_serial_numbers => ARRAY['SN-5G-90001', 'SN-5G-90002', 'SN-5G-90003']
  );
  ASSERT (v_res->>'success')::boolean = true, 'Failed to receive serial stock';
  ASSERT (v_res->>'quantity_received')::numeric = 3, 'Serial receipt count mismatch';

  -- Verify each serial has exactly 1 balance
  SELECT * INTO v_bal FROM public.inventory_balances
  WHERE facility_id = v_facility_id AND location_id = v_loc_a AND sku_id = v_sku_serial
  LIMIT 1;
  ASSERT v_bal.on_hand_qty = 1, 'Serial balance must be exactly 1';

  RAISE NOTICE 'TEST GROUP 1 PASSED: Inbound receiving primitives functional.';

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 2: Ledger Immutability & Anti-Corruption Guard
  -- ----------------------------------------------------------------------------
  BEGIN
    UPDATE public.inventory_transactions SET quantity = 9999 WHERE sku_id = v_sku_general;
    RAISE EXCEPTION 'Immutability failure: inventory_transactions update was allowed!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'VP001' THEN
      RAISE NOTICE 'Immutability guard correctly blocked UPDATE on inventory_transactions.';
    ELSE
      RAISE EXCEPTION 'Unexpected error code: % (msg: %)', SQLSTATE, SQLERRM;
    END IF;
  END;

  BEGIN
    DELETE FROM public.inventory_transactions WHERE sku_id = v_sku_general;
    RAISE EXCEPTION 'Immutability failure: inventory_transactions delete was allowed!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'VP001' THEN
      RAISE NOTICE 'Immutability guard correctly blocked DELETE on inventory_transactions.';
    ELSE
      RAISE EXCEPTION 'Unexpected error code: % (msg: %)', SQLSTATE, SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'TEST GROUP 2 PASSED: Ledger immutability verified.';

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 3: Constraint & Tracking Class Invariants
  -- ----------------------------------------------------------------------------
  -- 3.1 Attempting to move more than available must fail
  BEGIN
    PERFORM public.move_inventory(
      p_facility_id => v_facility_id,
      p_from_location_id => v_loc_a,
      p_from_container_id => NULL,
      p_to_location_id => v_loc_b,
      p_to_container_id => NULL,
      p_sku_id => v_sku_general,
      p_lot_id => NULL,
      p_serial_id => NULL,
      p_quantity => 500 -- only 100 available
    );
    RAISE EXCEPTION 'Allowed over-drawing inventory balance!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'VP016' THEN
      RAISE NOTICE 'Correctly rejected over-drawing balance (VP016).';
    ELSE
      RAISE EXCEPTION 'Expected VP016, got % (msg: %)', SQLSTATE, SQLERRM;
    END IF;
  END;

  -- 3.2 Attempting to move lot-tracked SKU without lot must fail
  BEGIN
    PERFORM public.move_inventory(
      p_facility_id => v_facility_id,
      p_from_location_id => v_loc_a,
      p_from_container_id => NULL,
      p_to_location_id => v_loc_b,
      p_to_container_id => NULL,
      p_sku_id => v_sku_lot,
      p_lot_id => NULL, -- missing lot!
      p_serial_id => NULL,
      p_quantity => 10
    );
    RAISE EXCEPTION 'Allowed moving lot-tracked SKU without lot ID!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'VP013' THEN
      RAISE NOTICE 'Correctly rejected lot-tracked SKU move without lot (VP013).';
    ELSE
      RAISE EXCEPTION 'Expected VP013, got % (msg: %)', SQLSTATE, SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'TEST GROUP 3 PASSED: Business invariants & tracking constraints enforced.';

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 4: Atomic Inventory Move & Mass Conservation
  -- ----------------------------------------------------------------------------
  v_res := public.move_inventory(
    p_facility_id => v_facility_id,
    p_from_location_id => v_loc_a,
    p_from_container_id => NULL,
    p_to_location_id => v_loc_b,
    p_to_container_id => NULL,
    p_sku_id => v_sku_general,
    p_lot_id => NULL,
    p_serial_id => NULL,
    p_quantity => 40,
    p_reason => 'putaway_to_rack'
  );
  ASSERT (v_res->>'success')::boolean = true, 'Failed to move inventory';

  -- Check source balance: 100 - 40 = 60
  SELECT on_hand_qty INTO v_bal.on_hand_qty FROM public.inventory_balances
  WHERE facility_id = v_facility_id AND location_id = v_loc_a AND sku_id = v_sku_general;
  ASSERT v_bal.on_hand_qty = 60, 'Source balance should be 60 after moving 40';

  -- Check dest balance: 0 + 40 = 40
  SELECT on_hand_qty INTO v_bal.on_hand_qty FROM public.inventory_balances
  WHERE facility_id = v_facility_id AND location_id = v_loc_b AND sku_id = v_sku_general;
  ASSERT v_bal.on_hand_qty = 40, 'Destination balance should be 40 after move';

  RAISE NOTICE 'TEST GROUP 4 PASSED: Atomic move and conservation of mass verified.';

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 5: Container / LPN Management & Atomic Pallet Move
  -- ----------------------------------------------------------------------------
  INSERT INTO public.containers (
    organization_id, facility_id, client_account_id, lpn, container_type, current_location_id
  ) VALUES (
    v_org_id, v_facility_id, v_client_id, 'LPN-TEST-99001', 'pallet', v_loc_a
  ) RETURNING id INTO v_container_id;

  -- Move 30 units of non-unique stock into the pallet container
  PERFORM public.move_inventory(
    p_facility_id => v_facility_id,
    p_from_location_id => v_loc_a,
    p_from_container_id => NULL,
    p_to_location_id => v_loc_a,
    p_to_container_id => v_container_id,
    p_sku_id => v_sku_general,
    p_lot_id => NULL,
    p_serial_id => NULL,
    p_quantity => 30,
    p_reason => 'pack_into_pallet'
  );

  -- Move entire pallet LPN-TEST-99001 from Loc A to Loc B
  v_res := public.move_container(
    p_lpn => 'LPN-TEST-99001',
    p_to_location_id => v_loc_b,
    p_notes => 'Forklift transfer to rack bay B'
  );
  ASSERT (v_res->>'success')::boolean = true, 'Failed to move container';
  ASSERT (v_res->>'sku_lines_moved')::integer >= 1, 'Container SKU lines moved should be at least 1';

  -- Verify container current location
  SELECT current_location_id INTO v_bal.location_id FROM public.containers WHERE id = v_container_id;
  ASSERT v_bal.location_id = v_loc_b, 'Container location should be Loc B';

  -- Verify inventory balance inside container now points to Loc B
  SELECT on_hand_qty INTO v_bal.on_hand_qty FROM public.inventory_balances
  WHERE facility_id = v_facility_id AND location_id = v_loc_b AND container_id = v_container_id;
  ASSERT v_bal.on_hand_qty = 30, 'Container inventory balance at Loc B should be 30';

  RAISE NOTICE 'TEST GROUP 5 PASSED: Container (LPN) atomic relocation verified.';

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 6: Adjustment Approval Threshold & Supervisor Queue
  -- ----------------------------------------------------------------------------
  -- 6.1 Small adjustment (delta = 5) -> auto-applies
  v_res := public.adjust_inventory(
    p_facility_id => v_facility_id,
    p_location_id => v_loc_a,
    p_container_id => NULL,
    p_sku_id => v_sku_general,
    p_lot_id => NULL,
    p_serial_id => NULL,
    p_quantity_delta => 5,
    p_reason_code => 'vendor_mispack',
    p_notes => 'Small variance within threshold',
    p_actor_id => NULL
  );
  ASSERT (v_res->>'success')::boolean = true, 'Small adjustment failed';
  ASSERT (v_res->>'queued_for_approval')::boolean = false, 'Small adjustment should not require approval';

  -- 6.2 Large adjustment (delta = 25 > 10) -> queues for supervisor approval
  v_res := public.adjust_inventory(
    p_facility_id => v_facility_id,
    p_location_id => v_loc_a,
    p_container_id => NULL,
    p_sku_id => v_sku_general,
    p_lot_id => NULL,
    p_serial_id => NULL,
    p_quantity_delta => 25,
    p_reason_code => 'cycle_count_discrepancy',
    p_notes => 'Large count adjustment',
    p_actor_id => NULL
  );
  ASSERT (v_res->>'success')::boolean = true, 'Large adjustment call failed';
  ASSERT (v_res->>'queued_for_approval')::boolean = true, 'Large adjustment must be queued for approval';
  v_adj_id := (v_res->>'adjustment_id')::uuid;

  -- 6.3 Supervisor approves the adjustment
  v_res := public.approve_inventory_adjustment(
    p_adjustment_id => v_adj_id,
    p_reviewer_id => gen_random_uuid(),
    p_reviewer_role => 'supervisor',
    p_notes => 'Verified during manager walk'
  );
  ASSERT (v_res->>'success')::boolean = true, 'Failed to approve adjustment';
  ASSERT (v_res->>'approved')::boolean = true, 'Approved flag mismatch';

  RAISE NOTICE 'TEST GROUP 6 PASSED: Supervisor approval queue and threshold enforced.';

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 7: Expiry Status Evaluation & Auto-Segregation
  -- ----------------------------------------------------------------------------
  -- Insert an expired lot
  INSERT INTO public.lots (
    organization_id, client_account_id, sku_id, lot_number, mfg_date, expiry_date, expiry_status
  ) VALUES (
    v_org_id, v_client_id, v_sku_lot, 'LOT-EXPIRED-TEST', '2024-01-01'::date, '2025-01-01'::date, 'ok'
  ) RETURNING id INTO v_lot_id;

  -- Add available balance for this expired lot
  INSERT INTO public.inventory_balances (
    organization_id, facility_id, location_id, sku_id, lot_id, status, on_hand_qty
  ) VALUES (
    v_org_id, v_facility_id, v_loc_a, v_sku_lot, v_lot_id, 'available', 15
  );

  -- Run expiry evaluation
  v_res := public.evaluate_expiry_statuses();
  ASSERT (v_res->>'success')::boolean = true, 'Expiry evaluation failed';
  ASSERT (v_res->>'lots_marked_expired')::integer >= 1, 'Expired lot count should be >= 1';

  -- Verify balance is now status = 'expired'
  SELECT status INTO v_bal.status FROM public.inventory_balances
  WHERE lot_id = v_lot_id;
  ASSERT v_bal.status = 'expired', 'Expired stock must be relocated to status = expired';

  RAISE NOTICE 'TEST GROUP 7 PASSED: Expiry status evaluation and segregation functional.';

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 8: 'Where Is It?' Search & Traceability Timeline
  -- ----------------------------------------------------------------------------
  -- Search by LPN
  v_where := public.where_is_it('LPN-TEST-99001', v_facility_id);
  ASSERT jsonb_array_length(v_where) >= 1, 'Where Is It failed to locate LPN';
  ASSERT (v_where->0->>'container_lpn') = 'LPN-TEST-99001', 'LPN mismatch in search results';

  -- Item timeline for SKU
  v_timeline := public.get_item_timeline('sku', v_sku_general, 20);
  ASSERT jsonb_array_length(v_timeline) >= 2, 'Item timeline should have multiple history events';

  RAISE NOTICE 'TEST GROUP 8 PASSED: Where Is It search and item timeline validated.';

  -- ----------------------------------------------------------------------------
  -- TEST GROUP 9: Nightly Reconciliation Job
  -- ----------------------------------------------------------------------------
  v_res := public.reconcile_inventory_balances(v_facility_id);
  ASSERT (v_res->>'success')::boolean = true, 'Reconciliation run failed';
  ASSERT (v_res->>'is_clean')::boolean = true, 'Reconciliation should report clean balances';

  RAISE NOTICE 'TEST GROUP 9 PASSED: Reconciliation engine verified clean.';

  -- ----------------------------------------------------------------------------
  -- Cleanup Test Artifacts
  -- ----------------------------------------------------------------------------
  -- In a real ledger, historical transactions are immutable and never deleted.
  -- Archive test SKUs and deactivate test locations:
  UPDATE public.skus SET status = 'discontinued' WHERE id IN (v_sku_general, v_sku_lot, v_sku_serial);
  UPDATE public.locations SET active = false WHERE id IN (v_loc_a, v_loc_b);

  RAISE NOTICE '=== ALL 9 SPRINT 5 LEDGER TEST GROUPS PASSED CLEANLY! ===';
END $$;
