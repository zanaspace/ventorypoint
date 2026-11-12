"use client";

import { useState, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { importCatalogCsvAction } from "../actions";
import { toast } from "sonner";
import { FileUp, Download, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface ImportCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: { id: string; name: string; short_code: string }[];
  organizationId: string;
  defaultClientId?: string;
  onSuccess: () => void;
}

export function ImportCatalogModal({
  isOpen,
  onClose,
  clients,
  organizationId,
  defaultClientId,
  onSuccess,
}: ImportCatalogModalProps) {
  const [clientId, setClientId] = useState(defaultClientId || (clients[0]?.id || ""));
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<{
    insertedCount: number;
    errors: { row: number; code?: string; reason: string }[];
    totalRows: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDownloadTemplate() {
    const headers = [
      "sku_code",
      "name",
      "description",
      "category",
      "brand",
      "barcode",
      "barcode_type",
      "tracking_class",
      "rotation_rule",
      "expiry_required",
      "shelf_life_days",
      "min_shelf_life_receipt_days",
      "temperature_class",
      "weight_kg",
      "length_cm",
      "width_cm",
      "height_cm",
      "case_barcode",
      "units_per_case",
    ];

    const sampleRow = [
      "VIT-C-1000MG",
      "Vitamin C 1000mg with Rose Hips 60ct",
      "High potency immune support",
      "Dietary Supplements",
      "NatureVital",
      "012345678905",
      "upc",
      "lot",
      "fefo",
      "true",
      "730",
      "180",
      "ambient",
      "0.250",
      "12.0",
      "8.0",
      "15.0",
      "10012345678902",
      "24",
    ];

    const csvContent = [headers.join(","), sampleRow.join(",")].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "ventorypoint-catalog-template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Downloaded CSV catalog template");
  }

  async function handleUpload() {
    if (!clientId) {
      toast.error("Please select a brand client");
      return;
    }
    if (!file) {
      toast.error("Please select a CSV file to upload");
      return;
    }

    setIsUploading(true);
    setImportResult(null);

    const text = await file.text();
    const res = await importCatalogCsvAction(clientId, organizationId, text);
    setIsUploading(false);

    if (!res.success && res.insertedCount === 0) {
      toast.error("Catalog import failed. See errors below.");
      setImportResult(res);
      return;
    }

    setImportResult(res);
    toast.success(`Successfully imported ${res.insertedCount} SKUs!`);
    onSuccess();
  }

  function handleReset() {
    setFile(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Product Catalog (CSV)" maxWidth="max-w-2xl">
      <div className="p-6 space-y-4">
        {/* Client Selection */}
        <div>
          <label className="text-xs font-semibold text-foreground">Select Brand Client *</label>
          <div className="mt-1">
            <SearchableSelect
              value={clientId}
              onChange={(v) => {
                setClientId(v);
                handleReset();
              }}
              options={clients.map((c) => ({ value: c.id, label: `${c.name} (${c.short_code})` }))}
            />
          </div>
        </div>

        {/* Template download & Guidelines */}
        <div className="p-3.5 bg-gray-50 dark:bg-white/[0.02] rounded-xl border border-border flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-foreground block">Download Standard CSV Template</span>
            <span className="text-[11px] text-muted-foreground block mt-0.5">
              Includes pre-configured headers, barcode types, UoM cases, and FEFO expiry rules.
            </span>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-brand" />
            Template
          </button>
        </div>

        {/* Drag and Drop Box */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border hover:border-brand rounded-xl p-8 text-center cursor-pointer transition-colors bg-gray-50/50 dark:bg-black/20"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                setFile(e.target.files[0]);
                setImportResult(null);
              }
            }}
            className="hidden"
          />
          <FileUp className="w-8 h-8 text-brand mx-auto mb-2" />
          {file ? (
            <div>
              <p className="text-xs font-bold font-mono text-foreground">{file.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {(file.size / 1024).toFixed(1)} KB · Click to choose a different file
              </p>
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-foreground">Click to upload or drag & drop CSV</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Standard comma-delimited UTF-8 CSV file</p>
            </div>
          )}
        </div>

        {/* Results / Error Log */}
        {importResult && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-border text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                {importResult.insertedCount} SKUs Imported Successfully
              </span>
              <span className="text-muted-foreground font-mono">
                {importResult.errors.length} error{importResult.errors.length === 1 ? "" : "s"}
              </span>
            </div>

            {importResult.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border p-3 bg-red-50/50 dark:bg-red-950/20 text-xs space-y-1.5">
                <span className="text-[11px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide block">
                  Import Errors Report
                </span>
                {importResult.errors.map((err, idx) => (
                  <div key={idx} className="flex items-start gap-1.5 text-red-700 dark:text-red-300 text-[11px]">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />
                    <span>
                      Row {err.row}: {err.code ? `[${err.code}] ` : ""}
                      {err.reason}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-md border border-input text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            {importResult?.insertedCount ? "Done" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-all disabled:opacity-40 cursor-pointer shadow-sm"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Importing Catalog...
              </>
            ) : (
              <>
                <FileUp className="w-3.5 h-3.5" />
                Start CSV Import
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
