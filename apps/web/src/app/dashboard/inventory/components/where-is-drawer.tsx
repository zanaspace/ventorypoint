"use client";

import { useEffect, useRef, useState } from "react";
import {
  Search,
  Camera,
  X,
  MapPin,
  Box,
  Layers,
  Calendar,
  Barcode,
  History,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { whereIsItAction } from "../actions";
import { WhereIsResult } from "@/lib/types/inventory";

interface WhereIsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  facilityId?: string;
  onSelectMove?: (result: WhereIsResult) => void;
  onSelectTimeline?: (type: string, id: string, label: string) => void;
}

export function WhereIsDrawer({
  isOpen,
  onClose,
  facilityId,
  onSelectMove,
  onSelectTimeline,
}: WhereIsDrawerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WhereIsResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Camera scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setHasSearched(false);
    } else {
      stopCamera();
    }
  }, [isOpen]);

  const handleSearch = async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const data = await whereIsItAction(q, facilityId);
      setResults(data);
    } catch (err) {
      console.error("Where is it search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    setCameraError(null);

    try {
      if (!codeReaderRef.current) {
        codeReaderRef.current = new BrowserMultiFormatReader();
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
      if (!videoRef.current) return;

      const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();
      const selectedDeviceId = videoInputDevices.length > 0 ? videoInputDevices[0].deviceId : undefined;

      await codeReaderRef.current.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        (result, err) => {
          if (result) {
            const scannedText = result.getText();
            setQuery(scannedText);
            stopCamera();
            handleSearch(scannedText);
          }
        }
      );
    } catch (err: unknown) {
      console.error("Camera scanner error:", err);
      const msg = err instanceof Error ? err.message : "Failed to access camera";
      setCameraError(msg);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (codeReaderRef.current) {
      try {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach((track) => track.stop());
      } catch (e) {
        // ignore
      }
      codeReaderRef.current = null;
    }
    setIsCameraActive(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-2xl bg-surface border-l border-border shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Where Is It? — Traceability Search</h2>
                <p className="text-xs text-muted-foreground">
                  Instant real-time location lookup across SKUs, Barcodes, Lots, Serials, and LPNs
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search Bar & Controls */}
          <div className="p-6 border-b border-border space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch(query);
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Scan or type SKU, Barcode, LPN-..., Lot, or Serial..."
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all font-mono"
                  autoFocus
                />
              </div>

              <button
                type="button"
                onClick={isCameraActive ? stopCamera : startCamera}
                className={`px-3.5 py-2.5 border rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${
                  isCameraActive
                    ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border"
                }`}
                title="Scan with Camera"
              >
                <Camera className="w-4 h-4" />
                <span>{isCameraActive ? "Stop" : "Camera"}</span>
              </button>

              <button
                type="submit"
                disabled={isSearching || !query.trim()}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </form>

            {/* Video Viewport */}
            {isCameraActive && (
              <div className="relative rounded-lg overflow-hidden border border-primary/30 bg-black aspect-video flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                  <div className="w-3/4 h-1/2 border-2 border-primary/80 rounded-lg relative">
                    <div className="absolute inset-x-0 top-1/2 h-0.5 bg-primary/80 animate-pulse" />
                  </div>
                  <span className="text-xs text-white/90 bg-black/70 px-3 py-1 rounded-full mt-3 font-mono">
                    Align barcode within viewport
                  </span>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-lg flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Camera scanner error: {cameraError}</span>
              </div>
            )}
          </div>

          {/* Results View */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {isSearching && (
              <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Querying real-time ledger addresses...</p>
              </div>
            )}

            {!isSearching && hasSearched && results.length === 0 && (
              <div className="py-16 text-center text-muted-foreground space-y-2">
                <div className="p-3 bg-muted/30 rounded-full w-fit mx-auto text-muted-foreground">
                  <Box className="w-8 h-8" />
                </div>
                <p className="text-base font-semibold text-foreground">No inventory matches found</p>
                <p className="text-xs max-w-sm mx-auto">
                  No active stock matching &quot;{query}&quot; exists in this facility. Check the code or ensure units have been received.
                </p>
              </div>
            )}

            {!isSearching && !hasSearched && (
              <div className="py-16 text-center text-muted-foreground space-y-2">
                <div className="p-3 bg-primary/10 rounded-full w-fit mx-auto text-primary">
                  <Barcode className="w-8 h-8" />
                </div>
                <p className="text-sm font-medium text-foreground">Ready for Scan or Query</p>
                <p className="text-xs max-w-xs mx-auto">
                  Scan a barcode or enter an SKU, LPN, lot, or serial to reveal its exact warehouse location.
                </p>
              </div>
            )}

            {!isSearching && results.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Found {results.length} active location record{results.length > 1 ? "s" : ""}</span>
                  <span>Facility scoped</span>
                </div>

                {results.map((res) => {
                  const statusColors: Record<string, string> = {
                    available: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                    allocated: "bg-blue-500/10 text-blue-600 border-blue-500/20",
                    hold: "bg-amber-500/10 text-amber-600 border-amber-500/20",
                    damaged: "bg-rose-500/10 text-rose-600 border-rose-500/20",
                    expired: "bg-purple-500/10 text-purple-600 border-purple-500/20",
                  };

                  return (
                    <div
                      key={res.balance_id}
                      className="p-4 rounded-xl border border-border bg-card/60 hover:border-primary/40 transition-all space-y-3 shadow-sm"
                    >
                      {/* Top Bar: Product Name & SKU & Status */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-base text-foreground">
                              {res.sku_name || "Unnamed Product"}
                            </span>
                            <span className="text-xs text-muted-foreground">({res.client_name})</span>
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground/50">SKU:</span>
                            <span className="font-normal text-muted-foreground/80">{res.sku_code}</span>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wider ${
                            statusColors[res.balance_status] || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {res.balance_status}
                        </span>
                      </div>

                      {/* Location Path Breadcrumbs */}
                      <div className="p-3 rounded-lg bg-muted/40 border border-border/80 flex items-start gap-2.5">
                        <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-foreground">
                              {res.location_code}
                            </span>
                            <span className="text-[11px] font-mono text-muted-foreground bg-background px-1.5 py-0.5 rounded border border-border">
                              {res.location_barcode}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground font-medium mt-0.5 truncate">
                            {res.location_path}
                          </p>
                        </div>
                      </div>

                      {/* Container & Lot / Serial Tags */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {res.container_lpn ? (
                          <div className="p-2 rounded bg-surface border border-border flex items-center gap-2">
                            <Box className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span className="text-muted-foreground">LPN:</span>
                            <span className="font-mono font-bold text-foreground truncate">
                              {res.container_lpn}
                            </span>
                          </div>
                        ) : (
                          <div className="p-2 rounded bg-surface border border-border flex items-center gap-2 text-muted-foreground">
                            <Box className="w-3.5 h-3.5 shrink-0" />
                            <span>Loose Storage (No LPN)</span>
                          </div>
                        )}

                        {res.lot_number ? (
                          <div className="p-2 rounded bg-surface border border-border flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="text-muted-foreground">Lot:</span>
                            <span className="font-mono font-semibold text-foreground truncate">
                              {res.lot_number}
                            </span>
                            {res.expiry_date && (
                              <span className="text-[10px] text-muted-foreground ml-auto">
                                Exp: {res.expiry_date}
                              </span>
                            )}
                          </div>
                        ) : res.serial_number ? (
                          <div className="p-2 rounded bg-surface border border-border flex items-center gap-2">
                            <Barcode className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                            <span className="text-muted-foreground">SN:</span>
                            <span className="font-mono font-bold text-foreground truncate">
                              {res.serial_number}
                            </span>
                          </div>
                        ) : (
                          <div className="p-2 rounded bg-surface border border-border flex items-center gap-2 text-muted-foreground">
                            <Layers className="w-3.5 h-3.5 shrink-0" />
                            <span>Tracking: Non-Unique</span>
                          </div>
                        )}
                      </div>

                      {/* Quantities & Action Footer */}
                      <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">On-Hand: </span>
                            <span className="font-bold text-foreground text-sm font-mono">
                              {res.on_hand_qty}
                            </span>
                          </div>
                          {res.allocated_qty > 0 && (
                            <div>
                              <span className="text-muted-foreground">Allocated: </span>
                              <span className="font-bold text-blue-500 font-mono">
                                {res.allocated_qty}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {onSelectTimeline && (
                            <button
                              onClick={() => {
                                if (res.serial_id) {
                                  onSelectTimeline("serial", res.serial_id, `Serial: ${res.serial_number}`);
                                } else if (res.lot_id) {
                                  onSelectTimeline("lot", res.lot_id, `Lot: ${res.lot_number}`);
                                } else if (res.container_id) {
                                  onSelectTimeline("container", res.container_id, `LPN: ${res.container_lpn}`);
                                } else {
                                  onSelectTimeline("sku", res.sku_id, `SKU: ${res.sku_code}`);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted border border-border rounded flex items-center gap-1.5 transition-colors"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>Timeline</span>
                            </button>
                          )}

                          {onSelectMove && (
                            <button
                              onClick={() => onSelectMove(res)}
                              className="px-3 py-1 text-xs font-semibold bg-primary text-primary-foreground rounded hover:bg-primary-hover flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span>Move</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
