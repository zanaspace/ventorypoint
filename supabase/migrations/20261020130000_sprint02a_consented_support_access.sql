-- ==============================================================================
-- Migration: 20261020130000_sprint02a_consented_support_access.sql
-- Sprint 02A Step 2: Consented Support Access
-- Time-boxed, logged, consent-based support access with RLS support role
-- ==============================================================================

-- 1. Ensure 'support' role exists in member_role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'member_role' AND e.enumlabel = 'support'
  ) THEN
    ALTER TYPE public.member_role ADD VALUE 'support';
  END IF;
END$$;

-- 2. Support Access Grants Table
CREATE TABLE IF NOT EXISTS public.support_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES auth.users(id),
  scope text NOT NULL CHECK (scope IN ('read_only', 'read_write')) DEFAULT 'read_only',
  duration_hours integer NOT NULL CHECK (duration_hours > 0),
  reason text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz DEFAULT NULL,
  revoked_by uuid REFERENCES auth.users(id) DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_grants_org_active
  ON public.support_access_grants(organization_id, expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS idx_support_grants_grantor
  ON public.support_access_grants(granted_by);

-- 3. Helper Functions: Active Grant Verification
CREATE OR REPLACE FUNCTION public.has_active_support_grant(
  p_organization_id uuid,
  p_required_scope text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.support_access_grants
    WHERE organization_id = p_organization_id
      AND starts_at <= now()
      AND expires_at > now()
      AND revoked_at IS NULL
      AND (
        p_required_scope IS NULL
        OR scope = p_required_scope
        OR (p_required_scope = 'read_only' AND scope = 'read_write')
      )
  );
END;
$$;

-- Function: Get current active support grant with grantor profile email
CREATE OR REPLACE FUNCTION public.get_active_support_grant(p_organization_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  scope text,
  duration_hours integer,
  reason text,
  starts_at timestamptz,
  expires_at timestamptz,
  granted_by uuid,
  grantor_email text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id,
    g.organization_id,
    g.scope,
    g.duration_hours,
    g.reason,
    g.starts_at,
    g.expires_at,
    g.granted_by,
    u.email::text AS grantor_email,
    true AS is_active
  FROM public.support_access_grants g
  LEFT JOIN auth.users u ON u.id = g.granted_by
  WHERE g.organization_id = p_organization_id
    AND g.starts_at <= now()
    AND g.expires_at > now()
    AND g.revoked_at IS NULL
  ORDER BY g.created_at DESC
  LIMIT 1;
END;
$$;

-- 4. RPCs: Grant and Revoke Support Access
CREATE OR REPLACE FUNCTION public.grant_support_access(
  p_organization_id uuid,
  p_scope text DEFAULT 'read_only',
  p_duration_hours integer DEFAULT 24,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role member_role;
  v_grant_id uuid;
BEGIN
  -- Caller must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Verify caller is owner or admin of the organization
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: Only organization owners and admins can grant support access'
      USING ERRCODE = '42501';
  END IF;

  -- Validate inputs
  IF p_scope NOT IN ('read_only', 'read_write') THEN
    RAISE EXCEPTION 'Invalid scope: must be read_only or read_write';
  END IF;

  IF p_duration_hours NOT IN (1, 4, 8, 24, 72, 168) THEN
    RAISE EXCEPTION 'Invalid duration: must be 1, 4, 8, 24, 72, or 168 hours';
  END IF;

  -- Revoke any previously active grants for this org
  UPDATE public.support_access_grants
  SET revoked_at = now(),
      revoked_by = auth.uid(),
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND starts_at <= now()
    AND expires_at > now()
    AND revoked_at IS NULL;

  -- Create new grant
  INSERT INTO public.support_access_grants (
    organization_id,
    granted_by,
    scope,
    duration_hours,
    reason,
    starts_at,
    expires_at
  )
  VALUES (
    p_organization_id,
    auth.uid(),
    p_scope,
    p_duration_hours,
    nullif(trim(p_reason), ''),
    now(),
    now() + (p_duration_hours || ' hours')::interval
  )
  RETURNING id INTO v_grant_id;

  RETURN v_grant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_support_access(p_grant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id uuid;
  v_role member_role;
  v_is_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Find the grant
  SELECT organization_id INTO v_org_id
  FROM public.support_access_grants
  WHERE id = p_grant_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Support grant not found';
  END IF;

  -- Check if caller is org owner/admin or platform staff
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = v_org_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  v_is_staff := public.is_platform_staff();

  IF (v_role IS NULL OR v_role NOT IN ('owner', 'admin')) AND NOT v_is_staff THEN
    RAISE EXCEPTION 'Unauthorized: Only tenant owners/admins or platform staff can revoke support grants'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.support_access_grants
  SET revoked_at = now(),
      revoked_by = auth.uid(),
      updated_at = now()
  WHERE id = p_grant_id
    AND revoked_at IS NULL;

  RETURN true;
END;
$$;

-- 5. Integrate Support Role into Core Tenancy RLS Helpers
CREATE OR REPLACE FUNCTION public.get_user_role(org_id uuid)
RETURNS member_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_role member_role;
BEGIN
  -- 1. Check direct tenant organization membership
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE organization_id = org_id AND user_id = auth.uid() AND is_active = true
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 2. Consented Support Access: platform staff with an active, unrevoked grant
  IF public.is_platform_staff() AND public.has_active_support_grant(org_id) THEN
    RETURN 'support'::member_role;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_facility(fac_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_org_id uuid;
  v_role member_role;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.facilities WHERE id = fac_id;
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;

  v_role := public.get_user_role(v_org_id);
  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Support role has full visibility across all facilities in tenant during active grant
  IF v_role = 'support'::member_role THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.organization_members m
    LEFT JOIN public.member_facility_access mfa ON mfa.member_id = m.id
    WHERE m.user_id = auth.uid()
      AND m.is_active = true
      AND (m.all_facilities = true OR mfa.facility_id = fac_id)
      AND m.organization_id = v_org_id
  );
END;
$$;

-- 6. RLS Policies on support_access_grants
ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_grants_select" ON public.support_access_grants;
CREATE POLICY "support_grants_select" ON public.support_access_grants
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin')
    OR public.is_platform_staff()
  );

DROP POLICY IF EXISTS "support_grants_insert" ON public.support_access_grants;
CREATE POLICY "support_grants_insert" ON public.support_access_grants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Only customer owners/admins can initiate support grants (never platform staff)
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = support_access_grants.organization_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

DROP POLICY IF EXISTS "support_grants_update" ON public.support_access_grants;
CREATE POLICY "support_grants_update" ON public.support_access_grants
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role(organization_id) IN ('owner', 'admin')
    OR public.is_platform_staff()
  )
  WITH CHECK (
    public.get_user_role(organization_id) IN ('owner', 'admin')
    OR public.is_platform_staff()
  );

-- 7. Audit Log Trigger: Record all grant & revocation events automatically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_row_change') THEN
    DROP TRIGGER IF EXISTS trg_audit_support_access_grants ON public.support_access_grants;
    CREATE TRIGGER trg_audit_support_access_grants
      AFTER INSERT OR UPDATE OR DELETE ON public.support_access_grants
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
  END IF;
END$$;
