-- ==============================================================================
-- Test Suite: sprint03_locations_suite.sql
-- Verifies Sprint 3: Precise Location Hierarchy, Floor Storage & Naming Convention
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_org_id uuid;
  v_facility_id uuid;
  v_loc_id uuid;
  v_resolved record;
  v_history_count int;
  v_convention record;
BEGIN
  RAISE NOTICE '--- TEST 1: Hierarchy Nodes & Locations Schema ---';

  -- Create test organization
  INSERT INTO public.organizations (name, slug, country, timezone, default_currency)
  VALUES ('Sprint 03 Warehouse 3PL', 'sprint-03-warehouse-3pl', 'US', 'America/Chicago', 'USD')
  RETURNING id INTO v_org_id;

  -- Create test facility
  INSERT INTO public.facilities (
    organization_id,
    name,
    short_code,
    address,
    city,
    state,
    zip_code,
    country,
    timezone
  ) VALUES (
    v_org_id,
    'Dallas 1 Central',
    'DAL1',
    '1000 Logistics Blvd',
    'Dallas',
    'TX',
    '75261',
    'USA',
    'America/Chicago'
  ) RETURNING id INTO v_facility_id;

  -- Create default facility naming convention
  INSERT INTO public.facility_naming_conventions (
    organization_id,
    facility_id,
    rack_template,
    floor_grid_template,
    bulk_lane_template
  ) VALUES (
    v_org_id,
    v_facility_id,
    '{FAC}-{WING}-{AREA}-{AISLE}-{BAY}-{LEVEL}-{POS}',
    '{FAC}-{WING}-FLR-R{ROW}-C{COL}',
    '{FAC}-{WING}-BLK-LN{LANE}-S{SLOT}'
  ) RETURNING * INTO v_convention;

  IF v_convention.separator <> '-' THEN
    RAISE EXCEPTION 'TEST 1 FAILED: Expected default separator "-"';
  END IF;

  RAISE NOTICE '--- TEST 2: Inserting Rack, Floor Grid & Bulk Locations ---';

  -- Insert a Rack Location
  INSERT INTO public.locations (
    organization_id,
    facility_id,
    full_code,
    barcode,
    short_pick_code,
    human_path,
    location_type,
    sub_type,
    building_code,
    wing_code,
    area_code,
    aisle_code,
    bay_code,
    level_code,
    position_code,
    temperature_class,
    rack_side,
    walk_sequence
  ) VALUES (
    v_org_id,
    v_facility_id,
    'DAL1-W2-ZA-A04-B12-L3-P02',
    'DAL1-W2-ZA-A04-B12-L3-P02',
    'A04-12-3-02',
    'Dallas 1 › Wing 2 › Area A › Aisle 04 › Bay 12 › Level 3 › Position 02',
    'rack_pallet_position',
    'standard',
    'DAL1',
    'W2',
    'ZA',
    'A04',
    'B12',
    'L3',
    'P02',
    'ambient',
    'even',
    104
  ) RETURNING id INTO v_loc_id;

  -- Insert a Floor Grid Cell Location
  INSERT INTO public.locations (
    organization_id,
    facility_id,
    full_code,
    barcode,
    human_path,
    location_type,
    sub_type,
    row_code,
    column_code,
    max_pallets,
    max_stack_height
  ) VALUES (
    v_org_id,
    v_facility_id,
    'DAL1-W1-FLR-R05-C03',
    'DAL1-W1-FLR-R05-C03',
    'Dallas 1 › Wing 1 › Floor Grid › Row 05 › Column 03',
    'floor_grid_cell',
    'standard',
    '05',
    '03',
    4,
    2
  );

  -- Insert a Bulk Lane Location
  INSERT INTO public.locations (
    organization_id,
    facility_id,
    full_code,
    barcode,
    human_path,
    location_type,
    sub_type,
    lane_code,
    slot_code,
    lane_depth,
    lane_rotation_rule
  ) VALUES (
    v_org_id,
    v_facility_id,
    'DAL1-W1-BLK-LN07-S02',
    'DAL1-W1-BLK-LN07-S02',
    'Dallas 1 › Wing 1 › Bulk Storage › Lane 07 › Slot 02',
    'bulk_floor_lane',
    'standard',
    '07',
    '02',
    6,
    'fifo_drive_through'
  );

  RAISE NOTICE '--- TEST 3: Code Resolution (resolve_location_by_code) ---';

  -- Resolve by full_code
  SELECT * INTO v_resolved FROM public.resolve_location_by_code(v_facility_id, 'DAL1-W2-ZA-A04-B12-L3-P02');
  IF v_resolved.id <> v_loc_id THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Could not resolve location by full_code';
  END IF;

  -- Resolve by short_pick_code
  SELECT * INTO v_resolved FROM public.resolve_location_by_code(v_facility_id, 'a04-12-3-02');
  IF v_resolved.id <> v_loc_id THEN
    RAISE EXCEPTION 'TEST 3 FAILED: Could not resolve location by short_pick_code (case-insensitive)';
  END IF;

  RAISE NOTICE '--- TEST 4: Rename Tracking & 90-Day Alias Resolution ---';

  -- Rename location to new code
  UPDATE public.locations
  SET full_code = 'DAL1-W2-ZA-A04-B12-L3-P99',
      barcode = 'DAL1-W2-ZA-A04-B12-L3-P99'
  WHERE id = v_loc_id;

  -- Check history entry was automatically created
  SELECT count(*) INTO v_history_count
  FROM public.location_code_history
  WHERE location_id = v_loc_id
    AND old_code = 'DAL1-W2-ZA-A04-B12-L3-P02';

  IF v_history_count <> 1 THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Rename trigger did not record history';
  END IF;

  -- Test resolution with OLD code
  SELECT * INTO v_resolved FROM public.resolve_location_by_code(v_facility_id, 'DAL1-W2-ZA-A04-B12-L3-P02');
  IF v_resolved.id <> v_loc_id THEN
    RAISE EXCEPTION 'TEST 4 FAILED: Could not resolve renamed location using its old code';
  END IF;

  RAISE NOTICE '--- TEST 5: Inventory Hard-Delete Protection ---';

  -- Mark location as has_held_inventory = true
  UPDATE public.locations
  SET has_held_inventory = true
  WHERE id = v_loc_id;

  -- Attempt to delete; must fail
  BEGIN
    DELETE FROM public.locations WHERE id = v_loc_id;
    RAISE EXCEPTION 'TEST 5 FAILED: Deleting a location with inventory history should have been blocked';
  EXCEPTION WHEN sqlstate '23503' THEN
    RAISE NOTICE 'Expected delete block caught successfully.';
  END;

  RAISE NOTICE '--- ALL SPRINT 03 LOCATION SUITE TESTS PASSED SUCCESSFULLY ---';
END $$;

ROLLBACK;
