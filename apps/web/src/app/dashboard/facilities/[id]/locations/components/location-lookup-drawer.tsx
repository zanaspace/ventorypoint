"use client";

import { useState, useRef, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { resolveLocationCode } from "../actions";
import { generateCode128Svg } from "@/lib/locations/barcode-svg";
import { Search, ScanLine, CheckCircle2, AlertCircle, MapPin, Thermometer, Camera } from "lucide-react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/floor/camera-scanner";

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
  const [showCamera, setShowCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setScanCode("");
      setResolvedLocation(null);
      setHasSearched(false);
      setShowCamera(false);
    }
  }, [isOpen]);

  async function executeResolve(codeToResolve: string) {
    if (!codeToResolve.trim()) return;

    setIsResolving(true);
    setHasSearched(true);
    const { location, error } = await resolveLocationCode(facilityId, codeToResolve.trim());
    setIsResolving(false);

    if (error) {
      toast.error(error);
      setResolvedLocation(null);
      return;
    }

    setResolvedLocation(location);
    if (!location) {
      toast.warning(`No location found matching '${codeToResolve.trim()}'`);
    } else {
      toast.success(`Found location: ${location.full_code}`);
    }
  }

  function handleResolve(e?: React.FormEvent) {
    if (e) e.preventDefault();
    executeResolve(scanCode);
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Location Scanner & Code Lookup" maxWidth="max-w-lg">
        <div className="p-6 space-y-5">
          <form onSubmit={handleResolve} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ScanLine className="w-4 h-4 text-brand" />
                Scan Barcode or Enter Location Code
              </label>

              {/* Camera Scanner Trigger */}
              <button
                type="button"
                onClick={() => setShowCamera(true)}
                className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-md border border-input text-brand hover:bg-brand/10 transition-colors cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Scan with Camera
              </button>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  autoFocus
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  placeholder="e.g. DAL1-W2-ZA-A04-B12-L3-P02 or A04-12-3-02"
                  className="w-full pl-3 pr-9 py-2.5 font-mono text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none transition-all"
                />
                <ScanLine className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <button
                type="submit"
                disabled={isResolving || !scanCode.trim()}
                className="px-4 py-2.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-lg transition-all disabled:opacity-40 cursor-pointer shadow-sm flex items-center gap-1.5 shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                {isResolving ? "Searching..." : "Lookup"}
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-normal">
              Point a <strong>handheld barcode scanner</strong> (Zebra/Honeywell), click <strong>Scan with Camera</strong>, or type any location code, Code 128 barcode, short pick-code, or 90-day renamed alias.
            </p>
          </form>

          {/* Resolved Location Card */}
          {resolvedLocation && (
            <div className="p-4 rounded-xl border border-border bg-gray-50/70 dark:bg-white/[0.02] space-y-3.5 animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-brand/10 text-brand font-semibold">
                    {resolvedLocation.location_type?.replace(/_/g, " ") || "LOCATION"}
                  </span>
                  <h3 className="text-base font-bold font-mono text-foreground mt-1 tracking-tight">
                    {resolvedLocation.full_code}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-brand shrink-0" />
                    {resolvedLocation.human_path || resolvedLocation.full_code}
                  </p>
                </div>

                {resolvedLocation.active ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3 h-3" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive shrink-0">
                    Inactive
                  </span>
                )}
              </div>

              {/* Scannable Barcode SVG */}
              <div
                className="p-3 bg-white text-black rounded-lg border border-border flex justify-center"
                dangerouslySetInnerHTML={{
                  __html: generateCode128Svg(resolvedLocation.barcode || resolvedLocation.full_code, 44, 1.6),
                }}
              />

              {/* Properties Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Max Pallets</span>
                  <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                    {resolvedLocation.max_pallets || "1"} Pallet(s)
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Temperature</span>
                  <span className="font-bold text-foreground text-xs mt-0.5 flex items-center gap-1 capitalize">
                    <Thermometer className="w-3.5 h-3.5 text-blue-500" />
                    {resolvedLocation.temperature_class || "Ambient"}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Walk Sequence</span>
                  <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                    #{resolvedLocation.walk_sequence || "1"}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Pick Code</span>
                  <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                    {resolvedLocation.short_pick_code || resolvedLocation.position_code || "—"}
                  </span>
                </div>
              </div>

              {/* Storage Rules Flags */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border text-xs">
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    resolvedLocation.pickable
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-gray-100 dark:bg-white/5 text-muted-foreground"
                  }`}
                >
                  Pick: {resolvedLocation.pickable ? "Yes" : "No"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    resolvedLocation.sellable
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-gray-100 dark:bg-white/5 text-muted-foreground"
                  }`}
                >
                  Sell: {resolvedLocation.sellable ? "Yes" : "No"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    resolvedLocation.receivable
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-gray-100 dark:bg-white/5 text-muted-foreground"
                  }`}
                >
                  Receive: {resolvedLocation.receivable ? "Yes" : "No"}
                </span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {hasSearched && !resolvedLocation && !isResolving && (
            <div className="p-5 text-center rounded-xl border border-dashed border-border text-muted-foreground">
              <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-1.5 opacity-50" />
              <p className="font-semibold text-xs">No location matches &quot;{scanCode}&quot;</p>
              <p className="text-[11px] mt-0.5">Check the code syntax or ensure it belongs to this facility.</p>
            </div>
          )}

          <div className="flex items-center justify-end pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-md border border-input text-foreground hover:bg-accent transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* Camera Barcode Scanner Viewfinder Overlay */}
      {showCamera && (
        <CameraScanner
          title="Scan Location Barcode"
          onResult={(scannedText) => {
            setScanCode(scannedText);
            setShowCamera(false);
            executeResolve(scannedText);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
}
