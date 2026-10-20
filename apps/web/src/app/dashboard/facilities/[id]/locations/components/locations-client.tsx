"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TablePagination } from "@/components/ui/table-pagination";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import { exportLocationsToCsv } from "@/lib/locations/csv-engine";
import { updateLocation, deleteLocation } from "../actions";
import { CreateLocationModal } from "./create-location-modal";
import { GeneratorModal } from "./generator-modal";
import { LabelPrintModal } from "./label-print-modal";
import { CsvImportModal } from "./csv-import-modal";
import { ConventionModal } from "./convention-modal";
import { LocationLookupModal } from "./location-lookup-drawer";
import { toast } from "sonner";
import {
  Plus,
  MapPin,
  Building,
  Layers,
  FileUp,
  Download,
  Printer,
  Settings2,
  ScanLine,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit2,
  Tag,
  Thermometer,
  ShieldAlert,
} from "lucide-react";

interface LocationsClientProps {
  facility: {
    id: string;
    name: string;
    short_code: string;
    organization_id: string;
    timezone?: string;
  };
  organization: { id: string; name: string };
  initialLocations: any[];
  totalCount: number;
  convention: any;
  hierarchyNodes: any[];
}

export function LocationsClient({
  facility,
  organization,
  initialLocations,
  totalCount,
  convention,
  hierarchyNodes,
}: LocationsClientProps) {
  const router = useRouter();
  const [locations, setLocations] = useState<any[]>(initialLocations);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
  const [selectedTemp, setSelectedTemp] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "tree">("table");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isConventionModalOpen, setIsConventionModalOpen] = useState(false);
  const [isLookupOpen, setIsLookupOpen] = useState(false);
  const [printTargets, setPrintTargets] = useState<any[]>([]);

  // Distinct areas for filter
  const uniqueAreas = useMemo(() => {
    const set = new Set<string>();
    locations.forEach((loc) => {
      if (loc.area_code) set.add(loc.area_code);
    });
    return Array.from(set).sort();
  }, [locations]);

  // Client-side filtering
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          loc.full_code?.toLowerCase().includes(q) ||
          loc.barcode?.toLowerCase().includes(q) ||
          loc.short_pick_code?.toLowerCase().includes(q) ||
          loc.human_path?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (selectedType !== "all" && loc.location_type !== selectedType) return false;
      if (selectedArea !== "all" && loc.area_code !== selectedArea) return false;
      if (selectedTemp !== "all" && loc.temperature_class !== selectedTemp) return false;
      if (activeOnly && !loc.active) return false;
      return true;
    });
  }, [locations, searchQuery, selectedType, selectedArea, selectedTemp, activeOnly]);

  const totalPages = Math.ceil(filteredLocations.length / itemsPerPage);
  const paginatedLocations = useMemo(() => {
    const from = (currentPage - 1) * itemsPerPage;
    return filteredLocations.slice(from, from + itemsPerPage);
  }, [filteredLocations, currentPage, itemsPerPage]);

  function handleExportCsv() {
    if (locations.length === 0) {
      toast.error("No locations to export");
      return;
    }
    const csvContent = exportLocationsToCsv(filteredLocations);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${facility.short_code}-locations-export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLocations.length} locations to CSV`);
  }

  function handleOpenPrint(locsToPrint?: any[]) {
    setPrintTargets(locsToPrint || filteredLocations);
    setIsPrintModalOpen(true);
  }

  async function handleToggleActive(loc: any) {
    const nextState = !loc.active;
    const res = await updateLocation(loc.id, facility.id, { active: nextState });
    if (!res.success) {
      toast.error(res.error || "Failed to update location");
      return;
    }
    setLocations((prev) => prev.map((l) => (l.id === loc.id ? { ...l, active: nextState } : l)));
    toast.success(`Location ${loc.full_code} ${nextState ? "activated" : "deactivated"}`);
  }

  async function handleDelete(loc: any) {
    if (!confirm(`Are you sure you want to delete ${loc.full_code}?`)) return;

    const res = await deleteLocation(loc.id, facility.id);
    if (!res.success) {
      toast.error(res.error || "Cannot delete location that has held inventory; deactivate it instead.");
      return;
    }
    setLocations((prev) => prev.filter((l) => l.id !== loc.id));
    toast.success(`Location ${loc.full_code} deleted successfully.`);
  }

  // Hierarchy Tree Builder (Building -> Wing -> Area -> Aisle -> Bays)
  const treeData = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, any[]>>>();
    locations.forEach((loc) => {
      const wing = loc.wing_code || "W1";
      const area = loc.area_code || "General";
      const aisle = loc.aisle_code || "Aisle 00";

      if (!map.has(wing)) map.set(wing, new Map<string, Map<string, any[]>>());
      const wingMap = map.get(wing)!;

      if (!wingMap.has(area)) wingMap.set(area, new Map<string, any[]>());
      const areaMap = wingMap.get(area)!;

      if (!areaMap.has(aisle)) areaMap.set(aisle, []);
      areaMap.get(aisle)!.push(loc);
    });
    return map;
  }, [locations]);

  return (
    <div className="space-y-6">
      {/* Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href="/dashboard/facilities" className="hover:text-foreground transition-colors">
              Facilities
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium">{facility.name}</span>
          </nav>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <MapPin className="w-6 h-6 text-brand" />
              Location Management
            </h1>
            <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-md bg-accent text-brand-text">
              {facility.short_code}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configurable hierarchy, rack and floor addresses, bulk generation, and printable barcode labels.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary-hover transition-colors cursor-pointer shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </button>

          <button
            type="button"
            onClick={() => setIsLookupOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors cursor-pointer"
            title="Scan or Lookup Location Code"
          >
            <ScanLine className="w-4 h-4 text-brand" />
            Scan / Lookup
          </button>

          <button
            type="button"
            onClick={() => setIsGeneratorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors cursor-pointer"
          >
            <Layers className="w-4 h-4 text-brand" />
            Generate Range
          </button>

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors cursor-pointer"
          >
            <FileUp className="w-4 h-4" />
            Import CSV
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => handleOpenPrint()}
            disabled={filteredLocations.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Print Labels
          </button>

          <button
            type="button"
            onClick={() => setIsConventionModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md border border-input hover:bg-accent transition-colors cursor-pointer"
            title="Facility Naming Convention Rules"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats Counter Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-border bg-background shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">Total Locations</span>
          <div className="text-xl font-bold font-mono text-foreground mt-0.5">
            {locations.length.toLocaleString()}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-background shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">Pallet Racks</span>
          <div className="text-xl font-bold font-mono text-foreground mt-0.5">
            {locations.filter((l) => l.location_type === "rack_pallet_position").length.toLocaleString()}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-background shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">Floor Grid & Lanes</span>
          <div className="text-xl font-bold font-mono text-foreground mt-0.5">
            {locations.filter((l) => l.location_type === "floor_grid_cell" || l.location_type === "bulk_floor_lane").length.toLocaleString()}
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-border bg-background shadow-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase">Active Rate</span>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
            {locations.length > 0
              ? `${Math.round((locations.filter((l) => l.active).length / locations.length) * 100)}%`
              : "0%"}
          </div>
        </div>
      </div>

      {/* Main Container Card */}
      <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Filter Toolbar */}
        <div className="p-4 border-b border-border flex flex-col lg:flex-row gap-3 items-center justify-between bg-gray-50/50 dark:bg-white/5">
          {/* Search Input */}
          <div className="relative w-full lg:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search code, barcode, or path..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-3 py-2 w-full text-xs font-mono bg-white dark:bg-black/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
            />
          </div>

          {/* Dropdown Filters using SearchableSelect */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <div className="w-44">
              <SearchableSelect
                value={selectedType}
                onChange={(v) => {
                  setSelectedType(v);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "all", label: "All Storage Types" },
                  { value: "rack_pallet_position", label: "Pallet Racks" },
                  { value: "shelf_bin", label: "Shelf Bins" },
                  { value: "floor_grid_cell", label: "Floor Grid Cells" },
                  { value: "bulk_floor_lane", label: "Bulk Lanes" },
                  { value: "special_area", label: "Special Areas" },
                ]}
              />
            </div>

            <div className="w-36">
              <SearchableSelect
                value={selectedArea}
                onChange={(v) => {
                  setSelectedArea(v);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "all", label: "All Areas" },
                  ...uniqueAreas.map((a) => ({ value: a, label: `Area ${a}` })),
                ]}
              />
            </div>

            <div className="w-36">
              <SearchableSelect
                value={selectedTemp}
                onChange={(v) => {
                  setSelectedTemp(v);
                  setCurrentPage(1);
                }}
                options={[
                  { value: "all", label: "All Temps" },
                  { value: "ambient", label: "Ambient" },
                  { value: "chilled", label: "Chilled" },
                  { value: "frozen", label: "Frozen" },
                  { value: "deep_freeze", label: "Deep Freeze" },
                ]}
              />
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-border p-0.5 bg-background">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === "table" ? "bg-accent text-brand-text" : "text-muted-foreground hover:text-foreground"
                }`}
                title="Table View"
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("tree")}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === "tree" ? "bg-accent text-brand-text" : "text-muted-foreground hover:text-foreground"
                }`}
                title="Hierarchy Tree View"
              >
                <FolderTree className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* View Mode 1: Table */}
        {viewMode === "table" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[11px] text-muted-foreground uppercase bg-gray-50/50 dark:bg-white/5 border-b border-border">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Location Code</th>
                  <th className="px-5 py-3.5 font-semibold">Type</th>
                  <th className="px-5 py-3.5 font-semibold">Breadcrumb Path</th>
                  <th className="px-5 py-3.5 font-semibold">Capacity</th>
                  <th className="px-5 py-3.5 font-semibold">Temp</th>
                  <th className="px-5 py-3.5 font-semibold">Walk Seq</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedLocations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <MapPin className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                        <p className="font-semibold text-sm">No locations found</p>
                        <p className="text-xs">
                          Generate a range or import CSV to populate this facility with scannable addresses.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedLocations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                      {/* Code & Pick Alias */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-foreground text-xs tracking-tight">
                            {loc.full_code}
                          </span>
                          {loc.short_pick_code && (
                            <span className="text-[10px] font-mono text-muted-foreground">
                              Pick: {loc.short_pick_code}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex text-[10px] font-mono uppercase font-semibold px-2 py-0.5 rounded bg-accent text-brand-text">
                          {loc.location_type.replace(/_/g, " ")}
                        </span>
                      </td>

                      {/* Path */}
                      <td className="px-5 py-3.5 max-w-[280px]">
                        <span className="text-xs text-muted-foreground truncate block" title={loc.human_path}>
                          {loc.human_path}
                        </span>
                      </td>

                      {/* Capacity */}
                      <td className="px-5 py-3.5 text-xs text-foreground font-mono">
                        {loc.location_type === "floor_grid_cell" ? (
                          <span>
                            {loc.max_pallets}p · {loc.max_stack_height}h
                          </span>
                        ) : loc.location_type === "bulk_floor_lane" ? (
                          <span>{loc.lane_depth} slots</span>
                        ) : (
                          <span>{loc.max_pallets || 1} pallet</span>
                        )}
                      </td>

                      {/* Temperature */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-[11px] capitalize text-foreground">
                          <Thermometer className="w-3.5 h-3.5 text-blue-500" />
                          {loc.temperature_class}
                        </span>
                      </td>

                      {/* Walk Sequence */}
                      <td className="px-5 py-3.5 text-xs font-mono text-muted-foreground">
                        #{loc.walk_sequence || "0"}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        {loc.active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                            Inactive
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-right">
                        <ActionDropdown
                          actions={[
                            {
                              label: "Print Barcode Label",
                              icon: <Printer className="w-4 h-4" />,
                              onClick: () => handleOpenPrint([loc]),
                            },
                            {
                              label: loc.active ? "Deactivate" : "Activate",
                              icon: <CheckCircle2 className="w-4 h-4" />,
                              onClick: () => handleToggleActive(loc),
                            },
                            {
                              label: "Delete",
                              icon: <Trash2 className="w-4 h-4" />,
                              danger: true,
                              onClick: () => handleDelete(loc),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* View Mode 2: Hierarchy Tree Explorer */}
        {viewMode === "tree" && (
          <div className="p-6 space-y-4 max-h-[650px] overflow-y-auto">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
              <Building className="w-4 h-4 text-brand" />
              <span>
                {facility.name} ({facility.short_code}) Tree Hierarchy
              </span>
            </div>

            {Array.from(treeData.entries()).map(([wing, areaMap]) => (
              <div key={wing} className="border border-border rounded-xl p-4 bg-gray-50/30 dark:bg-white/5 space-y-3">
                <div className="font-bold text-sm text-foreground flex items-center gap-2">
                  <span className="font-mono bg-brand/10 text-brand px-2 py-0.5 rounded text-xs">{wing}</span>
                  <span>Wing {wing.replace(/^W/i, "")}</span>
                </div>

                <div className="pl-4 border-l-2 border-border space-y-3">
                  {Array.from(areaMap.entries()).map(([area, aisleMap]) => (
                    <div key={area} className="space-y-2">
                      <div className="font-semibold text-xs text-foreground flex items-center gap-2">
                        <span className="font-mono bg-accent text-brand-text px-1.5 py-0.5 rounded text-[10px]">
                          {area}
                        </span>
                        <span>Area {area}</span>
                      </div>

                      <div className="pl-4 border-l-2 border-border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {Array.from(aisleMap.entries()).map(([aisle, locs]) => (
                          <div
                            key={aisle}
                            className="p-2.5 rounded-lg border border-border bg-background text-xs flex items-center justify-between"
                          >
                            <span className="font-mono font-medium text-foreground">{aisle}</span>
                            <span className="text-[10px] text-muted-foreground font-mono bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                              {locs.length} pos
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Toolbar */}
        {viewMode === "table" && filteredLocations.length > itemsPerPage && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(currentPage * itemsPerPage, filteredLocations.length)} of {filteredLocations.length} locations
            </span>
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
      <CreateLocationModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        facility={facility}
        onSuccess={() => router.refresh()}
      />

      <GeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        facility={facility}
        onSuccess={() => router.refresh()}
      />

      <LabelPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        locations={printTargets}
        facilityShortCode={facility.short_code}
      />

      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        facility={facility}
        onSuccess={() => router.refresh()}
      />

      <ConventionModal
        isOpen={isConventionModalOpen}
        onClose={() => setIsConventionModalOpen(false)}
        facility={facility}
        convention={convention}
        onSuccess={() => router.refresh()}
      />

      <LocationLookupModal
        isOpen={isLookupOpen}
        onClose={() => setIsLookupOpen(false)}
        facilityId={facility.id}
      />
    </div>
  );
}
