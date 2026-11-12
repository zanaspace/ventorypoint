"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateLocation } from "../actions";
import { Edit2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface EditLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: any | null;
  facilityId: string;
  onSuccess: (updatedLoc: any) => void;
}

export function EditLocationModal({
  isOpen,
  onClose,
  location,
  facilityId,
  onSuccess,
}: EditLocationModalProps) {
  const [fullCode, setFullCode] = useState("");
  const [shortPickCode, setShortPickCode] = useState("");
  const [humanPath, setHumanPath] = useState("");
  const [locationType, setLocationType] = useState("rack_pallet_position");
  const [areaCode, setAreaCode] = useState("");
  const [maxPallets, setMaxPallets] = useState(1);
  const [walkSequence, setWalkSequence] = useState(1);
  const [temperatureClass, setTemperatureClass] = useState("ambient");
  const [pickable, setPickable] = useState(true);
  const [sellable, setSellable] = useState(true);
  const [receivable, setReceivable] = useState(true);
  const [active, setActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (location) {
      setFullCode(location.full_code || "");
      setShortPickCode(location.short_pick_code || "");
      setHumanPath(location.human_path || "");
      setLocationType(location.location_type || "rack_pallet_position");
      setAreaCode(location.area_code || "");
      setMaxPallets(location.max_pallets ?? 1);
      setWalkSequence(location.walk_sequence ?? 1);
      setTemperatureClass(location.temperature_class || "ambient");
      setPickable(location.pickable ?? true);
      setSellable(location.sellable ?? true);
      setReceivable(location.receivable ?? true);
      setActive(location.active ?? true);
    }
  }, [location]);

  if (!location) return null;

  const isRenaming = fullCode.trim().toUpperCase() !== location.full_code;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = fullCode.trim().toUpperCase();
    if (!cleanCode) {
      toast.error("Location code cannot be empty");
      return;
    }

    if (cleanCode.includes("O")) {
      toast.error("Ambiguous character 'O' found; use '0' (zero) instead.");
      return;
    }

    setIsSubmitting(true);

    const updates = {
      full_code: cleanCode,
      barcode: cleanCode,
      short_pick_code: shortPickCode.trim() || undefined,
      human_path: humanPath.trim() || cleanCode.replace(/-/g, " › "),
      location_type: locationType as any,
      area_code: areaCode.trim().toUpperCase() || undefined,
      max_pallets: Number(maxPallets) || 1,
      walk_sequence: Number(walkSequence) || 1,
      temperature_class: temperatureClass as any,
      pickable,
      sellable,
      receivable,
      active,
    };

    const res = await updateLocation(location.id, facilityId, updates);
    setIsSubmitting(false);

    if (!res.success) {
      toast.error(res.error || "Failed to update location");
      return;
    }

    toast.success(
      isRenaming
        ? `Location renamed to ${cleanCode}. Old code '${location.full_code}' will resolve for 90 days.`
        : `Location ${cleanCode} updated successfully.`
    );

    onSuccess({ ...location, ...updates });
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit Location: ${location.full_code}`} maxWidth="max-w-lg">
      <form onSubmit={handleSave} className="p-6 space-y-4">
        {/* Code Field */}
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1">
            Location Code (Barcode Identifier)
          </label>
          <input
            required
            value={fullCode}
            onChange={(e) => setFullCode(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 text-xs font-mono font-bold border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
          />
          {isRenaming && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 mt-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Renaming this location will preserve the old code as a 90-day scannable alias.
            </p>
          )}
        </div>

        {/* Short Pick Code & Breadcrumbs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Floor Pick Code (Short Alias)
            </label>
            <input
              value={shortPickCode}
              onChange={(e) => setShortPickCode(e.target.value)}
              placeholder="e.g. A01-01-1-01"
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">
              Zone / Area Code
            </label>
            <input
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value.toUpperCase())}
              placeholder="e.g. ZA"
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
        </div>

        {/* Human Path */}
        <div>
          <label className="text-xs font-semibold text-foreground block mb-1">
            Human-Readable Breadcrumb Path
          </label>
          <input
            value={humanPath}
            onChange={(e) => setHumanPath(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
          />
        </div>

        {/* Storage Type & Temperature */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Storage Type</label>
            <SearchableSelect
              value={locationType}
              onChange={(v) => setLocationType(v)}
              options={[
                { value: "rack_pallet_position", label: "Pallet Racking (Heavy)" },
                { value: "shelf_bin", label: "Shelf Bin / Small Parts" },
                { value: "floor_grid_cell", label: "Floor Grid Cell" },
                { value: "bulk_floor_lane", label: "Bulk Storage Lane" },
                { value: "special_area", label: "Special Area (Cage, Dock, Cart)" },
              ]}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Temperature Class</label>
            <SearchableSelect
              value={temperatureClass}
              onChange={(v) => setTemperatureClass(v)}
              options={[
                { value: "ambient", label: "Ambient (Standard)" },
                { value: "chilled", label: "Chilled (+2°C to +8°C)" },
                { value: "frozen", label: "Frozen (-18°C)" },
                { value: "deep_freeze", label: "Deep Freeze (-25°C)" },
              ]}
            />
          </div>
        </div>

        {/* Capacity & Walk Sequence */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Walk Sequence Routing #</label>
            <input
              type="number"
              min={0}
              value={walkSequence}
              onChange={(e) => setWalkSequence(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
          </div>
        </div>

        {/* Operational Flags */}
        <div className="pt-2 border-t border-border">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
            Operations Allowed & Status
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={pickable}
                onChange={(e) => setPickable(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand cursor-pointer"
              />
              Pickable
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={sellable}
                onChange={(e) => setSellable(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand cursor-pointer"
              />
              Sellable
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={receivable}
                onChange={(e) => setReceivable(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand cursor-pointer"
              />
              Receivable
            </label>
            <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-border text-brand focus:ring-brand cursor-pointer"
              />
              Active
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
            <Save className="w-3.5 h-3.5" />
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
