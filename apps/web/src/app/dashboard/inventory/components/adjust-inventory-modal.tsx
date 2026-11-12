"use client";

import { useState } from "react";
import {
  Sliders,
  X,
  AlertTriangle,
  Loader2,
  CheckCircle,
  HelpCircle,
  FileCheck,
} from "lucide-react";
import { adjustInventoryAction } from "../actions";
import { InventoryBalance, AdjustmentReason } from "@/lib/types/inventory";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface AdjustInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance?: InventoryBalance | null;
  facilityId: string;
  reasons: AdjustmentReason[];
  onSuccess?: () => void;
}

export function AdjustInventoryModal({
  isOpen,
  onClose,
  balance,
  facilityId,
  reasons,
  onSuccess,
}: AdjustInventoryModalProps) {
  const [deltaStr, setDeltaStr] = useState("");
  const [reasonCode, setReasonCode] = useState(reasons[0]?.code || "damaged_found");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !balance) return null;

  const currentQty = balance.on_hand_qty;
  const delta = parseFloat(deltaStr) || 0;
  const targetQty = currentQty + delta;

  // Selected reason details
  const selectedReason = reasons.find((r) => r.code === reasonCode);
  const requiresApproval = (selectedReason?.requires_supervisor_approval) || Math.abs(delta) > 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (delta === 0) {
      setError("Quantity delta cannot be zero.");
      return;
    }

    if (targetQty < 0) {
      setError(`Adjustment would cause negative on-hand balance (${targetQty} units).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await adjustInventoryAction({
        facilityId,
        locationId: balance.location_id,
        containerId: balance.container_id,
        skuId: balance.sku_id,
        lotId: balance.lot_id,
        serialId: balance.serial_id,
        quantityDelta: delta,
        reasonCode,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        setError(res.error || "Adjustment failed.");
      } else {
        if (res.data?.queued_for_approval) {
          setSuccessMsg("Adjustment exceeds threshold and was enqueued into the Supervisor Approval Queue.");
        } else {
          setSuccessMsg("Inventory balance adjusted successfully.");
        }
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 1200);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error executing adjustment";
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
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Adjust On-Hand Inventory</h2>
              <p className="text-xs text-muted-foreground font-mono">
                Physical count correction or damage write-off
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
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs rounded-xl flex items-center gap-2 font-medium">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Item Context Box */}
            <div className="p-3.5 bg-muted/20 border border-border rounded-xl space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground text-sm truncate">
                  {balance.sku?.name || "Unnamed Product"}
                </span>
                <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/80">
                  {balance.location?.full_code}
                </span>
              </div>
              <div className="text-[11px] font-mono text-muted-foreground/60 flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/50">SKU:</span>
                <span className="font-normal text-muted-foreground/80">{balance.sku?.code}</span>
              </div>

              <div className="flex items-center justify-between pt-1.5 border-t border-border/50 text-xs">
                <span className="text-muted-foreground">Current On-Hand Balance:</span>
                <span className="font-mono font-bold text-foreground text-sm">{currentQty} units</span>
              </div>
            </div>

          {/* Delta and Result Preview */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">
                Quantity Delta (+/-) *
              </label>
              <input
                type="number"
                step="any"
                required
                value={deltaStr}
                onChange={(e) => setDeltaStr(e.target.value)}
                placeholder="e.g. -2 or +15"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">Target Result</label>
              <div className="w-full px-3 py-2 bg-muted/40 border border-border rounded-lg text-sm font-mono font-bold flex items-center justify-between">
                <span className={targetQty < 0 ? "text-rose-500" : "text-foreground"}>
                  {targetQty} units
                </span>
                {delta !== 0 && (
                  <span
                    className={`text-xs ${
                      delta > 0 ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    ({delta > 0 ? `+${delta}` : delta})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Reason Code Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Adjustment Reason *</label>
            <SearchableSelect
              value={reasonCode}
              onChange={setReasonCode}
              options={reasons.map((r) => ({
                value: r.code,
                label: `${r.description} (${r.code})`,
              }))}
              searchable={reasons.length > 5}
            />
          </div>

          {/* Supervisor Approval Warning Banner */}
          {requiresApproval && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs rounded-xl flex items-start gap-2.5">
              <FileCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Supervisor Approval Required</p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Adjustments exceeding 10 units or classified as discrepancies must be approved by a Supervisor or Operations Manager before updating live ledger balances.
                </p>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Audit Explanation / Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Provide reason for cycle count discrepancy or damaged carton..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/30 resize-none"
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
              disabled={isSubmitting || delta === 0}
              className="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-500 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{requiresApproval ? "Submit for Approval" : "Post Adjustment"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
