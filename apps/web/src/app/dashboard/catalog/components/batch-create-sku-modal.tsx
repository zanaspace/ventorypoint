"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createBatchSkusAction,
  BatchSkuItem,
} from "@/app/dashboard/catalog/actions";
import {
  getFacilityLocationsAction,
  FacilityLocationOption,
} from "@/app/dashboard/inventory/actions";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Trash2,
  Copy,
  Loader2,
  Layers,
  Boxes,
  Sparkles,
} from "lucide-react";

export function generateSkuFromName(name: string): string {
  if (!name || !name.trim()) return "";
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "of", "with", "for", "in", "on", "at", "by", "to", "from",
  ]);
  const cleaned = name.trim().replace(/[^a-zA-Z0-9\s-]/g, " ");
  const words = cleaned
    .split(/[\s-]+/)
    .filter((w) => w.length > 0 && !stopWords.has(w.toLowerCase()));

  if (words.length === 0) return "";

  const tokens = words.slice(0, 4).map((w) => {
    if (/\d/.test(w)) return w.toUpperCase();
    if (w.length <= 8) return w.toUpperCase();
    return w.substring(0, 6).toUpperCase();
  });

  return tokens.join("-");
}

export interface BatchProductRowState {
  id: string;
  name: string;
  code: string;
  isCodeCustomized: boolean;
  barcode: string;
  trackingClass: string;
  rotationRule: string;
  quantity: string;
  locationId: string;
  lotNumber: string;
  expiryDate: string;
}

interface BatchCreateSkuModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: { id: string; name: string; short_code: string }[];
  defaultClientId?: string;
  facilities: { id: string; name: string; short_code: string }[];
  organizationId: string;
  onSuccess: () => void;
}

function createBlankRow(defaultLocationId = ""): BatchProductRowState {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name: "",
    code: "",
    isCodeCustomized: false,
    barcode: "",
    trackingClass: "non_unique",
    rotationRule: "fifo",
    quantity: "", // Empty string with placeholder 0 so it doesn't count
    locationId: defaultLocationId,
    lotNumber: "",
    expiryDate: "",
  };
}

export function BatchCreateSkuModal({
  isOpen,
  onClose,
  clients = [],
  defaultClientId,
  facilities = [],
  organizationId,
  onSuccess,
}: BatchCreateSkuModalProps) {
  const [clientId, setClientId] = useState<string>(
    defaultClientId || clients[0]?.id || ""
  );
  const [facilityId, setFacilityId] = useState<string>(facilities[0]?.id || "");
  const [defaultLocationId, setDefaultLocationId] = useState<string>("");
  const [locations, setLocations] = useState<FacilityLocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Line items state
  const [rows, setRows] = useState<BatchProductRowState[]>([]);

  // Reset and initialize on open
  useEffect(() => {
    if (!isOpen) return;
    setClientId(defaultClientId || clients[0]?.id || "");
    setFacilityId(facilities[0]?.id || "");
    setDefaultLocationId("");
    setRows([createBlankRow(""), createBlankRow("")]);
  }, [isOpen, defaultClientId, clients, facilities]);

  // Load locations when facility changes
  useEffect(() => {
    if (!isOpen || !facilityId) return;

    let isMounted = true;
    setIsLoadingLocations(true);

    getFacilityLocationsAction(facilityId)
      .then((locs) => {
        if (!isMounted) return;
        setLocations(locs);
        setIsLoadingLocations(false);

        if (locs.length > 0 && !defaultLocationId) {
          const stagingLoc = locs.find((l) => l.location_type === "staging" || l.full_code.includes("STG"));
          const chosen = stagingLoc ? stagingLoc.id : locs[0].id;
          setDefaultLocationId(chosen);
          setRows((prev) =>
            prev.map((r) => (r.locationId ? r : { ...r, locationId: chosen }))
          );
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingLocations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, facilityId, defaultLocationId]);

  // Calculations
  const validProductsCount = useMemo(() => {
    return rows.filter((r) => r.name.trim().length > 0).length;
  }, [rows]);

  const totalOpeningUnits = useMemo(() => {
    return rows.reduce((sum, r) => {
      const q = parseFloat(r.quantity);
      return sum + (isNaN(q) || q <= 0 ? 0 : q);
    }, 0);
  }, [rows]);

  // Row handlers
  const handleAddRow = () => {
    setRows((prev) => [...prev, createBlankRow(defaultLocationId)]);
  };

  const handleDuplicateRow = (index: number) => {
    const source = rows[index];
    const duplicated: BatchProductRowState = {
      ...source,
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      code: source.code ? `${source.code}-COPY` : "",
      isCodeCustomized: true,
    };
    const next = [...rows];
    next.splice(index + 1, 0, duplicated);
    setRows(next);
  };

  const handleRemoveRow = (index: number) => {
    if (rows.length <= 1) {
      toast.error("At least one product line is required.");
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<BatchProductRowState>) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const handleNameChange = (index: number, newName: string) => {
    setRows((prev) => {
      const next = [...prev];
      const target = next[index];
      const code = target.isCodeCustomized ? target.code : generateSkuFromName(newName);
      next[index] = { ...target, name: newName, code };
      return next;
    });
  };

  const handleCodeChange = (index: number, newCode: string) => {
    const uppercase = newCode.toUpperCase();
    setRows((prev) => {
      const next = [...prev];
      const target = next[index];
      next[index] = {
        ...target,
        code: uppercase,
        isCodeCustomized: uppercase.trim() !== "",
      };
      return next;
    });
  };

  const handleDefaultLocationChange = (newLocId: string) => {
    setDefaultLocationId(newLocId);
    setRows((prev) =>
      prev.map((r) => (r.locationId === defaultLocationId || !r.locationId ? { ...r, locationId: newLocId } : r))
    );
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!clientId) {
      toast.error("Please select a brand client.");
      return;
    }

    if (validProductsCount === 0) {
      toast.error("Please enter a product name for at least one item.");
      return;
    }

    // Validate rows with quantities
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      if (!row.name.trim()) continue;

      const q = parseFloat(row.quantity);
      if (!isNaN(q) && q > 0) {
        const loc = row.locationId || defaultLocationId;
        if (!loc) {
          toast.error(`Line #${rowNum} ("${row.name}"): Destination rack/bin is required when opening stock is specified.`);
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      const itemsToSubmit: BatchSkuItem[] = rows
        .filter((r) => r.name.trim().length > 0)
        .map((r) => {
          const qty = parseFloat(r.quantity);
          const hasStock = !isNaN(qty) && qty > 0;

          return {
            name: r.name.trim(),
            code: r.code.trim().toUpperCase() || undefined,
            barcode: r.barcode.trim() || undefined,
            trackingClass: r.trackingClass,
            rotationRule: r.rotationRule,
            initialStock: hasStock
              ? {
                  facilityId,
                  locationId: r.locationId || defaultLocationId,
                  quantity: qty,
                  lotNumber: r.lotNumber.trim() || undefined,
                  expiryDate: r.expiryDate || undefined,
                }
              : undefined,
          };
        });

      const res = await createBatchSkusAction({
        organizationId,
        clientId,
        items: itemsToSubmit,
      });

      if (!res.success) {
        toast.error(res.error || "Failed to create products.");
      } else {
        if (res.partialWarning) {
          toast.warning(res.partialWarning);
        } else {
          toast.success(
            `Successfully created ${res.createdCount} products in catalog!` +
              ((res.totalOpeningUnits ?? 0) > 0 ? ` (${res.totalOpeningUnits} units credited to ledger)` : "")
          );
        }
        onSuccess();
        onClose();
      }
    } catch {
      toast.error("Unexpected error during batch product creation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Multiple Products (Multi-Item Sheet)"
      maxWidth="max-w-4xl"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {/* ===================================================================== */}
        {/* HEADER CONFIGURATION */}
        {/* ===================================================================== */}
        <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border/60">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-foreground">Catalog Brand & Receiving Destination</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Multi-Product Creation
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Client Brand */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Brand Client *
              </label>
              <SearchableSelect
                value={clientId}
                onChange={(v) => setClientId(v)}
                options={clients.map((c) => ({ value: c.id, label: `${c.name} (${c.short_code})` }))}
                placeholder="Select client brand..."
                searchable={clients.length > 4}
              />
            </div>

            {/* Warehouse Facility */}
            <div>
              <label className="text-xs font-semibold text-foreground block mb-1">
                Warehouse Facility (Opening Stock)
              </label>
              <SearchableSelect
                value={facilityId}
                onChange={(val) => {
                  setFacilityId(val);
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
                  Default Staging Rack
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
                placeholder={locations.length === 0 ? "No locations available" : "Select default rack..."}
                searchable={locations.length > 5}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Auto-assigned if initial stock is entered.
              </p>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* PRODUCT LINE ITEMS LIST */}
        {/* ===================================================================== */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold text-foreground">Products to Create</h3>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {rows.length} {rows.length === 1 ? "line" : "lines"}
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddRow}
              className="px-3 py-1.5 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Product</span>
            </button>
          </div>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {rows.map((row, index) => {
              const hasStockEntered = parseFloat(row.quantity) > 0;
              const isLotTracked = row.trackingClass === "lot" || row.trackingClass === "lot_serial";

              return (
                <div
                  key={row.id}
                  className="p-3.5 rounded-xl border border-border bg-card hover:border-primary/30 transition-all space-y-2.5 shadow-xs"
                >
                  {/* Row Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-muted text-[11px] font-mono font-bold flex items-center justify-center text-foreground">
                        {index + 1}
                      </span>
                      <span className="text-xs font-bold text-foreground">
                        {row.name.trim() || `Product Line #${index + 1}`}
                      </span>
                      {row.code && (
                        <span className="text-[11px] font-mono text-muted-foreground/70">
                          ({row.code})
                        </span>
                      )}
                      {hasStockEntered && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          +{row.quantity} units opening stock
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Duplicate product"
                        onClick={() => handleDuplicateRow(index)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Remove product"
                        disabled={rows.length <= 1}
                        onClick={() => handleRemoveRow(index)}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Row Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* Product Name (4 cols) */}
                    <div className="sm:col-span-4">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        Product Title / Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Vanilla Ice Cream 500ml"
                        value={row.name}
                        onChange={(e) => handleNameChange(index, e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary font-medium"
                      />
                    </div>

                    {/* SKU Code (3 cols) */}
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        SKU Code
                      </label>
                      <input
                        type="text"
                        placeholder="Auto-generated"
                        value={row.code}
                        onChange={(e) => handleCodeChange(index, e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono font-bold bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Barcode (2 cols) */}
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        Barcode (Opt)
                      </label>
                      <input
                        type="text"
                        placeholder="UPC / EAN"
                        value={row.barcode}
                        onChange={(e) => updateRow(index, { barcode: e.target.value })}
                        className="w-full px-2.5 py-2 text-xs font-mono bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    {/* Tracking Class (3 cols) */}
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-semibold text-foreground block mb-1">
                        Tracking Class
                      </label>
                      <SearchableSelect
                        value={row.trackingClass}
                        onChange={(val) => updateRow(index, { trackingClass: val })}
                        options={[
                          { value: "non_unique", label: "Non-Unique (Standard)" },
                          { value: "lot", label: "Lot / Batch-Tracked" },
                          { value: "serial", label: "Serialized (IMEI / SN)" },
                          { value: "lot_serial", label: "Lot + Serial" },
                        ]}
                      />
                    </div>
                  </div>

                  {/* Optional Opening Stock Row */}
                  <div className="pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-muted/10 p-2.5 rounded-lg">
                    {/* Quantity (3 cols) */}
                    <div className="sm:col-span-3">
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Opening Qty (Optional)
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={row.quantity}
                        onChange={(e) => updateRow(index, { quantity: e.target.value })}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 text-xs font-mono font-bold bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary text-center placeholder:text-muted-foreground/40 placeholder:font-normal"
                      />
                    </div>

                    {/* Rack / Bin (4 cols) */}
                    <div className="sm:col-span-4">
                      <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
                        Destination Rack / Bin
                      </label>
                      <SearchableSelect
                        value={row.locationId || defaultLocationId}
                        onChange={(val) => updateRow(index, { locationId: val })}
                        options={locations.map((loc) => ({
                          value: loc.id,
                          label: loc.full_code,
                          badge: loc.location_type.replace(/_/g, " "),
                        }))}
                        placeholder="Rack/bin..."
                        searchable={locations.length > 5}
                        disabled={!hasStockEntered && !row.locationId}
                      />
                    </div>

                    {/* Optional Lot (5 cols) */}
                    {isLotTracked && (
                      <div className="sm:col-span-5 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 block mb-1">
                            Lot # (Opt)
                          </label>
                          <input
                            type="text"
                            placeholder="LOT-2026-X"
                            value={row.lotNumber}
                            onChange={(e) => updateRow(index, { lotNumber: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs font-mono bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 block mb-1">
                            Expiry (Opt)
                          </label>
                          <input
                            type="date"
                            value={row.expiryDate}
                            onChange={(e) => updateRow(index, { expiryDate: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                          />
                        </div>
                      </div>
                    )}
                  </div>
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
              onClick={handleAddRow}
              className="px-3.5 py-2 text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>+ Add Product Line</span>
            </button>

            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="font-bold text-foreground">
                {validProductsCount} {validProductsCount === 1 ? "product" : "products"} ready
              </span>
              {totalOpeningUnits > 0 && (
                <>
                  <span>•</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {totalOpeningUnits} opening units
                  </span>
                </>
              )}
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
              disabled={isSubmitting || validProductsCount === 0}
              className="px-5 py-2 text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating {validProductsCount} Products...</span>
                </>
              ) : (
                <>
                  <Package className="w-3.5 h-3.5" />
                  <span>
                    Create {validProductsCount > 0 ? `All ${validProductsCount} Products` : "Products"} into Catalog
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
