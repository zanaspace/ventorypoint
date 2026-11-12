"use client";

import { useState } from "react";
import {
  FileCheck,
  X,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { approveAdjustmentAction, rejectAdjustmentAction } from "../actions";
import { InventoryAdjustment } from "@/lib/types/inventory";

interface AdjustmentApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  adjustment?: InventoryAdjustment | null;
  onSuccess?: () => void;
}

export function AdjustmentApprovalModal({
  isOpen,
  onClose,
  adjustment,
  onSuccess,
}: AdjustmentApprovalModalProps) {
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("Variance unverified upon second count");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !adjustment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (actionType === "approve") {
        const res = await approveAdjustmentAction(adjustment.id, notes.trim() || undefined);
        if (!res.success) {
          setError(res.error || "Approval failed.");
        } else {
          onSuccess?.();
          onClose();
        }
      } else {
        const res = await rejectAdjustmentAction(adjustment.id, rejectionReason.trim());
        if (!res.success) {
          setError(res.error || "Rejection failed.");
        } else {
          onSuccess?.();
          onClose();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error executing decision";
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
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Review Count Adjustment</h2>
              <p className="text-xs text-muted-foreground font-mono">Supervisor Authorization Decision</p>
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

            {/* Adjustment Details Box */}
            <div className="p-3.5 bg-muted/20 border border-border rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-foreground text-sm">{adjustment.sku?.code}</span>
                <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/80">{adjustment.location?.full_code}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{adjustment.sku?.name}</p>

              <div className="p-2.5 bg-background border border-border/80 rounded-lg grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">System Qty</span>
                  <span className="font-mono font-bold text-foreground text-sm">{adjustment.current_qty}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Proposed Delta</span>
                  <span
                    className={`font-mono font-bold text-sm ${
                      adjustment.quantity_delta > 0 ? "text-emerald-500" : "text-rose-500"
                    }`}
                  >
                    {adjustment.quantity_delta > 0 ? `+${adjustment.quantity_delta}` : adjustment.quantity_delta}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Target Balance</span>
                  <span className="font-mono font-bold text-foreground text-sm">{adjustment.target_qty}</span>
                </div>
              </div>

              <div className="text-xs space-y-1 text-muted-foreground pt-1">
                <p>
                  <strong className="text-foreground">Reason Code:</strong> {adjustment.reason_code}
                </p>
                {adjustment.notes && (
                  <p className="italic">
                    <strong className="text-foreground">Worker Note:</strong> &ldquo;{adjustment.notes}&rdquo;
                  </p>
                )}
              </div>
            </div>

          {/* Decision Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground">Decision *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setActionType("approve")}
                className={`p-3 rounded-xl border flex items-center gap-2.5 font-semibold text-xs transition-all ${
                  actionType === "approve"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 shadow-sm"
                    : "bg-surface border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Approve & Post</span>
              </button>

              <button
                type="button"
                onClick={() => setActionType("reject")}
                className={`p-3 rounded-xl border flex items-center gap-2.5 font-semibold text-xs transition-all ${
                  actionType === "reject"
                    ? "bg-rose-500/10 border-rose-500 text-rose-600 shadow-sm"
                    : "bg-surface border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>Reject Discrepancy</span>
              </button>
            </div>
          </div>

          {actionType === "approve" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Approval Note (Optional)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Confirmation of physical recount..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground">Rejection Reason *</label>
              <textarea
                rows={2}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why variance was rejected..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
              />
            </div>
          )}

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
              className={`px-5 py-2 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 shadow-xs cursor-pointer ${
                actionType === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-500"
                  : "bg-rose-600 hover:bg-rose-500"
              }`}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{actionType === "approve" ? "Confirm Approval" : "Confirm Rejection"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
