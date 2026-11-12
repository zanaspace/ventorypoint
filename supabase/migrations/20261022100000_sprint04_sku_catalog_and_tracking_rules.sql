-- ==============================================================================
-- Migration: 20261022100000_sprint04_sku_catalog_and_tracking_rules.sql
-- Sprint 4: SKU Catalog, Tracking Classes & Rotation Rules
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Client Tracking & Rotation Defaults
CREATE TABLE IF NOT EXISTS public.client_tracking_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  default_tracking_class text NOT NULL DEFAULT 'non_unique' CHECK (
    default_tracking_class IN ('non_unique', 'lot', 'serial', 'lot_serial')
  ),
  default_rotation_rule text NOT NULL DEFAULT 'fifo' CHECK (
    default_rotation_rule IN ('fifo', 'fefo', 'lifo', 'customer_lot')
  ),
  default_shelf_life_days integer CHECK (default_shelf_life_days IS NULL OR default_shelf_life_days > 0),
  default_min_shelf_life_receipt_days integer CHECK (default_min_shelf_life_receipt_days IS NULL OR default_min_shelf_life_receipt_days >= 0),
  default_min_shelf_life_ship_days integer CHECK (default_min_shelf_life_ship_days IS NULL OR default_min_shelf_life_ship_days >= 0),
  default_near_expiry_days integer NOT NULL DEFAULT 60 CHECK (default_near_expiry_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_tracking_defaults UNIQUE (client_account_id)
);

CREATE INDEX IF NOT EXISTS idx_client_tracking_defaults_org ON public.client_tracking_defaults(organization_id);

-- 2. Master SKUs Table
CREATE TABLE IF NOT EXISTS public.skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  
  -- Master Identifiers
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  category text,
  brand text,
  
  -- Tracking Class & Serialization
  tracking_class text NOT NULL DEFAULT 'non_unique' CHECK (
    tracking_class IN ('non_unique', 'lot', 'serial', 'lot_serial')
  ),
  serial_source text CHECK (serial_source IN ('manufacturer', 'generated')),
  serial_capture_point text CHECK (serial_capture_point IN ('receipt', 'shipment', 'both')),
  serial_pattern text, -- Optional regex pattern for serial validation
  uid_prefix text NOT NULL DEFAULT 'UID',
  
  -- Rotation & Shelf-Life Rules
  rotation_rule text NOT NULL DEFAULT 'fifo' CHECK (
    rotation_rule IN ('fifo', 'fefo', 'lifo', 'customer_lot')
  ),
  expiry_required boolean NOT NULL DEFAULT false,
  mfg_date_required boolean NOT NULL DEFAULT false,
  shelf_life_days integer CHECK (shelf_life_days IS NULL OR shelf_life_days > 0),
  min_shelf_life_receipt_days integer CHECK (min_shelf_life_receipt_days IS NULL OR min_shelf_life_receipt_days >= 0),
  min_shelf_life_ship_days integer CHECK (min_shelf_life_ship_days IS NULL OR min_shelf_life_ship_days >= 0),
  near_expiry_days integer NOT NULL DEFAULT 60 CHECK (near_expiry_days >= 0),
  
  -- Storage & Safety Classifications
  temperature_class text NOT NULL DEFAULT 'ambient' CHECK (
    temperature_class IN ('ambient', 'chilled', 'frozen', 'deep_freeze', 'temperature_controlled')
  ),
  hazmat_class text, -- e.g. 'Class 9', 'UN3481 Lithium Ion'
  fragile boolean NOT NULL DEFAULT false,
  country_of_origin text,
  hs_code text,
  
  -- Media & Custom Attributes
  images text[] NOT NULL DEFAULT '{}',
  custom_attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_skus_client_code UNIQUE (client_account_id, code),
  CONSTRAINT chk_sku_fefo_expiry CHECK (rotation_rule != 'fefo' OR expiry_required = true),
  CONSTRAINT chk_sku_serial_rules CHECK (
    tracking_class NOT IN ('serial', 'lot_serial') OR
    (serial_source IS NOT NULL AND serial_capture_point IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_skus_org_client ON public.skus(organization_id, client_account_id);
CREATE INDEX IF NOT EXISTS idx_skus_code_trgm ON public.skus USING gin (code gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skus_name_trgm ON public.skus USING gin (name gin_trgm_ops);

-- 3. SKU Units of Measure (UoM Packaging Hierarchy)
CREATE TABLE IF NOT EXISTS public.sku_uoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  uom_level text NOT NULL CHECK (uom_level IN ('each', 'inner', 'case', 'pallet')),
  uom_name text NOT NULL,
  conversion_factor integer NOT NULL CHECK (conversion_factor >= 1),
  
  -- Physical Dimensions & Weights
  length_cm numeric(10,2) CHECK (length_cm IS NULL OR length_cm >= 0),
  width_cm numeric(10,2) CHECK (width_cm IS NULL OR width_cm >= 0),
  height_cm numeric(10,2) CHECK (height_cm IS NULL OR height_cm >= 0),
  weight_kg numeric(10,3) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  volume_cbm numeric(12,6) GENERATED ALWAYS AS (
    ROUND((COALESCE(length_cm, 0) * COALESCE(width_cm, 0) * COALESCE(height_cm, 0)) / 1000000.0, 6)
  ) STORED,
  
  -- Operational Flags
  is_receivable boolean NOT NULL DEFAULT true,
  is_pickable boolean NOT NULL DEFAULT true,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_sku_uom_level UNIQUE (sku_id, uom_level)
);

CREATE INDEX IF NOT EXISTS idx_sku_uoms_sku ON public.sku_uoms(sku_id);
CREATE INDEX IF NOT EXISTS idx_sku_uoms_org ON public.sku_uoms(organization_id);

-- 4. SKU Barcodes Table
CREATE TABLE IF NOT EXISTS public.sku_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  uom_id uuid REFERENCES public.sku_uoms(id) ON DELETE SET NULL,
  barcode text NOT NULL,
  barcode_type text NOT NULL DEFAULT 'upc' CHECK (
    barcode_type IN ('upc', 'ean', 'gtin14', 'code128', 'custom')
  ),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_client_barcode UNIQUE (client_account_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_sku_barcodes_lookup ON public.sku_barcodes(organization_id, barcode);
CREATE INDEX IF NOT EXISTS idx_sku_barcodes_sku ON public.sku_barcodes(sku_id);

-- 5. SKU Marketplace & Channel Aliases
CREATE TABLE IF NOT EXISTS public.sku_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (
    channel_type IN ('shopify', 'amazon', 'woocommerce', 'walmart', 'ebay', 'custom')
  ),
  channel_sku text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_client_channel_sku UNIQUE (client_account_id, channel_type, channel_sku)
);

CREATE INDEX IF NOT EXISTS idx_sku_aliases_lookup ON public.sku_aliases(organization_id, channel_type, channel_sku);

-- 6. Kit / Bundle Definitions
CREATE TABLE IF NOT EXISTS public.kit_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  component_sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT uq_kit_parent_component UNIQUE (parent_sku_id, component_sku_id),
  CONSTRAINT chk_no_self_kit CHECK (parent_sku_id != component_sku_id)
);

CREATE INDEX IF NOT EXISTS idx_kit_components_parent ON public.kit_components(parent_sku_id);

-- ==============================================================================
-- 7. Functions & RPCs
-- ==============================================================================

-- 7.1 Auto-create default 'each' packaging level on SKU insert
CREATE OR REPLACE FUNCTION public.fn_sku_auto_default_uom()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.sku_uoms (
    organization_id,
    sku_id,
    uom_level,
    uom_name,
    conversion_factor,
    is_receivable,
    is_pickable
  ) VALUES (
    NEW.organization_id,
    NEW.id,
    'each',
    'Each (Unit)',
    1,
    true,
    true
  ) ON CONFLICT (sku_id, uom_level) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sku_auto_default_uom ON public.skus;
CREATE TRIGGER trg_sku_auto_default_uom
  AFTER INSERT ON public.skus
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sku_auto_default_uom();

-- 7.2 Universal Barcode Resolution Service
-- Resolves any scanned barcode (UPC, GTIN, Serial, SKU code) across clients or filtered by client
CREATE OR REPLACE FUNCTION public.resolve_barcode(
  p_organization_id uuid,
  p_barcode text,
  p_client_id uuid DEFAULT NULL
)
RETURNS TABLE (
  sku_id uuid,
  client_account_id uuid,
  client_name text,
  client_code text,
  sku_code text,
  sku_name text,
  uom_id uuid,
  uom_level text,
  uom_name text,
  conversion_factor integer,
  barcode_matched text,
  barcode_type text,
  tracking_class text,
  serial_source text,
  serial_capture_point text,
  rotation_rule text,
  expiry_required boolean,
  shelf_life_days integer,
  min_shelf_life_receipt_days integer,
  temperature_class text,
  hazmat_class text,
  fragile boolean,
  weight_kg numeric,
  length_cm numeric,
  width_cm numeric,
  height_cm numeric
) AS $$
DECLARE
  v_clean text := trim(p_barcode);
BEGIN
  RETURN QUERY
  -- 1. Check direct barcode matches
  SELECT
    s.id AS sku_id,
    s.client_account_id,
    c.name AS client_name,
    c.short_code AS client_code,
    s.code AS sku_code,
    s.name AS sku_name,
    u.id AS uom_id,
    COALESCE(u.uom_level, 'each') AS uom_level,
    COALESCE(u.uom_name, 'Each (Unit)') AS uom_name,
    COALESCE(u.conversion_factor, 1) AS conversion_factor,
    b.barcode AS barcode_matched,
    b.barcode_type,
    s.tracking_class,
    s.serial_source,
    s.serial_capture_point,
    s.rotation_rule,
    s.expiry_required,
    s.shelf_life_days,
    s.min_shelf_life_receipt_days,
    s.temperature_class,
    s.hazmat_class,
    s.fragile,
    COALESCE(u.weight_kg, 0) AS weight_kg,
    COALESCE(u.length_cm, 0) AS length_cm,
    COALESCE(u.width_cm, 0) AS width_cm,
    COALESCE(u.height_cm, 0) AS height_cm
  FROM public.sku_barcodes b
  JOIN public.skus s ON s.id = b.sku_id
  JOIN public.client_accounts c ON c.id = s.client_account_id
  LEFT JOIN public.sku_uoms u ON u.id = b.uom_id
  WHERE b.organization_id = p_organization_id
    AND b.barcode = v_clean
    AND (p_client_id IS NULL OR s.client_account_id = p_client_id)
    AND s.status = 'active'

  UNION

  -- 2. Fallback: Check if scanned value is the exact SKU code itself
  SELECT
    s.id AS sku_id,
    s.client_account_id,
    c.name AS client_name,
    c.short_code AS client_code,
    s.code AS sku_code,
    s.name AS sku_name,
    u.id AS uom_id,
    COALESCE(u.uom_level, 'each') AS uom_level,
    COALESCE(u.uom_name, 'Each (Unit)') AS uom_name,
    COALESCE(u.conversion_factor, 1) AS conversion_factor,
    s.code AS barcode_matched,
    'sku_code' AS barcode_type,
    s.tracking_class,
    s.serial_source,
    s.serial_capture_point,
    s.rotation_rule,
    s.expiry_required,
    s.shelf_life_days,
    s.min_shelf_life_receipt_days,
    s.temperature_class,
    s.hazmat_class,
    s.fragile,
    COALESCE(u.weight_kg, 0) AS weight_kg,
    COALESCE(u.length_cm, 0) AS length_cm,
    COALESCE(u.width_cm, 0) AS width_cm,
    COALESCE(u.height_cm, 0) AS height_cm
  FROM public.skus s
  JOIN public.client_accounts c ON c.id = s.client_account_id
  LEFT JOIN public.sku_uoms u ON u.sku_id = s.id AND u.uom_level = 'each'
  WHERE s.organization_id = p_organization_id
    AND s.code = v_clean
    AND (p_client_id IS NULL OR s.client_account_id = p_client_id)
    AND s.status = 'active'
    AND NOT EXISTS (
      -- Don't duplicate if already matched by barcode above
      SELECT 1 FROM public.sku_barcodes b2
      WHERE b2.organization_id = p_organization_id
        AND b2.barcode = v_clean
        AND b2.sku_id = s.id
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 7.3 Client Catalog Completeness Scoring View / Function
CREATE OR REPLACE FUNCTION public.get_client_catalog_completeness(p_client_id uuid)
RETURNS TABLE (
  total_skus bigint,
  with_barcode bigint,
  with_dimensions bigint,
  with_weight bigint,
  with_image bigint,
  completeness_score_pct numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH sku_metrics AS (
    SELECT
      s.id,
      EXISTS (SELECT 1 FROM public.sku_barcodes b WHERE b.sku_id = s.id) AS has_barcode,
      EXISTS (
        SELECT 1 FROM public.sku_uoms u 
        WHERE u.sku_id = s.id 
          AND u.length_cm > 0 AND u.width_cm > 0 AND u.height_cm > 0
      ) AS has_dimensions,
      EXISTS (
        SELECT 1 FROM public.sku_uoms u 
        WHERE u.sku_id = s.id AND u.weight_kg > 0
      ) AS has_weight,
      (cardinality(s.images) > 0) AS has_image
    FROM public.skus s
    WHERE s.client_account_id = p_client_id
      AND s.status != 'discontinued'
  )
  SELECT
    COUNT(*)::bigint AS total_skus,
    COUNT(*) FILTER (WHERE has_barcode)::bigint AS with_barcode,
    COUNT(*) FILTER (WHERE has_dimensions)::bigint AS with_dimensions,
    COUNT(*) FILTER (WHERE has_weight)::bigint AS with_weight,
    COUNT(*) FILTER (WHERE has_image)::bigint AS with_image,
    CASE 
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE ROUND(
        (
          (
            COUNT(*) FILTER (WHERE has_barcode)::numeric +
            COUNT(*) FILTER (WHERE has_dimensions)::numeric +
            COUNT(*) FILTER (WHERE has_weight)::numeric +
            COUNT(*) FILTER (WHERE has_image)::numeric
          ) / (COUNT(*)::numeric * 4.0)
        ) * 100.0,
        1
      )
    END AS completeness_score_pct
  FROM sku_metrics;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 8. Row Level Security (RLS) & Permissions
-- ==============================================================================

ALTER TABLE public.client_tracking_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sku_uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sku_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sku_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kit_components ENABLE ROW LEVEL SECURITY;

-- 8.1 Read policies: All active members can view catalog
DROP POLICY IF EXISTS "Members can view client_tracking_defaults" ON public.client_tracking_defaults;
CREATE POLICY "Members can view client_tracking_defaults"
  ON public.client_tracking_defaults FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can view skus" ON public.skus;
CREATE POLICY "Members can view skus"
  ON public.skus FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can view sku_uoms" ON public.sku_uoms;
CREATE POLICY "Members can view sku_uoms"
  ON public.sku_uoms FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can view sku_barcodes" ON public.sku_barcodes;
CREATE POLICY "Members can view sku_barcodes"
  ON public.sku_barcodes FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can view sku_aliases" ON public.sku_aliases;
CREATE POLICY "Members can view sku_aliases"
  ON public.sku_aliases FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can view kit_components" ON public.kit_components;
CREATE POLICY "Members can view kit_components"
  ON public.kit_components FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

-- 8.2 Write policies: Admins, Owners, and Ops Managers can manage catalog
DROP POLICY IF EXISTS "Admins and ops managers can insert skus" ON public.skus;
CREATE POLICY "Admins and ops managers can insert skus"
  ON public.skus FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

DROP POLICY IF EXISTS "Admins and ops managers can update skus" ON public.skus;
CREATE POLICY "Admins and ops managers can update skus"
  ON public.skus FOR UPDATE TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

DROP POLICY IF EXISTS "Admins and ops managers can delete skus" ON public.skus;
CREATE POLICY "Admins and ops managers can delete skus"
  ON public.skus FOR DELETE TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

-- sku_uoms write policies
DROP POLICY IF EXISTS "Admins and ops managers can insert sku_uoms" ON public.sku_uoms;
CREATE POLICY "Admins and ops managers can insert sku_uoms"
  ON public.sku_uoms FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

DROP POLICY IF EXISTS "Admins and ops managers can update sku_uoms" ON public.sku_uoms;
CREATE POLICY "Admins and ops managers can update sku_uoms"
  ON public.sku_uoms FOR UPDATE TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

DROP POLICY IF EXISTS "Admins and ops managers can delete sku_uoms" ON public.sku_uoms;
CREATE POLICY "Admins and ops managers can delete sku_uoms"
  ON public.sku_uoms FOR DELETE TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

-- sku_barcodes write policies
DROP POLICY IF EXISTS "Admins and ops managers can insert sku_barcodes" ON public.sku_barcodes;
CREATE POLICY "Admins and ops managers can insert sku_barcodes"
  ON public.sku_barcodes FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

DROP POLICY IF EXISTS "Admins and ops managers can update sku_barcodes" ON public.sku_barcodes;
CREATE POLICY "Admins and ops managers can update sku_barcodes"
  ON public.sku_barcodes FOR UPDATE TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

DROP POLICY IF EXISTS "Admins and ops managers can delete sku_barcodes" ON public.sku_barcodes;
CREATE POLICY "Admins and ops managers can delete sku_barcodes"
  ON public.sku_barcodes FOR DELETE TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

-- client_tracking_defaults write policies
DROP POLICY IF EXISTS "Admins and ops managers can manage client_tracking_defaults" ON public.client_tracking_defaults;
CREATE POLICY "Admins and ops managers can manage client_tracking_defaults"
  ON public.client_tracking_defaults FOR ALL TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

-- sku_aliases write policies
DROP POLICY IF EXISTS "Admins and ops managers can manage sku_aliases" ON public.sku_aliases;
CREATE POLICY "Admins and ops managers can manage sku_aliases"
  ON public.sku_aliases FOR ALL TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

-- kit_components write policies
DROP POLICY IF EXISTS "Admins and ops managers can manage kit_components" ON public.kit_components;
CREATE POLICY "Admins and ops managers can manage kit_components"
  ON public.kit_components FOR ALL TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'support')
  );

-- 8.3 Service Role & Execution Grants
GRANT ALL ON public.client_tracking_defaults TO authenticated, service_role;
GRANT ALL ON public.skus TO authenticated, service_role;
GRANT ALL ON public.sku_uoms TO authenticated, service_role;
GRANT ALL ON public.sku_barcodes TO authenticated, service_role;
GRANT ALL ON public.sku_aliases TO authenticated, service_role;
GRANT ALL ON public.kit_components TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.resolve_barcode(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_catalog_completeness(uuid) TO authenticated, service_role;

-- 8.4 Attach Audit Log Triggers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
    DROP TRIGGER IF EXISTS trg_audit_skus ON public.skus;
    CREATE TRIGGER trg_audit_skus
      AFTER INSERT OR UPDATE OR DELETE ON public.skus
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

    DROP TRIGGER IF EXISTS trg_audit_sku_uoms ON public.sku_uoms;
    CREATE TRIGGER trg_audit_sku_uoms
      AFTER INSERT OR UPDATE OR DELETE ON public.sku_uoms
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

    DROP TRIGGER IF EXISTS trg_audit_sku_barcodes ON public.sku_barcodes;
    CREATE TRIGGER trg_audit_sku_barcodes
      AFTER INSERT OR UPDATE OR DELETE ON public.sku_barcodes
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
  END IF;
END $$;
