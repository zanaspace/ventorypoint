"use client";

import { useState } from "react";
import {
  ShieldAlert,
  X,
  AlertCircle,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { changeInventoryStatusAction } from "../actions";
import { InventoryBalance, InventoryStatus } from "@/lib/types/inventory";
import { SearchableSelect } from "@/components/ui/searchable-select";

const STATUS_OPTIONS = [
  { value: "available", label: "Available (Sellable / Pickable)" },
  { value: "hold", label: "Quality Hold (Non-Allocatable)" },
  { value: "damaged", label: "Damaged Stock" },
  { value: "expired", label: "Expired Quarantine" },
];

const REASON_OPTIONS = [
  { value: "quality_inspection", label: "Quality Inspection / Hold" },
  { value: "carrier_damage", label: "Transit / Carrier Damage" },
  { value: "client_request", label: "Brand Client Request" },
  { value: "released_from_hold", label: "Cleared Inspection (Return to Available)" },
  { value: "expired_segregation", label: "Shelf-Life Expiry Quarantine" },
];

interface ChangeStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance?: InventoryBalance | null;
  facilityId: string;
  onSuccess?: () => void;
}

export function ChangeStatusModal({
  isOpen,
  onClose,
  balance,
  facilityId,
  onSuccess,
}: ChangeStatusModalProps) {
  const [toStatus, setToStatus] = useState<InventoryStatus>("hold");
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("quality_inspection");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !balance) return null;

  const currentQty = balance.on_hand_qty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid quantity.");
      return;
    }

    if (qty > currentQty) {
      setError(`Cannot move more than current balance quantity (${currentQty} units).`);
      return;
    }

    if (toStatus === balance.status) {
      setError("Target status must be different from current status.");
      return;
    }

    setIsSubmitting(true);
    try {
      const resolvedFacilityId =
        balance.facility_id || (facilityId && facilityId !== "all" ? facilityId : "");

      const res = await changeInventoryStatusAction({
        facilityId: resolvedFacilityId,
        locationId: balance.location_id,
        containerId: balance.container_id,
        skuId: balance.sku_id,
        lotId: balance.lot_id,
        serialId: balance.serial_id,
        quantity: qty,
        fromStatus: balance.status,
        toStatus,
        reason,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || "Failed to update status.");
      } else {
        onSuccess?.();
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error changing status";
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
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 border border-purple-500/20">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Change Inventory Status</h2>
              <p className="text-xs text-muted-foreground font-mono">
                Segregate to Hold, Damaged, or Return to Available
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body with Scrollable Area and Pinned Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Item Context */}
            <div className="p-3.5 bg-muted/20 border border-border rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-sm truncate">{balance.sku?.name || "Unnamed Product"}</span>
                <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/80">{balance.location?.full_code}</span>
              </div>
              <div className="text-[11px] font-mono text-muted-foreground/60 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/50">SKU:</span>
                <span className="font-normal text-muted-foreground/80">{balance.sku?.code}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-border/50 text-xs">
                <span className="text-muted-foreground">Current Status:</span>
                <span className="font-bold uppercase tracking-wider text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  {balance.status} ({balance.on_hand_qty} units)
                </span>
              </div>
            </div>

          {/* Target Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">New Target Status *</label>
            <SearchableSelect
              value={toStatus}
              onChange={(val) => setToStatus(val as InventoryStatus)}
              options={STATUS_OPTIONS}
              searchable={false}
            />
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Units to Transition *</label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min="1"
                max={currentQty}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              <button
                type="button"
                onClick={() => setQuantity(currentQty.toString())}
                className="px-3 py-2 text-xs font-bold bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg transition-colors"
              >
                All
              </button>
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Reason Code *</label>
            <SearchableSelect
              value={reason}
              onChange={setReason}
              options={REASON_OPTIONS}
              searchable={false}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Audit Explanation</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Inspection badge reference or damage description..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none"
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
              <span>Apply Status Change</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
