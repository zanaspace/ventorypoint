-- ==============================================================================
-- Migration: 20261020120000_sprint02a_internal_console_and_flags.sql
-- Sprint 02A Step 1: Internal Admin Console, Platform Staff Roles,
-- Feature Flags, Tenant Notes & Announcements
-- ==============================================================================

-- 0. Extend organizations with plan, slug, and is_active if not present
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan text DEFAULT 'launch';
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Backfill slugs for existing organizations if null
UPDATE public.organizations
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Backfill plan if null
UPDATE public.organizations
SET plan = 'launch'
WHERE plan IS NULL;

-- Backfill is_active if null
UPDATE public.organizations
SET is_active = true
WHERE is_active IS NULL;

-- 1. Platform Staff Table & Roles
CREATE TABLE IF NOT EXISTS public.platform_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role text NOT NULL CHECK (role IN ('platform_admin', 'support', 'customer_success', 'finance')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_platform_staff_user ON public.platform_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_staff_role ON public.platform_staff(role, is_active);

-- Helper function: is_platform_staff
CREATE OR REPLACE FUNCTION public.is_platform_staff(p_role text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF p_role IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.platform_staff
      WHERE user_id = auth.uid() AND is_active = true
    );
  ELSE
    RETURN EXISTS (
      SELECT 1 FROM public.platform_staff
      WHERE user_id = auth.uid() AND role = p_role AND is_active = true
    );
  END IF;
END;
$$;

-- RLS for platform_staff
ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_staff_view" ON public.platform_staff;
CREATE POLICY "platform_staff_view" ON public.platform_staff
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_staff('platform_admin')
    OR public.is_platform_staff('support')
    OR public.is_platform_staff('customer_success')
  );

DROP POLICY IF EXISTS "platform_staff_admin_insert" ON public.platform_staff;
CREATE POLICY "platform_staff_admin_insert" ON public.platform_staff
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_staff('platform_admin'));

DROP POLICY IF EXISTS "platform_staff_admin_update" ON public.platform_staff;
CREATE POLICY "platform_staff_admin_update" ON public.platform_staff
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_staff('platform_admin'))
  WITH CHECK (public.is_platform_staff('platform_admin'));

DROP POLICY IF EXISTS "platform_staff_admin_delete" ON public.platform_staff;
CREATE POLICY "platform_staff_admin_delete" ON public.platform_staff
  FOR DELETE
  TO authenticated
  USING (public.is_platform_staff('platform_admin'));

-- Bootstrap platform admin helper (callable by service_role or first run)
CREATE OR REPLACE FUNCTION public.bootstrap_platform_admin(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_staff_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found in auth.users', p_email;
  END IF;

  INSERT INTO public.platform_staff (user_id, role, is_active, notes)
  VALUES (v_user_id, 'platform_admin', true, 'Bootstrapped via PLATFORM_ADMIN_EMAILS')
  ON CONFLICT (user_id) DO UPDATE
  SET role = 'platform_admin', is_active = true, updated_at = now()
  RETURNING id INTO v_staff_id;

  RETURN v_staff_id;
END;
$$;

-- 2. Feature Flags (Global & Per-Tenant)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]+$'),
  name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(key);

CREATE TABLE IF NOT EXISTS public.organization_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_flag_id uuid NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE (organization_id, feature_flag_id)
);

CREATE INDEX IF NOT EXISTS idx_org_feature_flags_org ON public.organization_feature_flags(organization_id);

-- Helper function: is_feature_enabled(org_id, flag_key)
CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_organization_id uuid, p_flag_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag_id uuid;
  v_global_enabled boolean;
  v_override_enabled boolean;
BEGIN
  -- Look up flag
  SELECT id, is_enabled INTO v_flag_id, v_global_enabled
  FROM public.feature_flags
  WHERE key = p_flag_key;

  IF v_flag_id IS NULL THEN
    RETURN false;
  END IF;

  -- Look up org override if organization_id provided
  IF p_organization_id IS NOT NULL THEN
    SELECT is_enabled INTO v_override_enabled
    FROM public.organization_feature_flags
    WHERE organization_id = p_organization_id AND feature_flag_id = v_flag_id;

    IF v_override_enabled IS NOT NULL THEN
      RETURN v_override_enabled;
    END IF;
  END IF;

  RETURN COALESCE(v_global_enabled, false);
END;
$$;

-- RLS for feature_flags
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_select" ON public.feature_flags;
CREATE POLICY "feature_flags_select" ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "feature_flags_staff_write" ON public.feature_flags;
CREATE POLICY "feature_flags_staff_write" ON public.feature_flags
  FOR ALL
  TO authenticated
  USING (public.is_platform_staff('platform_admin') OR public.is_platform_staff('customer_success'))
  WITH CHECK (public.is_platform_staff('platform_admin') OR public.is_platform_staff('customer_success'));

-- RLS for organization_feature_flags
ALTER TABLE public.organization_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_feature_flags_select" ON public.organization_feature_flags;
CREATE POLICY "org_feature_flags_select" ON public.organization_feature_flags
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_feature_flags.organization_id
        AND user_id = auth.uid()
        AND is_active = true
    )
    OR public.is_platform_staff()
  );

DROP POLICY IF EXISTS "org_feature_flags_staff_write" ON public.organization_feature_flags;
CREATE POLICY "org_feature_flags_staff_write" ON public.organization_feature_flags
  FOR ALL
  TO authenticated
  USING (public.is_platform_staff('platform_admin') OR public.is_platform_staff('customer_success'))
  WITH CHECK (public.is_platform_staff('platform_admin') OR public.is_platform_staff('customer_success'));

-- 3. Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'maintenance')) DEFAULT 'info',
  target_audience text NOT NULL CHECK (target_audience IN ('all', 'admins', 'floor_workers', 'specific_orgs')) DEFAULT 'all',
  target_organization_ids uuid[] DEFAULT NULL,
  action_label text,
  action_url text,
  dismissible boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON public.announcements(is_active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_dismissals_user ON public.announcement_dismissals(user_id);

-- RLS for announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
CREATE POLICY "announcements_select" ON public.announcements
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
    OR public.is_platform_staff()
  );

DROP POLICY IF EXISTS "announcements_staff_manage" ON public.announcements;
CREATE POLICY "announcements_staff_manage" ON public.announcements
  FOR ALL
  TO authenticated
  USING (public.is_platform_staff('platform_admin') OR public.is_platform_staff('customer_success'))
  WITH CHECK (public.is_platform_staff('platform_admin') OR public.is_platform_staff('customer_success'));

-- RLS for announcement_dismissals
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcement_dismissals_user" ON public.announcement_dismissals;
CREATE POLICY "announcement_dismissals_user" ON public.announcement_dismissals
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Tenant Internal Notes
CREATE TABLE IF NOT EXISTS public.tenant_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_internal_notes_org ON public.tenant_internal_notes(organization_id, created_at DESC);

ALTER TABLE public.tenant_internal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_internal_notes_staff" ON public.tenant_internal_notes;
CREATE POLICY "tenant_internal_notes_staff" ON public.tenant_internal_notes
  FOR ALL
  TO authenticated
  USING (public.is_platform_staff())
  WITH CHECK (public.is_platform_staff());

-- 5. Attach Audit Trigger from Sprint 2
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
    DROP TRIGGER IF EXISTS trg_audit_platform_staff ON public.platform_staff;
    CREATE TRIGGER trg_audit_platform_staff
      AFTER INSERT OR UPDATE OR DELETE ON public.platform_staff
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

    DROP TRIGGER IF EXISTS trg_audit_feature_flags ON public.feature_flags;
    CREATE TRIGGER trg_audit_feature_flags
      AFTER INSERT OR UPDATE OR DELETE ON public.feature_flags
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

    DROP TRIGGER IF EXISTS trg_audit_organization_feature_flags ON public.organization_feature_flags;
    CREATE TRIGGER trg_audit_organization_feature_flags
      AFTER INSERT OR UPDATE OR DELETE ON public.organization_feature_flags
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

    DROP TRIGGER IF EXISTS trg_audit_announcements ON public.announcements;
    CREATE TRIGGER trg_audit_announcements
      AFTER INSERT OR UPDATE OR DELETE ON public.announcements
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
  END IF;
END $$;

-- 6. Seed Default Feature Flags
INSERT INTO public.feature_flags (key, name, description, is_enabled, is_system)
VALUES
  ('billing_portal_enabled', 'Stripe Billing & Customer Portal', 'Enables self-service subscription upgrades and payment method management', false, true),
  ('data_export_enabled', 'Tenant Data Export', 'Permits 3PL owners to trigger a comprehensive CSV/JSON archive export', true, true),
  ('camera_barcode_scanner', 'Camera Barcode Scanner', 'Enables mobile camera QR and barcode scanning on floor terminals', true, false),
  ('realtime_telemetry_hud', 'Realtime Telemetry HUD', 'Shows live event and scan throughput metrics on dashboard', true, false),
  ('developer_console_access', 'Internal Dev Event Console', 'Permits emitting synthetic warehouse events for integration testing', true, false)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 7. Internal Console Aggregation Functions
CREATE OR REPLACE FUNCTION public.get_internal_tenants_overview()
RETURNS TABLE (
  organization_id uuid,
  name text,
  slug text,
  created_at timestamptz,
  facilities_count bigint,
  members_count bigint,
  clients_count bigint,
  devices_count bigint,
  events_count_30d bigint,
  plan text,
  status text,
  notes_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Access denied: caller is not platform staff' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id AS organization_id,
    o.name,
    COALESCE(o.slug, lower(regexp_replace(o.name, '[^a-zA-Z0-9]+', '-', 'g'))) AS slug,
    o.created_at,
    COALESCE(fac.cnt, 0) AS facilities_count,
    COALESCE(mem.cnt, 0) AS members_count,
    COALESCE(cli.cnt, 0) AS clients_count,
    COALESCE(dev.cnt, 0) AS devices_count,
    COALESCE(evt.cnt, 0) AS events_count_30d,
    COALESCE(o.plan, 'launch') AS plan,
    CASE WHEN o.is_active = false THEN 'suspended' ELSE 'active' END AS status,
    COALESCE(notec.cnt, 0) AS notes_count
  FROM public.organizations o
  LEFT JOIN (
    SELECT organization_id, count(*)::bigint AS cnt
    FROM public.facilities
    GROUP BY organization_id
  ) fac ON fac.organization_id = o.id
  LEFT JOIN (
    SELECT organization_id, count(*)::bigint AS cnt
    FROM public.organization_members
    WHERE is_active = true
    GROUP BY organization_id
  ) mem ON mem.organization_id = o.id
  LEFT JOIN (
    SELECT organization_id, count(*)::bigint AS cnt
    FROM public.client_accounts
    GROUP BY organization_id
  ) cli ON cli.organization_id = o.id
  LEFT JOIN (
    SELECT organization_id, count(*)::bigint AS cnt
    FROM public.floor_devices
    WHERE is_authorized = true AND retired_at IS NULL
    GROUP BY organization_id
  ) dev ON dev.organization_id = o.id
  LEFT JOIN (
    SELECT organization_id, count(*)::bigint AS cnt
    FROM public.warehouse_events
    WHERE occurred_at >= (now() - interval '30 days')
    GROUP BY organization_id
  ) evt ON evt.organization_id = o.id
  LEFT JOIN (
    SELECT organization_id, count(*)::bigint AS cnt
    FROM public.tenant_internal_notes
    GROUP BY organization_id
  ) notec ON notec.organization_id = o.id
  ORDER BY o.created_at DESC;
END;
$$;

-- Function to get active announcements for the current user and org
CREATE OR REPLACE FUNCTION public.get_active_announcements_for_user(p_organization_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  title text,
  message text,
  severity text,
  action_label text,
  action_url text,
  dismissible boolean,
  starts_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.message,
    a.severity,
    a.action_label,
    a.action_url,
    a.dismissible,
    a.starts_at
  FROM public.announcements a
  WHERE a.is_active = true
    AND a.starts_at <= now()
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (
      a.target_audience = 'all'
      OR (a.target_audience = 'specific_orgs' AND p_organization_id IS NOT NULL AND p_organization_id = ANY(a.target_organization_ids))
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.announcement_dismissals d
      WHERE d.announcement_id = a.id AND d.user_id = auth.uid()
    )
  ORDER BY
    CASE a.severity
      WHEN 'critical' THEN 1
      WHEN 'maintenance' THEN 2
      WHEN 'warning' THEN 3
      ELSE 4
    END,
    a.starts_at DESC;
END;
$$;

-- Function to dismiss an announcement
CREATE OR REPLACE FUNCTION public.dismiss_announcement(p_announcement_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.announcement_dismissals (announcement_id, user_id)
  VALUES (p_announcement_id, auth.uid())
  ON CONFLICT (announcement_id, user_id) DO NOTHING;

  RETURN true;
END;
$$;
