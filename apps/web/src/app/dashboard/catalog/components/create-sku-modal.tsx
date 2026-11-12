"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createSkuAction } from "../actions";
import { toast } from "sonner";
import {
  Plus,
  Package,
  Barcode,
  Sliders,
  Boxes,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  getFacilityLocationsAction,
  FacilityLocationOption,
} from "@/app/dashboard/inventory/actions";

/**
 * Automatically creates a clean, standardized, uppercase SKU code from a product name.
 * e.g. "Noodles" -> "NOODLES"
 * e.g. "Indomie Instant Noodles (70g)" -> "INDOMIE-INSTANT-NOODLES-70G"
 * e.g. "Royal Basmati Rice 10kg" -> "ROYAL-BASMATI-RICE-10KG"
 */
export function generateSkuFromName(name: string): string {
  if (!name || !name.trim()) return "";
  const stopWords = new Set([
    "a", "an", "the", "and", "or", "of", "with", "for", "in", "on", "at", "by", "to", "from"
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

interface CreateSkuModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: { id: string; name: string; short_code: string }[];
  facilities?: { id: string; name: string; short_code: string }[];
  organizationId: string;
  defaultClientId?: string;
  onSuccess: () => void;
}

export function CreateSkuModal({
  isOpen,
  onClose,
  clients,
  facilities = [],
  organizationId,
  defaultClientId,
  onSuccess,
}: CreateSkuModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "advanced">("general");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [clientId, setClientId] = useState(defaultClientId || (clients[0]?.id || ""));
  const [code, setCode] = useState("");
  const [isSkuCustomized, setIsSkuCustomized] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");

  function handleNameChange(newName: string) {
    setName(newName);
    if (!isSkuCustomized) {
      setCode(generateSkuFromName(newName));
    }
  }

  function handleCodeChange(newCode: string) {
    const uppercase = newCode.toUpperCase();
    setCode(uppercase);
    if (uppercase.trim() === "") {
      // If user clears the field, resume auto-generation when typing product name
      setIsSkuCustomized(false);
    } else {
      setIsSkuCustomized(true);
    }
  }

  function handleRegenerateSku() {
    const generated = generateSkuFromName(name);
    setCode(generated);
    setIsSkuCustomized(false);
  }

  // Initial Stock State
  const [hasInitialStock, setHasInitialStock] = useState(false);
  const [initialFacilityId, setInitialFacilityId] = useState(facilities[0]?.id || "");
  const [initialLocationId, setInitialLocationId] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("");
  const [initialContainerLpn, setInitialContainerLpn] = useState("");
  const [initialLotNumber, setInitialLotNumber] = useState("");
  const [initialExpiryDate, setInitialExpiryDate] = useState("");
  const [locations, setLocations] = useState<FacilityLocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  useEffect(() => {
    if (facilities && facilities.length > 0 && !initialFacilityId) {
      setInitialFacilityId(facilities[0].id);
    }
  }, [facilities, initialFacilityId]);

  useEffect(() => {
    if (!isOpen || !hasInitialStock || !initialFacilityId) return;

    let isMounted = true;
    setIsLoadingLocations(true);
    getFacilityLocationsAction(initialFacilityId)
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
  }, [isOpen, hasInitialStock, initialFacilityId]);

  // Tracking & Rotation
  const [trackingClass, setTrackingClass] = useState<string>("non_unique");
  const [serialSource, setSerialSource] = useState<string>("manufacturer");
  const [serialCapturePoint, setSerialCapturePoint] = useState<string>("receipt");
  const [rotationRule, setRotationRule] = useState<string>("fifo");
  const [expiryRequired, setExpiryRequired] = useState(false);
  const [shelfLifeDays, setShelfLifeDays] = useState<string>("");
  const [minShelfLifeReceiptDays, setMinShelfLifeReceiptDays] = useState<string>("");

  // Dimensions & Barcodes
  const [barcode, setBarcode] = useState("");
  const [barcodeType, setBarcodeType] = useState("upc");
  const [weightKg, setWeightKg] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");

  // Storage & Safety
  const [temperatureClass, setTemperatureClass] = useState("ambient");
  const [hazmatClass, setHazmatClass] = useState("");
  const [fragile, setFragile] = useState(false);
  const [countryOfOrigin, setCountryOfOrigin] = useState("US");
  const [hsCode, setHsCode] = useState("");

  // Auto-enforce FEFO requirements
  function handleRotationChange(v: string) {
    setRotationRule(v);
    if (v === "fefo") {
      setExpiryRequired(true);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      toast.error("Please select a brand client");
      return;
    }
    if (!code.trim()) {
      toast.error("SKU Code is required");
      return;
    }
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }

    if (hasInitialStock) {
      const qty = parseFloat(initialQuantity);
      if (isNaN(qty) || qty <= 0) {
        toast.error("Please enter a valid initial stock quantity (> 0).");
        setActiveTab("general");
        return;
      }
      if (!initialFacilityId) {
        toast.error("Please select a warehouse facility for initial stock.");
        setActiveTab("general");
        return;
      }
      if (!initialLocationId.trim()) {
        toast.error("Please select a destination rack/bin location for initial stock.");
        setActiveTab("general");
        return;
      }
    }

    setIsSubmitting(true);
    const res = await createSkuAction({
      organizationId,
      clientId,
      code,
      name,
      description,
      category,
      brand,
      trackingClass,
      serialSource,
      serialCapturePoint,
      rotationRule,
      expiryRequired: rotationRule === "fefo" ? true : expiryRequired,
      shelfLifeDays: shelfLifeDays ? parseInt(shelfLifeDays, 10) : undefined,
      minShelfLifeReceiptDays: minShelfLifeReceiptDays ? parseInt(minShelfLifeReceiptDays, 10) : undefined,
      temperatureClass,
      hazmatClass,
      fragile,
      countryOfOrigin,
      hsCode,
      barcode,
      barcodeType,
      weightKg: weightKg ? parseFloat(weightKg) : undefined,
      lengthCm: lengthCm ? parseFloat(lengthCm) : undefined,
      widthCm: widthCm ? parseFloat(widthCm) : undefined,
      heightCm: heightCm ? parseFloat(heightCm) : undefined,
      initialStock: hasInitialStock
        ? {
            facilityId: initialFacilityId,
            locationId: initialLocationId.trim(),
            quantity: parseFloat(initialQuantity),
            containerLpn: initialContainerLpn.trim() || undefined,
            lotNumber: initialLotNumber.trim() || undefined,
            expiryDate: initialExpiryDate || undefined,
          }
        : undefined,
    });
    setIsSubmitting(false);

    if (!res.success) {
      toast.error(res.error || "Failed to create SKU");
      return;
    }

    if (hasInitialStock) {
      toast.success(
        `SKU ${code.toUpperCase()} created and ${initialQuantity} units received into inventory!`
      );
    } else {
      toast.success(`SKU ${code.toUpperCase()} created successfully!`);
    }
    onSuccess();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Product SKU" maxWidth="max-w-2xl">
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

        {/* Tab 1: General Info, Barcode, Tracking Rules & Initial Stock */}
        {activeTab === "general" && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            {/* Identity & Product Info */}
            <div>
              <label className="text-xs font-semibold text-foreground">Brand Client *</label>
              <div className="mt-1">
                <SearchableSelect
                  value={clientId}
                  onChange={(v) => setClientId(v)}
                  options={clients.map((c) => ({ value: c.id, label: `${c.name} (${c.short_code})` }))}
                />
              </div>
            </div>

            {/* Product Title */}
            <div>
              <label className="text-xs font-semibold text-foreground">Product Title / Name *</label>
              <input
                required
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Indomie Instant Noodles (70g) or Royal Basmati Rice 10kg"
                className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            {/* SKU Code (Auto-generated from title, fully editable) */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">SKU Code *</label>
                {name.trim() && (
                  <button
                    type="button"
                    onClick={handleRegenerateSku}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer transition-colors"
                    title="Re-generate SKU code from product title"
                  >
                    <Sparkles className="w-3 h-3 text-primary" />
                    {isSkuCustomized ? "Re-sync with title" : "Auto-synced"}
                  </button>
                )}
              </div>
              <div className="relative mt-1">
                <input
                  required
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  placeholder={name.trim() ? generateSkuFromName(name) || "e.g. NOODLES-70G" : "Auto-created as you type title..."}
                  className="w-full px-3 py-2 text-xs font-mono font-bold uppercase border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {isSkuCustomized
                  ? "Custom SKU entered. Click 'Re-sync with title' to regenerate from product name."
                  : "Auto-created from product title. You can freely edit or customize it."}
              </p>
            </div>

            {/* Barcode & Format */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-foreground">Barcode / EAN / UPC</label>
                <div className="relative mt-1">
                  <Barcode className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value.trim())}
                    placeholder="Scan or enter barcode (e.g. 501234567890)"
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
                      { value: "gtin14", label: "GTIN-14 (Case)" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Tracking & Rotation Rules */}
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

            {/* Serial Settings if Serial Tracking selected */}
            {(trackingClass === "serial" || trackingClass === "lot_serial") && (
              <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 space-y-2.5">
                <span className="text-[11px] font-bold text-primary uppercase block tracking-wider">
                  Serialization Settings
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-muted-foreground block text-[11px] mb-1">Serial Source</label>
                    <SearchableSelect
                      value={serialSource}
                      onChange={(v) => setSerialSource(v)}
                      options={[
                        { value: "manufacturer", label: "Manufacturer Serial / IMEI" },
                        { value: "generated", label: "System-Generated Unique ID" },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="text-muted-foreground block text-[11px] mb-1">Capture Point</label>
                    <SearchableSelect
                      value={serialCapturePoint}
                      onChange={(v) => setSerialCapturePoint(v)}
                      options={[
                        { value: "receipt", label: "At Inbound Receipt (Full Trace)" },
                        { value: "shipment", label: "At Outbound Shipment Only" },
                        { value: "both", label: "Both Inbound & Outbound" },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Expiry & Shelf Life Settings */}
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
                  Expiry Date Required at Inbound Receipt
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
                      placeholder="e.g. 730 (2 years)"
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
                      placeholder="e.g. 180 days"
                      className="w-full px-3 py-1.5 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Initial Opening Stock Section */}
            <div className="pt-2 border-t border-border">
              <div
                className={`p-3.5 rounded-xl border transition-all ${
                  hasInitialStock
                    ? "bg-primary/[0.04] border-primary/30"
                    : "bg-muted/20 border-border hover:border-primary/20"
                } space-y-3`}
              >
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      id="enableInitialStock"
                      checked={hasInitialStock}
                      onChange={(e) => setHasInitialStock(e.target.checked)}
                      className="mt-0.5 rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground block">
                        Record Initial Stock on Hand
                      </span>
                      <span className="text-[11px] text-muted-foreground block">
                        Have goods in the warehouse right now? Enter quantity and bin location to credit inventory ledger immediately.
                      </span>
                    </div>
                  </label>
                  {hasInitialStock && (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <Boxes className="w-3 h-3" />
                      Active
                    </span>
                  )}
                </div>

                {hasInitialStock && (
                  <div className="space-y-3 pt-2.5 border-t border-border/80 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Facility Selection */}
                      <div>
                        <label className="text-xs font-semibold text-foreground">Warehouse Facility *</label>
                        <div className="mt-1">
                          <SearchableSelect
                            value={initialFacilityId}
                            onChange={(v) => setInitialFacilityId(v)}
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
                        <label className="text-xs font-semibold text-foreground">Opening Quantity *</label>
                        <input
                          type="number"
                          min="1"
                          step="any"
                          required={hasInitialStock}
                          value={initialQuantity}
                          onChange={(e) => setInitialQuantity(e.target.value)}
                          placeholder="0"
                          className="mt-1 w-full px-3 py-2 text-xs font-mono font-bold border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none placeholder:text-muted-foreground/40 placeholder:font-normal"
                        />
                      </div>
                    </div>

                    {/* Location Selection with Searchable Combobox */}
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">Destination Rack / Bin Location *</label>
                        {isLoadingLocations && (
                          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" /> Loading racks...
                          </span>
                        )}
                      </div>
                      <div className="mt-1">
                        <SearchableSelect
                          value={initialLocationId}
                          onChange={(v) => setInitialLocationId(v)}
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
                        value={initialContainerLpn}
                        onChange={(e) => setInitialContainerLpn(e.target.value)}
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
                            required={hasInitialStock && rotationRule === "fefo"}
                            value={initialLotNumber}
                            onChange={(e) => setInitialLotNumber(e.target.value)}
                            placeholder="e.g. BATCH-2026-OCT"
                            className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground">Expiration Date</label>
                          <input
                            type="date"
                            required={hasInitialStock && rotationRule === "fefo"}
                            value={initialExpiryDate}
                            onChange={(e) => setInitialExpiryDate(e.target.value)}
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
            {/* Vendor & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Brand / Vendor</label>
                <input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. NatureVital"
                  className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Category</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Food & Grains"
                  className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-semibold text-foreground">Description & Warehousing Notes</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Product description, special warehousing handling notes, or allergen flags..."
                className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none resize-none"
              />
            </div>

            {/* Dimensions & Weight */}
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
                    placeholder="10.0"
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
                    placeholder="40.0"
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
                    placeholder="25.0"
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
                    placeholder="15.0"
                    className="w-full px-2.5 py-1.5 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none text-center"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Required for volumetric 3PL storage billing, cartonization, and carrier dimensional weight.
              </p>
            </div>

            {/* Storage, Hazmat & Customs */}
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
                <label className="text-xs font-semibold text-foreground">Hazmat / Dangerous Goods</label>
                <input
                  value={hazmatClass}
                  onChange={(e) => setHazmatClass(e.target.value)}
                  placeholder="e.g. UN3481 (Lithium Ion), ORM-D"
                  className="mt-1 w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground">Country of Origin</label>
                <input
                  value={countryOfOrigin}
                  onChange={(e) => setCountryOfOrigin(e.target.value.toUpperCase())}
                  placeholder="e.g. US, IN, CN"
                  maxLength={2}
                  className="mt-1 w-full px-3 py-2 text-xs uppercase font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Customs HS Code</label>
                <input
                  value={hsCode}
                  onChange={(e) => setHsCode(e.target.value)}
                  placeholder="e.g. 1006.30.00"
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
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
            <Plus className="w-4 h-4" />
            {isSubmitting ? "Creating..." : "Create Product SKU"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
