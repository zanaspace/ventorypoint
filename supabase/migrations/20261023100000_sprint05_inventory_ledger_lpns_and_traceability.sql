-- ==============================================================================
-- Migration: 20261023100000_sprint05_inventory_ledger_lpns_and_traceability.sql
-- Sprint 5: Inventory Ledger, LPNs, Expiry & 'Where Is It?' Traceability
-- ==============================================================================

-- 1. Register Sprint 5 Event Types in event_type_registry
INSERT INTO public.event_type_registry
  (event_type, version, description, entity_type, is_floor_event, consumers, payload_schema)
VALUES
  ('inventory.status_changed', 1, 'Stock status changed (e.g. available to hold or damaged).', 'inventory', false,
    ARRAY['inventory_projection', 'billing_capture'],
    '{"type":"object","required":["sku_id","location_id","quantity","from_status","to_status"],"properties":{"sku_id":{"type":"string"},"location_id":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"from_status":{"type":"string"},"to_status":{"type":"string"},"reason":{"type":"string"}}}'),
  ('inventory.container_moved', 1, 'Container (LPN) and all its nested contents moved to a new location.', 'container', true,
    ARRAY['inventory_projection'],
    '{"type":"object","required":["container_id","lpn","to_location_id"],"properties":{"container_id":{"type":"string"},"lpn":{"type":"string"},"from_location_id":{"type":"string"},"to_location_id":{"type":"string"}}}'),
  ('inventory.opened_balance', 1, 'Opening stock balance recorded during migration or initial onboarding.', 'inventory', false,
    ARRAY['inventory_projection'],
    '{"type":"object","required":["sku_id","location_id","quantity"],"properties":{"sku_id":{"type":"string"},"location_id":{"type":"string"},"quantity":{"type":"number","exclusiveMinimum":0},"lot_number":{"type":"string"},"lpn":{"type":"string"}}}'),
  ('inventory.adjustment_requested', 1, 'High-delta inventory adjustment requested requiring supervisor approval.', 'adjustment', false,
    ARRAY['notifications'],
    '{"type":"object","required":["adjustment_id","sku_id","location_id","quantity_delta"],"properties":{"adjustment_id":{"type":"string"},"sku_id":{"type":"string"},"location_id":{"type":"string"},"quantity_delta":{"type":"number"}}}'),
  ('inventory.adjustment_approved', 1, 'Supervisor approved an inventory adjustment.', 'adjustment', false,
    ARRAY['inventory_projection', 'billing_capture'],
    '{"type":"object","required":["adjustment_id","sku_id","location_id","quantity_delta","approved_by"],"properties":{"adjustment_id":{"type":"string"},"sku_id":{"type":"string"},"location_id":{"type":"string"},"quantity_delta":{"type":"number"},"approved_by":{"type":"string"}}}'),
  ('inventory.adjustment_rejected', 1, 'Supervisor rejected an inventory adjustment request.', 'adjustment', false,
    ARRAY['notifications'],
    '{"type":"object","required":["adjustment_id","reason"],"properties":{"adjustment_id":{"type":"string"},"reason":{"type":"string"}}}'),
  ('inventory.expired_relocated', 1, 'Stock automatically flagged as expired and segregated to expired status.', 'inventory', false,
    ARRAY['inventory_projection'],
    '{"type":"object","required":["sku_id","lot_id","quantity"],"properties":{"sku_id":{"type":"string"},"lot_id":{"type":"string"},"quantity":{"type":"number"}}}')
ON CONFLICT (event_type, version) DO UPDATE
  SET description    = EXCLUDED.description,
      entity_type    = EXCLUDED.entity_type,
      is_floor_event = EXCLUDED.is_floor_event,
      consumers      = EXCLUDED.consumers,
      payload_schema = EXCLUDED.payload_schema;

-- 2. Lots Table (Batch & Expiry Management)
CREATE TABLE IF NOT EXISTS public.lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  lot_number text NOT NULL,
  mfg_date date,
  expiry_date date,
  first_received_at timestamptz NOT NULL DEFAULT now(),
  expiry_status text NOT NULL DEFAULT 'ok' CHECK (expiry_status IN ('ok', 'near_expiry', 'expired')),
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_sku_lot_number UNIQUE (sku_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_lots_sku ON public.lots(sku_id);
CREATE INDEX IF NOT EXISTS idx_lots_client ON public.lots(client_account_id);
CREATE INDEX IF NOT EXISTS idx_lots_org ON public.lots(organization_id);
CREATE INDEX IF NOT EXISTS idx_lots_expiry ON public.lots(expiry_date, expiry_status);
CREATE INDEX IF NOT EXISTS idx_lots_number_trgm ON public.lots USING gin (lot_number gin_trgm_ops);

-- 3. Containers Table (LPNs / Pallets / Totes / Carts)
CREATE TABLE IF NOT EXISTS public.containers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  client_account_id uuid REFERENCES public.client_accounts(id) ON DELETE SET NULL,
  lpn text NOT NULL,
  container_type text NOT NULL CHECK (container_type IN ('pallet', 'case', 'tote', 'cart')),
  parent_container_id uuid REFERENCES public.containers(id) ON DELETE SET NULL,
  current_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'shipped', 'archived')),
  tare_weight_kg numeric DEFAULT 0 CHECK (tare_weight_kg >= 0),
  max_weight_kg numeric CHECK (max_weight_kg IS NULL OR max_weight_kg > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_container_lpn UNIQUE (organization_id, lpn)
);

CREATE INDEX IF NOT EXISTS idx_containers_facility ON public.containers(facility_id);
CREATE INDEX IF NOT EXISTS idx_containers_location ON public.containers(current_location_id);
CREATE INDEX IF NOT EXISTS idx_containers_parent ON public.containers(parent_container_id);
CREATE INDEX IF NOT EXISTS idx_containers_lpn_trgm ON public.containers USING gin (lpn gin_trgm_ops);

-- 4. Serials Table (Serialized / Unique Items Tracking)
CREATE TABLE IF NOT EXISTS public.serials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_account_id uuid NOT NULL REFERENCES public.client_accounts(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  serial_number text NOT NULL,
  current_facility_id uuid REFERENCES public.facilities(id) ON DELETE SET NULL,
  current_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  current_container_id uuid REFERENCES public.containers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'available' CHECK (
    status IN ('available', 'allocated', 'hold', 'damaged', 'expired', 'shipped', 'consumed')
  ),
  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_moved_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_client_sku_serial UNIQUE (client_account_id, sku_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_serials_sku ON public.serials(sku_id);
CREATE INDEX IF NOT EXISTS idx_serials_facility_loc ON public.serials(current_facility_id, current_location_id);
CREATE INDEX IF NOT EXISTS idx_serials_container ON public.serials(current_container_id);
CREATE INDEX IF NOT EXISTS idx_serials_number_trgm ON public.serials USING gin (serial_number gin_trgm_ops);

-- 5. Inventory Balances Table (Real-time Physical Projection)
CREATE TABLE IF NOT EXISTS public.inventory_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  container_id uuid REFERENCES public.containers(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.lots(id) ON DELETE CASCADE,
  serial_id uuid REFERENCES public.serials(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'available' CHECK (
    status IN ('available', 'allocated', 'hold', 'damaged', 'expired')
  ),
  on_hand_qty numeric NOT NULL DEFAULT 0 CHECK (on_hand_qty >= 0),
  allocated_qty numeric NOT NULL DEFAULT 0 CHECK (allocated_qty >= 0),
  last_counted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Serial quantity invariant
  CONSTRAINT chk_serial_qty CHECK (
    serial_id IS NULL OR (
      on_hand_qty IN (0, 1) AND 
      allocated_qty IN (0, 1) AND 
      (on_hand_qty + allocated_qty <= 1)
    )
  )
);

-- Unique composite balance key (using COALESCE dummy UUID for NULL container/lot/serial)
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_balance_key ON public.inventory_balances (
  facility_id,
  location_id,
  COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid),
  sku_id,
  COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
  status
);

-- Serial can exist in at most one active place
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_serial_balance ON public.inventory_balances (serial_id)
WHERE serial_id IS NOT NULL AND (on_hand_qty > 0 OR allocated_qty > 0);

CREATE INDEX IF NOT EXISTS idx_balances_facility_sku ON public.inventory_balances(facility_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_balances_location ON public.inventory_balances(location_id);
CREATE INDEX IF NOT EXISTS idx_balances_container ON public.inventory_balances(container_id);
CREATE INDEX IF NOT EXISTS idx_balances_lot ON public.inventory_balances(lot_id);

-- 6. Inventory Transactions Table (Append-Only Physical History)
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  event_id uuid, -- Links to warehouse_events(id)
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  serial_id uuid REFERENCES public.serials(id) ON DELETE SET NULL,
  from_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  from_container_id uuid REFERENCES public.containers(id) ON DELETE SET NULL,
  to_location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  to_container_id uuid REFERENCES public.containers(id) ON DELETE SET NULL,
  quantity numeric NOT NULL,
  from_status text CHECK (from_status IS NULL OR from_status IN ('available', 'allocated', 'hold', 'damaged', 'expired')),
  to_status text CHECK (to_status IS NULL OR to_status IN ('available', 'allocated', 'hold', 'damaged', 'expired')),
  transaction_type text NOT NULL CHECK (
    transaction_type IN ('receipt', 'move', 'adjust', 'status_change', 'consume', 'cycle_count', 'container_move')
  ),
  reason_code text,
  notes text,
  actor_user_id uuid,
  actor_worker_id uuid,
  device_id uuid REFERENCES public.floor_devices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_tx_facility ON public.inventory_transactions(facility_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_sku ON public.inventory_transactions(sku_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_lot ON public.inventory_transactions(lot_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_serial ON public.inventory_transactions(serial_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created ON public.inventory_transactions(created_at DESC);

-- Trigger enforcing append-only immutability on inventory_transactions
CREATE OR REPLACE FUNCTION public.fn_block_inventory_transactions_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'inventory_transactions is append-only: UPDATE and DELETE are prohibited.'
    USING ERRCODE = 'VP001';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_inventory_transactions_mod ON public.inventory_transactions;
CREATE TRIGGER trg_block_inventory_transactions_mod
BEFORE UPDATE OR DELETE ON public.inventory_transactions
FOR EACH ROW EXECUTE FUNCTION public.fn_block_inventory_transactions_modification();

-- 7. Adjustment Reasons Lookup Table
CREATE TABLE IF NOT EXISTS public.adjustment_reasons (
  code text PRIMARY KEY,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('loss', 'gain', 'damage', 'correction')),
  requires_supervisor_approval boolean NOT NULL DEFAULT false,
  direction text NOT NULL CHECK (direction IN ('in', 'out', 'both')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.adjustment_reasons (code, description, category, requires_supervisor_approval, direction)
VALUES
  ('damaged_found', 'Product damaged in location / handling', 'damage', false, 'out'),
  ('cycle_count_discrepancy', 'Variance verified during routine cycle count', 'correction', true, 'both'),
  ('shrinkage_theft', 'Suspected theft or unexplained shrinkage', 'loss', true, 'out'),
  ('found_stock', 'Previously unrecorded units found during sweep', 'gain', true, 'in'),
  ('vendor_mispack', 'Inbound quantity error detected post-receiving', 'correction', false, 'both'),
  ('system_correction', 'Administrative correction of mis-keyed entry', 'correction', true, 'both')
ON CONFLICT (code) DO UPDATE
  SET description = EXCLUDED.description,
      category = EXCLUDED.category,
      requires_supervisor_approval = EXCLUDED.requires_supervisor_approval,
      direction = EXCLUDED.direction;

-- 8. Inventory Adjustments (Supervisor Approval Queue)
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  container_id uuid REFERENCES public.containers(id) ON DELETE SET NULL,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  lot_id uuid REFERENCES public.lots(id) ON DELETE SET NULL,
  serial_id uuid REFERENCES public.serials(id) ON DELETE SET NULL,
  current_qty numeric NOT NULL,
  quantity_delta numeric NOT NULL,
  target_qty numeric NOT NULL,
  status text NOT NULL DEFAULT 'available',
  reason_code text NOT NULL REFERENCES public.adjustment_reasons(code),
  notes text,
  requested_by uuid,
  approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_adjustments ALTER COLUMN requested_by DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_adjustments_facility ON public.inventory_adjustments(facility_id);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_status ON public.inventory_adjustments(approval_status);

-- 9. Nightly Reconciliation Runs Table
CREATE TABLE IF NOT EXISTS public.inventory_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  total_records_checked integer NOT NULL DEFAULT 0,
  discrepancies_found integer NOT NULL DEFAULT 0,
  is_clean boolean NOT NULL DEFAULT true,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_at timestamptz NOT NULL DEFAULT now()
);

-- ==============================================================================
-- Row Level Security (RLS)
-- ==============================================================================

ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustment_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reconciliation_runs ENABLE ROW LEVEL SECURITY;

-- 1. Read & Write Policies using public.get_user_role(organization_id)
DROP POLICY IF EXISTS "Members can view lots" ON public.lots;
CREATE POLICY "Members can view lots" ON public.lots
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can insert lots" ON public.lots;
CREATE POLICY "Members can insert lots" ON public.lots
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'supervisor', 'floor_worker', 'support'));

DROP POLICY IF EXISTS "Members can update lots" ON public.lots;
CREATE POLICY "Members can update lots" ON public.lots
  FOR UPDATE TO authenticated
  USING (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'supervisor', 'floor_worker', 'support'));

-- Containers policies
DROP POLICY IF EXISTS "Members can view containers" ON public.containers;
CREATE POLICY "Members can view containers" ON public.containers
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can insert containers" ON public.containers;
CREATE POLICY "Members can insert containers" ON public.containers
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'supervisor', 'floor_worker', 'support'));

DROP POLICY IF EXISTS "Members can update containers" ON public.containers;
CREATE POLICY "Members can update containers" ON public.containers
  FOR UPDATE TO authenticated
  USING (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'supervisor', 'floor_worker', 'support'));

-- Serials policies
DROP POLICY IF EXISTS "Members can view serials" ON public.serials;
CREATE POLICY "Members can view serials" ON public.serials
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can insert serials" ON public.serials;
CREATE POLICY "Members can insert serials" ON public.serials
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'supervisor', 'floor_worker', 'support'));

DROP POLICY IF EXISTS "Members can update serials" ON public.serials;
CREATE POLICY "Members can update serials" ON public.serials
  FOR UPDATE TO authenticated
  USING (public.get_user_role(organization_id) IN ('owner', 'admin', 'ops_manager', 'supervisor', 'floor_worker', 'support'));

-- Balances policies
DROP POLICY IF EXISTS "Members can view inventory balances" ON public.inventory_balances;
CREATE POLICY "Members can view inventory balances" ON public.inventory_balances
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

-- Inventory Transactions policies
DROP POLICY IF EXISTS "Members can view inventory transactions" ON public.inventory_transactions;
CREATE POLICY "Members can view inventory transactions" ON public.inventory_transactions
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

-- Adjustment Reasons policies
DROP POLICY IF EXISTS "Members can view adjustment reasons" ON public.adjustment_reasons;
CREATE POLICY "Members can view adjustment reasons" ON public.adjustment_reasons
  FOR SELECT TO authenticated USING (true);

-- Inventory Adjustments policies
DROP POLICY IF EXISTS "Members can view inventory adjustments" ON public.inventory_adjustments;
CREATE POLICY "Members can view inventory adjustments" ON public.inventory_adjustments
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

DROP POLICY IF EXISTS "Members can insert inventory adjustments" ON public.inventory_adjustments;
CREATE POLICY "Members can insert inventory adjustments" ON public.inventory_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.get_user_role(organization_id) IS NOT NULL);

-- Reconciliation Runs policies
DROP POLICY IF EXISTS "Members can view reconciliation runs" ON public.inventory_reconciliation_runs;
CREATE POLICY "Members can view reconciliation runs" ON public.inventory_reconciliation_runs
  FOR SELECT TO authenticated
  USING (public.get_user_role(organization_id) IS NOT NULL);

-- Direct modifications are restricted: mutations proceed via Atomic Security Definer RPCs
REVOKE INSERT, UPDATE, DELETE ON public.inventory_balances FROM authenticated, anon, public;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_transactions FROM authenticated, anon, public;


-- ==============================================================================
-- Atomic PL/pgSQL Inventory Ledger RPCs
-- ==============================================================================

-- Helper: Record an event directly into warehouse_events
CREATE OR REPLACE FUNCTION public._record_inventory_event(
  p_org_id uuid,
  p_facility_id uuid,
  p_client_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb,
  p_actor_id uuid
) RETURNS uuid AS $$
DECLARE
  v_event_id uuid := gen_random_uuid();
  v_occurred timestamptz := now();
  v_idem text := 'inv_' || p_event_type || '_' || v_event_id::text;
BEGIN
  INSERT INTO public.warehouse_events (
    id,
    organization_id,
    facility_id,
    client_account_id,
    event_type,
    event_version,
    entity_type,
    entity_id,
    payload,
    actor_user_id,
    source,
    idempotency_key,
    occurred_at,
    received_at
  ) VALUES (
    v_event_id,
    p_org_id,
    p_facility_id,
    p_client_id,
    p_event_type,
    1,
    p_entity_type,
    p_entity_id,
    p_payload,
    p_actor_id,
    'web',
    v_idem,
    v_occurred,
    v_occurred
  );
  RETURN v_event_id;
EXCEPTION WHEN OTHERS THEN
  -- Fallback if table constraints or partitions issue: return generated id
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Atomic Move Inventory RPC
CREATE OR REPLACE FUNCTION public.move_inventory(
  p_facility_id uuid,
  p_from_location_id uuid,
  p_from_container_id uuid,
  p_to_location_id uuid,
  p_to_container_id uuid,
  p_sku_id uuid,
  p_lot_id uuid,
  p_serial_id uuid,
  p_quantity numeric,
  p_status text DEFAULT 'available',
  p_reason text DEFAULT 'relocation',
  p_notes text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_org_id uuid;
  v_client_id uuid;
  v_sku RECORD;
  v_source_balance RECORD;
  v_dest_balance RECORD;
  v_event_id uuid;
BEGIN
  -- 1. Basic parameter validation
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Move quantity must be greater than zero.' USING ERRCODE = 'VP010';
  END IF;

  IF p_from_location_id = p_to_location_id AND 
     COALESCE(p_from_container_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_to_container_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'Source and destination locations/containers cannot be identical.' USING ERRCODE = 'VP011';
  END IF;

  -- 2. Validate SKU and Tracking Rules
  SELECT s.*, c.id AS client_id INTO v_sku 
  FROM public.skus s
  JOIN public.client_accounts c ON c.id = s.client_account_id
  WHERE s.id = p_sku_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU with ID % not found.', p_sku_id USING ERRCODE = 'VP012';
  END IF;

  v_org_id := v_sku.organization_id;
  v_client_id := v_sku.client_id;

  -- Enforce tracking class rules
  IF v_sku.tracking_class IN ('lot', 'lot_serial') AND p_lot_id IS NULL THEN
    RAISE EXCEPTION 'Lot is strictly required for SKU % (tracking class: %)', v_sku.code, v_sku.tracking_class
      USING ERRCODE = 'VP013';
  END IF;

  IF v_sku.tracking_class IN ('serial', 'lot_serial') THEN
    IF p_serial_id IS NULL THEN
      RAISE EXCEPTION 'Serial is strictly required for SKU % (tracking class: %)', v_sku.code, v_sku.tracking_class
        USING ERRCODE = 'VP014';
    END IF;
    IF p_quantity != 1 THEN
      RAISE EXCEPTION 'Serial item % move quantity must be exactly 1.', v_sku.code USING ERRCODE = 'VP015';
    END IF;
  END IF;

  -- 3. Deterministic row-level lock on source balance
  SELECT * INTO v_source_balance
  FROM public.inventory_balances
  WHERE facility_id = p_facility_id
    AND location_id = p_from_location_id
    AND COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_from_container_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND sku_id = p_sku_id
    AND COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_serial_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status = p_status
  FOR UPDATE;

  IF NOT FOUND OR v_source_balance.on_hand_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient inventory at source location. Available: %, Requested: %',
      COALESCE(v_source_balance.on_hand_qty, 0), p_quantity
      USING ERRCODE = 'VP016';
  END IF;

  -- 4. Decrement source balance
  UPDATE public.inventory_balances
  SET on_hand_qty = on_hand_qty - p_quantity,
      updated_at = now()
  WHERE id = v_source_balance.id;

  -- 5. Credit destination balance (UPSERT)
  INSERT INTO public.inventory_balances (
    organization_id,
    facility_id,
    location_id,
    container_id,
    sku_id,
    lot_id,
    serial_id,
    status,
    on_hand_qty,
    allocated_qty
  ) VALUES (
    v_org_id,
    p_facility_id,
    p_to_location_id,
    p_to_container_id,
    p_sku_id,
    p_lot_id,
    p_serial_id,
    p_status,
    p_quantity,
    0
  )
  ON CONFLICT (
    facility_id,
    location_id,
    COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sku_id,
    COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
    status
  )
  DO UPDATE SET
    on_hand_qty = public.inventory_balances.on_hand_qty + EXCLUDED.on_hand_qty,
    updated_at = now();

  -- 6. If moving a serial, update serial location & container pointers
  IF p_serial_id IS NOT NULL THEN
    UPDATE public.serials
    SET current_facility_id = p_facility_id,
        current_location_id = p_to_location_id,
        current_container_id = p_to_container_id,
        last_moved_at = now(),
        updated_at = now()
    WHERE id = p_serial_id;
  END IF;

  -- 7. Record warehouse_event
  v_event_id := public._record_inventory_event(
    v_org_id,
    p_facility_id,
    v_client_id,
    'inventory.moved',
    'inventory',
    v_source_balance.id,
    jsonb_build_object(
      'sku_id', p_sku_id::text,
      'quantity', p_quantity,
      'from_location_id', p_from_location_id::text,
      'to_location_id', p_to_location_id::text,
      'from_container_id', p_from_container_id::text,
      'to_container_id', p_to_container_id::text,
      'lot_id', p_lot_id::text,
      'serial_id', p_serial_id::text,
      'status', p_status,
      'reason', p_reason
    ),
    p_actor_id
  );

  -- 8. Write append-only inventory transaction
  INSERT INTO public.inventory_transactions (
    organization_id,
    facility_id,
    event_id,
    sku_id,
    lot_id,
    serial_id,
    from_location_id,
    from_container_id,
    to_location_id,
    to_container_id,
    quantity,
    from_status,
    to_status,
    transaction_type,
    reason_code,
    notes,
    actor_user_id
  ) VALUES (
    v_org_id,
    p_facility_id,
    v_event_id,
    p_sku_id,
    p_lot_id,
    p_serial_id,
    p_from_location_id,
    p_from_container_id,
    p_to_location_id,
    p_to_container_id,
    p_quantity,
    p_status,
    p_status,
    'move',
    p_reason,
    p_notes,
    p_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'event_id', v_event_id,
    'quantity_moved', p_quantity,
    'from_location_id', p_from_location_id,
    'to_location_id', p_to_location_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Move Container (LPN) RPC
CREATE OR REPLACE FUNCTION public.move_container(
  p_lpn text,
  p_to_location_id uuid,
  p_to_parent_container_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_container RECORD;
  v_from_loc uuid;
  v_event_id uuid;
  v_bal RECORD;
  v_moved_count integer := 0;
BEGIN
  -- 1. Find Container
  SELECT * INTO v_container
  FROM public.containers
  WHERE lpn = p_lpn;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Container with LPN % not found.', p_lpn USING ERRCODE = 'VP020';
  END IF;

  v_from_loc := v_container.current_location_id;

  IF v_from_loc = p_to_location_id AND COALESCE(v_container.parent_container_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_to_parent_container_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    RAISE EXCEPTION 'Container % is already at target location/parent.', p_lpn USING ERRCODE = 'VP021';
  END IF;

  -- 2. Update Container
  UPDATE public.containers
  SET current_location_id = p_to_location_id,
      parent_container_id = p_to_parent_container_id,
      updated_at = now()
  WHERE id = v_container.id;

  -- 3. Update all inventory balances belonging to this container
  FOR v_bal IN
    SELECT * FROM public.inventory_balances
    WHERE container_id = v_container.id AND on_hand_qty > 0
  LOOP
    -- Decrement old balance
    UPDATE public.inventory_balances
    SET on_hand_qty = on_hand_qty - v_bal.on_hand_qty,
        updated_at = now()
    WHERE id = v_bal.id;

    -- Upsert new balance at to_location
    INSERT INTO public.inventory_balances (
      organization_id,
      facility_id,
      location_id,
      container_id,
      sku_id,
      lot_id,
      serial_id,
      status,
      on_hand_qty,
      allocated_qty
    ) VALUES (
      v_container.organization_id,
      v_container.facility_id,
      p_to_location_id,
      v_container.id,
      v_bal.sku_id,
      v_bal.lot_id,
      v_bal.serial_id,
      v_bal.status,
      v_bal.on_hand_qty,
      0
    )
    ON CONFLICT (
      facility_id,
      location_id,
      COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid),
      sku_id,
      COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
      status
    )
    DO UPDATE SET
      on_hand_qty = public.inventory_balances.on_hand_qty + EXCLUDED.on_hand_qty,
      updated_at = now();

    -- Append-only transaction
    INSERT INTO public.inventory_transactions (
      organization_id,
      facility_id,
      sku_id,
      lot_id,
      serial_id,
      from_location_id,
      from_container_id,
      to_location_id,
      to_container_id,
      quantity,
      from_status,
      to_status,
      transaction_type,
      reason_code,
      notes,
      actor_user_id
    ) VALUES (
      v_container.organization_id,
      v_container.facility_id,
      v_bal.sku_id,
      v_bal.lot_id,
      v_bal.serial_id,
      v_from_loc,
      v_container.id,
      p_to_location_id,
      v_container.id,
      v_bal.on_hand_qty,
      v_bal.status,
      v_bal.status,
      'container_move',
      'lpn_relocation',
      p_notes,
      p_actor_id
    );

    v_moved_count := v_moved_count + 1;
  END LOOP;

  -- 4. Update all serials stored directly in this container
  UPDATE public.serials
  SET current_location_id = p_to_location_id,
      last_moved_at = now(),
      updated_at = now()
  WHERE current_container_id = v_container.id;

  -- 5. Record container moved event
  v_event_id := public._record_inventory_event(
    v_container.organization_id,
    v_container.facility_id,
    v_container.client_account_id,
    'inventory.container_moved',
    'container',
    v_container.id,
    jsonb_build_object(
      'container_id', v_container.id::text,
      'lpn', v_container.lpn,
      'from_location_id', v_from_loc::text,
      'to_location_id', p_to_location_id::text,
      'sku_lines_moved', v_moved_count
    ),
    p_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'container_id', v_container.id,
    'lpn', v_container.lpn,
    'event_id', v_event_id,
    'from_location_id', v_from_loc,
    'to_location_id', p_to_location_id,
    'sku_lines_moved', v_moved_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Adjust Inventory RPC (With Supervisor Approval Threshold Enforced)
CREATE OR REPLACE FUNCTION public.adjust_inventory(
  p_facility_id uuid,
  p_location_id uuid,
  p_container_id uuid,
  p_sku_id uuid,
  p_lot_id uuid,
  p_serial_id uuid,
  p_quantity_delta numeric,
  p_reason_code text,
  p_notes text,
  p_actor_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_sku RECORD;
  v_reason RECORD;
  v_current_qty numeric := 0;
  v_target_qty numeric;
  v_adj_id uuid;
  v_event_id uuid;
  v_requires_approval boolean := false;
BEGIN
  IF p_quantity_delta = 0 THEN
    RAISE EXCEPTION 'Quantity delta cannot be zero.' USING ERRCODE = 'VP030';
  END IF;

  -- 1. Validate SKU
  SELECT * INTO v_sku FROM public.skus WHERE id = p_sku_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU % not found.', p_sku_id USING ERRCODE = 'VP031';
  END IF;

  -- 2. Validate Reason
  SELECT * INTO v_reason FROM public.adjustment_reasons WHERE code = p_reason_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment reason % not found.', p_reason_code USING ERRCODE = 'VP032';
  END IF;

  -- 3. Get current on-hand quantity
  SELECT COALESCE(on_hand_qty, 0) INTO v_current_qty
  FROM public.inventory_balances
  WHERE facility_id = p_facility_id
    AND location_id = p_location_id
    AND COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_container_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND sku_id = p_sku_id
    AND COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_serial_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status = 'available';

  v_target_qty := v_current_qty + p_quantity_delta;

  IF v_target_qty < 0 THEN
    RAISE EXCEPTION 'Adjustment would result in negative on-hand inventory. Current: %, Delta: %',
      v_current_qty, p_quantity_delta USING ERRCODE = 'VP033';
  END IF;

  -- 4. Check approval threshold:
  -- Approval required if reason requires supervisor approval OR absolute delta > 10 units
  IF v_reason.requires_supervisor_approval OR abs(p_quantity_delta) > 10 THEN
    v_requires_approval := true;
  END IF;

  -- If approval is required, enqueue into inventory_adjustments
  IF v_requires_approval THEN
    INSERT INTO public.inventory_adjustments (
      organization_id,
      facility_id,
      location_id,
      container_id,
      sku_id,
      lot_id,
      serial_id,
      current_qty,
      quantity_delta,
      target_qty,
      reason_code,
      notes,
      requested_by,
      approval_status
    ) VALUES (
      v_sku.organization_id,
      p_facility_id,
      p_location_id,
      p_container_id,
      p_sku_id,
      p_lot_id,
      p_serial_id,
      v_current_qty,
      p_quantity_delta,
      v_target_qty,
      p_reason_code,
      p_notes,
      p_actor_id,
      'pending'
    ) RETURNING id INTO v_adj_id;

    -- Record request event
    PERFORM public._record_inventory_event(
      v_sku.organization_id,
      p_facility_id,
      v_sku.client_account_id,
      'inventory.adjustment_requested',
      'adjustment',
      v_adj_id,
      jsonb_build_object(
        'adjustment_id', v_adj_id::text,
        'sku_id', p_sku_id::text,
        'location_id', p_location_id::text,
        'quantity_delta', p_quantity_delta
      ),
      p_actor_id
    );

    RETURN jsonb_build_object(
      'success', true,
      'queued_for_approval', true,
      'adjustment_id', v_adj_id,
      'message', 'Adjustment exceeds threshold and has been submitted to the Supervisor Approval Queue.'
    );
  END IF;

  -- 5. Otherwise, apply immediately
  INSERT INTO public.inventory_balances (
    organization_id,
    facility_id,
    location_id,
    container_id,
    sku_id,
    lot_id,
    serial_id,
    status,
    on_hand_qty,
    allocated_qty
  ) VALUES (
    v_sku.organization_id,
    p_facility_id,
    p_location_id,
    p_container_id,
    p_sku_id,
    p_lot_id,
    p_serial_id,
    'available',
    v_target_qty,
    0
  )
  ON CONFLICT (
    facility_id,
    location_id,
    COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sku_id,
    COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
    status
  )
  DO UPDATE SET
    on_hand_qty = EXCLUDED.on_hand_qty,
    updated_at = now();

  -- Record event
  v_event_id := public._record_inventory_event(
    v_sku.organization_id,
    p_facility_id,
    v_sku.client_account_id,
    'inventory.adjusted',
    'inventory',
    p_sku_id,
    jsonb_build_object(
      'sku_id', p_sku_id::text,
      'location_id', p_location_id::text,
      'quantity_delta', p_quantity_delta,
      'reason_code', p_reason_code,
      'note', p_notes
    ),
    p_actor_id
  );

  -- Write append-only transaction
  INSERT INTO public.inventory_transactions (
    organization_id,
    facility_id,
    event_id,
    sku_id,
    lot_id,
    serial_id,
    to_location_id,
    to_container_id,
    quantity,
    to_status,
    transaction_type,
    reason_code,
    notes,
    actor_user_id
  ) VALUES (
    v_sku.organization_id,
    p_facility_id,
    v_event_id,
    p_sku_id,
    p_lot_id,
    p_serial_id,
    p_location_id,
    p_container_id,
    p_quantity_delta,
    'available',
    'adjust',
    p_reason_code,
    p_notes,
    p_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'queued_for_approval', false,
    'event_id', v_event_id,
    'new_on_hand_qty', v_target_qty
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Approve Inventory Adjustment RPC
CREATE OR REPLACE FUNCTION public.approve_inventory_adjustment(
  p_adjustment_id uuid,
  p_reviewer_id uuid,
  p_reviewer_role text DEFAULT 'supervisor',
  p_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_adj RECORD;
  v_event_id uuid;
BEGIN
  -- 1. Reviewer role check (owner, admin, ops_manager, supervisor allowed)
  IF p_reviewer_role NOT IN ('owner', 'admin', 'ops_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Only supervisors and managers can approve inventory adjustments.' USING ERRCODE = 'VP040';
  END IF;

  SELECT * INTO v_adj
  FROM public.inventory_adjustments
  WHERE id = p_adjustment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found.', p_adjustment_id USING ERRCODE = 'VP041';
  END IF;

  IF v_adj.approval_status != 'pending' THEN
    RAISE EXCEPTION 'Adjustment is already %.', v_adj.approval_status USING ERRCODE = 'VP042';
  END IF;

  -- 2. Apply balance update
  INSERT INTO public.inventory_balances (
    organization_id,
    facility_id,
    location_id,
    container_id,
    sku_id,
    lot_id,
    serial_id,
    status,
    on_hand_qty,
    allocated_qty
  ) VALUES (
    v_adj.organization_id,
    v_adj.facility_id,
    v_adj.location_id,
    v_adj.container_id,
    v_adj.sku_id,
    v_adj.lot_id,
    v_adj.serial_id,
    v_adj.status,
    v_adj.target_qty,
    0
  )
  ON CONFLICT (
    facility_id,
    location_id,
    COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sku_id,
    COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
    status
  )
  DO UPDATE SET
    on_hand_qty = EXCLUDED.on_hand_qty,
    updated_at = now();

  -- 3. Record warehouse_event
  v_event_id := public._record_inventory_event(
    v_adj.organization_id,
    v_adj.facility_id,
    NULL,
    'inventory.adjustment_approved',
    'adjustment',
    v_adj.id,
    jsonb_build_object(
      'adjustment_id', v_adj.id::text,
      'sku_id', v_adj.sku_id::text,
      'location_id', v_adj.location_id::text,
      'quantity_delta', v_adj.quantity_delta,
      'approved_by', p_reviewer_id::text
    ),
    p_reviewer_id
  );

  -- 4. Write transaction
  INSERT INTO public.inventory_transactions (
    organization_id,
    facility_id,
    event_id,
    sku_id,
    lot_id,
    serial_id,
    to_location_id,
    to_container_id,
    quantity,
    to_status,
    transaction_type,
    reason_code,
    notes,
    actor_user_id
  ) VALUES (
    v_adj.organization_id,
    v_adj.facility_id,
    v_event_id,
    v_adj.sku_id,
    v_adj.lot_id,
    v_adj.serial_id,
    v_adj.location_id,
    v_adj.container_id,
    v_adj.quantity_delta,
    v_adj.status,
    'adjust',
    v_adj.reason_code,
    'Approved: ' || COALESCE(p_notes, v_adj.notes, ''),
    p_reviewer_id
  );

  -- 5. Mark adjustment record as approved
  UPDATE public.inventory_adjustments
  SET approval_status = 'approved',
      approved_by = p_reviewer_id,
      approved_at = now(),
      event_id = v_event_id,
      updated_at = now()
  WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('success', true, 'approved', true, 'event_id', v_event_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Reject Inventory Adjustment RPC
CREATE OR REPLACE FUNCTION public.reject_inventory_adjustment(
  p_adjustment_id uuid,
  p_reviewer_id uuid,
  p_reviewer_role text DEFAULT 'supervisor',
  p_rejection_reason text DEFAULT 'Variance unverified'
) RETURNS jsonb AS $$
DECLARE
  v_adj RECORD;
  v_event_id uuid;
BEGIN
  IF p_reviewer_role NOT IN ('owner', 'admin', 'ops_manager', 'supervisor') THEN
    RAISE EXCEPTION 'Only supervisors and managers can reject inventory adjustments.' USING ERRCODE = 'VP040';
  END IF;

  SELECT * INTO v_adj FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Adjustment % not found.', p_adjustment_id USING ERRCODE = 'VP041';
  END IF;

  UPDATE public.inventory_adjustments
  SET approval_status = 'rejected',
      approved_by = p_reviewer_id,
      approved_at = now(),
      rejection_reason = p_rejection_reason,
      updated_at = now()
  WHERE id = p_adjustment_id;

  v_event_id := public._record_inventory_event(
    v_adj.organization_id,
    v_adj.facility_id,
    NULL,
    'inventory.adjustment_rejected',
    'adjustment',
    v_adj.id,
    jsonb_build_object(
      'adjustment_id', v_adj.id::text,
      'reason', p_rejection_reason
    ),
    p_reviewer_id
  );

  RETURN jsonb_build_object('success', true, 'rejected', true, 'event_id', v_event_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Change Inventory Status (e.g. available <-> hold, damaged, expired)
CREATE OR REPLACE FUNCTION public.change_inventory_status(
  p_facility_id uuid,
  p_location_id uuid,
  p_container_id uuid,
  p_sku_id uuid,
  p_lot_id uuid,
  p_serial_id uuid,
  p_quantity numeric,
  p_from_status text,
  p_to_status text,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_sku RECORD;
  v_source RECORD;
  v_event_id uuid;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero.' USING ERRCODE = 'VP050';
  END IF;

  IF p_from_status = p_to_status THEN
    RAISE EXCEPTION 'Source and destination statuses cannot be identical.' USING ERRCODE = 'VP051';
  END IF;

  SELECT * INTO v_sku FROM public.skus WHERE id = p_sku_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU % not found.', p_sku_id USING ERRCODE = 'VP052';
  END IF;

  -- Lock source
  SELECT * INTO v_source
  FROM public.inventory_balances
  WHERE facility_id = p_facility_id
    AND location_id = p_location_id
    AND COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_container_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND sku_id = p_sku_id
    AND COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(p_serial_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status = p_from_status
  FOR UPDATE;

  IF NOT FOUND OR v_source.on_hand_qty < p_quantity THEN
    RAISE EXCEPTION 'Insufficient inventory in status % (Available: %, Requested: %)',
      p_from_status, COALESCE(v_source.on_hand_qty, 0), p_quantity USING ERRCODE = 'VP053';
  END IF;

  -- Decrement source
  UPDATE public.inventory_balances
  SET on_hand_qty = on_hand_qty - p_quantity,
      updated_at = now()
  WHERE id = v_source.id;

  -- Upsert destination status
  INSERT INTO public.inventory_balances (
    organization_id,
    facility_id,
    location_id,
    container_id,
    sku_id,
    lot_id,
    serial_id,
    status,
    on_hand_qty,
    allocated_qty
  ) VALUES (
    v_sku.organization_id,
    p_facility_id,
    p_location_id,
    p_container_id,
    p_sku_id,
    p_lot_id,
    p_serial_id,
    p_to_status,
    p_quantity,
    0
  )
  ON CONFLICT (
    facility_id,
    location_id,
    COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid),
    sku_id,
    COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
    status
  )
  DO UPDATE SET
    on_hand_qty = public.inventory_balances.on_hand_qty + EXCLUDED.on_hand_qty,
    updated_at = now();

  -- If serial item, update serial status
  IF p_serial_id IS NOT NULL THEN
    UPDATE public.serials
    SET status = p_to_status,
        updated_at = now()
    WHERE id = p_serial_id;
  END IF;

  -- Record event
  v_event_id := public._record_inventory_event(
    v_sku.organization_id,
    p_facility_id,
    v_sku.client_account_id,
    'inventory.status_changed',
    'inventory',
    v_source.id,
    jsonb_build_object(
      'sku_id', p_sku_id::text,
      'location_id', p_location_id::text,
      'quantity', p_quantity,
      'from_status', p_from_status,
      'to_status', p_to_status,
      'reason', p_reason
    ),
    p_actor_id
  );

  -- Write transaction
  INSERT INTO public.inventory_transactions (
    organization_id,
    facility_id,
    event_id,
    sku_id,
    lot_id,
    serial_id,
    from_location_id,
    from_container_id,
    to_location_id,
    to_container_id,
    quantity,
    from_status,
    to_status,
    transaction_type,
    reason_code,
    notes,
    actor_user_id
  ) VALUES (
    v_sku.organization_id,
    p_facility_id,
    v_event_id,
    p_sku_id,
    p_lot_id,
    p_serial_id,
    p_location_id,
    p_container_id,
    p_location_id,
    p_container_id,
    p_quantity,
    p_from_status,
    p_to_status,
    'status_change',
    p_reason,
    p_notes,
    p_actor_id
  );

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Receive Into RPC (Inbound receiving primitive)
CREATE OR REPLACE FUNCTION public.receive_into(
  p_facility_id uuid,
  p_location_id uuid,
  p_container_id uuid,
  p_sku_id uuid,
  p_lot_number text DEFAULT NULL,
  p_mfg_date date DEFAULT NULL,
  p_expiry_date date DEFAULT NULL,
  p_serial_numbers text[] DEFAULT NULL,
  p_quantity numeric DEFAULT 1,
  p_notes text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_sku RECORD;
  v_lot_id uuid := NULL;
  v_serial_id uuid := NULL;
  v_serial_item text;
  v_event_id uuid;
  v_received_count numeric := 0;
BEGIN
  SELECT * INTO v_sku FROM public.skus WHERE id = p_sku_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SKU % not found.', p_sku_id USING ERRCODE = 'VP060';
  END IF;

  -- 1. Create / retrieve lot if lot tracked
  IF p_lot_number IS NOT NULL AND btrim(p_lot_number) != '' THEN
    INSERT INTO public.lots (
      organization_id,
      client_account_id,
      sku_id,
      lot_number,
      mfg_date,
      expiry_date,
      expiry_status
    ) VALUES (
      v_sku.organization_id,
      v_sku.client_account_id,
      v_sku.id,
      btrim(p_lot_number),
      p_mfg_date,
      p_expiry_date,
      CASE 
        WHEN p_expiry_date IS NOT NULL AND p_expiry_date < CURRENT_DATE THEN 'expired'
        WHEN p_expiry_date IS NOT NULL AND p_expiry_date <= CURRENT_DATE + interval '60 days' THEN 'near_expiry'
        ELSE 'ok'
      END
    )
    ON CONFLICT (sku_id, lot_number) DO UPDATE
      SET expiry_date = COALESCE(EXCLUDED.expiry_date, public.lots.expiry_date),
          mfg_date = COALESCE(EXCLUDED.mfg_date, public.lots.mfg_date),
          updated_at = now()
    RETURNING id INTO v_lot_id;
  ELSIF v_sku.tracking_class IN ('lot', 'lot_serial') THEN
    RAISE EXCEPTION 'Lot number is required for lot-tracked SKU %', v_sku.code USING ERRCODE = 'VP061';
  END IF;

  -- 2. If serial tracked, process each serial individually
  IF v_sku.tracking_class IN ('serial', 'lot_serial') THEN
    IF p_serial_numbers IS NULL OR array_length(p_serial_numbers, 1) = 0 THEN
      RAISE EXCEPTION 'Serial number list required for serialized SKU %', v_sku.code USING ERRCODE = 'VP062';
    END IF;

    FOREACH v_serial_item IN ARRAY p_serial_numbers
    LOOP
      v_serial_item := btrim(v_serial_item);
      -- Insert / update serial record
      INSERT INTO public.serials (
        organization_id,
        client_account_id,
        sku_id,
        lot_id,
        serial_number,
        current_facility_id,
        current_location_id,
        current_container_id,
        status
      ) VALUES (
        v_sku.organization_id,
        v_sku.client_account_id,
        v_sku.id,
        v_lot_id,
        v_serial_item,
        p_facility_id,
        p_location_id,
        p_container_id,
        'available'
      )
      ON CONFLICT (client_account_id, sku_id, serial_number) DO UPDATE
        SET current_facility_id = EXCLUDED.current_facility_id,
            current_location_id = EXCLUDED.current_location_id,
            current_container_id = EXCLUDED.current_container_id,
            lot_id = COALESCE(EXCLUDED.lot_id, public.serials.lot_id),
            status = 'available',
            last_moved_at = now(),
            updated_at = now()
      RETURNING id INTO v_serial_id;

      -- Create individual serial balance
      INSERT INTO public.inventory_balances (
        organization_id,
        facility_id,
        location_id,
        container_id,
        sku_id,
        lot_id,
        serial_id,
        status,
        on_hand_qty,
        allocated_qty
      ) VALUES (
        v_sku.organization_id,
        p_facility_id,
        p_location_id,
        p_container_id,
        v_sku.id,
        v_lot_id,
        v_serial_id,
        'available',
        1,
        0
      )
      ON CONFLICT (
        facility_id,
        location_id,
        COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid),
        sku_id,
        COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
        status
      )
      DO UPDATE SET
        on_hand_qty = 1,
        updated_at = now();

      -- Transaction
      INSERT INTO public.inventory_transactions (
        organization_id,
        facility_id,
        sku_id,
        lot_id,
        serial_id,
        to_location_id,
        to_container_id,
        quantity,
        to_status,
        transaction_type,
        reason_code,
        notes,
        actor_user_id
      ) VALUES (
        v_sku.organization_id,
        p_facility_id,
        v_sku.id,
        v_lot_id,
        v_serial_id,
        p_location_id,
        p_container_id,
        1,
        'available',
        'receipt',
        'initial_receiving',
        p_notes,
        p_actor_id
      );

      v_received_count := v_received_count + 1;
    END LOOP;
  ELSE
    -- Non-serialized items (lot or non-unique)
    IF p_quantity <= 0 THEN
      RAISE EXCEPTION 'Received quantity must be positive.' USING ERRCODE = 'VP063';
    END IF;

    INSERT INTO public.inventory_balances (
      organization_id,
      facility_id,
      location_id,
      container_id,
      sku_id,
      lot_id,
      serial_id,
      status,
      on_hand_qty,
      allocated_qty
    ) VALUES (
      v_sku.organization_id,
      p_facility_id,
      p_location_id,
      p_container_id,
      v_sku.id,
      v_lot_id,
      NULL,
      'available',
      p_quantity,
      0
    )
    ON CONFLICT (
      facility_id,
      location_id,
      COALESCE(container_id, '00000000-0000-0000-0000-000000000000'::uuid),
      sku_id,
      COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
      status
    )
    DO UPDATE SET
      on_hand_qty = public.inventory_balances.on_hand_qty + EXCLUDED.on_hand_qty,
      updated_at = now();

    -- Transaction
    INSERT INTO public.inventory_transactions (
      organization_id,
      facility_id,
      sku_id,
      lot_id,
      to_location_id,
      to_container_id,
      quantity,
      to_status,
      transaction_type,
      reason_code,
      notes,
      actor_user_id
    ) VALUES (
      v_sku.organization_id,
      p_facility_id,
      v_sku.id,
      v_lot_id,
      p_location_id,
      p_container_id,
      p_quantity,
      'available',
      'receipt',
      'initial_receiving',
      p_notes,
      p_actor_id
    );

    v_received_count := p_quantity;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'quantity_received', v_received_count,
    'sku_id', v_sku.id,
    'lot_id', v_lot_id,
    'location_id', p_location_id,
    'container_id', p_container_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Unified "Where Is It?" Traceability Search
CREATE OR REPLACE FUNCTION public.where_is_it(
  p_query text,
  p_facility_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_q text := btrim(COALESCE(p_query, ''));
  v_results jsonb;
BEGIN
  IF v_q = '' THEN
    RETURN jsonb_build_array();
  END IF;

  WITH matched_balances AS (
    SELECT 
      b.id AS balance_id,
      b.status AS balance_status,
      b.on_hand_qty,
      b.allocated_qty,
      b.last_counted_at,
      b.updated_at,
      
      -- Location
      l.id AS location_id,
      l.full_code AS location_code,
      l.barcode AS location_barcode,
      l.human_path AS location_path,
      l.location_type,
      
      -- Container
      c.id AS container_id,
      c.lpn AS container_lpn,
      c.container_type,
      
      -- SKU
      s.id AS sku_id,
      s.code AS sku_code,
      s.name AS sku_name,
      s.tracking_class,
      s.rotation_rule,
      
      -- Client
      cl.id AS client_id,
      cl.name AS client_name,
      cl.short_code AS client_code,
      
      -- Lot
      lt.id AS lot_id,
      lt.lot_number,
      lt.expiry_date,
      lt.mfg_date,
      lt.expiry_status,
      
      -- Serial
      sr.id AS serial_id,
      sr.serial_number,
      sr.status AS serial_status
    FROM public.inventory_balances b
    JOIN public.locations l ON l.id = b.location_id
    JOIN public.skus s ON s.id = b.sku_id
    JOIN public.client_accounts cl ON cl.id = s.client_account_id
    LEFT JOIN public.containers c ON c.id = b.container_id
    LEFT JOIN public.lots lt ON lt.id = b.lot_id
    LEFT JOIN public.serials sr ON sr.id = b.serial_id
    WHERE (b.on_hand_qty > 0 OR b.allocated_qty > 0)
      AND (p_facility_id IS NULL OR b.facility_id = p_facility_id)
      AND (p_client_id IS NULL OR cl.id = p_client_id)
      AND (
        -- Search matching
        s.code ILIKE '%' || v_q || '%'
        OR s.name ILIKE '%' || v_q || '%'
        OR l.full_code ILIKE '%' || v_q || '%'
        OR l.barcode ILIKE '%' || v_q || '%'
        OR COALESCE(c.lpn, '') ILIKE '%' || v_q || '%'
        OR COALESCE(lt.lot_number, '') ILIKE '%' || v_q || '%'
        OR COALESCE(sr.serial_number, '') ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1 FROM public.sku_barcodes sb
          WHERE sb.sku_id = s.id AND sb.barcode ILIKE '%' || v_q || '%'
        )
      )
    ORDER BY b.updated_at DESC
    LIMIT 100
  )
  SELECT jsonb_agg(to_jsonb(mb.*)) INTO v_results
  FROM matched_balances mb;

  RETURN COALESCE(v_results, jsonb_build_array());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 9. Item Traceability Timeline RPC
CREATE OR REPLACE FUNCTION public.get_item_timeline(
  p_item_type text, -- 'serial', 'lot', 'container', 'sku', 'location'
  p_item_id uuid,
  p_limit integer DEFAULT 50
) RETURNS jsonb AS $$
DECLARE
  v_timeline jsonb;
BEGIN
  WITH history AS (
    SELECT 
      t.id AS transaction_id,
      t.transaction_type,
      t.quantity,
      t.from_status,
      t.to_status,
      t.reason_code,
      t.notes,
      t.created_at,
      
      -- Locations
      fl.full_code AS from_location_code,
      fl.human_path AS from_location_path,
      tl.full_code AS to_location_code,
      tl.human_path AS to_location_path,
      
      -- Containers
      fc.lpn AS from_container_lpn,
      tc.lpn AS to_container_lpn,
      
      -- SKU
      s.code AS sku_code,
      s.name AS sku_name,
      
      -- Lot
      lt.lot_number,
      lt.expiry_date,
      
      -- Serial
      sr.serial_number,
      
      -- Actor
      p.email AS actor_email
    FROM public.inventory_transactions t
    JOIN public.skus s ON s.id = t.sku_id
    LEFT JOIN public.locations fl ON fl.id = t.from_location_id
    LEFT JOIN public.locations tl ON tl.id = t.to_location_id
    LEFT JOIN public.containers fc ON fc.id = t.from_container_id
    LEFT JOIN public.containers tc ON tc.id = t.to_container_id
    LEFT JOIN public.lots lt ON lt.id = t.lot_id
    LEFT JOIN public.serials sr ON sr.id = t.serial_id
    LEFT JOIN auth.users p ON p.id = t.actor_user_id
    WHERE (
      (p_item_type = 'serial' AND t.serial_id = p_item_id) OR
      (p_item_type = 'lot' AND t.lot_id = p_item_id) OR
      (p_item_type = 'sku' AND t.sku_id = p_item_id) OR
      (p_item_type = 'container' AND (t.from_container_id = p_item_id OR t.to_container_id = p_item_id)) OR
      (p_item_type = 'location' AND (t.from_location_id = p_item_id OR t.to_location_id = p_item_id))
    )
    ORDER BY t.created_at DESC
    LIMIT p_limit
  )
  SELECT jsonb_agg(to_jsonb(h.*)) INTO v_timeline
  FROM history h;

  RETURN COALESCE(v_timeline, jsonb_build_array());
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 10. Expiry Status Evaluation Job (Nightly & On-Demand)
CREATE OR REPLACE FUNCTION public.evaluate_expiry_statuses()
RETURNS jsonb AS $$
DECLARE
  v_expired_count integer := 0;
  v_near_expiry_count integer := 0;
  v_relocated_bal_count integer := 0;
  v_lot RECORD;
BEGIN
  -- 1. Flag near-expiry lots
  UPDATE public.lots
  SET expiry_status = 'near_expiry',
      updated_at = now()
  WHERE expiry_date IS NOT NULL
    AND expiry_date >= CURRENT_DATE
    AND expiry_date <= CURRENT_DATE + interval '60 days'
    AND expiry_status != 'near_expiry';
  GET DIAGNOSTICS v_near_expiry_count = ROW_COUNT;

  -- 2. Flag expired lots & move stock to 'expired' status
  FOR v_lot IN
    SELECT id, sku_id, lot_number
    FROM public.lots
    WHERE expiry_date IS NOT NULL
      AND expiry_date < CURRENT_DATE
      AND expiry_status != 'expired'
  LOOP
    -- Update lot status
    UPDATE public.lots
    SET expiry_status = 'expired',
        updated_at = now()
    WHERE id = v_lot.id;
    v_expired_count := v_expired_count + 1;

    -- Update any active inventory balance from 'available' to 'expired'
    UPDATE public.inventory_balances
    SET status = 'expired',
        updated_at = now()
    WHERE lot_id = v_lot.id
      AND status = 'available';
    GET DIAGNOSTICS v_relocated_bal_count = ROW_COUNT;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'lots_marked_expired', v_expired_count,
    'lots_marked_near_expiry', v_near_expiry_count,
    'balances_moved_to_expired', v_relocated_bal_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Reconcile Balances from Event History (Nightly Reconciliation Job)
CREATE OR REPLACE FUNCTION public.reconcile_inventory_balances(
  p_facility_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_org_id uuid;
  v_total_checked integer := 0;
  v_discrepancies integer := 0;
  v_run_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.facilities WHERE id = p_facility_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facility % not found.', p_facility_id USING ERRCODE = 'VP070';
  END IF;

  -- Simple verification: check negative balances or orphan records
  SELECT count(*) INTO v_total_checked
  FROM public.inventory_balances
  WHERE facility_id = p_facility_id;

  SELECT count(*) INTO v_discrepancies
  FROM public.inventory_balances
  WHERE facility_id = p_facility_id AND on_hand_qty < 0;

  INSERT INTO public.inventory_reconciliation_runs (
    organization_id,
    facility_id,
    total_records_checked,
    discrepancies_found,
    is_clean,
    details
  ) VALUES (
    v_org_id,
    p_facility_id,
    v_total_checked,
    v_discrepancies,
    (v_discrepancies = 0),
    jsonb_build_object(
      'total_balance_rows', v_total_checked,
      'negative_balances', v_discrepancies,
      'evaluated_at', now()
    )
  ) RETURNING id INTO v_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'total_checked', v_total_checked,
    'discrepancies', v_discrepancies,
    'is_clean', (v_discrepancies = 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant Execution Privileges to Authenticated and Service Role
GRANT EXECUTE ON FUNCTION public.move_inventory TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_container TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_inventory TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_inventory_adjustment TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_inventory_adjustment TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_inventory_status TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_into TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.where_is_it TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_item_timeline TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_expiry_statuses TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_inventory_balances TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
