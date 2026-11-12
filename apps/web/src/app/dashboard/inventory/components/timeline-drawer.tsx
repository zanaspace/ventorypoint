"use client";

import { useEffect, useState } from "react";
import {
  History,
  X,
  MapPin,
  Box,
  User,
  ArrowRight,
  Clock,
  Layers,
  FileText,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { getItemTimelineAction } from "../actions";
import { ItemTimelineEntry } from "@/lib/types/inventory";

interface TimelineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  itemType: string;
  itemId: string;
  label: string;
}

export function TimelineDrawer({
  isOpen,
  onClose,
  itemType,
  itemId,
  label,
}: TimelineDrawerProps) {
  const [timeline, setTimeline] = useState<ItemTimelineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && itemId) {
      loadTimeline();
    }
  }, [isOpen, itemId, itemType]);

  const loadTimeline = async () => {
    setIsLoading(true);
    try {
      const data = await getItemTimelineAction(itemType, itemId);
      setTimeline(data);
    } catch (err) {
      console.error("Error loading timeline:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-xl bg-surface border-l border-border shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-6 py-5 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <History className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Traceability Timeline</h2>
                <p className="text-xs text-muted-foreground font-mono">{label}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Timeline Feed */}
          <div className="flex-1 overflow-y-auto p-6">
            {isLoading && (
              <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm">Fetching ledger movement history...</p>
              </div>
            )}

            {!isLoading && timeline.length === 0 && (
              <div className="py-20 text-center text-muted-foreground space-y-2">
                <Clock className="w-10 h-10 mx-auto text-muted-foreground/60" />
                <p className="text-sm font-semibold text-foreground">No transaction history found</p>
                <p className="text-xs max-w-xs mx-auto">
                  No recorded movements or status changes exist for this entity in the ledger.
                </p>
              </div>
            )}

            {!isLoading && timeline.length > 0 && (
              <div className="relative border-l-2 border-border ml-3 pl-6 space-y-6">
                {timeline.map((entry) => {
                  const typeBadges: Record<string, { bg: string; text: string }> = {
                    receipt: { bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600", text: "Receipt" },
                    move: { bg: "bg-blue-500/10 border-blue-500/20 text-blue-600", text: "Move" },
                    container_move: { bg: "bg-indigo-500/10 border-indigo-500/20 text-indigo-600", text: "LPN Move" },
                    adjust: { bg: "bg-amber-500/10 border-amber-500/20 text-amber-600", text: "Adjustment" },
                    status_change: { bg: "bg-purple-500/10 border-purple-500/20 text-purple-600", text: "Status Change" },
                    cycle_count: { bg: "bg-teal-500/10 border-teal-500/20 text-teal-600", text: "Cycle Count" },
                  };

                  const badge = typeBadges[entry.transaction_type] || {
                    bg: "bg-muted border-border text-muted-foreground",
                    text: entry.transaction_type,
                  };

                  return (
                    <div key={entry.transaction_id} className="relative group">
                      {/* Timeline Dot */}
                      <div className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-surface border-2 border-primary" />

                      <div className="p-4 rounded-xl border border-border bg-card/60 hover:border-primary/30 transition-all space-y-2.5 shadow-sm">
                        {/* Event Header */}
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${badge.bg}`}
                          >
                            {badge.text}
                          </span>
                          <span className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                        </div>

                        {/* Location Transition */}
                        <div className="flex items-center gap-2 text-xs font-mono">
                          {entry.from_location_code ? (
                            <span className="px-2 py-0.5 rounded bg-muted text-muted-foreground">
                              {entry.from_location_code}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Dock / Outside</span>
                          )}

                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

                          <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-bold border border-primary/20">
                            {entry.to_location_code || "Dock / Relocated"}
                          </span>
                        </div>

                        {/* Quantity & Container info */}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <div>
                            Quantity:{" "}
                            <span className="font-bold text-foreground font-mono">
                              {entry.quantity > 0 ? `+${entry.quantity}` : entry.quantity}
                            </span>
                          </div>

                          {entry.to_container_lpn && (
                            <div className="flex items-center gap-1">
                              <Box className="w-3.5 h-3.5" />
                              <span className="font-mono text-foreground">{entry.to_container_lpn}</span>
                            </div>
                          )}

                          {entry.lot_number && (
                            <div>
                              Lot: <span className="font-mono text-foreground">{entry.lot_number}</span>
                            </div>
                          )}
                        </div>

                        {/* Notes / Reason */}
                        {(entry.reason_code || entry.notes) && (
                          <div className="p-2 rounded bg-muted/30 text-xs text-muted-foreground space-y-0.5">
                            {entry.reason_code && (
                              <p className="font-medium text-foreground">
                                Reason: <span className="capitalize">{entry.reason_code.replace(/_/g, " ")}</span>
                              </p>
                            )}
                            {entry.notes && <p className="italic">&ldquo;{entry.notes}&rdquo;</p>}
                          </div>
                        )}

                        {/* Actor Email */}
                        {entry.actor_email && (
                          <div className="pt-1.5 border-t border-border/50 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="w-3 h-3" />
                            <span>Actor: {entry.actor_email}</span>
                          </div>
                        )}
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
