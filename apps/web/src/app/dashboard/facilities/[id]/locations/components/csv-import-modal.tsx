"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { importLocationsCsvAction } from "../actions";
import { FileUp, AlertTriangle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ValidationIssue } from "@/lib/locations/csv-engine";

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  facility: { id: string; name: string; short_code: string; organization_id: string };
  onSuccess: () => void;
}

export function CsvImportModal({ isOpen, onClose, facility, onSuccess }: CsvImportModalProps) {
  const [csvText, setCsvText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationReport, setValidationReport] = useState<{
    totalRows: number;
    insertedCount: number;
    errors: ValidationIssue[];
  } | null>(null);

  function handleDownloadTemplate() {
    const template = `full_code,barcode,short_pick_code,location_type,sub_type,human_path,building_code,wing_code,area_code,aisle_code,bay_code,level_code,position_code,max_pallets,temperature_class,walk_sequence
${facility.short_code}-W1-ZA-A01-B01-L1-P01,${facility.short_code}-W1-ZA-A01-B01-L1-P01,A01-01-1-01,rack_pallet_position,standard,${facility.name} › Wing 1 › Area A › Aisle 01 › Bay 01 › Level 1 › Position 01,${facility.short_code},W1,ZA,A01,B01,L1,P01,1,ambient,1
${facility.short_code}-W1-FLR-R01-C01,${facility.short_code}-W1-FLR-R01-C01,,floor_grid_cell,standard,${facility.name} › Wing 1 › Floor Grid › Row 01 · Col 01,${facility.short_code},W1,,,R01,C01,,,4,ambient,2
${facility.short_code}-W1-BLK-LN01-S01,${facility.short_code}-W1-BLK-LN01-S01,,bulk_floor_lane,standard,${facility.name} › Wing 1 › Bulk Storage › Lane 01 · Slot 01,${facility.short_code},W1,,,LN01,S01,,,1,ambient,3`;

    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `locations-template-${facility.short_code}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    if (!csvText.trim()) {
      toast.error("Please paste or upload CSV content");
      return;
    }

    setIsSubmitting(true);
    const res = await importLocationsCsvAction(
      facility.id,
      facility.organization_id,
      facility.short_code,
      csvText
    );
    setIsSubmitting(false);

    setValidationReport({
      totalRows: res.totalRows,
      insertedCount: res.insertedCount,
      errors: res.errors || [],
    });

    if (res.success && res.errors.length === 0) {
      toast.success(`Successfully imported all ${res.insertedCount} locations!`);
      onSuccess();
      onClose();
    } else if (res.success && res.errors.length > 0) {
      toast.warning(`Imported ${res.insertedCount} locations with ${res.errors.length} validation errors.`);
      onSuccess();
    } else {
      toast.error(`Import failed: ${res.errors[0]?.reason || "Validation errors detected"}`);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText((event.target?.result as string) || "");
    };
    reader.readAsText(file);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Locations from CSV" maxWidth="3xl">
      <div className="space-y-5">
        <div className="flex items-center justify-between p-3.5 rounded-lg bg-gray-50/50 dark:bg-white/5 border border-border">
          <div className="text-xs text-muted-foreground">
            Strict validation: verifies naming convention, excludes lookalike characters (O/I/S), checks duplicates.
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Sample CSV
          </button>
        </div>

        {/* File Dropzone / File Picker */}
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">
            Select CSV File or Paste Text Below
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary-hover file:cursor-pointer cursor-pointer"
          />
        </div>

        {/* Text Area */}
        <div>
          <textarea
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder={`full_code,barcode,location_type,human_path\n${facility.short_code}-W1-ZA-A01-B01-L1-P01,${facility.short_code}-W1-ZA-A01-B01-L1-P01,rack_pallet_position,Dallas 1 › Wing 1 › Area A`}
            className="w-full p-3 font-mono text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Validation Errors Report */}
        {validationReport && validationReport.errors.length > 0 && (
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-3">
            <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>
                Found {validationReport.errors.length} validation issues (
                {validationReport.insertedCount} valid locations imported):
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background divide-y divide-border">
              {validationReport.errors.map((err, idx) => (
                <div key={idx} className="p-2.5 text-xs flex items-start gap-2">
                  <span className="font-mono bg-destructive/10 text-destructive px-1.5 py-0.5 rounded shrink-0">
                    Row #{err.row}
                  </span>
                  <div className="min-w-0 flex-1">
                    {err.code && <span className="font-mono font-semibold mr-1.5">[{err.code}]</span>}
                    <span className="text-muted-foreground">{err.reason}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success Notice */}
        {validationReport && validationReport.errors.length === 0 && validationReport.insertedCount > 0 && (
          <div className="p-4 rounded-xl border border-success/20 bg-success/5 flex items-center gap-2 text-success font-semibold text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>All {validationReport.insertedCount} locations validated and imported successfully!</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting || !csvText.trim()}
            onClick={handleImport}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Validating & Importing...
              </>
            ) : (
              <>
                <FileUp className="w-4 h-4" />
                Validate & Import Locations
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
