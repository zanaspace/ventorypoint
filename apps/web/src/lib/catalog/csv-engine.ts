import { Sku } from "@/lib/types/catalog";

export interface ParsedCatalogRow {
  code: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  barcode?: string;
  barcode_type?: string;
  tracking_class: "non_unique" | "lot" | "serial" | "lot_serial";
  rotation_rule: "fifo" | "fefo" | "lifo" | "customer_lot";
  expiry_required: boolean;
  shelf_life_days?: number;
  min_shelf_life_receipt_days?: number;
  temperature_class: "ambient" | "chilled" | "frozen" | "deep_freeze" | "temperature_controlled";
  weight_kg?: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  case_barcode?: string;
  units_per_case?: number;
}

export interface ParseCatalogResult {
  validSkus: ParsedCatalogRow[];
  errors: { row: number; code?: string; reason: string }[];
  totalRows: number;
}

export function parseCatalogCsv(csvContent: string): ParseCatalogResult {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return {
      validSkus: [],
      errors: [{ row: 1, reason: "CSV must contain a header row and at least one data row" }],
      totalRows: 0,
    };
  }

  const rawHeaders = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  const headerMap: Record<string, number> = {};
  rawHeaders.forEach((h, idx) => {
    headerMap[h] = idx;
  });

  const getCol = (hNames: string[]): number => {
    for (const name of hNames) {
      if (headerMap[name] !== undefined) return headerMap[name];
    }
    return -1;
  };

  const codeIdx = getCol(["sku_code", "sku", "code", "item_code"]);
  const nameIdx = getCol(["name", "title", "product_name", "item_name"]);
  const descIdx = getCol(["description", "desc"]);
  const catIdx = getCol(["category", "dept"]);
  const brandIdx = getCol(["brand", "vendor", "manufacturer"]);
  const barcodeIdx = getCol(["barcode", "upc", "ean"]);
  const barcodeTypeIdx = getCol(["barcode_type", "type"]);
  const trackingIdx = getCol(["tracking_class", "tracking", "is_serial", "is_lot"]);
  const rotationIdx = getCol(["rotation_rule", "rotation"]);
  const expiryReqIdx = getCol(["expiry_required", "requires_expiry"]);
  const shelfLifeIdx = getCol(["shelf_life_days", "shelf_life"]);
  const minShelfReceiptIdx = getCol(["min_shelf_life_receipt_days", "min_shelf_receipt"]);
  const tempIdx = getCol(["temperature_class", "temperature", "temp"]);
  const weightIdx = getCol(["weight_kg", "weight"]);
  const lengthIdx = getCol(["length_cm", "length"]);
  const widthIdx = getCol(["width_cm", "width"]);
  const heightIdx = getCol(["height_cm", "height"]);
  const caseBarcodeIdx = getCol(["case_barcode", "gtin14", "case_gtin"]);
  const caseUnitsIdx = getCol(["units_per_case", "case_qty", "case_pack"]);

  if (codeIdx === -1 || nameIdx === -1) {
    return {
      validSkus: [],
      errors: [
        {
          row: 1,
          reason: "Missing mandatory columns. CSV must include 'sku_code' (or 'code') and 'name' (or 'title').",
        },
      ],
      totalRows: 0,
    };
  }

  const validSkus: ParsedCatalogRow[] = [];
  const errors: { row: number; code?: string; reason: string }[] = [];
  const seenCodes = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Split by comma ignoring commas inside quotes
    const cells = rawLine
      .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map((c) => c.trim().replace(/^["']|["']$/g, ""));

    const code = (cells[codeIdx] || "").trim().toUpperCase();
    const name = (cells[nameIdx] || "").trim();

    if (!code) {
      errors.push({ row: i + 1, reason: "SKU code cannot be empty" });
      continue;
    }

    if (seenCodes.has(code)) {
      errors.push({ row: i + 1, code, reason: `Duplicate SKU code '${code}' within file` });
      continue;
    }
    seenCodes.add(code);

    if (!name) {
      errors.push({ row: i + 1, code, reason: "Product name cannot be empty" });
      continue;
    }

    // Tracking class
    let trackingClass: "non_unique" | "lot" | "serial" | "lot_serial" = "non_unique";
    const rawTracking = (trackingIdx !== -1 ? cells[trackingIdx] || "" : "").toLowerCase().trim();
    if (["lot", "batch"].includes(rawTracking)) trackingClass = "lot";
    else if (["serial", "serialized", "unique"].includes(rawTracking)) trackingClass = "serial";
    else if (["lot_serial", "lot+serial"].includes(rawTracking)) trackingClass = "lot_serial";

    // Rotation rule
    let rotationRule: "fifo" | "fefo" | "lifo" | "customer_lot" = "fifo";
    const rawRotation = (rotationIdx !== -1 ? cells[rotationIdx] || "" : "").toLowerCase().trim();
    if (["fefo", "expiry_first"].includes(rawRotation)) rotationRule = "fefo";
    else if (["lifo", "last_in"].includes(rawRotation)) rotationRule = "lifo";

    const rawExpiry = (expiryReqIdx !== -1 ? cells[expiryReqIdx] || "" : "").toLowerCase().trim();
    let expiryRequired = ["true", "1", "yes", "y"].includes(rawExpiry);
    if (rotationRule === "fefo") expiryRequired = true; // Required by business logic

    // Temperature class
    let tempClass: "ambient" | "chilled" | "frozen" | "deep_freeze" | "temperature_controlled" = "ambient";
    const rawTemp = (tempIdx !== -1 ? cells[tempIdx] || "" : "").toLowerCase().trim();
    if (["chilled", "cold", "cooler"].includes(rawTemp)) tempClass = "chilled";
    else if (["frozen", "freezer"].includes(rawTemp)) tempClass = "frozen";
    else if (["deep_freeze"].includes(rawTemp)) tempClass = "deep_freeze";

    // Shelf life numbers
    const shelfLife = shelfLifeIdx !== -1 ? parseInt(cells[shelfLifeIdx], 10) : undefined;
    const minReceipt = minShelfReceiptIdx !== -1 ? parseInt(cells[minShelfReceiptIdx], 10) : undefined;

    // Dimensions
    const weight = weightIdx !== -1 ? parseFloat(cells[weightIdx]) : undefined;
    const length = lengthIdx !== -1 ? parseFloat(cells[lengthIdx]) : undefined;
    const width = widthIdx !== -1 ? parseFloat(cells[widthIdx]) : undefined;
    const height = heightIdx !== -1 ? parseFloat(cells[heightIdx]) : undefined;

    // Case pack
    const caseBarcode = caseBarcodeIdx !== -1 ? (cells[caseBarcodeIdx] || "").trim() : undefined;
    const unitsPerCase = caseUnitsIdx !== -1 ? parseInt(cells[caseUnitsIdx], 10) : undefined;

    validSkus.push({
      code,
      name,
      description: descIdx !== -1 ? cells[descIdx] : undefined,
      category: catIdx !== -1 ? cells[catIdx] : undefined,
      brand: brandIdx !== -1 ? cells[brandIdx] : undefined,
      barcode: barcodeIdx !== -1 ? (cells[barcodeIdx] || "").trim() : undefined,
      barcode_type: barcodeTypeIdx !== -1 ? cells[barcodeTypeIdx] : "upc",
      tracking_class: trackingClass,
      rotation_rule: rotationRule,
      expiry_required: expiryRequired,
      shelf_life_days: isNaN(shelfLife!) ? undefined : shelfLife,
      min_shelf_life_receipt_days: isNaN(minReceipt!) ? undefined : minReceipt,
      temperature_class: tempClass,
      weight_kg: isNaN(weight!) ? undefined : weight,
      length_cm: isNaN(length!) ? undefined : length,
      width_cm: isNaN(width!) ? undefined : width,
      height_cm: isNaN(height!) ? undefined : height,
      case_barcode: caseBarcode || undefined,
      units_per_case: isNaN(unitsPerCase!) ? undefined : unitsPerCase,
    });
  }

  return {
    validSkus,
    errors,
    totalRows: lines.length - 1,
  };
}

export function exportCatalogToCsv(skus: Sku[]): string {
  const headers = [
    "sku_code",
    "name",
    "description",
    "category",
    "brand",
    "primary_barcode",
    "tracking_class",
    "rotation_rule",
    "expiry_required",
    "shelf_life_days",
    "min_shelf_life_receipt_days",
    "temperature_class",
    "weight_kg",
    "length_cm",
    "width_cm",
    "height_cm",
    "created_at",
  ];

  const escapeCsv = (val: any): string => {
    if (val === null || val === undefined) return "";
    let str = String(val);
    // Neutralize formula injection (=, +, -, @) per Core Security Doc
    if (/^[=+\-@]/.test(str)) {
      str = "'" + str;
    }
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = skus.map((s) => {
    const eachUom = s.uoms?.find((u) => u.uom_level === "each");
    const primaryBarcode = s.barcodes?.find((b) => b.is_primary)?.barcode || s.barcodes?.[0]?.barcode || "";

    return [
      escapeCsv(s.code),
      escapeCsv(s.name),
      escapeCsv(s.description || ""),
      escapeCsv(s.category || ""),
      escapeCsv(s.brand || ""),
      escapeCsv(primaryBarcode),
      escapeCsv(s.tracking_class),
      escapeCsv(s.rotation_rule),
      escapeCsv(s.expiry_required ? "true" : "false"),
      escapeCsv(s.shelf_life_days ?? ""),
      escapeCsv(s.min_shelf_life_receipt_days ?? ""),
      escapeCsv(s.temperature_class),
      escapeCsv(eachUom?.weight_kg ?? ""),
      escapeCsv(eachUom?.length_cm ?? ""),
      escapeCsv(eachUom?.width_cm ?? ""),
      escapeCsv(eachUom?.height_cm ?? ""),
      escapeCsv(s.created_at),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}
