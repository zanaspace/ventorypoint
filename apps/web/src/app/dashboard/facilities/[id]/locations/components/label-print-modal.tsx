"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { generateCode128Svg } from "@/lib/locations/barcode-svg";
import { generateBatchZpl } from "@/lib/locations/zpl-generator";
import { Printer, Download, ArrowUp, ArrowDown, Tag, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface LabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: any[];
  facilityShortCode: string;
}

export function LabelPrintModal({ isOpen, onClose, locations, facilityShortCode }: LabelPrintModalProps) {
  const [labelFormat, setLabelFormat] = useState<"4x6" | "2x1">("4x6");
  const [selectedLimit, setSelectedLimit] = useState(
    locations.length > 0 ? (locations.length > 20 ? 20 : locations.length) : 0
  );

  // Synchronize quantity whenever the modal opens or the locations array changes
  useEffect(() => {
    if (isOpen && locations.length > 0) {
      setSelectedLimit((prev) => (prev > 0 && prev <= locations.length ? prev : (locations.length > 20 ? 20 : locations.length)));
    } else if (!isOpen) {
      // Keep state intact or reset if needed
    }
  }, [isOpen, locations]);

  const effectiveLimit =
    selectedLimit > 0
      ? Math.min(locations.length, selectedLimit)
      : locations.length > 0
      ? Math.min(locations.length, 20)
      : 0;

  const displayLocations = locations.slice(0, effectiveLimit);

  function handleDownloadZpl() {
    if (displayLocations.length === 0) {
      toast.error("No locations to export");
      return;
    }

    const payload = displayLocations.map((loc) => ({
      fullCode: loc.full_code,
      barcode: loc.barcode || loc.full_code,
      shortPickCode: loc.short_pick_code,
      humanPath: loc.human_path,
      levelCode: loc.level_code,
      locationType: loc.location_type,
      facilityShortCode,
    }));

    const zplString = generateBatchZpl(payload, labelFormat);
    const blob = new Blob([zplString], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${facilityShortCode}-locations-${labelFormat}.zpl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ZPL file for ${displayLocations.length} locations`);
  }

  function handlePrint() {
    if (displayLocations.length === 0) {
      toast.error("No locations selected to print");
      return;
    }

    const is4x6 = labelFormat === "4x6";
    const printContent = displayLocations
      .map((loc) => {
        const levelNum = loc.level_code ? parseInt(loc.level_code.replace(/\D/g, ""), 10) : 1;
        const isUpperLevel = levelNum > 1;
        const barcodeVal = loc.barcode || loc.full_code || "LOC";
        const svgHtml = generateCode128Svg(barcodeVal, is4x6 ? 65 : 38, is4x6 ? 2 : 1.4);

        if (!is4x6) {
          return `
            <div class="label-sheet label-2x1">
              <div class="row-between">
                <span class="code-title">${loc.full_code}</span>
                <span class="badge-black">${loc.short_pick_code || loc.position_code || "BIN"}</span>
              </div>
              <div class="barcode-wrap">
                ${svgHtml}
              </div>
              <div class="sub-text">${loc.human_path || loc.full_code}</div>
            </div>
          `;
        }

        return `
          <div class="label-sheet label-4x6">
            <div class="header-box">
              <div class="facility-sub">${facilityShortCode} LOGISTICS CENTER</div>
              <div class="code-title-lg">${loc.full_code}</div>
            </div>

            <div class="barcode-wrap-lg">
              ${svgHtml}
              <div class="barcode-mono-val">${barcodeVal}</div>
            </div>

            <div class="level-box">
              <div class="level-left">
                <div class="arrow-badge">
                  ${isUpperLevel ? "&#9650;" : "&#9660;"}
                </div>
                <div>
                  <div class="level-heading">
                    ${isUpperLevel ? `LEVEL ${levelNum} (SHELF UP)` : "GROUND LEVEL (FLOOR BEAM)"}
                  </div>
                  <div class="level-sub">
                    Seq: #${loc.walk_sequence || "1"} &middot; Side: ${(loc.rack_side || "STD").toUpperCase()}
                  </div>
                </div>
              </div>
              <div class="level-right">
                <div class="type-sub">TYPE</div>
                <div class="type-val">${(loc.location_type || "standard").replace(/_/g, " ").toUpperCase()}</div>
              </div>
            </div>

            <div class="footer-path">
              ${loc.human_path || loc.full_code}
            </div>
          </div>
        `;
      })
      .join("");

    // Render into an isolated hidden iframe for clean, full-bleed label printing
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${facilityShortCode} Barcode Labels</title>
          <style>
            @page {
              size: ${is4x6 ? "4in 6in" : "2in 1in"};
              margin: 0;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000000;
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            .label-sheet {
              width: ${is4x6 ? "4in" : "2in"};
              height: ${is4x6 ? "6in" : "1in"};
              padding: ${is4x6 ? "0.25in" : "0.08in"};
              page-break-after: always;
              break-after: page;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              background: #ffffff;
              box-sizing: border-box;
            }

            /* 4x6 Style Rules */
            .header-box {
              border-bottom: 3px solid #000;
              padding-bottom: 6px;
            }
            .facility-sub {
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 0.08em;
              color: #333;
              text-transform: uppercase;
            }
            .code-title-lg {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 24px;
              font-weight: 900;
              letter-spacing: -0.02em;
              line-height: 1.1;
              margin-top: 3px;
            }
            .barcode-wrap-lg {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              margin: 8px 0;
            }
            .barcode-wrap-lg svg {
              width: 100%;
              max-height: 75px;
            }
            .barcode-mono-val {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 13px;
              font-weight: 800;
              letter-spacing: 0.18em;
              margin-top: 4px;
            }
            .level-box {
              border: 3px solid #000;
              border-radius: 8px;
              padding: 10px 12px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: #f7f7f7;
            }
            .level-left {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .arrow-badge {
              width: 36px;
              height: 36px;
              border-radius: 50%;
              background: #000;
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
              font-weight: bold;
            }
            .level-heading {
              font-size: 12px;
              font-weight: 800;
              letter-spacing: 0.04em;
              text-transform: uppercase;
            }
            .level-sub {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 10px;
              color: #444;
              margin-top: 2px;
            }
            .level-right {
              text-align: right;
            }
            .type-sub {
              font-size: 9px;
              font-weight: 700;
              color: #666;
              text-transform: uppercase;
            }
            .type-val {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 12px;
              font-weight: 800;
            }
            .footer-path {
              font-size: 10px;
              font-weight: 600;
              color: #444;
              border-top: 1px solid #ddd;
              padding-top: 5px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            /* 2x1 Style Rules */
            .label-2x1 {
              border: 2px solid #000;
              border-radius: 4px;
            }
            .row-between {
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .code-title {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 11px;
              font-weight: 800;
            }
            .badge-black {
              background: #000;
              color: #fff;
              font-size: 9px;
              padding: 1px 4px;
              border-radius: 2px;
              font-weight: 700;
              font-family: ui-monospace, monospace;
            }
            .barcode-wrap svg {
              width: 100%;
              max-height: 40px;
            }
            .sub-text {
              font-size: 8px;
              font-family: ui-monospace, monospace;
              color: #444;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 300);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Print Location Barcode Labels" maxWidth="max-w-3xl">
      <div className="p-6 space-y-4">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl bg-gray-50/70 dark:bg-white/[0.02] border border-border">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="w-56">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">
                Label Format
              </label>
              <SearchableSelect
                value={labelFormat}
                onChange={(v) => setLabelFormat(v as any)}
                options={[
                  { value: "4x6", label: '4" × 6" Rack Pallet (Level Arrow)' },
                  { value: "2x1", label: '2" × 1" Shelf Bin (Compact)' },
                ]}
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase block mb-1">
                Quantity
              </label>
              <input
                type="number"
                min={1}
                max={Math.max(1, locations.length)}
                value={effectiveLimit}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (isNaN(val)) {
                    setSelectedLimit(1);
                  } else {
                    setSelectedLimit(Math.min(locations.length, Math.max(1, val)));
                  }
                }}
                className="w-20 px-2.5 py-2 text-xs font-mono border border-border rounded-lg bg-background text-center focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleDownloadZpl}
              disabled={displayLocations.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-input rounded-md hover:bg-accent transition-colors cursor-pointer disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5 text-brand" />
              Download ZPL
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={displayLocations.length === 0}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-all cursor-pointer shadow-sm disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Scrollable Preview Grid */}
        <div className="max-h-[380px] overflow-y-auto rounded-xl border border-border p-4 bg-gray-100/70 dark:bg-black/30 space-y-3">
          {displayLocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <AlertCircle className="w-8 h-8 stroke-[1.5] mb-2 opacity-50" />
              <p className="text-sm font-medium">No locations selected to print</p>
              <p className="text-xs text-muted-foreground mt-0.5">Please ensure locations are available or select a quantity greater than 0.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {displayLocations.map((loc) => {
                const levelNum = loc.level_code ? parseInt(loc.level_code.replace(/\D/g, ""), 10) : 1;
                const isUpperLevel = levelNum > 1;
                const barcodeValue = loc.barcode || loc.full_code || "LOC";

                if (labelFormat === "2x1") {
                  return (
                    <div
                      key={loc.id}
                      className="p-3 bg-white text-black border-2 border-black rounded-lg shadow-sm flex flex-col justify-between h-[120px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold tracking-tight">{loc.full_code}</span>
                        <span className="text-[10px] font-mono bg-black text-white px-1.5 py-0.5 rounded font-bold">
                          {loc.short_pick_code || loc.position_code || "BIN"}
                        </span>
                      </div>

                      <div
                        className="py-0.5"
                        dangerouslySetInnerHTML={{ __html: generateCode128Svg(barcodeValue, 38, 1.4) }}
                      />

                      <div className="text-[10px] text-gray-700 truncate font-mono">
                        {loc.human_path || loc.full_code}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={loc.id}
                    className="p-4 bg-white text-black border-2 border-black rounded-xl shadow-sm flex flex-col justify-between min-h-[290px]"
                  >
                    <div className="border-b-2 border-black pb-1.5 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase font-extrabold tracking-wider text-gray-700">
                          {facilityShortCode} LOGISTICS CENTER
                        </div>
                        <div className="font-mono text-base font-black">{loc.full_code}</div>
                      </div>
                      <Tag className="w-4 h-4 text-black" />
                    </div>

                    <div className="my-2.5 flex flex-col items-center justify-center">
                      <div
                        className="w-full flex justify-center"
                        dangerouslySetInnerHTML={{ __html: generateCode128Svg(barcodeValue, 55, 1.8) }}
                      />
                      <span className="font-mono text-xs font-bold tracking-widest text-black mt-1">
                        {barcodeValue}
                      </span>
                    </div>

                    <div className="border-2 border-black rounded-lg p-2.5 bg-gray-50 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        {isUpperLevel ? (
                          <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold">
                            <ArrowUp className="w-4 h-4 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold">
                            <ArrowDown className="w-4 h-4 stroke-[3]" />
                          </div>
                        )}
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-wide">
                            {isUpperLevel ? `LEVEL ${levelNum} (SHELF UP)` : "GROUND LEVEL (FLOOR BEAM)"}
                          </div>
                          <div className="text-[10px] text-gray-600 font-mono">
                            Seq: #{loc.walk_sequence || "1"} · Side: {loc.rack_side?.toUpperCase() || "STD"}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[9px] text-gray-500 uppercase font-semibold">Type</div>
                        <div className="text-[11px] font-mono font-bold">{(loc.location_type || "standard").replace(/_/g, " ").toUpperCase()}</div>
                      </div>
                    </div>

                    <div className="pt-1.5 text-[10px] text-gray-600 font-medium truncate">
                      {loc.human_path || loc.full_code}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground font-mono">
            Showing {displayLocations.length} of {locations.length} location{locations.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md border border-input text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
