"use client";

import { useState, useMemo } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import {
  generateRackLocations,
  generateFloorGridLocations,
  generateBulkLaneLocations,
  generateSpecialAreaLocations,
  RangePreviewResult,
} from "@/lib/locations/range-generator";
import { bulkInsertLocations } from "../actions";
import { Layers, Grid, Database, ShieldAlert, Sparkles, ArrowRight } from "lucide-react";

interface GeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  facility: { id: string; name: string; short_code: string; organization_id: string };
  onSuccess: () => void;
}

export function GeneratorModal({ isOpen, onClose, facility, onSuccess }: GeneratorModalProps) {
  const [activeTab, setActiveTab] = useState<"rack" | "floor" | "bulk" | "special">("rack");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Rack generator state
  const [wingCode, setWingCode] = useState("W1");
  const [areaCode, setAreaCode] = useState("ZA");
  const [aisleStart, setAisleStart] = useState(1);
  const [aisleEnd, setAisleEnd] = useState(10);
  const [bayStart, setBayStart] = useState(1);
  const [bayEnd, setBayEnd] = useState(12);
  const [levelStart, setLevelStart] = useState(1);
  const [levelEnd, setLevelEnd] = useState(4);
  const [posStart, setPosStart] = useState(1);
  const [posEnd, setPosEnd] = useState(2);
  const [rackType, setRackType] = useState<"rack_pallet_position" | "shelf_bin">("rack_pallet_position");
  const [walkType, setWalkType] = useState<"serpentine" | "one_way">("serpentine");
  const [temperatureClass, setTemperatureClass] = useState<"ambient" | "chilled" | "frozen" | "deep_freeze">("ambient");

  // Floor grid state
  const [gridWing, setGridWing] = useState("W1");
  const [rowStart, setRowStart] = useState(1);
  const [rowEnd, setRowEnd] = useState(10);
  const [colStart, setColStart] = useState(1);
  const [colEnd, setColEnd] = useState(8);
  const [maxPalletsGrid, setMaxPalletsGrid] = useState(4);
  const [maxStackHeight, setMaxStackHeight] = useState(2);

  // Bulk lane state
  const [bulkWing, setBulkWing] = useState("W1");
  const [laneStart, setLaneStart] = useState(1);
  const [laneEnd, setLaneEnd] = useState(12);
  const [slotStart, setSlotStart] = useState(1);
  const [slotEnd, setSlotEnd] = useState(6);
  const [laneRotationRule, setLaneRotationRule] = useState<"fifo_drive_through" | "lifo_single_entry">("fifo_drive_through");

  // Special area state
  const [specialWing, setSpecialWing] = useState("W1");
  const [specialType, setSpecialType] = useState("cage");
  const [specialCount, setSpecialCount] = useState(4);

  // Live preview calculation
  const preview: RangePreviewResult = useMemo(() => {
    try {
      if (activeTab === "rack") {
        return generateRackLocations({
          organizationId: facility.organization_id,
          facilityId: facility.id,
          facilityCode: facility.short_code,
          facilityName: facility.name,
          wingCode,
          areaCode,
          aisleStart: Number(aisleStart),
          aisleEnd: Number(aisleEnd),
          bayStart: Number(bayStart),
          bayEnd: Number(bayEnd),
          levelStart: Number(levelStart),
          levelEnd: Number(levelEnd),
          posStart: Number(posStart),
          posEnd: Number(posEnd),
          locationType: rackType,
          walkType,
          temperatureClass,
          oddEvenSides: true,
        });
      }
      if (activeTab === "floor") {
        return generateFloorGridLocations({
          organizationId: facility.organization_id,
          facilityId: facility.id,
          facilityCode: facility.short_code,
          facilityName: facility.name,
          wingCode: gridWing,
          rowStart: Number(rowStart),
          rowEnd: Number(rowEnd),
          colStart: Number(colStart),
          colEnd: Number(colEnd),
          maxPallets: Number(maxPalletsGrid),
          maxStackHeight: Number(maxStackHeight),
        });
      }
      if (activeTab === "bulk") {
        return generateBulkLaneLocations({
          organizationId: facility.organization_id,
          facilityId: facility.id,
          facilityCode: facility.short_code,
          facilityName: facility.name,
          wingCode: bulkWing,
          laneStart: Number(laneStart),
          laneEnd: Number(laneEnd),
          slotStart: Number(slotStart),
          slotEnd: Number(slotEnd),
          laneRotationRule,
        });
      }
      return generateSpecialAreaLocations({
        organizationId: facility.organization_id,
        facilityId: facility.id,
        facilityCode: facility.short_code,
        facilityName: facility.name,
        wingCode: specialWing,
        subType: specialType,
        areaCode: specialType.slice(0, 4).toUpperCase(),
        count: Number(specialCount),
      });
    } catch {
      return { totalCount: 0, sampleFirst: [], sampleLast: [], locations: [] };
    }
  }, [
    activeTab,
    facility,
    wingCode,
    areaCode,
    aisleStart,
    aisleEnd,
    bayStart,
    bayEnd,
    levelStart,
    levelEnd,
    posStart,
    posEnd,
    rackType,
    walkType,
    temperatureClass,
    gridWing,
    rowStart,
    rowEnd,
    colStart,
    colEnd,
    maxPalletsGrid,
    maxStackHeight,
    bulkWing,
    laneStart,
    laneEnd,
    slotStart,
    slotEnd,
    laneRotationRule,
    specialWing,
    specialType,
    specialCount,
  ]);

  async function handleGenerate() {
    if (preview.totalCount === 0) {
      toast.error("No locations to generate.");
      return;
    }
    setIsSubmitting(true);
    const res = await bulkInsertLocations(facility.id, preview.locations);
    setIsSubmitting(false);

    if (!res.success) {
      toast.error(res.error || "Failed to generate locations.");
      return;
    }

    toast.success(`Generated ${res.inserted.toLocaleString()} locations successfully!`);
    onSuccess();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Bulk Location Range Generator" maxWidth="max-w-3xl">
      <div className="p-6 space-y-5">
        {/* Segmented Pill Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setActiveTab("rack")}
            className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "rack"
                ? "bg-white dark:bg-neutral-800 text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-brand" />
            <span>Pallet Racks</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("floor")}
            className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "floor"
                ? "bg-white dark:bg-neutral-800 text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Grid className="w-3.5 h-3.5 text-brand" />
            <span>Floor Grids</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("bulk")}
            className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "bulk"
                ? "bg-white dark:bg-neutral-800 text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Database className="w-3.5 h-3.5 text-brand" />
            <span>Bulk Lanes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("special")}
            className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeTab === "special"
                ? "bg-white dark:bg-neutral-800 text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-brand" />
            <span>Special Areas</span>
          </button>
        </div>

        {/* Tab 1: Pallet Racks & Shelving */}
        {activeTab === "rack" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="text-xs font-semibold text-foreground">Wing Code</label>
                <input
                  value={wingCode}
                  onChange={(e) => setWingCode(e.target.value.toUpperCase())}
                  placeholder="W1"
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Area / Zone Code</label>
                <input
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.toUpperCase())}
                  placeholder="ZA"
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Storage Type</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={rackType}
                    onChange={(v) => setRackType(v as any)}
                    options={[
                      { value: "rack_pallet_position", label: "Pallet Racking (Heavy)" },
                      { value: "shelf_bin", label: "Small-Parts Shelving (Bin)" },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Coordinates Card */}
            <div className="p-4 rounded-xl bg-gray-50/70 dark:bg-white/[0.02] border border-border space-y-2.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Rack Array Coordinates
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Aisles (Start – End)</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={aisleStart}
                      onChange={(e) => setAisleStart(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={aisleStart}
                      value={aisleEnd}
                      onChange={(e) => setAisleEnd(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Bays per Aisle</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={bayStart}
                      onChange={(e) => setBayStart(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={bayStart}
                      value={bayEnd}
                      onChange={(e) => setBayEnd(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Shelf Levels</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={levelStart}
                      onChange={(e) => setLevelStart(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={levelStart}
                      value={levelEnd}
                      onChange={(e) => setLevelEnd(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Positions / Level</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={posStart}
                      onChange={(e) => setPosStart(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={posStart}
                      value={posEnd}
                      onChange={(e) => setPosEnd(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Routing & Temp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-semibold text-foreground">Walk Routing Strategy</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={walkType}
                    onChange={(v) => setWalkType(v as any)}
                    options={[
                      { value: "serpentine", label: "Serpentine (Alternate aisle snake routing)" },
                      { value: "one_way", label: "One-Way Standard Aisle Flow" },
                    ]}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Temperature Class</label>
                <div className="mt-1">
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
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Floor Grid */}
        {activeTab === "floor" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="text-xs font-semibold text-foreground">Wing Code</label>
                <input
                  value={gridWing}
                  onChange={(e) => setGridWing(e.target.value.toUpperCase())}
                  placeholder="W1"
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Max Pallets Per Cell</label>
                <input
                  type="number"
                  min={1}
                  value={maxPalletsGrid}
                  onChange={(e) => setMaxPalletsGrid(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Max Stack Height</label>
                <input
                  type="number"
                  min={1}
                  value={maxStackHeight}
                  onChange={(e) => setMaxStackHeight(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50/70 dark:bg-white/[0.02] border border-border space-y-2.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Grid Matrix Bounds
              </span>
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Grid Rows (R01..RN)</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={rowStart}
                      onChange={(e) => setRowStart(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={rowStart}
                      value={rowEnd}
                      onChange={(e) => setRowEnd(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Grid Columns (C01..CM)</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={colStart}
                      onChange={(e) => setColStart(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={colStart}
                      value={colEnd}
                      onChange={(e) => setColEnd(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Bulk Lanes */}
        {activeTab === "bulk" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="text-xs font-semibold text-foreground">Wing Code</label>
                <input
                  value={bulkWing}
                  onChange={(e) => setBulkWing(e.target.value.toUpperCase())}
                  placeholder="W1"
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Lane Rotation Rule</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={laneRotationRule}
                    onChange={(v) => setLaneRotationRule(v as any)}
                    options={[
                      { value: "fifo_drive_through", label: "Drive-Through (FIFO-friendly)" },
                      { value: "lifo_single_entry", label: "Single-Entry Pushback (LIFO nature)" },
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-gray-50/70 dark:bg-white/[0.02] border border-border space-y-2.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                Lane Range & Slot Depth
              </span>
              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Lanes (LN01..LN)</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={laneStart}
                      onChange={(e) => setLaneStart(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={laneStart}
                      value={laneEnd}
                      onChange={(e) => setLaneEnd(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground">Slots Per Lane Depth</label>
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={slotStart}
                      onChange={(e) => setSlotStart(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                    <span className="text-muted-foreground">–</span>
                    <input
                      type="number"
                      min={slotStart}
                      value={slotEnd}
                      onChange={(e) => setSlotEnd(Number(e.target.value))}
                      className="w-full px-2 py-1.5 text-xs font-mono text-center border border-border rounded-md bg-background"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Special Areas */}
        {activeTab === "special" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="text-xs font-semibold text-foreground">Wing Code</label>
                <input
                  value={specialWing}
                  onChange={(e) => setSpecialWing(e.target.value.toUpperCase())}
                  placeholder="W1"
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Area Category</label>
                <div className="mt-1">
                  <SearchableSelect
                    value={specialType}
                    onChange={(v) => setSpecialType(v)}
                    options={[
                      { value: "cage", label: "Secure Vault / Cage" },
                      { value: "cold_room", label: "Cold Room" },
                      { value: "hazmat", label: "Hazmat Secure Area" },
                      { value: "staging_lane", label: "Staging Lane (Dock In/Out)" },
                      { value: "dock_door", label: "Loading Dock Door" },
                      { value: "yard_slot", label: "Trailer Yard Slot" },
                      { value: "returns", label: "Returns Processing Area" },
                      { value: "quarantine", label: "Quarantine / Inspection Hold" },
                      { value: "damaged", label: "Damaged Rework Area" },
                      { value: "pack_station", label: "Packing Station" },
                      { value: "mobile_cart", label: "Mobile Picking Cart" },
                    ]}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground">Number of Positions</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={specialCount}
                  onChange={(e) => setSpecialCount(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-2 text-xs font-mono border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Live Calculation Preview Banner */}
        <div className="p-3.5 rounded-xl border border-brand/20 bg-brand/5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <span className="text-xs font-semibold text-foreground">
                Locations to Generate:{" "}
                <span className="text-brand font-mono text-sm font-bold ml-1">
                  {preview.totalCount.toLocaleString()}
                </span>
              </span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              Facility: {facility.short_code}
            </span>
          </div>

          {preview.sampleFirst.length > 0 && (
            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 pt-1.5 border-t border-brand/10">
              <span className="font-semibold text-foreground text-[11px]">Range:</span>
              <span className="font-mono text-xs bg-background px-2 py-0.5 rounded border border-border text-foreground">
                {preview.sampleFirst[0]}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-mono text-xs bg-background px-2 py-0.5 rounded border border-border text-foreground">
                {preview.sampleLast[preview.sampleLast.length - 1]}
              </span>
            </div>
          )}
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
            type="button"
            disabled={isSubmitting || preview.totalCount === 0}
            onClick={handleGenerate}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-all disabled:opacity-40 cursor-pointer shadow-sm"
          >
            {isSubmitting ? "Generating..." : `Create ${preview.totalCount.toLocaleString()} Locations`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
