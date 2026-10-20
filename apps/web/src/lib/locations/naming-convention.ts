/**
 * VentoryPoint Location Naming Convention Engine (Sprint 3 §3.3)
 * Enforces fixed-width, zero-padded segments, exclusion of lookalike characters,
 * template substitution, and human-readable breadcrumb path generation.
 */

export interface NamingConventionConfig {
  separator: string;
  rackTemplate: string;
  floorGridTemplate: string;
  bulkLaneTemplate: string;
  specialAreaTemplate: string;
  segmentWidths: Record<string, number>;
  excludedChars: string[];
  oddEvenAisleSides: boolean;
  bottomUpLevels: boolean;
}

export const DEFAULT_NAMING_CONFIG: NamingConventionConfig = {
  separator: "-",
  rackTemplate: "{FAC}-{WING}-{AREA}-{AISLE}-{BAY}-{LEVEL}-{POS}",
  floorGridTemplate: "{FAC}-{WING}-FLR-R{ROW}-C{COL}",
  bulkLaneTemplate: "{FAC}-{WING}-BLK-LN{LANE}-S{SLOT}",
  specialAreaTemplate: "{FAC}-{WING}-{AREA}-{NN}",
  segmentWidths: {
    FAC: 4,
    WING: 2,
    AREA: 2,
    AISLE: 3,
    BAY: 3,
    LEVEL: 2,
    POS: 3,
    ROW: 2,
    COL: 2,
    LANE: 2,
    SLOT: 2,
    NN: 2,
  },
  excludedChars: ["O", "0", "I", "1", "S", "5"],
  oddEvenAisleSides: true,
  bottomUpLevels: true,
};

/**
 * Validates a code segment against excluded lookalike characters and format rules.
 */
export function validateSegment(
  key: string,
  val: string,
  expectedWidth: number,
  excludedChars: string[]
): { valid: boolean; reason?: string } {
  if (!val || val.trim().length === 0) {
    return { valid: false, reason: `Segment ${key} is empty` };
  }

  const clean = val.trim().toUpperCase();

  // If width is specified and strictly enforced
  if (expectedWidth && clean.length !== expectedWidth) {
    return {
      valid: false,
      reason: `Segment ${key} ('${clean}') has length ${clean.length}, expected ${expectedWidth}`,
    };
  }

  // Check for disallowed characters (letters that look like numbers)
  for (const char of clean) {
    // Only check letter segments for lookalikes (or check full segment if configured)
    if (excludedChars.includes(char)) {
      if (char === "O") {
        return { valid: false, reason: `Ambiguous character 'O' found in ${key} (use '0' or omit)` };
      }
      if (char === "I") {
        return { valid: false, reason: `Ambiguous character 'I' found in ${key} (use '1' or omit)` };
      }
      if (char === "S") {
        return { valid: false, reason: `Ambiguous character 'S' found in ${key} (use '5' or omit)` };
      }
    }
  }

  return { valid: true };
}

/**
 * Format and zero-pad a numeric or string segment to the target width
 */
export function formatSegment(val: string | number, width: number, prefix: string = ""): string {
  const str = String(val).trim().toUpperCase();
  // Strip existing prefix if already present
  const rawNumber = str.startsWith(prefix) ? str.slice(prefix.length) : str;
  const num = parseInt(rawNumber, 10);

  if (!isNaN(num)) {
    return `${prefix}${String(num).padStart(width - prefix.length, "0")}`;
  }

  return str.padStart(width, "0");
}

/**
 * Generates a full Rack Pallet / Shelf Bin code
 */
export function buildRackCode(
  params: {
    facilityCode: string;
    wingCode: string;
    areaCode: string;
    aisle: number | string;
    bay: number | string;
    level: number | string;
    position: number | string;
  },
  config: NamingConventionConfig = DEFAULT_NAMING_CONFIG
): string {
  const fac = params.facilityCode.trim().toUpperCase().padEnd(config.segmentWidths.FAC || 4, " ").trim();
  const wing = formatSegment(params.wingCode, config.segmentWidths.WING || 2, "W");
  const area = formatSegment(params.areaCode, config.segmentWidths.AREA || 2, "Z");
  const aisle = formatSegment(params.aisle, config.segmentWidths.AISLE || 3, "A");
  const bay = formatSegment(params.bay, config.segmentWidths.BAY || 3, "B");
  const level = formatSegment(params.level, config.segmentWidths.LEVEL || 2, "L");
  const pos = formatSegment(params.position, config.segmentWidths.POS || 3, "P");

  return config.rackTemplate
    .replace("{FAC}", fac)
    .replace("{WING}", wing)
    .replace("{AREA}", area)
    .replace("{AISLE}", aisle)
    .replace("{BAY}", bay)
    .replace("{LEVEL}", level)
    .replace("{POS}", pos);
}

/**
 * Generates a Floor Grid Cell code (e.g. DAL1-W1-FLR-R05-C03)
 */
export function buildFloorGridCode(
  params: {
    facilityCode: string;
    wingCode: string;
    row: number | string;
    col: number | string;
  },
  config: NamingConventionConfig = DEFAULT_NAMING_CONFIG
): string {
  const fac = params.facilityCode.trim().toUpperCase();
  const wing = formatSegment(params.wingCode, config.segmentWidths.WING || 2, "W");
  const row = String(params.row).padStart(config.segmentWidths.ROW || 2, "0");
  const col = String(params.col).padStart(config.segmentWidths.COL || 2, "0");

  return config.floorGridTemplate
    .replace("{FAC}", fac)
    .replace("{WING}", wing)
    .replace("{ROW}", row)
    .replace("{COL}", col);
}

/**
 * Generates a Bulk Lane code (e.g. DAL1-W1-BLK-LN07-S02)
 */
export function buildBulkLaneCode(
  params: {
    facilityCode: string;
    wingCode: string;
    lane: number | string;
    slot: number | string;
  },
  config: NamingConventionConfig = DEFAULT_NAMING_CONFIG
): string {
  const fac = params.facilityCode.trim().toUpperCase();
  const wing = formatSegment(params.wingCode, config.segmentWidths.WING || 2, "W");
  const lane = String(params.lane).padStart(config.segmentWidths.LANE || 2, "0");
  const slot = String(params.slot).padStart(config.segmentWidths.SLOT || 2, "0");

  return config.bulkLaneTemplate
    .replace("{FAC}", fac)
    .replace("{WING}", wing)
    .replace("{LANE}", lane)
    .replace("{SLOT}", slot);
}

/**
 * Generates a Special Area code (e.g. DAL1-W1-CAGE-01, DAL1-W3-COLD-04)
 */
export function buildSpecialAreaCode(
  params: {
    facilityCode: string;
    wingCode: string;
    areaCode: string;
    index: number | string;
  },
  config: NamingConventionConfig = DEFAULT_NAMING_CONFIG
): string {
  const fac = params.facilityCode.trim().toUpperCase();
  const wing = formatSegment(params.wingCode, config.segmentWidths.WING || 2, "W");
  const area = params.areaCode.trim().toUpperCase();
  const nn = String(params.index).padStart(config.segmentWidths.NN || 2, "0");

  return config.specialAreaTemplate
    .replace("{FAC}", fac)
    .replace("{WING}", wing)
    .replace("{AREA}", area)
    .replace("{NN}", nn);
}

/**
 * Generates a short pick code alias (e.g. A04-12-3-02)
 */
export function buildShortPickCode(
  aisle: number | string,
  bay: number | string,
  level: number | string,
  pos: number | string
): string {
  const a = formatSegment(aisle, 3, "A");
  const b = String(bay).padStart(2, "0");
  const l = String(level).trim();
  const p = String(pos).padStart(2, "0");
  return `${a}-${b}-${l}-${p}`;
}

/**
 * Renders a full human-readable breadcrumb path from structured parameters or location data.
 * Example: 'Dallas 1 › Wing 2 › Area A › Aisle 04 › Bay 12 › Level 3 › Position 02'
 */
export function renderHumanPath(params: {
  facilityName?: string;
  wingName?: string;
  areaName?: string;
  aisleCode?: string;
  bayCode?: string;
  levelCode?: string;
  positionCode?: string;
  rowCode?: string;
  colCode?: string;
  laneCode?: string;
  slotCode?: string;
  specialTypeName?: string;
}): string {
  const segments: string[] = [];

  if (params.facilityName) segments.push(params.facilityName);
  if (params.wingName) segments.push(`Wing ${params.wingName.replace(/^W/i, "")}`);
  if (params.areaName) segments.push(params.areaName.startsWith("Area") ? params.areaName : `Area ${params.areaName}`);

  if (params.aisleCode) segments.push(`Aisle ${params.aisleCode.replace(/^A/i, "")}`);
  if (params.bayCode) segments.push(`Bay ${params.bayCode.replace(/^B/i, "")}`);
  if (params.levelCode) segments.push(`Level ${params.levelCode.replace(/^L/i, "")}`);
  if (params.positionCode) segments.push(`Position ${params.positionCode.replace(/^P/i, "")}`);

  if (params.rowCode && params.colCode) {
    segments.push(`Floor Grid Row ${params.rowCode} · Col ${params.colCode}`);
  }

  if (params.laneCode && params.slotCode) {
    segments.push(`Bulk Lane ${params.laneCode} · Slot ${params.slotCode}`);
  }

  if (params.specialTypeName) {
    segments.push(params.specialTypeName);
  }

  return segments.join(" › ");
}
