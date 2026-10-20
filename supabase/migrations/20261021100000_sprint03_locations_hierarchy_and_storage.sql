-- ==============================================================================
-- Migration: 20261021100000_sprint03_locations_hierarchy_and_storage.sql
-- Sprint 3: Precise Location Hierarchy, Floor Storage & Naming Convention
-- ==============================================================================

-- 1. Facility Hierarchy Nodes (Tree: Building -> Wing -> Floor -> Area -> Aisle -> Bay -> Level -> Position)
CREATE TABLE IF NOT EXISTS public.location_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.location_nodes(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN ('building', 'wing', 'floor_level', 'area', 'aisle', 'bay', 'level', 'position')),
  code text NOT NULL,
  name text NOT NULL,
  path text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sequence_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_location_nodes_facility ON public.location_nodes (facility_id);
CREATE INDEX IF NOT EXISTS idx_location_nodes_parent ON public.location_nodes (parent_id);
CREATE INDEX IF NOT EXISTS idx_location_nodes_org ON public.location_nodes (organization_id);

-- 2. Physical Storage Locations (Leaf Addressable Nodes)
CREATE TABLE IF NOT EXISTS public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  node_id uuid REFERENCES public.location_nodes(id) ON DELETE SET NULL,
  
  -- Identifiers & Scannables
  full_code text NOT NULL,
  barcode text NOT NULL,
  short_pick_code text,
  human_path text NOT NULL,
  
  -- Storage Type
  location_type text NOT NULL CHECK (
    location_type IN (
      'rack_pallet_position',
      'shelf_bin',
      'floor_grid_cell',
      'bulk_floor_lane',
      'special_area'
    )
  ),
  sub_type text NOT NULL DEFAULT 'standard', -- cage, cold_room, hazmat, mezzanine, staging_lane, dock_door, yard_slot, returns, quarantine, damaged, pack_station, mobile_cart, mobile_tote
  
  -- Structured Path Elements
  building_code text,
  wing_code text,
  floor_code text,
  area_code text,
  aisle_code text,
  bay_code text,
  level_code text,
  position_code text,
  row_code text,
  column_code text,
  lane_code text,
  slot_code text,
  
  -- Capacity & Dimensions
  max_weight_kg numeric,
  max_volume_cbm numeric,
  max_pallets integer NOT NULL DEFAULT 1,
  max_stack_height integer NOT NULL DEFAULT 1,
  lane_depth integer,
  lane_rotation_rule text CHECK (lane_rotation_rule IN ('fifo_drive_through', 'lifo_single_entry')),
  temperature_class text NOT NULL DEFAULT 'ambient' CHECK (
    temperature_class IN ('ambient', 'chilled', 'frozen', 'deep_freeze', 'temperature_controlled')
  ),
  security_level text NOT NULL DEFAULT 'standard' CHECK (
    security_level IN ('standard', 'caged_vault', 'hazmat_secure', 'high_value')
  ),
  
  -- Operational Rules & Flags
  mixed_sku_allowed boolean NOT NULL DEFAULT true,
  mixed_lot_allowed boolean NOT NULL DEFAULT true,
  pickable boolean NOT NULL DEFAULT true,
  sellable boolean NOT NULL DEFAULT true,
  receivable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  has_held_inventory boolean NOT NULL DEFAULT false,
  
  -- Routing & Spatial Coordinates
  rack_side text NOT NULL DEFAULT 'none' CHECK (rack_side IN ('left', 'right', 'odd', 'even', 'none')),
  walk_sequence integer NOT NULL DEFAULT 0,
  x_coord numeric,
  y_coord numeric,
  z_coord numeric,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_locations_facility_code UNIQUE (facility_id, full_code),
  CONSTRAINT uq_locations_facility_barcode UNIQUE (facility_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_locations_facility_type ON public.locations (facility_id, location_type);
CREATE INDEX IF NOT EXISTS idx_locations_facility_area ON public.locations (facility_id, area_code);
CREATE INDEX IF NOT EXISTS idx_locations_facility_active ON public.locations (facility_id, active);
CREATE INDEX IF NOT EXISTS idx_locations_walk_seq ON public.locations (facility_id, walk_sequence);
CREATE INDEX IF NOT EXISTS idx_locations_org ON public.locations (organization_id);

-- 3. Facility Naming Convention Settings
CREATE TABLE IF NOT EXISTS public.facility_naming_conventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE UNIQUE,
  
  rack_template text NOT NULL DEFAULT '{FAC}-{WING}-{AREA}-{AISLE}-{BAY}-{LEVEL}-{POS}',
  floor_grid_template text NOT NULL DEFAULT '{FAC}-{WING}-FLR-R{ROW}-C{COL}',
  bulk_lane_template text NOT NULL DEFAULT '{FAC}-{WING}-BLK-LN{LANE}-S{SLOT}',
  special_area_template text NOT NULL DEFAULT '{FAC}-{WING}-{AREA}-{NN}',
  
  separator text NOT NULL DEFAULT '-',
  segment_widths jsonb NOT NULL DEFAULT '{
    "FAC": 4,
    "WING": 2,
    "AREA": 2,
    "AISLE": 3,
    "BAY": 3,
    "LEVEL": 2,
    "POS": 3,
    "ROW": 2,
    "COL": 2,
    "LANE": 2,
    "SLOT": 2,
    "NN": 2
  }'::jsonb,
  
  excluded_chars text[] NOT NULL DEFAULT ARRAY['O', '0', 'I', '1', 'S', '5'],
  odd_even_aisle_sides boolean NOT NULL DEFAULT true,
  bottom_up_levels boolean NOT NULL DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_naming_conventions_org ON public.facility_naming_conventions (organization_id);

-- 4. Location Code History (Old codes resolve for 90 days after rename)
CREATE TABLE IF NOT EXISTS public.location_code_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  old_code text NOT NULL,
  new_code text NOT NULL,
  renamed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS idx_location_history_lookup ON public.location_code_history (facility_id, old_code, expires_at);

-- 5. Row-Level Security (RLS)
ALTER TABLE public.location_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_naming_conventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_code_history ENABLE ROW LEVEL SECURITY;

-- location_nodes policies
DROP POLICY IF EXISTS "Members can view location nodes" ON public.location_nodes;
CREATE POLICY "Members can view location nodes" ON public.location_nodes
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Ops managers and above can manage location nodes" ON public.location_nodes;
CREATE POLICY "Ops managers and above can manage location nodes" ON public.location_nodes
  FOR ALL TO authenticated
  USING (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support'))
  WITH CHECK (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support'));

-- locations policies
DROP POLICY IF EXISTS "Members can view locations" ON public.locations;
CREATE POLICY "Members can view locations" ON public.locations
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Ops managers and above can manage locations" ON public.locations;
CREATE POLICY "Ops managers and above can manage locations" ON public.locations
  FOR ALL TO authenticated
  USING (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support'))
  WITH CHECK (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support'));

-- facility_naming_conventions policies
DROP POLICY IF EXISTS "Members can view naming conventions" ON public.facility_naming_conventions;
CREATE POLICY "Members can view naming conventions" ON public.facility_naming_conventions
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Ops managers and above can manage naming conventions" ON public.facility_naming_conventions;
CREATE POLICY "Ops managers and above can manage naming conventions" ON public.facility_naming_conventions
  FOR ALL TO authenticated
  USING (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support'))
  WITH CHECK (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support'));

-- location_code_history policies
DROP POLICY IF EXISTS "Members can view location code history" ON public.location_code_history;
CREATE POLICY "Members can view location code history" ON public.location_code_history
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

-- Service role bypass for all tables
GRANT ALL ON public.location_nodes TO authenticated, service_role;
GRANT ALL ON public.locations TO authenticated, service_role;
GRANT ALL ON public.facility_naming_conventions TO authenticated, service_role;
GRANT ALL ON public.location_code_history TO authenticated, service_role;

-- 6. Triggers for Business Integrity

-- Prevent hard-deletion of locations that have held inventory
CREATE OR REPLACE FUNCTION public.locations_protect_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.has_held_inventory = true THEN
    RAISE EXCEPTION 'Cannot delete location %: it has held inventory. Deactivate it instead.', OLD.full_code
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_locations_protect_delete ON public.locations;
CREATE TRIGGER trg_locations_protect_delete
  BEFORE DELETE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.locations_protect_delete();

-- Record rename in location_code_history
CREATE OR REPLACE FUNCTION public.locations_track_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.full_code IS DISTINCT FROM NEW.full_code THEN
    INSERT INTO public.location_code_history (
      organization_id,
      facility_id,
      location_id,
      old_code,
      new_code,
      renamed_by
    ) VALUES (
      NEW.organization_id,
      NEW.facility_id,
      NEW.id,
      OLD.full_code,
      NEW.full_code,
      auth.uid()
    );
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_locations_track_rename ON public.locations;
CREATE TRIGGER trg_locations_track_rename
  BEFORE UPDATE ON public.locations
  FOR EACH ROW
  EXECUTE FUNCTION public.locations_track_rename();

-- 7. Helper: Resolve location by code, barcode, pick code, or historical code
CREATE OR REPLACE FUNCTION public.resolve_location_by_code(
  p_facility_id uuid,
  p_code text
)
RETURNS SETOF public.locations
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_clean_code text := upper(trim(p_code));
  v_resolved_id uuid;
BEGIN
  -- 1. Direct match on full_code or barcode or short_pick_code
  RETURN QUERY
  SELECT *
  FROM public.locations
  WHERE facility_id = p_facility_id
    AND (
      full_code = v_clean_code
      OR barcode = v_clean_code
      OR short_pick_code = v_clean_code
    )
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- 2. Check 90-day historical alias if not found directly
  SELECT location_id INTO v_resolved_id
  FROM public.location_code_history
  WHERE facility_id = p_facility_id
    AND old_code = v_clean_code
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_resolved_id IS NOT NULL THEN
    RETURN QUERY
    SELECT *
    FROM public.locations
    WHERE id = v_resolved_id
    LIMIT 1;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_location_by_code(uuid, text) TO authenticated, service_role;

-- 8. Attach Audit Log triggers if audit_row_change() exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
    DROP TRIGGER IF EXISTS trg_audit_location_nodes ON public.location_nodes;
    CREATE TRIGGER trg_audit_location_nodes
      AFTER INSERT OR UPDATE OR DELETE ON public.location_nodes
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

    DROP TRIGGER IF EXISTS trg_audit_locations ON public.locations;
    CREATE TRIGGER trg_audit_locations
      AFTER INSERT OR UPDATE OR DELETE ON public.locations
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

    DROP TRIGGER IF EXISTS trg_audit_naming_conventions ON public.facility_naming_conventions;
    CREATE TRIGGER trg_audit_naming_conventions
      AFTER INSERT OR UPDATE OR DELETE ON public.facility_naming_conventions
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
  END IF;
END $$;
