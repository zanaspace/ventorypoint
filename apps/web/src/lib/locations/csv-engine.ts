/**
 * VentoryPoint Location CSV Import & Export Engine (Sprint 3 §3.4)
 * Parses CSV lines, strictly validates codes against facility naming rules,
 * flags duplicates and format violations with row-level error reasons.
 */

import { GeneratedLocation } from "./range-generator";
import { DEFAULT_NAMING_CONFIG, NamingConventionConfig } from "./naming-convention";

export interface ValidationIssue {
  row: number;
  code?: string;
  field?: string;
  reason: string;
}

export interface CsvImportResult {
  totalRows: number;
  validLocations: GeneratedLocation[];
  errors: ValidationIssue[];
}

export function exportLocationsToCsv(locations: any[]): string {
  const headers = [
    "full_code",
    "barcode",
    "short_pick_code",
    "location_type",
    "sub_type",
    "human_path",
    "building_code",
    "wing_code",
    "area_code",
    "aisle_code",
    "bay_code",
    "level_code",
    "position_code",
    "row_code",
    "column_code",
    "lane_code",
    "slot_code",
    "max_pallets",
    "max_stack_height",
    "lane_depth",
    "lane_rotation_rule",
    "temperature_class",
    "security_level",
    "mixed_sku_allowed",
    "mixed_lot_allowed",
    "pickable",
    "sellable",
    "receivable",
    "active",
    "rack_side",
    "walk_sequence",
  ];

  const rows = locations.map((loc) =>
    headers
      .map((h) => {
        const val = loc[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );

  return [headers.join(","), ...rows].join("\n");
}

export function parseLocationsCsv(
  csvContent: string,
  context: {
    organizationId: string;
    facilityId: string;
    facilityCode: string;
    config?: NamingConventionConfig;
    existingCodes?: Set<string>;
  }
): CsvImportResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      totalRows: 0,
      validLocations: [],
      errors: [{ row: 1, reason: "CSV must have a header row and at least one data row" }],
    };
  }

  const rawHeaders = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const headerMap = new Map<string, number>();
  rawHeaders.forEach((h, idx) => headerMap.set(h, idx));

  if (!headerMap.has("full_code")) {
    return {
      totalRows: lines.length - 1,
      validLocations: [],
      errors: [{ row: 1, field: "full_code", reason: "Missing required 'full_code' header in CSV" }],
    };
  }

  const validLocations: GeneratedLocation[] = [];
  const errors: ValidationIssue[] = [];
  const seenInFile = new Set<string>();
  const config = context.config || DEFAULT_NAMING_CONFIG;

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const rawLine = lines[i];

    // Basic CSV cell extraction supporting quotes
    const cells: string[] = [];
    let inQuotes = false;
    let currentCell = "";
    for (let c = 0; c < rawLine.length; c++) {
      const char = rawLine[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        cells.push(currentCell.trim());
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim());

    const getVal = (colName: string): string => {
      const idx = headerMap.get(colName);
      if (idx === undefined || idx >= cells.length) return "";
      return cells[idx].replace(/^"|"$/g, "").trim();
    };

    const fullCode = getVal("full_code").toUpperCase();

    if (!fullCode) {
      errors.push({ row: rowNum, field: "full_code", reason: "full_code cannot be empty" });
      continue;
    }

    // Check uppercase alphanumeric and separator
    const codeRegex = /^[A-Z0-9_\-]+$/;
    if (!codeRegex.test(fullCode)) {
      errors.push({
        row: rowNum,
        code: fullCode,
        field: "full_code",
        reason: "Code must contain only uppercase letters, numbers, and hyphens",
      });
      continue;
    }

    // Check for lookalike characters
    if (fullCode.includes("O")) {
      errors.push({
        row: rowNum,
        code: fullCode,
        field: "full_code",
        reason: "Ambiguous character 'O' found; use '0' instead to prevent scanning errors",
      });
      continue;
    }

    // Check duplicates inside CSV
    if (seenInFile.has(fullCode)) {
      errors.push({
        row: rowNum,
        code: fullCode,
        field: "full_code",
        reason: `Duplicate code '${fullCode}' found multiple times in this import file`,
      });
      continue;
    }
    seenInFile.add(fullCode);

    // Check existing database duplicates
    if (context.existingCodes && context.existingCodes.has(fullCode)) {
      errors.push({
        row: rowNum,
        code: fullCode,
        field: "full_code",
        reason: `Location '${fullCode}' already exists in this facility`,
      });
      continue;
    }

    const locType = (getVal("location_type") || "rack_pallet_position") as any;
    const allowedTypes = [
      "rack_pallet_position",
      "shelf_bin",
      "floor_grid_cell",
      "bulk_floor_lane",
      "special_area",
    ];
    if (!allowedTypes.includes(locType)) {
      errors.push({
        row: rowNum,
        code: fullCode,
        field: "location_type",
        reason: `Invalid location_type '${locType}'. Allowed: ${allowedTypes.join(", ")}`,
      });
      continue;
    }

    const barcode = getVal("barcode") || fullCode;
    const shortPickCode = getVal("short_pick_code") || undefined;
    const humanPath = getVal("human_path") || fullCode.replace(/-/g, " › ");

    const tempClass = (getVal("temperature_class") || "ambient") as any;
    const allowedTemps = ["ambient", "chilled", "frozen", "deep_freeze", "temperature_controlled"];
    if (!allowedTemps.includes(tempClass)) {
      errors.push({
        row: rowNum,
        code: fullCode,
        field: "temperature_class",
        reason: `Invalid temperature_class '${tempClass}'`,
      });
      continue;
    }

    validLocations.push({
      organization_id: context.organizationId,
      facility_id: context.facilityId,
      full_code: fullCode,
      barcode: barcode,
      short_pick_code: shortPickCode,
      human_path: humanPath,
      location_type: locType,
      sub_type: getVal("sub_type") || "standard",
      building_code: getVal("building_code") || context.facilityCode,
      wing_code: getVal("wing_code") || undefined,
      floor_code: getVal("floor_code") || undefined,
      area_code: getVal("area_code") || undefined,
      aisle_code: getVal("aisle_code") || undefined,
      bay_code: getVal("bay_code") || undefined,
      level_code: getVal("level_code") || undefined,
      position_code: getVal("position_code") || undefined,
      row_code: getVal("row_code") || undefined,
      column_code: getVal("column_code") || undefined,
      lane_code: getVal("lane_code") || undefined,
      slot_code: getVal("slot_code") || undefined,
      max_pallets: parseInt(getVal("max_pallets") || "1", 10),
      max_stack_height: parseInt(getVal("max_stack_height") || "1", 10),
      lane_depth: getVal("lane_depth") ? parseInt(getVal("lane_depth"), 10) : undefined,
      lane_rotation_rule: (getVal("lane_rotation_rule") as any) || undefined,
      temperature_class: tempClass,
      security_level: (getVal("security_level") || "standard") as any,
      mixed_sku_allowed: getVal("mixed_sku_allowed") !== "false",
      mixed_lot_allowed: getVal("mixed_lot_allowed") !== "false",
      pickable: getVal("pickable") !== "false",
      sellable: getVal("sellable") !== "false",
      receivable: getVal("receivable") !== "false",
      active: getVal("active") !== "false",
      rack_side: (getVal("rack_side") || "none") as any,
      walk_sequence: parseInt(getVal("walk_sequence") || String(validLocations.length + 1), 10),
    });
  }

  return {
    totalRows: lines.length - 1,
    validLocations,
    errors,
  };
}
