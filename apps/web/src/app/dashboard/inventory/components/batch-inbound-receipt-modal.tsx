"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Sku } from "@/lib/types/catalog";
import {
  receiveBatchInventoryAction,
  getFacilityLocationsAction,
  FacilityLocationOption,
} from "@/app/dashboard/inventory/actions";
import { toast } from "sonner";
import {
  Boxes,
  Plus,
  Trash2,
  Copy,
  AlertCircle,
  Loader2,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
} from "lucide-react";

export interface BatchReceiptLineState {
  id: string;
  skuId: string;
  quantity: string;
  locationId: string;
  containerLpn: string;
  lotNumber: string;
  expiryDate: string;
}

interface BatchInboundReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  facilities: { id: string; name: string; short_code: string }[];
  defaultFacilityId?: string;
  skus: Sku[];
  initialSkuId?: string;
  clientName?: string;
  onSuccess: () => void;
}

function createBlankLine(defaultLocationId = "", initialSkuId = ""): BatchReceiptLineState {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    skuId: initialSkuId || "",
    quantity: "",
    locationId: defaultLocationId,
    containerLpn: "",
    lotNumber: "",
    expiryDate: "",
  };
}

export function BatchInboundReceiptModal({
  isOpen,
  onClose,
  title,
  facilities = [],
  defaultFacilityId = "",
  skus = [],
  initialSkuId = "",
  clientName,
  onSuccess,
}: BatchInboundReceiptModalProps) {
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(
    defaultFacilityId || facilities[0]?.id || ""
  );
  const [defaultLocationId, setDefaultLocationId] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [shipmentNotes, setShipmentNotes] = useState<string>("");

  const [locations, setLocations] = useState<FacilityLocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Line items state
  const [lines, setLines] = useState<BatchReceiptLineState[]>([]);

  // Initialize lines when modal opens or initialSkuId changes
  useEffect(() => {
    if (!isOpen) return;
    const initialFac = defaultFacilityId || facilities[0]?.id || "";
    setSelectedFacilityId(initialFac);
    setReferenceNumber("");
    setShipmentNotes("");
    setLines([createBlankLine("", initialSkuId)]);
  }, [isOpen, defaultFacilityId, facilities, initialSkuId]);

  // Load locations when selected facility changes
  useEffect(() => {
    if (!isOpen || !selectedFacilityId) return;

    let isMounted = true;
    setIsLoadingLocations(true);

    getFacilityLocationsAction(selectedFacilityId)
      .then((locs) => {
        if (!isMounted) return;
        setLocations(locs);
        setIsLoadingLocations(false);

        // Auto-select first staging or storage location as default
        if (locs.length > 0 && !defaultLocationId) {
          const stagingLoc = locs.find((l) => l.location_type === "staging" || l.full_code.includes("STG"));
          const chosen = stagingLoc ? stagingLoc.id : locs[0].id;
          setDefaultLocationId(chosen);

          // Also set on the first line if it doesn't have one
          setLines((prev) =>
            prev.map((l) => (l.locationId ? l : { ...l, locationId: chosen }))
          );
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingLocations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedFacilityId, defaultLocationId]);

  // SKU Map for quick lookup
  const skuMap = useMemo(() => {
    return new Map<string, Sku>(skus.map((s) => [s.id, s]));
  }, [skus]);

  // Totals calculations
  const totalUnits = useMemo(() => {
    return lines.reduce((sum, l) => {
      const q = parseFloat(l.quantity);
      return sum + (isNaN(q) || q < 0 ? 0 : q);
    }, 0);
  }, [lines]);

  const validLinesCount = useMemo(() => {
    return lines.filter((l) => l.skuId && parseFloat(l.quantity) > 0).length;
  }, [lines]);

  // Line management handlers
  const handleAddLine = () => {
    setLines((prev) => [...prev, createBlankLine(defaultLocationId)]);
  };

  const handleDuplicateLine = (index: number) => {
    const source = lines[index];
    const duplicated: BatchReceiptLineState = {
      ...source,
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    };
    const next = [...lines];
    next.splice(index + 1, 0, duplicated);
    setLines(next);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      toast.error("At least one line item is required.");
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, patch: Partial<BatchReceiptLineState>) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  // When default staging location changes, ask or apply to blank locations
  const handleDefaultLocationChange = (newLocId: string) => {
    setDefaultLocationId(newLocId);
    setLines((prev) =>
      prev.map((l) => (l.locationId === defaultLocationId || !l.locationId ? { ...l, locationId: newLocId } : l))
    );
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFacilityId) {
      toast.error("Please select a warehouse facility.");
      return;
    }

    if (lines.length === 0) {
      toast.error("Please add at least one line item to receive.");
      return;
    }

    // Validate lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      if (!line.skuId) {
        toast.error(`Line #${lineNum}: Please select a product SKU.`);
        return;
      }

      const q = parseFloat(line.quantity);
      if (isNaN(q) || q <= 0) {
        toast.error(`Line #${lineNum}: Quantity must be greater than 0.`);
        return;
      }

      const loc = line.locationId || defaultLocationId;
      if (!loc) {
        toast.error(`Line #${lineNum}: Please select a destination rack/bin.`);
        return;
      }

      const sku = skuMap.get(line.skuId);
      if (sku && (sku.tracking_class === "lot" || sku.tracking_class === "lot_serial" || sku.rotation_rule === "fefo")) {
        if (!line.lotNumber?.trim()) {
          toast.error(`Line #${lineNum} (${sku.name}): Lot/Batch number is required for this SKU.`);
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      const res = await receiveBatchInventoryAction({
        facilityId: selectedFacilityId,
        defaultLocationId,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: shipmentNotes.trim() || (clientName ? `Direct intake for ${clientName}` : undefined),
        lines: lines.map((l) => ({
          skuId: l.skuId,
          locationId: l.locationId || defaultLocationId,
          quantity: parseFloat(l.quantity),
          containerLpn: l.containerLpn.trim() || undefined,
          lotNumber: l.lotNumber.trim() || undefined,
          expiryDate: l.expiryDate.trim() || undefined,
        })),
      });

      if (!res.success) {
        toast.error(res.error || "Failed to process batch intake.");
      } else {
        if (res.partialWarning) {
          toast.warning(res.partialWarning);
        } else {
          toast.success(
            `Successfully received ${res.processedCount} items (${res.totalUnits} total units) into ledger!`
          );
        }
        onSuccess();
        onClose();
      }
    } catch {
      toast.error("Unexpected error during batch receiving.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || (clientName ? `Inbound Stock Intake: ${clientName}` : "Multi-Item Inbound Stock Receipt")}
      maxWidth="max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {/* ===================================================================== */}
        {/* SHIPMENT HEADER CARD */}
        {/* ===================================================================== */}
        <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-bold text-foreground">Shipment Header & Receiving Destination</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Multi-Line Inbound
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Facility */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Receiving Facility *
              </label>
              <SearchableSelect
                value={selectedFacilityId}
                onChange={(val) => {
                  setSelectedFacilityId(val);
                  setDefaultLocationId("");
                }}
                options={facilities.map((fac) => ({
                  value: fac.id,
                  label: `${fac.name} (${fac.short_code})`,
                }))}
                placeholder="Select facility..."
                searchable={facilities.length > 4}
              />
            </div>

            {/* Default Staging Location */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-foreground">
                  Default Staging Rack *
                </label>
                {isLoadingLocations && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" /> Loading...
                  </span>
                )}
              </div>
              <SearchableSelect
                value={defaultLocationId}
                onChange={handleDefaultLocationChange}
                options={locations.map((loc) => ({
                  value: loc.id,
                  label: loc.full_code,
                  badge: loc.location_type.replace(/_/g, " "),
                }))}
                placeholder={locations.length === 0 ? "Loading locations..." : "Choose default rack..."}
                searchable={locations.length > 5}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Auto-assigned to all line items.
              </p>
            </div>

            {/* Inbound Ref / ASN / PO # */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                ASN / PO / Ref # (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. PO-2026-8812"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Carrier / Notes */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Shipment Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Delivered by DHL"
                value={shipmentNotes}
                onChange={(e) => setShipmentNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* LINE ITEMS TABLE */}
        {/* ===================================================================== */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold text-foreground">Line Items to Receive</h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {lines.length} {lines.length === 1 ? "item" : "items"}
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddLine}
              className="px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Item</span>
            </button>
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {lines.map((line, index) => {
              const sku = skuMap.get(line.skuId);
              const isLotTracked = sku?.tracking_class === "lot" || sku?.tracking_class === "lot_serial" || sku?.rotation_rule === "fefo";
              const isSerialized = sku?.tracking_class === "serial" || sku?.tracking_class === "lot_serial";

              return (
                <div
                  key={line.id}
                  className="p-3.5 rounded-xl border border-border bg-card hover:border-primary/30 transition-all space-y-2.5 shadow-xs"
                >
                  {/* Row Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-muted text-[11px] font-mono font-bold flex items-center justify-center text-foreground">
                        {index + 1}
                      </span>
                      {sku ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{sku.name}</span>
                          <span className="text-[11px] font-mono text-muted-foreground/70">({sku.code})</span>
                          {isSerialized && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20">
                              Serialized
                            </span>
                          )}
                          {isLotTracked && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              Lot Required
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">Select Product SKU below</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Duplicate this line"
                        onClick={() => handleDuplicateLine(index)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remove line"
                        disabled={lines.length <= 1}
                        onClick={() => handleRemoveLine(index)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Row Main Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* SKU Selection (5 cols) */}
                    <div className="sm:col-span-5">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        Product SKU *
                      </label>
                      <SearchableSelect
                        value={line.skuId}
                        onChange={(val) => updateLine(index, { skuId: val })}
                        options={skus.map((s) => ({
                          value: s.id,
                          label: `${s.name} (${s.code})`,
                          description: `Tracking: ${s.tracking_class.replace(/_/g, " ")} • Rotation: ${s.rotation_rule.toUpperCase()}`,
                          badge: s.tracking_class === "serial" ? "Serial" : s.tracking_class === "lot" ? "Lot" : undefined,
                        }))}
                        placeholder="Choose SKU..."
                        searchable={skus.length > 5}
                      />
                    </div>

                    {/* Quantity (2 cols) */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: e.target.value })}
                        placeholder="0"
                        className="w-full px-2.5 py-2 text-xs font-mono font-bold bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary text-center placeholder:text-muted-foreground/40 placeholder:font-normal"
                      />
                    </div>

                    {/* Destination Rack (3 cols) */}
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        Destination Rack / Bin *
                      </label>
                      <SearchableSelect
                        value={line.locationId || defaultLocationId}
                        onChange={(val) => updateLine(index, { locationId: val })}
                        options={locations.map((loc) => ({
                          value: loc.id,
                          label: loc.full_code,
                          badge: loc.location_type.replace(/_/g, " "),
                        }))}
                        placeholder="Rack/bin..."
                        searchable={locations.length > 5}
                      />
                    </div>

                    {/* Pallet LPN (2 cols) */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        Pallet LPN (Opt)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. LPN-01"
                        value={line.containerLpn}
                        onChange={(e) => updateLine(index, { containerLpn: e.target.value })}
                        className="w-full px-2 py-2 text-xs font-mono bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Lot & Expiry fields (Only if Lot Tracked or explicitly needed) */}
                  {isLotTracked && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-border/40 bg-amber-500/[0.03] p-2.5 rounded-lg border border-amber-500/20">
                      <div>
                        <label className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 block mb-1">
                          Lot / Batch Number *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. LOT-2026-X"
                          value={line.lotNumber}
                          onChange={(e) => updateLine(index, { lotNumber: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs font-mono bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 block mb-1">
                          Expiration Date {sku?.rotation_rule === "fefo" ? "*" : "(Optional)"}
                        </label>
                        <input
                          type="date"
                          required={sku?.rotation_rule === "fefo"}
                          value={line.expiryDate}
                          onChange={(e) => updateLine(index, { expiryDate: e.target.value })}
                          className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ===================================================================== */}
        {/* FOOTER ACTIONS & SUMMARY */}
        {/* ===================================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleAddLine}
              className="px-3.5 py-2 text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>+ Add Line Item</span>
            </button>

            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-bold text-foreground">{validLinesCount} items ready</span>
              <span>•</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {totalUnits} total units
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || validLinesCount === 0}
              className="px-5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording {validLinesCount} Items...</span>
                </>
              ) : (
                <>
                  <Boxes className="w-3.5 h-3.5" />
                  <span>Receive {validLinesCount > 0 ? `All ${validLinesCount} Items` : "Stock"} into Ledger</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
