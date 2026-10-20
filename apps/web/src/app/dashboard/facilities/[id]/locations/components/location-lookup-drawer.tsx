"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { resolveLocationCode } from "../actions";
import { generateCode128Svg } from "@/lib/locations/barcode-svg";
import { Search, ScanLine, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, Thermometer, Layers, MapPin } from "lucide-react";
import { toast } from "sonner";

interface LocationLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  facilityId: string;
}

export function LocationLookupModal({ isOpen, onClose, facilityId }: LocationLookupModalProps) {
  const [scanCode, setScanCode] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedLocation, setResolvedLocation] = useState<any | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function handleResolve(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!scanCode.trim()) return;

    setIsResolving(true);
    setHasSearched(true);
    const { location, error } = await resolveLocationCode(facilityId, scanCode.trim());
    setIsResolving(false);

    if (error) {
      toast.error(error);
      setResolvedLocation(null);
      return;
    }

    setResolvedLocation(location);
    if (!location) {
      toast.warning(`No location found matching code or barcode '${scanCode.trim()}'`);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Location Scanner & Code Lookup" maxWidth="2xl">
      <div className="space-y-6">
        <form onSubmit={handleResolve} className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <ScanLine className="w-4 h-4 text-brand" />
            Scan Barcode or Enter Location / Historical Code
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                autoFocus
                value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                placeholder="e.g. DAL1-W2-ZA-A04-B12-L3-P02 or A04-12-3-02"
                className="w-full pl-3 pr-10 py-2.5 font-mono text-sm border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
              />
              <ScanLine className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            <button
              type="submit"
              disabled={isResolving || !scanCode.trim()}
              className="px-5 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              {isResolving ? "Searching..." : "Lookup"}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Supports exact full codes, Code 128 barcodes, short floor pick-codes, and 90-day historical renamed aliases.
          </p>
        </form>

        {/* Resolved Location Card */}
        {resolvedLocation && (
          <div className="p-5 rounded-xl border border-border bg-gray-50/50 dark:bg-white/5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-brand/10 text-brand font-semibold">
                  {resolvedLocation.location_type.replace(/_/g, " ")}
                </span>
                <h3 className="text-xl font-bold font-mono text-foreground mt-1 tracking-tight">
                  {resolvedLocation.full_code}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-brand" />
                  {resolvedLocation.human_path}
                </p>
              </div>

              {resolvedLocation.active ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-success-soft text-success-text">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-destructive/10 text-destructive">
                  Inactive
                </span>
              )}
            </div>

            {/* Scannable Barcode SVG */}
            <div
              className="p-3 bg-white text-black rounded border border-border flex justify-center"
              dangerouslySetInnerHTML={{ __html: generateCode128Svg(resolvedLocation.barcode, 50, 1.8) }}
            />

            {/* Properties Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
              <div className="p-2.5 rounded-lg bg-background border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Max Pallets</span>
                <span className="font-mono font-bold text-foreground text-sm">
                  {resolvedLocation.max_pallets || "1"} Pallet(s)
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-background border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Temperature</span>
                <span className="font-bold text-foreground text-sm flex items-center gap-1 capitalize">
                  <Thermometer className="w-3.5 h-3.5 text-blue-500" />
                  {resolvedLocation.temperature_class}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-background border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Walk Sequence</span>
                <span className="font-mono font-bold text-foreground text-sm">
                  #{resolvedLocation.walk_sequence || "1"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-background border border-border">
                <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Pick Code</span>
                <span className="font-mono font-bold text-foreground text-sm">
                  {resolvedLocation.short_pick_code || "—"}
                </span>
              </div>
            </div>

            {/* Storage Rules Flags */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border text-xs">
              <span className="text-muted-foreground text-[11px] font-semibold">Operations:</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${resolvedLocation.pickable ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-gray-100 text-gray-500"}`}>
                Pickable: {resolvedLocation.pickable ? "Yes" : "No"}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${resolvedLocation.sellable ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-gray-100 text-gray-500"}`}>
                Sellable: {resolvedLocation.sellable ? "Yes" : "No"}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${resolvedLocation.receivable ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-gray-100 text-gray-500"}`}>
                Receivable: {resolvedLocation.receivable ? "Yes" : "No"}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${resolvedLocation.mixed_sku_allowed ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-gray-100 text-gray-500"}`}>
                Mix SKU: {resolvedLocation.mixed_sku_allowed ? "Allowed" : "Restricted"}
              </span>
            </div>
          </div>
        )}

        {/* Empty state after search */}
        {hasSearched && !resolvedLocation && !isResolving && (
          <div className="p-8 text-center rounded-xl border border-dashed border-border text-muted-foreground">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="font-semibold text-sm">No location matches &quot;{scanCode}&quot;</p>
            <p className="text-xs mt-1">Check the code syntax or ensure it belongs to this facility.</p>
          </div>
        )}

        <div className="flex items-center justify-end pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
