"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sku, CatalogCompleteness } from "@/lib/types/catalog";
import { getSkus, deleteSkuAction, getClientCompleteness } from "../actions";
import { exportCatalogToCsv } from "@/lib/catalog/csv-engine";
import { CreateSkuModal } from "./create-sku-modal";
import { BatchCreateSkuModal } from "./batch-create-sku-modal";
import { EditSkuModal } from "./edit-sku-modal";
import { ImportCatalogModal } from "./import-catalog-modal";
import { BarcodeLookupModal } from "./barcode-lookup-modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  Package,
  Plus,
  Layers,
  Search,
  FileUp,
  Download,
  ScanLine,
  Shield,
  Clock,
  Scale,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

interface CatalogClientProps {
  initialSkus: Sku[];
  totalCount: number;
  clients: { id: string; name: string; short_code: string }[];
  facilities?: { id: string; name: string; short_code: string }[];
  organizationId: string;
}

export function CatalogClient({
  initialSkus,
  totalCount,
  clients,
  facilities = [],
  organizationId,
}: CatalogClientProps) {
  const router = useRouter();
  const [skus, setSkus] = useState<Sku[]>(initialSkus);
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTracking, setSelectedTracking] = useState("all");
  const [selectedRotation, setSelectedRotation] = useState("all");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isBatchCreateOpen, setIsBatchCreateOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<Sku | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isLookupOpen, setIsLookupOpen] = useState(false);

  // Completeness score for selected client
  const [completeness, setCompleteness] = useState<CatalogCompleteness | null>(null);

  useEffect(() => {
    if (selectedClientId && selectedClientId !== "all") {
      getClientCompleteness(selectedClientId).then((res) => setCompleteness(res));
    } else {
      setCompleteness(null);
    }
  }, [selectedClientId, skus]);

  // Client-side filtering
  const filteredSkus = useMemo(() => {
    return skus.filter((item) => {
      if (selectedClientId !== "all" && item.client_account_id !== selectedClientId) {
        return false;
      }
      if (selectedTracking !== "all" && item.tracking_class !== selectedTracking) {
        return false;
      }
      if (selectedRotation !== "all" && item.rotation_rule !== selectedRotation) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.code.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.brand?.toLowerCase().includes(q) ||
          item.barcodes?.some((b) => b.barcode.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [skus, selectedClientId, selectedTracking, selectedRotation, searchQuery]);

  const totalPages = Math.ceil(filteredSkus.length / itemsPerPage);
  const paginatedSkus = useMemo(() => {
    const from = (currentPage - 1) * itemsPerPage;
    return filteredSkus.slice(from, from + itemsPerPage);
  }, [filteredSkus, currentPage, itemsPerPage]);

  function handleExportCsv() {
    if (filteredSkus.length === 0) {
      toast.error("No SKUs to export");
      return;
    }
    const csvContent = exportCatalogToCsv(filteredSkus);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `catalog-export-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredSkus.length} SKUs to CSV`);
  }

  async function handleDelete(sku: Sku) {
    if (!confirm(`Are you sure you want to delete SKU ${sku.code}?`)) return;

    const res = await deleteSkuAction(sku.id);
    if (!res.success) {
      toast.error(res.error || "Failed to delete SKU");
      return;
    }

    setSkus((prev) => prev.filter((s) => s.id !== sku.id));
    toast.success(`SKU ${sku.code} deleted successfully`);
  }

  async function refreshData() {
    const res = await getSkus({
      clientId: selectedClientId,
      query: searchQuery,
      trackingClass: selectedTracking,
      rotationRule: selectedRotation,
    });
    if (res.skus) setSkus(res.skus);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Completeness Score */}
      {completeness && selectedClientId !== "all" && (
        <div className="p-4 rounded-xl border border-brand/20 bg-brand/[0.03] dark:bg-brand/[0.05] flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">Catalog Completeness Score</h3>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                  {completeness.completeness_score_pct}% Complete
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Measures readiness for automated barcode picking, dimensional billing, and carrier rate calculation.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs shrink-0 w-full md:w-auto">
            <div className="p-2 rounded-lg bg-background border border-border">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Barcodes</span>
              <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                {completeness.with_barcode} / {completeness.total_skus}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-background border border-border">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Dimensions</span>
              <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                {completeness.with_dimensions} / {completeness.total_skus}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-background border border-border">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Weights</span>
              <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                {completeness.with_weight} / {completeness.total_skus}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-background border border-border">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Images</span>
              <span className="font-mono font-bold text-foreground text-xs mt-0.5 block">
                {completeness.with_image} / {completeness.total_skus}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Control Bar: Filters & Actions */}
      <div className="space-y-3">
        {/* Top Controls: Search + Action Buttons */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search SKU, name, barcode..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-brand focus:outline-none transition-all"
            />
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Action Buttons: Touch-friendly grid on mobile, flex row on tablet/desktop */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Utility actions: 3-column equal grid on phone */}
            <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsLookupOpen(true)}
                className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors cursor-pointer whitespace-nowrap"
              >
                <ScanLine className="w-4 h-4 text-brand shrink-0" />
                <span>Lookup</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImportOpen(true)}
                className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileUp className="w-4 h-4 shrink-0" />
                <span>Import</span>
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredSkus.length === 0}
                className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Export</span>
              </button>
            </div>

            {/* Primary Action: Full-width on mobile, auto-width on tablet/desktop */}
            <div className="w-full sm:w-auto">
              <ActionDropdown
                variant="primary"
                triggerText="Add Product"
                triggerIcon={<Plus className="w-4 h-4" />}
                align="end"
                width={260}
                className="w-full justify-center"
                actions={[
                  {
                    label: "Add Single Product",
                    description: "Detailed form with tracking rules & barcode",
                    icon: <Plus className="w-4 h-4 text-primary" />,
                    onClick: () => setIsCreateOpen(true),
                  },
                  {
                    label: "Add Multiple Products",
                    description: "Fast multi-line entry in a single table",
                    icon: <Layers className="w-4 h-4 text-primary" />,
                    onClick: () => setIsBatchCreateOpen(true),
                  },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Second Row: Dropdown Filters (2-col on phone, 3-col on desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {/* Client Filter - Full width on phone */}
          <div className="col-span-2 sm:col-span-1">
            <SearchableSelect
              value={selectedClientId}
              onChange={(v) => {
                setSelectedClientId(v);
                setCurrentPage(1);
              }}
              options={[
                { value: "all", label: "All Brand Clients" },
                ...clients.map((c) => ({ value: c.id, label: `${c.name} (${c.short_code})` })),
              ]}
            />
          </div>

          {/* Tracking Class Filter */}
          <div className="col-span-1">
            <SearchableSelect
              value={selectedTracking}
              onChange={(v) => {
                setSelectedTracking(v);
                setCurrentPage(1);
              }}
              options={[
                { value: "all", label: "All Tracking" },
                { value: "non_unique", label: "Non-Unique" },
                { value: "lot", label: "Lot / Batch" },
                { value: "serial", label: "Serialized" },
                { value: "lot_serial", label: "Lot + Serial" },
              ]}
            />
          </div>

          {/* Rotation Rule Filter */}
          <div className="col-span-1">
            <SearchableSelect
              value={selectedRotation}
              onChange={(v) => {
                setSelectedRotation(v);
                setCurrentPage(1);
              }}
              options={[
                { value: "all", label: "All Rotation" },
                { value: "fifo", label: "FIFO" },
                { value: "fefo", label: "FEFO (Expiry)" },
                { value: "lifo", label: "LIFO" },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Main Catalog View: Cards on Mobile, Table on Tablet/Desktop */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        {/* Mobile Card List View (< md) */}
        <div className="block md:hidden divide-y divide-border">
          {paginatedSkus.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="font-semibold text-sm">No SKUs found</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {searchQuery ? "Try refining your search filter." : "Get started by adding your first product SKU."}
              </p>
            </div>
          ) : (
            paginatedSkus.map((sku) => {
              const eachUom = sku.uoms?.find((u) => u.uom_level === "each");
              const primaryBarcode = sku.barcodes?.find((b) => b.is_primary)?.barcode || sku.barcodes?.[0]?.barcode || "—";

              return (
                <div key={sku.id} className="p-4 space-y-3 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-foreground text-sm leading-snug">{sku.name}</div>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                          {sku.code}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand/10 text-brand">
                          {sku.client?.short_code || "CLIENT"}
                        </span>
                        {sku.status === "active" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground capitalize">
                            {sku.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <ActionDropdown
                      actions={[
                        {
                          label: "Edit SKU",
                          icon: <Edit2 className="w-4 h-4" />,
                          onClick: () => setEditingSku(sku),
                        },
                        {
                          label: "Delete SKU",
                          icon: <Trash2 className="w-4 h-4" />,
                          danger: true,
                          onClick: () => handleDelete(sku),
                        },
                      ]}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Barcode</span>
                      <span className="font-mono text-xs text-foreground font-medium truncate block">
                        {primaryBarcode}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Tracking</span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground capitalize mt-0.5">
                        <Shield className="w-3 h-3 text-brand shrink-0" />
                        {sku.tracking_class.replace(/_/g, " ")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Rotation</span>
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase mt-0.5 ${
                          sku.rotation_rule === "fefo"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        <Clock className="w-3 h-3 shrink-0" />
                        {sku.rotation_rule}
                        {sku.expiry_required ? " (Exp)" : ""}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Weight & Dims</span>
                      <span className="text-xs text-muted-foreground font-mono mt-0.5 block truncate">
                        {eachUom?.weight_kg ? `${eachUom.weight_kg} kg` : "—"}
                        {eachUom?.length_cm ? ` (${eachUom.length_cm}×${eachUom.width_cm}×${eachUom.height_cm})` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Tablet & Desktop Table View (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-gray-50/75 dark:bg-white/[0.02] text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                <th className="px-5 py-3.5">Product Name & SKU</th>
                <th className="px-5 py-3.5">Client Brand</th>
                <th className="px-5 py-3.5">Primary Barcode</th>
                <th className="px-5 py-3.5">Tracking Class</th>
                <th className="px-5 py-3.5">Rotation Rule</th>
                <th className="px-5 py-3.5">Weight & Dims</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedSkus.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="font-semibold text-sm">No SKUs found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {searchQuery ? "Try refining your search filter." : "Get started by adding your first product SKU or importing a CSV catalog."}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedSkus.map((sku) => {
                  const eachUom = sku.uoms?.find((u) => u.uom_level === "each");
                  const primaryBarcode = sku.barcodes?.find((b) => b.is_primary)?.barcode || sku.barcodes?.[0]?.barcode || "—";

                  return (
                    <tr key={sku.id} className="hover:bg-muted/40 transition-colors">
                      {/* Product Name & SKU */}
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-foreground text-sm line-clamp-1">{sku.name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground/50">SKU:</span>
                          <span className="font-normal text-muted-foreground/80">{sku.code}</span>
                        </div>
                      </td>

                      {/* Client Brand */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 text-brand">
                          {sku.client?.short_code || "CLIENT"}
                        </span>
                      </td>

                      {/* Barcode */}
                      <td className="px-5 py-3.5 font-mono text-xs text-foreground whitespace-nowrap">
                        {primaryBarcode}
                      </td>

                      {/* Tracking Class */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/5 text-foreground capitalize">
                          <Shield className="w-3 h-3 text-brand" />
                          {sku.tracking_class.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Rotation Rule */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase ${
                            sku.rotation_rule === "fefo"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          {sku.rotation_rule}
                          {sku.expiry_required ? " (Exp)" : ""}
                        </span>
                      </td>

                      {/* Weight & Dims */}
                      <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {eachUom?.weight_kg ? `${eachUom.weight_kg} kg` : "—"}
                        {eachUom?.length_cm ? ` (${eachUom.length_cm}×${eachUom.width_cm}×${eachUom.height_cm})` : ""}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {sku.status === "active" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground capitalize">
                            {sku.status}
                          </span>
                        )}
                      </td>

                      {/* Action Dropdown */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <ActionDropdown
                          actions={[
                            {
                              label: "Edit SKU",
                              icon: <Edit2 className="w-4 h-4" />,
                              onClick: () => setEditingSku(sku),
                            },
                            {
                              label: "Delete SKU",
                              icon: <Trash2 className="w-4 h-4" />,
                              danger: true,
                              onClick: () => handleDelete(sku),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredSkus.length > 0 && (
          <div className="p-4 border-t border-border">
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(val) => {
                setItemsPerPage(val);
                setCurrentPage(1);
              }}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateSkuModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        clients={clients}
        facilities={facilities}
        organizationId={organizationId}
        defaultClientId={selectedClientId !== "all" ? selectedClientId : undefined}
        onSuccess={refreshData}
      />

      <BatchCreateSkuModal
        isOpen={isBatchCreateOpen}
        onClose={() => setIsBatchCreateOpen(false)}
        clients={clients}
        facilities={facilities}
        organizationId={organizationId}
        defaultClientId={selectedClientId !== "all" ? selectedClientId : undefined}
        onSuccess={refreshData}
      />

      <EditSkuModal
        isOpen={!!editingSku}
        onClose={() => setEditingSku(null)}
        sku={editingSku}
        facilities={facilities}
        onSuccess={refreshData}
      />

      <ImportCatalogModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        clients={clients}
        organizationId={organizationId}
        defaultClientId={selectedClientId !== "all" ? selectedClientId : undefined}
        onSuccess={refreshData}
      />

      <BarcodeLookupModal
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
        clientId={selectedClientId !== "all" ? selectedClientId : undefined}
      />
    </div>
  );
}
