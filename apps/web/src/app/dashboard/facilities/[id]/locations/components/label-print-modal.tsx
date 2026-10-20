"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { generateCode128Svg } from "@/lib/locations/barcode-svg";
import { generateBatchZpl } from "@/lib/locations/zpl-generator";
import { Printer, Download, ArrowUp, ArrowDown, Tag } from "lucide-react";
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
    <Modal isOpen={isOpen} onClose={onClose} title="Print Location Barcode Labels" maxWidth="4xl">
      <div className="space-y-6">
        {/* Settings Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-gray-50/50 dark:bg-white/5 border border-border">
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Label Format</label>
              <div className="mt-1 w-56">
                <SearchableSelect
                  value={labelFormat}
                  onChange={(v) => setLabelFormat(v as any)}
                  options={[
                    { value: "4x6", label: '4" × 6" Rack Pallet Label (Level Arrow)' },
                    { value: "2x1", label: '2" × 1" Shelf Bin Label (Compact)' },
                  ]}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Count to Print</label>
              <input
                type="number"
                min={1}
                max={locations.length}
                value={selectedLimit}
                onChange={(e) => setSelectedLimit(Math.min(locations.length, Math.max(1, Number(e.target.value))))}
                className="mt-1 w-24 px-3 py-2 text-sm border border-border rounded-md font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadZpl}
              className="flex items-center gap-2 px-3 py-2 text-sm font-semibold border border-input rounded-md hover:bg-accent transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-brand" />
              Download ZPL
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Print Labels / PDF
            </button>
          </div>
        </div>

        {/* Live Visual Preview Container */}
        <div className="max-h-[500px] overflow-y-auto p-4 rounded-xl border border-border bg-gray-100 dark:bg-black/30 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayLocations.map((loc) => {
              const levelNum = loc.level_code ? parseInt(loc.level_code.replace(/\D/g, ""), 10) : 1;
              const isUpperLevel = levelNum > 1;

              if (labelFormat === "2x1") {
                return (
                  <div
                    key={loc.id}
                    className="p-3 bg-white text-black border-2 border-black rounded shadow-sm flex flex-col justify-between h-[120px]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold tracking-tight">{loc.full_code}</span>
                      <span className="text-[10px] font-mono bg-black text-white px-1.5 py-0.5 rounded">
                        {loc.short_pick_code || loc.position_code || "BIN"}
                      </span>
                    </div>

                    <div
                      className="py-1"
                      dangerouslySetInnerHTML={{ __html: generateCode128Svg(loc.barcode, 40, 1.5) }}
                    />

                    <div className="text-[10px] text-gray-700 truncate font-mono">
                      {loc.human_path}
                    </div>
                  </div>
                );
              }

              // 4" x 6" Rack Pallet Label format with Direction Arrow
              return (
                <div
                  key={loc.id}
                  className="p-5 bg-white text-black border-2 border-black rounded-lg shadow-sm flex flex-col justify-between min-h-[300px]"
                >
                  <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase font-extrabold tracking-wider text-gray-800">
                        {facilityShortCode} LOGISTICS CENTER
                      </div>
                      <div className="font-mono text-xl font-black">{loc.full_code}</div>
                    </div>
                    <Tag className="w-6 h-6 text-black" />
                  </div>

                  {/* Scannable Barcode */}
                  <div
                    className="my-3 flex justify-center"
                    dangerouslySetInnerHTML={{ __html: generateCode128Svg(loc.barcode, 70, 2) }}
                  />

                  {/* Direction Arrow & Level Indicator */}
                  <div className="border-2 border-black rounded p-3 bg-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isUpperLevel ? (
                        <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold">
                          <ArrowUp className="w-6 h-6 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold">
                          <ArrowDown className="w-6 h-6 stroke-[3]" />
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide">
                          {isUpperLevel ? `LEVEL ${levelNum} (SHELF UP)` : "GROUND LEVEL (FLOOR BEAM)"}
                        </div>
                        <div className="text-xs text-gray-600 font-mono">
                          Walk Seq: #{loc.walk_sequence || "1"} · Side: {loc.rack_side?.toUpperCase() || "STD"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-gray-500 uppercase">Type</div>
                      <div className="text-xs font-mono font-bold">{loc.location_type.replace(/_/g, " ").toUpperCase()}</div>
                    </div>
                  </div>

                  {/* Path Breadcrumbs */}
                  <div className="pt-2 text-[11px] text-gray-600 font-medium truncate">
                    {loc.human_path}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <span className="text-xs text-muted-foreground font-mono">
            Showing {displayLocations.length} of {locations.length} locations
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
