export type TrackingClass = "non_unique" | "lot" | "serial" | "lot_serial";
export type RotationRule = "fifo" | "fefo" | "lifo" | "customer_lot";
export type SerialSource = "manufacturer" | "generated";
export type SerialCapturePoint = "receipt" | "shipment" | "both";
export type UomLevel = "each" | "inner" | "case" | "pallet";
export type BarcodeType = "upc" | "ean" | "gtin14" | "code128" | "custom";
export type SkuStatus = "active" | "inactive" | "discontinued";
export type TemperatureClass = "ambient" | "chilled" | "frozen" | "deep_freeze" | "temperature_controlled";

export interface SkuUom {
  id: string;
  sku_id: string;
  uom_level: UomLevel;
  uom_name: string;
  conversion_factor: number;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  volume_cbm?: number | null;
  is_receivable: boolean;
  is_pickable: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkuBarcode {
  id: string;
  sku_id: string;
  uom_id?: string | null;
  barcode: string;
  barcode_type: BarcodeType;
  is_primary: boolean;
  created_at: string;
}

export interface SkuAlias {
  id: string;
  sku_id: string;
  channel_type: "shopify" | "amazon" | "woocommerce" | "walmart" | "ebay" | "custom";
  channel_sku: string;
  created_at: string;
}

export interface KitComponent {
  id: string;
  parent_sku_id: string;
  component_sku_id: string;
  quantity: number;
  component_sku?: Sku;
}

export interface Sku {
  id: string;
  organization_id: string;
  client_account_id: string;
  client?: {
    id: string;
    name: string;
    short_code: string;
  };
  code: string;
  name: string;
  description?: string | null;
  status: SkuStatus;
  category?: string | null;
  brand?: string | null;
  
  // Tracking & Rotation
  tracking_class: TrackingClass;
  serial_source?: SerialSource | null;
  serial_capture_point?: SerialCapturePoint | null;
  serial_pattern?: string | null;
  uid_prefix: string;
  rotation_rule: RotationRule;
  expiry_required: boolean;
  mfg_date_required: boolean;
  shelf_life_days?: number | null;
  min_shelf_life_receipt_days?: number | null;
  min_shelf_life_ship_days?: number | null;
  near_expiry_days: number;
  
  // Storage & Safety
  temperature_class: TemperatureClass;
  hazmat_class?: string | null;
  fragile: boolean;
  country_of_origin?: string | null;
  hs_code?: string | null;
  
  // Media & Meta
  images: string[];
  custom_attributes: Record<string, any>;
  
  // Relational aggregates
  uoms?: SkuUom[];
  barcodes?: SkuBarcode[];
  aliases?: SkuAlias[];
  
  created_at: string;
  updated_at: string;
}

export interface CatalogCompleteness {
  total_skus: number;
  with_barcode: number;
  with_dimensions: number;
  with_weight: number;
  with_image: number;
  completeness_score_pct: number;
}
