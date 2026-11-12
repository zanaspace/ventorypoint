"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateSkuAction, getSkuStockSummaryAction } from "../actions";
import { Sku } from "@/lib/types/catalog";
import { toast } from "sonner";
import {
  Save,
  Package,
  Sliders,
  Barcode,
  Boxes,
  Loader2,
  MapPin,
  Plus,
} from "lucide-react";
import {
  getFacilityLocationsAction,
  FacilityLocationOption,
} from "@/app/dashboard/inventory/actions";

interface EditSkuModalProps {
  isOpen: boolean;
  onClose: () => void;
  sku: Sku | null;
  facilities?: { id: string; name: string; short_code: string }[];
  onSuccess: () => void;
}

export function EditSkuModal({
  isOpen,
  onClose,
  sku,
  facilities = [],
  onSuccess,
}: EditSkuModalProps) {
  if (!sku) return null;

  const eachUom = sku.uoms?.find((u) => u.uom_level === "each");
  const primaryBarcode =
    sku.barcodes?.find((b) => b.is_primary)?.barcode || sku.barcodes?.[0]?.barcode || "";

  const [activeTab, setActiveTab] = useState<"general" | "advanced">("general");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState(sku.name);
  const [description, setDescription] = useState(sku.description || "");
  const [category, setCategory] = useState(sku.category || "");
  const [brand, setBrand] = useState(sku.brand || "");
  const [status, setStatus] = useState<string>(sku.status);

  // Tracking & Rotation
  const [trackingClass, setTrackingClass] = useState<string>(sku.tracking_class);
  const [rotationRule, setRotationRule] = useState<string>(sku.rotation_rule);
  const [expiryRequired, setExpiryRequired] = useState(sku.expiry_required);
  const [shelfLifeDays, setShelfLifeDays] = useState<string>(
    sku.shelf_life_days ? String(sku.shelf_life_days) : ""
  );
  const [minShelfLifeReceiptDays, setMinShelfLifeReceiptDays] = useState<string>(
    sku.min_shelf_life_receipt_days ? String(sku.min_shelf_life_receipt_days) : ""
  );

  // Dimensions & Barcodes
  const [barcode, setBarcode] = useState(primaryBarcode);
  const [barcodeType, setBarcodeType] = useState("upc");
  const [weightKg, setWeightKg] = useState<string>(
    eachUom?.weight_kg ? String(eachUom.weight_kg) : ""
  );
  const [lengthCm, setLengthCm] = useState<string>(
    eachUom?.length_cm ? String(eachUom.length_cm) : ""
  );
  const [widthCm, setWidthCm] = useState<string>(
    eachUom?.width_cm ? String(eachUom.width_cm) : ""
  );
  const [heightCm, setHeightCm] = useState<string>(
    eachUom?.height_cm ? String(eachUom.height_cm) : ""
  );

  // Storage & Safety
  const [temperatureClass, setTemperatureClass] = useState<string>(sku.temperature_class);
  const [hazmatClass, setHazmatClass] = useState(sku.hazmat_class || "");
  const [fragile, setFragile] = useState(sku.fragile);

  // Live Inventory Stock State
  const [stockSummary, setStockSummary] = useState<{
    totalQty: number;
    balances: any[];
  } | null>(null);
  const [isLoadingStock, setIsLoadingStock] = useState(false);

  const [hasAddStock, setHasAddStock] = useState(false);
  const [stockFacilityId, setStockFacilityId] = useState(facilities[0]?.id || "");
  const [stockLocationId, setStockLocationId] = useState("");
  const [stockQuantity, setStockQuantity] = useState("");
  const [stockContainerLpn, setStockContainerLpn] = useState("");
  const [stockLotNumber, setStockLotNumber] = useState("");
  const [stockExpiryDate, setStockExpiryDate] = useState("");
  const [locations, setLocations] = useState<FacilityLocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  // Fetch current on-hand inventory balances for this SKU
  useEffect(() => {
    if (!isOpen || !sku?.id) return;
    let isMounted = true;
    setIsLoadingStock(true);
    getSkuStockSummaryAction(sku.id)
      .then((res) => {
        if (isMounted) {
          setStockSummary(res);
          setIsLoadingStock(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingStock(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, sku?.id]);

  useEffect(() => {
    if (facilities && facilities.length > 0 && !stockFacilityId) {
      setStockFacilityId(facilities[0].id);
    }
  }, [facilities, stockFacilityId]);

  // Load locations when adding stock
  useEffect(() => {
    if (!isOpen || !hasAddStock || !stockFacilityId) return;

    let isMounted = true;
    setIsLoadingLocations(true);
    getFacilityLocationsAction(stockFacilityId)
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
  }, [isOpen, hasAddStock, stockFacilityId]);

  function handleRotationChange(v: string) {
    setRotationRule(v);
    if (v === "fefo") setExpiryRequired(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (hasAddStock) {
      const qty = parseFloat(stockQuantity);
      if (isNaN(qty) || qty <= 0) {
        toast.error("Please enter a valid stock quantity to add (> 0).");
        return;
      }
      if (!stockFacilityId) {
        toast.error("Please select a warehouse facility for the new stock.");
        return;
      }
      if (!stockLocationId.trim()) {
        toast.error("Please select a destination rack/bin location for the new stock.");
        return;
      }
    }

    setIsSubmitting(true);

    const res = await updateSkuAction(sku!.id, {
      name,
      description,
      category,
      brand,
      status,
      trackingClass,
      rotationRule,
      expiryRequired: rotationRule === "fefo" ? true : expiryRequired,
      shelfLifeDays: shelfLifeDays ? parseInt(shelfLifeDays, 10) : undefined,
      minShelfLifeReceiptDays: minShelfLifeReceiptDays ? parseInt(minShelfLifeReceiptDays, 10) : undefined,
      temperatureClass,
      hazmatClass,
      fragile,
      barcode,
      weightKg: weightKg ? parseFloat(weightKg) : undefined,
      lengthCm: lengthCm ? parseFloat(lengthCm) : undefined,
      widthCm: widthCm ? parseFloat(widthCm) : undefined,
      heightCm: heightCm ? parseFloat(heightCm) : undefined,
      addStock: hasAddStock
        ? {
            facilityId: stockFacilityId,
            locationId: stockLocationId.trim(),
            quantity: parseFloat(stockQuantity),
            containerLpn: stockContainerLpn.trim() || undefined,
            lotNumber: stockLotNumber.trim() || undefined,
            expiryDate: stockExpiryDate || undefined,
          }
        : undefined,
    });
    setIsSubmitting(false);

    if (!res.success) {
      toast.error(res.error || "Failed to update SKU");
      return;
    }

    if (hasAddStock) {
      toast.success(
        `SKU ${sku!.code} updated and ${stockQuantity} units received into inventory!`
      );
    } else {
      toast.success(`SKU ${sku!.code} updated successfully!`);
    }
    onSuccess();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Product: ${sku.name || sku.code} (${sku.code})`} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {/* Tab Headers */}
        <div className="flex border-b border-border gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === "general"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            General & Stock Intake
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("advanced")}
            className={`pb-2.5 px-3 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === "advanced"
                ? "border-primary text-primary font-bold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Advanced Specs
            <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Optional
            </span>
          </button>
        </div>

        {/* Tab 1: General Info, Stock on Hand & Live Intake */}
        {activeTab === "general" && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            {/* SKU Code & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">SKU Code (Read-Only)</label>
                <input
                  disabled
                  value={sku.code}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono font-bold bg-muted text-muted-foreground border border-border rounded-lg cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Catalog Status</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={status}
                    onChange={(v) => setStatus(v)}
                    options={[
                      { value: "active", label: "Active (Available for Operations)" },
                      { value: "inactive", label: "Inactive (Fulfillment Paused)" },
                      { value: "discontinued", label: "Discontinued (Phased Out)" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Product Title */}
            <div>
              <label className="text-xs font-semibold text-foreground">Product Title / Name *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            {/* Barcode & Format */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">Primary Barcode (Each)</label>
                <div className="relative mt-1">
                  <Barcode className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value.trim())}
                    placeholder="Scan or enter barcode"
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Barcode Format</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={barcodeType}
                    onChange={(v) => setBarcodeType(v)}
                    options={[
                      { value: "upc", label: "UPC-A (12-digit)" },
                      { value: "ean", label: "EAN-13" },
                      { value: "code128", label: "Code 128" },
                      { value: "gtin14", label: "GTIN-14" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Tracking Class & Rotation Rule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-foreground">Tracking Class</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={trackingClass}
                    onChange={(v) => setTrackingClass(v)}
                    options={[
                      { value: "non_unique", label: "Non-Unique (Standard Quantity)" },
                      { value: "lot", label: "Lot / Batch-Controlled" },
                      { value: "serial", label: "Unique / Serialized (IMEI / Serial)" },
                      { value: "lot_serial", label: "Lot + Serial Controlled" },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Rotation Rule</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={rotationRule}
                    onChange={handleRotationChange}
                    options={[
                      { value: "fifo", label: "FIFO (First-In, First-Out)" },
                      { value: "fefo", label: "FEFO (First-Expired, First-Out)" },
                      { value: "lifo", label: "LIFO (Last-In, First-Out)" },
                      { value: "customer_lot", label: "Customer-Specified Lot" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Shelf Life Rules */}
            <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-foreground">
                  <input
                    type="checkbox"
                    checked={expiryRequired}
                    disabled={rotationRule === "fefo"}
                    onChange={(e) => setExpiryRequired(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary cursor-pointer"
                  />
                  Expiry Date Required at Receipt
                </label>
                {rotationRule === "fefo" && (
                  <span className="text-[10px] text-primary font-bold uppercase tracking-wide">
                    Enforced by FEFO
                  </span>
                )}
              </div>

              {(expiryRequired || rotationRule === "fefo") && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      Total Shelf Life (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={shelfLifeDays}
                      onChange={(e) => setShelfLifeDays(e.target.value)}
                      placeholder="e.g. 730"
                      className="w-full px-3 py-1.5 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">
                      Min Days Remaining at Receipt
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={minShelfLifeReceiptDays}
                      onChange={(e) => setMinShelfLifeReceiptDays(e.target.value)}
                      placeholder="e.g. 180"
                      className="w-full px-3 py-1.5 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Live Physical Stock & Add Quantity Section */}
            <div className="pt-2 border-t border-border">
              <div
                className={`p-3.5 rounded-xl border transition-all ${
                  hasAddStock
                    ? "bg-primary/[0.04] border-primary/30"
                    : "bg-muted/20 border-border hover:border-primary/20"
                } space-y-3`}
              >
                {/* Stock on Hand Status */}
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <Boxes className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">Physical Stock on Hand</span>
                  </div>
                  {isLoadingStock ? (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-primary" /> Checking balances...
                    </span>
                  ) : stockSummary && stockSummary.totalQty > 0 ? (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {stockSummary.totalQty} units on hand
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      0 units (Out of Stock / No Inventory Recorded)
                    </span>
                  )}
                </div>

                {/* Add Stock Toggle */}
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      id="enableAddStock"
                      checked={hasAddStock}
                      onChange={(e) => setHasAddStock(e.target.checked)}
                      className="mt-0.5 rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground block">
                        + Add / Receive Physical Stock for this SKU
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        Record on-hand inventory into a warehouse facility and rack location now.
                      </span>
                    </div>
                  </label>
                  {hasAddStock && (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Plus className="w-3 h-3" />
                      Receiving
                    </span>
                  )}
                </div>

                {/* Form fields when Add Stock is active */}
                {hasAddStock && (
                  <div className="space-y-3 pt-2.5 border-t border-border/80 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Facility Selection */}
                      <div>
                        <label className="text-xs font-semibold text-foreground">Warehouse Facility *</label>
                        <div className="mt-1">
                          <SearchableSelect
                            value={stockFacilityId}
                            onChange={(v) => setStockFacilityId(v)}
                            options={facilities.map((f) => ({
                              value: f.id,
                              label: `${f.name} (${f.short_code})`,
                            }))}
                            searchable={facilities.length > 5}
                          />
                        </div>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="text-xs font-semibold text-foreground">Quantity to Add *</label>
                        <input
                          type="number"
                          min="1"
                          step="any"
                          required={hasAddStock}
                          value={stockQuantity}
                          onChange={(e) => setStockQuantity(e.target.value)}
                          placeholder="0"
                          className="mt-1 w-full px-3 py-2 text-xs font-mono font-bold border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none placeholder:text-muted-foreground/40 placeholder:font-normal"
                        />
                      </div>
                    </div>

                    {/* Destination Location */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">
                          Destination Rack / Bin Location *
                        </label>
                        {isLoadingLocations && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" /> Loading racks...
                          </span>
                        )}
                      </div>
                      <div className="mt-1">
                        <SearchableSelect
                          value={stockLocationId}
                          onChange={(v) => setStockLocationId(v)}
                          placeholder={
                            isLoadingLocations
                              ? "Loading facility locations..."
                              : locations.length === 0
                              ? "No locations found (type custom code or barcode)..."
                              : "Search rack, aisle, bay, or location code..."
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
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Select the rack, floor grid, or staging area where these goods are deposited.
                      </p>
                    </div>

                    {/* Optional Pallet LPN */}
                    <div>
                      <label className="text-xs font-semibold text-foreground">Pallet / Container LPN (Optional)</label>
                      <input
                        value={stockContainerLpn}
                        onChange={(e) => setStockContainerLpn(e.target.value)}
                        placeholder="e.g. LPN-614467 (or leave blank if stored loose on shelf)"
                        className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                      />
                    </div>

                    {/* Optional Lot & Expiry if Lot Tracked or FEFO */}
                    {(trackingClass === "lot" || trackingClass === "lot_serial" || rotationRule === "fefo") && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-background rounded-lg border border-border">
                        <div>
                          <label className="text-xs font-semibold text-foreground">Lot / Batch Number *</label>
                          <input
                            required={hasAddStock && rotationRule === "fefo"}
                            value={stockLotNumber}
                            onChange={(e) => setStockLotNumber(e.target.value)}
                            placeholder="e.g. BATCH-2026-OCT"
                            className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground">Expiration Date</label>
                          <input
                            type="date"
                            required={hasAddStock && rotationRule === "fefo"}
                            value={stockExpiryDate}
                            onChange={(e) => setStockExpiryDate(e.target.value)}
                            className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Advanced Specifications (Optional) */}
        {activeTab === "advanced" && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Brand / Vendor</label>
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Category</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground">Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none resize-none"
              />
            </div>

            {/* Physical Dimensions */}
            <div className="p-3 bg-muted/30 rounded-xl border border-border space-y-2.5">
              <span className="text-xs font-semibold text-foreground block">
                Unit Physical Dimensions & Weight (Each)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none text-center"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                    Length (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={lengthCm}
                    onChange={(e) => setLengthCm(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none text-center"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                    Width (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={widthCm}
                    onChange={(e) => setWidthCm(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none text-center"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none text-center"
                  />
                </div>
              </div>
            </div>

            {/* Storage & Safety */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Temperature Class</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={temperatureClass}
                    onChange={(v) => setTemperatureClass(v)}
                    options={[
                      { value: "ambient", label: "Ambient (Standard Room Temp)" },
                      { value: "chilled", label: "Chilled / Refrigerated (2°C to 8°C)" },
                      { value: "frozen", label: "Frozen (-18°C)" },
                      { value: "deep_freeze", label: "Deep Freeze (-25°C or colder)" },
                      { value: "temperature_controlled", label: "Temperature Controlled (15°C to 25°C)" },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Hazmat Class</label>
                <input
                  value={hazmatClass}
                  onChange={(e) => setHazmatClass(e.target.value)}
                  placeholder="e.g. UN3481"
                  className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={fragile}
                onChange={(e) => setFragile(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
              Fragile Item (Requires Special Cushioning / Bubble Wrap at Packing)
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md border border-input text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-all disabled:opacity-40 cursor-pointer shadow-sm"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
