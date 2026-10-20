/**
 * VentoryPoint Zebra Programming Language (ZPL) Generator (Sprint 3 §3.5)
 * Generates thermal printer commands for 2"x1" shelf bin labels,
 * 4"x6" rack pallet position labels with directional level arrows,
 * and bulk lane / floor cell signage.
 */

export interface LabelData {
  fullCode: string;
  barcode: string;
  shortPickCode?: string;
  humanPath: string;
  levelCode?: string;
  levelNumber?: number;
  locationType: string;
  facilityShortCode?: string;
}

/**
 * Generate 2" x 1" Shelf Bin ZPL (203 DPI, 406 x 203 dots)
 */
export function generate2x1BinZpl(data: LabelData): string {
  const shortLine = data.shortPickCode ? `PICK: ${data.shortPickCode}` : data.humanPath.slice(0, 30);
  return `^XA
^PW406
^LL203
^FO30,20^A0N,28,28^FD${data.fullCode}^FS
^FO30,55^BY2,2,60^BCN,60,Y,N,N^FD${data.barcode}^FS
^FO30,150^A0N,20,20^FD${shortLine}^FS
^XZ`;
}

/**
 * Generate 4" x 6" Rack Pallet Position ZPL (203 DPI, 812 x 1218 dots)
 * Includes bold level indicator with directional arrow pointing up or down.
 */
export function generate4x6RackZpl(data: LabelData): string {
  const levelNum = data.levelNumber ?? (data.levelCode ? parseInt(data.levelCode.replace(/\D/g, ""), 10) : 1);
  const arrow = levelNum > 1 ? "^" : "v";
  const arrowText = levelNum > 1 ? "LEVEL UP" : "GROUND LEVEL";

  return `^XA
^PW812
^LL1218
^FO50,50^A0N,40,40^FD${data.facilityShortCode || "VENTORYPOINT"} WAREHOUSE^FS
^FO50,110^GB712,4,4^FS
^FO50,150^A0N,64,64^FD${data.fullCode}^FS
^FO50,230^BY3,3,180^BCN,180,Y,N,N^FD${data.barcode}^FS
^FO50,470^GB712,4,4^FS
^FO50,510^A0N,48,48^FD${arrowText} [${arrow}]^FS
^FO50,580^A0N,32,32^FD${data.humanPath}^FS
^FO50,650^GB712,4,4^FS
^FO50,680^A0N,32,32^FDTYPE: ${data.locationType.toUpperCase()}^FS
^XZ`;
}

/**
 * Generate Batch ZPL file for multiple locations
 */
export function generateBatchZpl(locations: LabelData[], format: "2x1" | "4x6" = "4x6"): string {
  return locations
    .map((loc) => (format === "2x1" ? generate2x1BinZpl(loc) : generate4x6RackZpl(loc)))
    .join("\n\n");
}
