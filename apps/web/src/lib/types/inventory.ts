export type InventoryStatus = 'available' | 'allocated' | 'hold' | 'damaged' | 'expired';
export type ContainerType = 'pallet' | 'case' | 'tote' | 'cart';
export type ContainerStatus = 'active' | 'closed' | 'shipped' | 'archived';
export type ExpiryStatus = 'ok' | 'near_expiry' | 'expired';
export type TransactionType = 'receipt' | 'move' | 'adjust' | 'status_change' | 'consume' | 'cycle_count' | 'container_move';
export type AdjustmentApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Lot {
  id: string;
  organization_id: string;
  client_account_id: string;
  sku_id: string;
  lot_number: string;
  mfg_date: string | null;
  expiry_date: string | null;
  first_received_at: string;
  expiry_status: ExpiryStatus;
  notes: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  sku?: {
    code: string;
    name: string;
    rotation_rule: string;
  };
  client?: {
    name: string;
    short_code: string;
  };
}

export interface Container {
  id: string;
  organization_id: string;
  facility_id: string;
  client_account_id: string | null;
  lpn: string;
  container_type: ContainerType;
  parent_container_id: string | null;
  current_location_id: string | null;
  status: ContainerStatus;
  tare_weight_kg: number;
  max_weight_kg: number | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  location?: {
    full_code: string;
    human_path: string;
  };
  parent_container?: {
    lpn: string;
    container_type: ContainerType;
  };
  contents_count?: number;
  total_qty?: number;
}

export interface Serial {
  id: string;
  organization_id: string;
  client_account_id: string;
  sku_id: string;
  lot_id: string | null;
  serial_number: string;
  current_facility_id: string | null;
  current_location_id: string | null;
  current_container_id: string | null;
  status: string;
  first_received_at: string;
  last_moved_at: string;
  metadata?: Record<string, unknown>;
  sku?: {
    code: string;
    name: string;
  };
  lot?: {
    lot_number: string;
    expiry_date: string | null;
  };
  location?: {
    full_code: string;
    human_path: string;
  };
  container?: {
    lpn: string;
  };
}

export interface InventoryBalance {
  id: string;
  organization_id: string;
  facility_id: string;
  location_id: string;
  container_id: string | null;
  sku_id: string;
  lot_id: string | null;
  serial_id: string | null;
  status: InventoryStatus;
  on_hand_qty: number;
  allocated_qty: number;
  last_counted_at: string | null;
  created_at: string;
  updated_at: string;
  location?: {
    id: string;
    full_code: string;
    barcode: string;
    human_path: string;
    location_type: string;
  };
  container?: {
    id: string;
    lpn: string;
    container_type: ContainerType;
  };
  sku?: {
    id: string;
    code: string;
    name: string;
    tracking_class: string;
    rotation_rule: string;
    client_account_id: string;
  };
  lot?: {
    id: string;
    lot_number: string;
    expiry_date: string | null;
    expiry_status: ExpiryStatus;
  };
  serial?: {
    id: string;
    serial_number: string;
    status: string;
  };
  client?: {
    id: string;
    name: string;
    short_code: string;
  };
}

export interface InventoryTransaction {
  id: string;
  organization_id: string;
  facility_id: string;
  event_id: string | null;
  sku_id: string;
  lot_id: string | null;
  serial_id: string | null;
  from_location_id: string | null;
  from_container_id: string | null;
  to_location_id: string | null;
  to_container_id: string | null;
  quantity: number;
  from_status: InventoryStatus | null;
  to_status: InventoryStatus | null;
  transaction_type: TransactionType;
  reason_code: string | null;
  notes: string | null;
  actor_user_id: string | null;
  actor_worker_id: string | null;
  device_id: string | null;
  created_at: string;
  sku?: {
    code: string;
    name: string;
  };
  lot?: {
    lot_number: string;
  };
  serial?: {
    serial_number: string;
  };
  from_location?: {
    full_code: string;
    human_path: string;
  };
  to_location?: {
    full_code: string;
    human_path: string;
  };
  from_container?: {
    lpn: string;
  };
  to_container?: {
    lpn: string;
  };
}

export interface AdjustmentReason {
  code: string;
  description: string;
  category: 'loss' | 'gain' | 'damage' | 'correction';
  requires_supervisor_approval: boolean;
  direction: 'in' | 'out' | 'both';
  is_active: boolean;
}

export interface InventoryAdjustment {
  id: string;
  organization_id: string;
  facility_id: string;
  location_id: string;
  container_id: string | null;
  sku_id: string;
  lot_id: string | null;
  serial_id: string | null;
  current_qty: number;
  quantity_delta: number;
  target_qty: number;
  status: InventoryStatus;
  reason_code: string;
  notes: string | null;
  requested_by: string | null;
  approval_status: AdjustmentApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
  sku?: {
    code: string;
    name: string;
  };
  location?: {
    full_code: string;
    human_path: string;
  };
  container?: {
    lpn: string;
  };
  lot?: {
    lot_number: string;
  };
}

export interface WhereIsResult {
  balance_id: string;
  balance_status: InventoryStatus;
  on_hand_qty: number;
  allocated_qty: number;
  last_counted_at: string | null;
  updated_at: string;
  location_id: string;
  location_code: string;
  location_barcode: string;
  location_path: string;
  location_type: string;
  container_id: string | null;
  container_lpn: string | null;
  container_type: string | null;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  tracking_class: string;
  rotation_rule: string;
  client_id: string;
  client_name: string;
  client_code: string;
  lot_id: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  mfg_date: string | null;
  expiry_status: ExpiryStatus | null;
  serial_id: string | null;
  serial_number: string | null;
  serial_status: string | null;
}

export interface ItemTimelineEntry {
  transaction_id: string;
  transaction_type: string;
  quantity: number;
  from_status: string | null;
  to_status: string | null;
  reason_code: string | null;
  notes: string | null;
  created_at: string;
  from_location_code: string | null;
  from_location_path: string | null;
  to_location_code: string | null;
  to_location_path: string | null;
  from_container_lpn: string | null;
  to_container_lpn: string | null;
  sku_code: string;
  sku_name: string;
  lot_number: string | null;
  expiry_date: string | null;
  serial_number: string | null;
  actor_email: string | null;
}
