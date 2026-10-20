/**
 * VentoryPoint Bulk Location Range Generator (Sprint 3 §3.4)
 * Generates Racks, Floor Grids, Bulk Deep Lanes and Special Areas
 * with auto-calculated serpentine / one-way walk sequencing.
 */

import {
  buildRackCode,
  buildFloorGridCode,
  buildBulkLaneCode,
  buildSpecialAreaCode,
  buildShortPickCode,
  renderHumanPath,
  formatSegment,
  DEFAULT_NAMING_CONFIG,
  NamingConventionConfig,
} from "./naming-convention";

export interface GeneratedLocation {
  organization_id: string;
  facility_id: string;
  full_code: string;
  barcode: string;
  short_pick_code?: string;
  human_path: string;
  location_type:
    | "rack_pallet_position"
    | "shelf_bin"
    | "floor_grid_cell"
    | "bulk_floor_lane"
    | "special_area";
  sub_type: string;
  building_code?: string;
  wing_code?: string;
  floor_code?: string;
  area_code?: string;
  aisle_code?: string;
  bay_code?: string;
  level_code?: string;
  position_code?: string;
  row_code?: string;
  column_code?: string;
  lane_code?: string;
  slot_code?: string;
  max_weight_kg?: number;
  max_volume_cbm?: number;
  max_pallets: number;
  max_stack_height: number;
  lane_depth?: number;
  lane_rotation_rule?: "fifo_drive_through" | "lifo_single_entry";
  temperature_class: "ambient" | "chilled" | "frozen" | "deep_freeze" | "temperature_controlled";
  security_level: "standard" | "caged_vault" | "hazmat_secure" | "high_value";
  mixed_sku_allowed: boolean;
  mixed_lot_allowed: boolean;
  pickable: boolean;
  sellable: boolean;
  receivable: boolean;
  active: boolean;
  rack_side: "left" | "right" | "odd" | "even" | "none";
  walk_sequence: number;
}

export interface RangePreviewResult {
  totalCount: number;
  sampleFirst: string[];
  sampleLast: string[];
  locations: GeneratedLocation[];
}

/**
 * Generate a range of Rack Pallet or Shelf Bin locations
 */
export function generateRackLocations(params: {
  organizationId: string;
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  wingCode: string;
  areaCode: string;
  aisleStart: number;
  aisleEnd: number;
  bayStart: number;
  bayEnd: number;
  levelStart: number;
  levelEnd: number;
  posStart: number;
  posEnd: number;
  locationType?: "rack_pallet_position" | "shelf_bin";
  temperatureClass?: "ambient" | "chilled" | "frozen" | "deep_freeze" | "temperature_controlled";
  walkType?: "serpentine" | "one_way";
  walkSeqStart?: number;
  oddEvenSides?: boolean;
  config?: NamingConventionConfig;
}): RangePreviewResult {
  const config = params.config || DEFAULT_NAMING_CONFIG;
  const locType = params.locationType || "rack_pallet_position";
  const tempClass = params.temperatureClass || "ambient";
  const walkType = params.walkType || "serpentine";
  let seq = params.walkSeqStart ?? 1;

  const locations: GeneratedLocation[] = [];

  for (let a = params.aisleStart; a <= params.aisleEnd; a++) {
    const isAisleReversed = walkType === "serpentine" && a % 2 === 0;
    const bayRange: number[] = [];
    for (let b = params.bayStart; b <= params.bayEnd; b++) {
      bayRange.push(b);
    }
    if (isAisleReversed) {
      bayRange.reverse();
    }

    const aisleStr = formatSegment(a, config.segmentWidths.AISLE || 3, "A");

    for (const b of bayRange) {
      const bayStr = formatSegment(b, config.segmentWidths.BAY || 3, "B");
      const side: "left" | "right" | "odd" | "even" = params.oddEvenSides
        ? b % 2 === 1
          ? "odd"
          : "even"
        : "left";

      for (let l = params.levelStart; l <= params.levelEnd; l++) {
        const levelStr = formatSegment(l, config.segmentWidths.LEVEL || 2, "L");

        for (let p = params.posStart; p <= params.posEnd; p++) {
          const posStr = formatSegment(p, config.segmentWidths.POS || 3, "P");

          const fullCode = buildRackCode(
            {
              facilityCode: params.facilityCode,
              wingCode: params.wingCode,
              areaCode: params.areaCode,
              aisle: a,
              bay: b,
              level: l,
              position: p,
            },
            config
          );

          const shortPick = buildShortPickCode(a, b, l, p);

          const humanPath = renderHumanPath({
            facilityName: params.facilityName,
            wingName: params.wingCode,
            areaName: params.areaCode,
            aisleCode: aisleStr,
            bayCode: bayStr,
            levelCode: levelStr,
            positionCode: posStr,
          });

          locations.push({
            organization_id: params.organizationId,
            facility_id: params.facilityId,
            full_code: fullCode,
            barcode: fullCode,
            short_pick_code: shortPick,
            human_path: humanPath,
            location_type: locType,
            sub_type: "standard",
            building_code: params.facilityCode,
            wing_code: params.wingCode,
            area_code: params.areaCode,
            aisle_code: aisleStr,
            bay_code: bayStr,
            level_code: levelStr,
            position_code: posStr,
            max_pallets: locType === "rack_pallet_position" ? 1 : 0,
            max_stack_height: 1,
            temperature_class: tempClass,
            security_level: "standard",
            mixed_sku_allowed: locType === "shelf_bin",
            mixed_lot_allowed: locType === "shelf_bin",
            pickable: true,
            sellable: true,
            receivable: true,
            active: true,
            rack_side: side,
            walk_sequence: seq++,
          });
        }
      }
    }
  }

  const sampleFirst = locations.slice(0, 3).map((l) => l.full_code);
  const sampleLast = locations.slice(-3).map((l) => l.full_code);

  return {
    totalCount: locations.length,
    sampleFirst,
    sampleLast,
    locations,
  };
}

/**
 * Generate a range of Floor Grid Cell locations (e.g. DAL1-W1-FLR-R05-C03)
 */
export function generateFloorGridLocations(params: {
  organizationId: string;
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  wingCode: string;
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  maxPallets?: number;
  maxStackHeight?: number;
  walkSeqStart?: number;
  config?: NamingConventionConfig;
}): RangePreviewResult {
  const config = params.config || DEFAULT_NAMING_CONFIG;
  let seq = params.walkSeqStart ?? 1;
  const locations: GeneratedLocation[] = [];

  for (let r = params.rowStart; r <= params.rowEnd; r++) {
    const rowStr = String(r).padStart(config.segmentWidths.ROW || 2, "0");

    for (let c = params.colStart; c <= params.colEnd; c++) {
      const colStr = String(c).padStart(config.segmentWidths.COL || 2, "0");

      const fullCode = buildFloorGridCode(
        {
          facilityCode: params.facilityCode,
          wingCode: params.wingCode,
          row: r,
          col: c,
        },
        config
      );

      const humanPath = renderHumanPath({
        facilityName: params.facilityName,
        wingName: params.wingCode,
        rowCode: rowStr,
        colCode: colStr,
      });

      locations.push({
        organization_id: params.organizationId,
        facility_id: params.facilityId,
        full_code: fullCode,
        barcode: fullCode,
        human_path: humanPath,
        location_type: "floor_grid_cell",
        sub_type: "standard",
        building_code: params.facilityCode,
        wing_code: params.wingCode,
        row_code: rowStr,
        column_code: colStr,
        max_pallets: params.maxPallets ?? 4,
        max_stack_height: params.maxStackHeight ?? 2,
        temperature_class: "ambient",
        security_level: "standard",
        mixed_sku_allowed: false,
        mixed_lot_allowed: false,
        pickable: true,
        sellable: true,
        receivable: true,
        active: true,
        rack_side: "none",
        walk_sequence: seq++,
      });
    }
  }

  return {
    totalCount: locations.length,
    sampleFirst: locations.slice(0, 3).map((l) => l.full_code),
    sampleLast: locations.slice(-3).map((l) => l.full_code),
    locations,
  };
}

/**
 * Generate a range of Bulk Lane locations (e.g. DAL1-W1-BLK-LN07-S02)
 */
export function generateBulkLaneLocations(params: {
  organizationId: string;
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  wingCode: string;
  laneStart: number;
  laneEnd: number;
  slotStart: number;
  slotEnd: number;
  laneDepth?: number;
  laneRotationRule?: "fifo_drive_through" | "lifo_single_entry";
  walkSeqStart?: number;
  config?: NamingConventionConfig;
}): RangePreviewResult {
  const config = params.config || DEFAULT_NAMING_CONFIG;
  let seq = params.walkSeqStart ?? 1;
  const locations: GeneratedLocation[] = [];

  for (let ln = params.laneStart; ln <= params.laneEnd; ln++) {
    const laneStr = String(ln).padStart(config.segmentWidths.LANE || 2, "0");

    for (let sl = params.slotStart; sl <= params.slotEnd; sl++) {
      const slotStr = String(sl).padStart(config.segmentWidths.SLOT || 2, "0");

      const fullCode = buildBulkLaneCode(
        {
          facilityCode: params.facilityCode,
          wingCode: params.wingCode,
          lane: ln,
          slot: sl,
        },
        config
      );

      const humanPath = renderHumanPath({
        facilityName: params.facilityName,
        wingName: params.wingCode,
        laneCode: laneStr,
        slotCode: slotStr,
      });

      locations.push({
        organization_id: params.organizationId,
        facility_id: params.facilityId,
        full_code: fullCode,
        barcode: fullCode,
        human_path: humanPath,
        location_type: "bulk_floor_lane",
        sub_type: "standard",
        building_code: params.facilityCode,
        wing_code: params.wingCode,
        lane_code: laneStr,
        slot_code: slotStr,
        lane_depth: params.laneDepth ?? 6,
        lane_rotation_rule: params.laneRotationRule ?? "fifo_drive_through",
        max_pallets: 1,
        max_stack_height: 2,
        temperature_class: "ambient",
        security_level: "standard",
        mixed_sku_allowed: false,
        mixed_lot_allowed: false,
        pickable: true,
        sellable: true,
        receivable: true,
        active: true,
        rack_side: "none",
        walk_sequence: seq++,
      });
    }
  }

  return {
    totalCount: locations.length,
    sampleFirst: locations.slice(0, 3).map((l) => l.full_code),
    sampleLast: locations.slice(-3).map((l) => l.full_code),
    locations,
  };
}

/**
 * Generate special area locations (cages, cold rooms, staging, dock doors, pack stations)
 */
export function generateSpecialAreaLocations(params: {
  organizationId: string;
  facilityId: string;
  facilityCode: string;
  facilityName: string;
  wingCode: string;
  subType: string;
  areaCode: string;
  count: number;
  temperatureClass?: "ambient" | "chilled" | "frozen" | "deep_freeze" | "temperature_controlled";
  securityLevel?: "standard" | "caged_vault" | "hazmat_secure" | "high_value";
  pickable?: boolean;
  sellable?: boolean;
  receivable?: boolean;
  config?: NamingConventionConfig;
}): RangePreviewResult {
  const config = params.config || DEFAULT_NAMING_CONFIG;
  const locations: GeneratedLocation[] = [];

  for (let i = 1; i <= params.count; i++) {
    const fullCode = buildSpecialAreaCode(
      {
        facilityCode: params.facilityCode,
        wingCode: params.wingCode,
        areaCode: params.areaCode,
        index: i,
      },
      config
    );

    const humanPath = renderHumanPath({
      facilityName: params.facilityName,
      wingName: params.wingCode,
      specialTypeName: `${params.subType.replace(/_/g, " ").toUpperCase()} #${i}`,
    });

    locations.push({
      organization_id: params.organizationId,
      facility_id: params.facilityId,
      full_code: fullCode,
      barcode: fullCode,
      human_path: humanPath,
      location_type: "special_area",
      sub_type: params.subType,
      building_code: params.facilityCode,
      wing_code: params.wingCode,
      area_code: params.areaCode,
      max_pallets: 10,
      max_stack_height: 1,
      temperature_class: params.temperatureClass || "ambient",
      security_level: params.securityLevel || "standard",
      mixed_sku_allowed: true,
      mixed_lot_allowed: true,
      pickable: params.pickable ?? false,
      sellable: params.sellable ?? false,
      receivable: params.receivable ?? true,
      active: true,
      rack_side: "none",
      walk_sequence: 9999 + i,
    });
  }

  return {
    totalCount: locations.length,
    sampleFirst: locations.slice(0, 3).map((l) => l.full_code),
    sampleLast: locations.slice(-3).map((l) => l.full_code),
    locations,
  };
}
