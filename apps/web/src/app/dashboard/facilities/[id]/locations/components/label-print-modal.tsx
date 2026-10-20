"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { generateCode128Svg } from "@/lib/locations/barcode-svg";
import { generateBatchZpl } from "@/lib/locations/zpl-generator";
import { Printer, Download, ArrowUp, ArrowDown, Tag, Layers } from "lucide-react";
import { toast } from "sonner";

interface LabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: any[];
  facilityShortCode: string;
}

export function LabelPrintModal({ isOpen, onClose, locations, facilityShortCode }: LabelPrintModalProps) {
  const [labelFormat, setLabelFormat] = useState<"4x6" | "2x1">("4x6");
  const [selectedLimit, setSelectedLimit] = useState(locations.length > 20 ? 20 : locations.length);

  const displayLocations = locations.slice(0, selectedLimit);

  function handleDownloadZpl() {
    const payload = displayLocations.map((loc) => ({
      fullCode: loc.full_code,
      barcode: loc.barcode,
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
    window.print();
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
                max={locations.length}
                value={selectedLimit}
                onChange={(e) => setSelectedLimit(Math.min(locations.length, Math.max(1, Number(e.target.value))))}
                className="w-20 px-2.5 py-2 text-xs font-mono border border-border rounded-lg bg-background text-center focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleDownloadZpl}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-input rounded-md hover:bg-accent transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-brand" />
              Download ZPL
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-all cursor-pointer shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Save PDF
            </button>
          </div>
        </div>

        {/* Scrollable Preview Grid */}
        <div className="max-h-[380px] overflow-y-auto rounded-xl border border-border p-4 bg-gray-100/70 dark:bg-black/30 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {displayLocations.map((loc) => {
              const levelNum = loc.level_code ? parseInt(loc.level_code.replace(/\D/g, ""), 10) : 1;
              const isUpperLevel = levelNum > 1;

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
                      dangerouslySetInnerHTML={{ __html: generateCode128Svg(loc.barcode, 40, 1.4) }}
                    />

                    <div className="text-[10px] text-gray-700 truncate font-mono">
                      {loc.human_path}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={loc.id}
                  className="p-4 bg-white text-black border-2 border-black rounded-xl shadow-sm flex flex-col justify-between min-h-[280px]"
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

                  <div
                    className="my-2.5 flex justify-center"
                    dangerouslySetInnerHTML={{ __html: generateCode128Svg(loc.barcode, 55, 1.8) }}
                  />

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
                      <div className="text-[11px] font-mono font-bold">{loc.location_type.replace(/_/g, " ").toUpperCase()}</div>
                    </div>
                  </div>

                  <div className="pt-1.5 text-[10px] text-gray-600 font-medium truncate">
                    {loc.human_path}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground font-mono">
            Showing {displayLocations.length} of {locations.length} locations
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
