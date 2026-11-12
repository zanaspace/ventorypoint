"use client";

import { useState, useRef, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { resolveBarcodeAction } from "../actions";
import { Search, ScanLine, CheckCircle2, AlertCircle, Camera, Package, Shield, Scale, Thermometer } from "lucide-react";
import { toast } from "sonner";
import { CameraScanner } from "@/components/floor/camera-scanner";

interface BarcodeLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: string;
}

export function BarcodeLookupModal({ isOpen, onClose, clientId }: BarcodeLookupModalProps) {
  const [scanCode, setScanCode] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedItem, setResolvedItem] = useState<any | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setScanCode("");
      setResolvedItem(null);
      setHasSearched(false);
      setShowCamera(false);
    }
  }, [isOpen]);

  async function executeResolve(codeToResolve: string) {
    if (!codeToResolve.trim()) return;

    setIsResolving(true);
    setHasSearched(true);
    const res = await resolveBarcodeAction(codeToResolve.trim(), clientId);
    setIsResolving(false);

    if (res.error) {
      toast.error(res.error);
      setResolvedItem(null);
      return;
    }

    if (res.match) {
      setResolvedItem(res.match);
      toast.success(`Resolved SKU: ${res.match.sku_code}`);
    } else if (res.candidates && res.candidates.length > 0) {
      setResolvedItem(res.candidates[0]);
      toast.info(`Found ${res.candidates.length} matching candidate(s)`);
    } else {
      setResolvedItem(null);
      toast.warning(`No product found matching barcode '${codeToResolve.trim()}'`);
    }
  }

  function handleResolve(e?: React.FormEvent) {
    if (e) e.preventDefault();
    executeResolve(scanCode);
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Product Barcode Resolver & Lookup" maxWidth="max-w-lg">
        <div className="p-6 space-y-5">
          <form onSubmit={handleResolve} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ScanLine className="w-4 h-4 text-brand" />
                Scan Product Barcode (UPC / GTIN / SKU)
              </label>

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
                  placeholder="e.g. 012345678905, 10012345678902, or SKU-104"
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
                {isResolving ? "Resolving..." : "Lookup"}
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground leading-normal">
              Resolves any product UPC, EAN, Case GTIN-14, Serial number, or master SKU code across client catalogs.
            </p>
          </form>

          {/* Resolved Product Card */}
          {resolvedItem && (
            <div className="p-4 rounded-xl border border-border bg-gray-50/70 dark:bg-white/[0.02] space-y-3.5 animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-brand/10 text-brand font-bold">
                      {resolvedItem.client_name} ({resolvedItem.client_code})
                    </span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-gray-200 dark:bg-white/10 text-foreground font-semibold">
                      UoM: {resolvedItem.uom_level.toUpperCase()} ({resolvedItem.conversion_factor} ct)
                    </span>
                  </div>
                  <h3 className="text-base font-bold font-mono text-foreground mt-1.5 tracking-tight">
                    {resolvedItem.sku_code}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                    {resolvedItem.sku_name}
                  </p>
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-3 h-3" /> Resolved
                </span>
              </div>

              {/* Resolved Properties Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Shield className="w-3 h-3 text-brand" />
                    Tracking Class
                  </span>
                  <span className="font-mono font-bold text-foreground text-xs mt-0.5 block capitalize">
                    {resolvedItem.tracking_class.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Rotation Rule</span>
                  <span className="font-mono font-bold text-foreground text-xs mt-0.5 block uppercase text-brand">
                    {resolvedItem.rotation_rule}
                    {resolvedItem.expiry_required ? " (Expiry Req)" : ""}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Scale className="w-3 h-3 text-blue-500" />
                    Weight & Dims
                  </span>
                  <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                    {resolvedItem.weight_kg ? `${resolvedItem.weight_kg} kg` : "No weight"}
                    {resolvedItem.length_cm ? ` · ${resolvedItem.length_cm}×${resolvedItem.width_cm}×${resolvedItem.height_cm} cm` : ""}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-background border border-border">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold flex items-center gap-1">
                    <Thermometer className="w-3 h-3 text-amber-500" />
                    Storage Temp
                  </span>
                  <span className="font-bold text-foreground text-xs mt-0.5 block capitalize">
                    {resolvedItem.temperature_class}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {hasSearched && !resolvedItem && !isResolving && (
            <div className="p-5 text-center rounded-xl border border-dashed border-border text-muted-foreground">
              <AlertCircle className="w-6 h-6 text-muted-foreground mx-auto mb-1.5 opacity-50" />
              <p className="font-semibold text-xs">No product found matching &quot;{scanCode}&quot;</p>
              <p className="text-[11px] mt-0.5">Check barcode digits or verify that this item is in the client catalog.</p>
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

      {/* Camera Barcode Scanner Viewfinder */}
      {showCamera && (
        <CameraScanner
          title="Scan Product Barcode"
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
