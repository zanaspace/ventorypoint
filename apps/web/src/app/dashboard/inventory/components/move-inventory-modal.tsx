"use client";

import { useState, useEffect } from "react";
import {
  ArrowRightLeft,
  X,
  MapPin,
  Box,
  Layers,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { moveInventoryAction, getFacilityLocationsAction, FacilityLocationOption } from "../actions";
import { InventoryBalance, WhereIsResult } from "@/lib/types/inventory";
import { SearchableSelect } from "@/components/ui/searchable-select";

const MOVE_REASON_OPTIONS = [
  { value: "relocation", label: "Standard Relocation" },
  { value: "replenishment", label: "Rack Replenishment" },
  { value: "consolidation", label: "Pallet Consolidation" },
  { value: "staging", label: "Dock Staging" },
];

interface MoveInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance?: InventoryBalance | WhereIsResult | null;
  facilityId: string;
  onSuccess?: () => void;
}

export function MoveInventoryModal({
  isOpen,
  onClose,
  balance,
  facilityId,
  onSuccess,
}: MoveInventoryModalProps) {
  const [targetLocationCode, setTargetLocationCode] = useState("");
  const [targetContainerLpn, setTargetContainerLpn] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("relocation");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Locations state for searchable dropdown
  const [locations, setLocations] = useState<FacilityLocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const facId =
      facilityId && facilityId !== "all"
        ? facilityId
        : balance && "facility_id" in balance
        ? (balance as InventoryBalance).facility_id
        : "";
    if (!facId) return;

    let isMounted = true;
    setIsLoadingLocations(true);
    getFacilityLocationsAction(facId)
      .then((locs) => {
        if (isMounted) {
          setLocations(locs);
          setIsLoadingLocations(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingLocations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, facilityId, balance]);

  if (!isOpen || !balance) return null;

  const sourceQty = "on_hand_qty" in balance ? balance.on_hand_qty : 0;
  const skuCode = "sku" in balance && balance.sku ? balance.sku.code : "sku_code" in balance ? (balance as WhereIsResult).sku_code : "";
  const skuName = "sku" in balance && balance.sku ? balance.sku.name : "sku_name" in balance ? (balance as WhereIsResult).sku_name : "";
  const locationCode = "location" in balance && balance.location ? balance.location.full_code : "location_code" in balance ? (balance as WhereIsResult).location_code : "";
  const locationId = "location_id" in balance ? balance.location_id : "";
  const skuId = "sku_id" in balance ? balance.sku_id : "";
  const lotId = "lot_id" in balance ? balance.lot_id : null;
  const serialId = "serial_id" in balance ? balance.serial_id : null;
  const containerId = "container_id" in balance ? balance.container_id : null;
  const containerLpn = "container" in balance && balance.container ? balance.container.lpn : "container_lpn" in balance ? (balance as WhereIsResult).container_lpn : null;
  const lotNumber = "lot" in balance && balance.lot ? balance.lot.lot_number : "lot_number" in balance ? (balance as WhereIsResult).lot_number : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid move quantity.");
      return;
    }

    if (qty > sourceQty) {
      setError(`Cannot move more than available on-hand balance (${sourceQty} units).`);
      return;
    }

    if (!targetLocationCode.trim()) {
      setError("Target destination location code or ID is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedFacilityId =
        ("facility_id" in balance && balance.facility_id)
          ? balance.facility_id
          : facilityId && facilityId !== "all"
          ? facilityId
          : "";

      const res = await moveInventoryAction({
        facilityId: resolvedFacilityId,
        fromLocationId: locationId,
        fromContainerId: containerId,
        toLocationId: targetLocationCode.trim(), // Server RPC accepts full_code or UUID
        toContainerId: targetContainerLpn.trim() ? targetContainerLpn.trim() : null,
        skuId,
        lotId,
        serialId,
        quantity: qty,
        reason,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to move inventory.");
      } else {
        onSuccess?.();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error executing move";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl max-w-lg w-full max-h-[min(90vh,740px)] shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Pinned Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Relocate Inventory Stock</h2>
              <p className="text-xs text-muted-foreground font-mono">Move between storage locations or LPNs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form with Scrollable Body and Pinned Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Source Stock Summary Box */}
            <div className="p-3.5 bg-muted/20 border border-border rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Source Item & Location
                </span>
                <span className="text-xs font-mono font-bold text-primary">
                  Available: {sourceQty}
                </span>
              </div>

              <div className="p-2.5 bg-background border border-border/80 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-sm truncate">{skuName || "Unnamed Product"}</span>
                  <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{locationCode}</span>
                </div>
                <div className="text-[11px] text-muted-foreground/60 font-mono flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground/50">SKU:</span>
                  <span className="font-normal text-muted-foreground/80">{skuCode}</span>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t border-border/50">
                  {containerLpn && (
                    <div className="flex items-center gap-1">
                      <Box className="w-3.5 h-3.5 text-primary" />
                      <span className="font-mono font-medium text-foreground">{containerLpn}</span>
                    </div>
                  )}
                  {lotNumber && (
                    <div>
                      Lot: <span className="font-mono font-medium text-foreground">{lotNumber}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Destination Location */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-foreground">Destination Location *</label>
                {isLoadingLocations ? (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin text-primary" /> Loading racks...
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground font-normal">Search or Browse</span>
                )}
              </div>
              <SearchableSelect
                value={targetLocationCode}
                onChange={(val) => setTargetLocationCode(val)}
                placeholder={
                  isLoadingLocations
                    ? "Loading warehouse locations..."
                    : locations.length === 0
                    ? "No locations found (type code or scan barcode)..."
                    : "Search by code, aisle, bay, or location type..."
                }
                options={locations.map((loc) => ({
                  value: loc.id,
                  label: loc.full_code,
                  description: loc.human_path || undefined,
                  badge: loc.location_type.replace(/_/g, " "),
                }))}
                searchable={true}
                allowCustomValue={true}
                customValueLabel={(query) => `Custom Code / Scan: "${query}"`}
              />
            </div>

            {/* Destination Container (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span>Destination Container / LPN (Optional)</span>
                <span className="text-[11px] text-muted-foreground font-normal">Pallet or Tote</span>
              </label>
              <div className="relative">
                <Box className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={targetContainerLpn}
                  onChange={(e) => setTargetContainerLpn(e.target.value)}
                  placeholder="e.g. LPN-002341 (leave blank for loose storage)"
                  className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
                />
              </div>
            </div>

            {/* Quantity Input */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Move Quantity *</label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    step="any"
                    min="1"
                    max={sourceQty}
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(sourceQty.toString())}
                    className="px-2.5 py-2 text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg transition-colors cursor-pointer"
                  >
                    Max
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Move Reason</label>
                <SearchableSelect
                  value={reason}
                  onChange={setReason}
                  options={MOVE_REASON_OPTIONS}
                  searchable={false}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Notes / Reference</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes or forklift task reference..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>
          </div>

          {/* Sticky Actions Footer */}
          <div className="px-6 py-3.5 border-t border-border bg-muted/10 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Confirm Relocation</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
