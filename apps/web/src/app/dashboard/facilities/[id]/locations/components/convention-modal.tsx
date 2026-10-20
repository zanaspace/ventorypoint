"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { saveFacilityConvention } from "../actions";
import { toast } from "sonner";
import { Settings2, Save } from "lucide-react";

interface ConventionModalProps {
  isOpen: boolean;
  onClose: () => void;
  facility: { id: string; name: string; short_code: string; organization_id: string };
  convention: any;
  onSuccess: () => void;
}

export function ConventionModal({ isOpen, onClose, facility, convention, onSuccess }: ConventionModalProps) {
  const [rackTemplate, setRackTemplate] = useState(
    convention?.rack_template || "{FAC}-{WING}-{AREA}-{AISLE}-{BAY}-{LEVEL}-{POS}"
  );
  const [floorGridTemplate, setFloorGridTemplate] = useState(
    convention?.floor_grid_template || "{FAC}-{WING}-FLR-R{ROW}-C{COL}"
  );
  const [bulkLaneTemplate, setBulkLaneTemplate] = useState(
    convention?.bulk_lane_template || "{FAC}-{WING}-BLK-LN{LANE}-S{SLOT}"
  );
  const [specialAreaTemplate, setSpecialAreaTemplate] = useState(
    convention?.special_area_template || "{FAC}-{WING}-{AREA}-{NN}"
  );
  const [separator, setSeparator] = useState(convention?.separator || "-");
  const [oddEvenSides, setOddEvenSides] = useState(convention?.odd_even_aisle_sides ?? true);
  const [bottomUpLevels, setBottomUpLevels] = useState(convention?.bottom_up_levels ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSave() {
    setIsSubmitting(true);
    const res = await saveFacilityConvention(facility.id, facility.organization_id, {
      rack_template: rackTemplate,
      floor_grid_template: floorGridTemplate,
      bulk_lane_template: bulkLaneTemplate,
      special_area_template: specialAreaTemplate,
      separator,
      odd_even_aisle_sides: oddEvenSides,
      bottom_up_levels: bottomUpLevels,
    });
    setIsSubmitting(false);

    if (!res.success) {
      toast.error(res.error || "Failed to update naming conventions");
      return;
    }

    toast.success("Facility naming conventions updated successfully!");
    onSuccess();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Facility Naming Convention Rules" maxWidth="2xl">
      <div className="space-y-5">
        <p className="text-xs text-muted-foreground">
          Naming conventions enforce fixed-width segments, automatic zero-padding, and exclude lookalike characters
          (O/0, I/1, S/5) across all barcode labels.
        </p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground">Pallet Racks & Shelving Template</label>
            <input
              value={rackTemplate}
              onChange={(e) => setRackTemplate(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm font-mono border border-border rounded-md bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              e.g. {facility.short_code}-W2-ZA-A04-B12-L3-P02
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground">Floor Grid Cells Template</label>
            <input
              value={floorGridTemplate}
              onChange={(e) => setFloorGridTemplate(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm font-mono border border-border rounded-md bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              e.g. {facility.short_code}-W1-FLR-R05-C03
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground">Bulk Deep Storage Lanes Template</label>
            <input
              value={bulkLaneTemplate}
              onChange={(e) => setBulkLaneTemplate(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm font-mono border border-border rounded-md bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              e.g. {facility.short_code}-W1-BLK-LN07-S02
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground">Special Areas Template (Cages, Docks)</label>
            <input
              value={specialAreaTemplate}
              onChange={(e) => setSpecialAreaTemplate(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm font-mono border border-border rounded-md bg-background focus:ring-2 focus:ring-brand focus:outline-none"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              e.g. {facility.short_code}-W1-CAGE-01, {facility.short_code}-W3-COLD-04
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-xs font-semibold text-foreground">Segment Separator</label>
              <input
                value={separator}
                onChange={(e) => setSeparator(e.target.value)}
                maxLength={2}
                className="mt-1 w-20 px-3 py-2 text-center text-sm font-mono border border-border rounded-md bg-background focus:ring-2 focus:ring-brand focus:outline-none"
              />
            </div>

            <div className="space-y-2 pt-4">
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={oddEvenSides}
                  onChange={(e) => setOddEvenSides(e.target.checked)}
                  className="rounded border-border text-brand focus:ring-brand cursor-pointer"
                />
                Odd/Even Aisle Sides (Odd bays on Left, Even on Right)
              </label>

              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={bottomUpLevels}
                  onChange={(e) => setBottomUpLevels(e.target.checked)}
                  className="rounded border-border text-brand focus:ring-brand cursor-pointer"
                />
                Count Shelf Levels Bottom-Up (Level 1 = Floor beam)
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <Save className="w-4 h-4" />
            {isSubmitting ? "Saving..." : "Save Convention Settings"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
