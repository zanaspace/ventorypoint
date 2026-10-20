"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { bulkInsertLocations } from "../actions";
import { GeneratedLocation } from "@/lib/locations/range-generator";
import { Plus, Tag, MapPin, Thermometer, Check } from "lucide-react";
import { toast } from "sonner";

interface CreateLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  facility: { id: string; name: string; short_code: string; organization_id: string };
  onSuccess: () => void;
}

export function CreateLocationModal({ isOpen, onClose, facility, onSuccess }: CreateLocationModalProps) {
  const [locationType, setLocationType] = useState<
    "rack_pallet_position" | "shelf_bin" | "floor_grid_cell" | "bulk_floor_lane" | "special_area"
  >("rack_pallet_position");
  const [subType, setSubType] = useState("standard");
  const [fullCode, setFullCode] = useState(`${facility.short_code}-W1-ZA-A01-B01-L1-P01`);
  const [shortPickCode, setShortPickCode] = useState("");
  const [humanPath, setHumanPath] = useState(`${facility.name} › Wing 1 › Area A`);
  const [areaCode, setAreaCode] = useState("ZA");
  const [maxPallets, setMaxPallets] = useState(1);
  const [temperatureClass, setTemperatureClass] = useState<"ambient" | "chilled" | "frozen" | "deep_freeze">("ambient");
  const [pickable, setPickable] = useState(true);
  const [sellable, setSellable] = useState(true);
  const [receivable, setReceivable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleTypeChange(val: string) {
    const t = val as any;
    setLocationType(t);
    if (t === "special_area") {
      setSubType("pack_station");
      setFullCode(`${facility.short_code}-W1-PACK-01`);
      setHumanPath(`${facility.name} › Wing 1 › Packing Station 01`);
    } else if (t === "floor_grid_cell") {
      setSubType("standard");
      setFullCode(`${facility.short_code}-W1-FLR-R01-C01`);
      setHumanPath(`${facility.name} › Wing 1 › Floor Grid Row 01 Col 01`);
      setMaxPallets(4);
    } else if (t === "bulk_floor_lane") {
      setSubType("standard");
      setFullCode(`${facility.short_code}-W1-BLK-LN01-S01`);
      setHumanPath(`${facility.name} › Wing 1 › Bulk Lane 01 Slot 01`);
    } else {
      setSubType("standard");
      setFullCode(`${facility.short_code}-W1-ZA-A01-B01-L1-P01`);
      setHumanPath(`${facility.name} › Wing 1 › Area A › Aisle 01`);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = fullCode.trim().toUpperCase();
    if (!cleanCode) {
      toast.error("Location code is required");
      return;
    }

    // Check for ambiguous lookalike character 'O'
    if (cleanCode.includes("O")) {
      toast.error("Location code contains 'O'. Use '0' (zero) instead to prevent barcode scanning errors.");
      return;
    }

    setIsSubmitting(true);

    const payload: GeneratedLocation = {
      organization_id: facility.organization_id,
      facility_id: facility.id,
      full_code: cleanCode,
      barcode: cleanCode,
      short_pick_code: shortPickCode.trim() || undefined,
      human_path: humanPath.trim() || cleanCode.replace(/-/g, " › "),
      location_type: locationType,
      sub_type: subType,
      area_code: areaCode.trim().toUpperCase() || undefined,
      max_pallets: Number(maxPallets) || 1,
      max_stack_height: 1,
      temperature_class: temperatureClass,
      security_level: subType === "cage" ? "caged_vault" : "standard",
      mixed_sku_allowed: locationType === "shelf_bin" || locationType === "special_area",
      mixed_lot_allowed: locationType === "shelf_bin" || locationType === "special_area",
      pickable,
      sellable,
      receivable,
      active: true,
      rack_side: "none",
      walk_sequence: 1,
    };

    const res = await bulkInsertLocations(facility.id, [payload]);
    setIsSubmitting(false);

    if (!res.success) {
      toast.error(res.error || "Failed to create location");
      return;
    }

    toast.success(`Location ${cleanCode} created successfully!`);
    onSuccess();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Custom Location" maxWidth="max-w-lg">
      <form onSubmit={handleCreate} className="p-6 space-y-4">
        {/* Storage Type */}
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1">Storage Type</label>
          <SearchableSelect
            value={locationType}
            onChange={handleTypeChange}
            options={[
              { value: "rack_pallet_position", label: "Pallet Racking (Heavy Pallet Position)" },
              { value: "shelf_bin", label: "Shelf Bin / Pick Slot" },
              { value: "floor_grid_cell", label: "Floor Grid Cell (Rxx-Cxx)" },
              { value: "bulk_floor_lane", label: "Bulk Deep Storage Lane" },
              { value: "special_area", label: "Special Area (Cage, Dock, Pack Station, Cart)" },
            ]}
          />
        </div>

        {/* If Special Area: Category */}
        {locationType === "special_area" && (
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Special Area Category</label>
            <SearchableSelect
              value={subType}
              onChange={(v) => {
                setSubType(v);
                setFullCode(`${facility.short_code}-W1-${v.toUpperCase()}-01`);
              }}
              options={[
                { value: "pack_station", label: "Packing Station Table" },
                { value: "returns", label: "Returns Inspection Area" },
                { value: "quarantine", label: "Quarantine / Hold Area" },
                { value: "dock_door", label: "Loading Dock Door" },
                { value: "staging_lane", label: "Staging Bay" },
                { value: "cage", label: "High-Security Vault / Cage" },
                { value: "cold_room", label: "Cold Storage Room" },
                { value: "mobile_cart", label: "Mobile Picking Cart" },
              ]}
            />
          </div>
        )}

        {/* Location Code */}
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1">
            Exact Location Code (Barcode payload)
          </label>
          <input
            required
            value={fullCode}
            onChange={(e) => setFullCode(e.target.value.toUpperCase())}
            placeholder={`e.g. ${facility.short_code}-W1-ZA-A01-B01-L1-P01`}
            className="w-full px-3 py-2 text-xs font-mono font-bold border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
          />
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Uppercase letters, numbers, and hyphens. Avoid letter &apos;O&apos; (use digit &apos;0&apos;).
          </p>
        </div>

        {/* Path / Description */}
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1">
            Human-Readable Breadcrumb Path
          </label>
          <input
            value={humanPath}
            onChange={(e) => setHumanPath(e.target.value)}
            placeholder="e.g. Dallas 1 › Wing 1 › Area A › Packing Table 01"
            className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
          />
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Zone / Area Code</label>
            <input
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.toUpperCase())}
              placeholder="e.g. ZA"
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Max Pallets Capacity</label>
            <input
              type="number"
              min={0}
              value={maxPallets}
              onChange={(e) => setMaxPallets(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
        </div>

        {/* Temperature Class */}
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1">Temperature Class</label>
          <SearchableSelect
            value={temperatureClass}
            onChange={(v) => setTemperatureClass(v as any)}
            options={[
              { value: "ambient", label: "Ambient (Standard Warehouse)" },
              { value: "chilled", label: "Chilled (+2°C to +8°C)" },
              { value: "frozen", label: "Frozen (-18°C)" },
              { value: "deep_freeze", label: "Deep Freeze (-25°C)" },
            ]}
          />
        </div>

        {/* Operational Flags */}
        <div className="pt-2 border-t border-border">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
            Operations Allowed
          </span>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={pickable}
                onChange={(e) => setPickable(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand cursor-pointer"
              />
              Pickable
            </label>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={sellable}
                onChange={(e) => setSellable(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand cursor-pointer"
              />
              Sellable
            </label>
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={receivable}
                onChange={(e) => setReceivable(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand cursor-pointer"
              />
              Receivable
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md border border-input text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !fullCode.trim()}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-all disabled:opacity-40 cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            {isSubmitting ? "Saving..." : "Create Location"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
