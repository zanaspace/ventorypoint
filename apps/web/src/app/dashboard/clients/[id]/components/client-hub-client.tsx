"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Package,
  Boxes,
  Settings,
  Plus,
  Search,
  Download,
  Shield,
  Edit2,
  Trash2,
  ArrowRightLeft,
  Sliders,
  ShieldAlert,
  History,
  MapPin,
  Box,
  Barcode,
  ExternalLink,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Phone,
  Mail,
  User,
  Filter,
  Check,
  PauseCircle,
  PlayCircle,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { Sku } from "@/lib/types/catalog";
import { InventoryBalance } from "@/lib/types/inventory";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import { TablePagination } from "@/components/ui/table-pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Modal } from "@/components/ui/modal";

// Catalog Modals & Actions
import { CreateSkuModal } from "@/app/dashboard/catalog/components/create-sku-modal";
import { BatchCreateSkuModal } from "@/app/dashboard/catalog/components/batch-create-sku-modal";
import { EditSkuModal } from "@/app/dashboard/catalog/components/edit-sku-modal";
import { deleteSkuAction, getSkus } from "@/app/dashboard/catalog/actions";
import { exportCatalogToCsv } from "@/lib/catalog/csv-engine";

// Inventory Modals & Actions
import { MoveInventoryModal } from "@/app/dashboard/inventory/components/move-inventory-modal";
import { AdjustInventoryModal } from "@/app/dashboard/inventory/components/adjust-inventory-modal";
import { ChangeStatusModal } from "@/app/dashboard/inventory/components/change-status-modal";
import { TimelineDrawer } from "@/app/dashboard/inventory/components/timeline-drawer";
import { BatchInboundReceiptModal } from "@/app/dashboard/inventory/components/batch-inbound-receipt-modal";
import { getInventoryBalances } from "@/app/dashboard/inventory/actions";
import { updateClientAccount, setClientStatus } from "@/app/dashboard/clients/actions";
import { AdjustmentReason } from "@/lib/types/inventory";

const DEFAULT_ADJUSTMENT_REASONS: AdjustmentReason[] = [
  { code: "cycle_count_discrepancy", description: "Cycle Count Discrepancy", category: "correction", requires_supervisor_approval: false, direction: "both", is_active: true },
  { code: "damaged_goods", description: "Damaged Goods Found", category: "damage", requires_supervisor_approval: false, direction: "out", is_active: true },
  { code: "loss_shrinkage", description: "Loss / Shrinkage", category: "loss", requires_supervisor_approval: true, direction: "out", is_active: true },
  { code: "found_stock", description: "Found Stock", category: "gain", requires_supervisor_approval: false, direction: "in", is_active: true },
];

interface ClientAccount {
  id: string;
  name: string;
  short_code: string;
  status: "active" | "suspended";
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  default_facility_id: string | null;
  facility_ids: string[];
  organization_id: string;
  created_at?: string;
}

interface FacilityOption {
  id: string;
  name: string;
  short_code: string;
  organization_id?: string;
}

interface ClientHubClientProps {
  client: ClientAccount;
  initialSkus: Sku[];
  totalSkus: number;
  initialBalances: InventoryBalance[];
  totalBalances: number;
  facilities: FacilityOption[];
  organizationId: string;
}

export function ClientHubClient({
  client: initialClient,
  initialSkus,
  totalSkus: _initialTotalSkus,
  initialBalances,
  totalBalances: _initialTotalBalances,
  facilities,
  organizationId,
}: ClientHubClientProps) {
  const router = useRouter();

  // Core Data State
  const [client, setClient] = useState<ClientAccount>(initialClient);
  const [skus, setSkus] = useState<Sku[]>(initialSkus);
  const [balances, setBalances] = useState<InventoryBalance[]>(initialBalances);
  const [activeTab, setActiveTab] = useState<"catalog" | "inventory" | "settings">("catalog");

  // Catalog Tab State
  const [catalogSearch, setCatalogSearch] = useState("");
  const [trackingFilter, setTrackingFilter] = useState("all");
  const [rotationFilter, setRotationFilter] = useState("all");
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(20);

  // Inventory Tab State
  const [inventorySearch, setInventorySearch] = useState("");
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "out_of_stock">("all");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState(20);

  // Modals State
  const [isCreateSkuOpen, setIsCreateSkuOpen] = useState(false);
  const [isBatchCreateSkuOpen, setIsBatchCreateSkuOpen] = useState(false);
  const [editingSku, setEditingSku] = useState<Sku | null>(null);

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedBalanceForMove, setSelectedBalanceForMove] = useState<InventoryBalance | null>(null);

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedBalanceForAdjust, setSelectedBalanceForAdjust] = useState<InventoryBalance | null>(null);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedBalanceForStatus, setSelectedBalanceForStatus] = useState<InventoryBalance | null>(null);

  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [timelineEntity, setTimelineEntity] = useState<{ type: string; id: string; label: string }>({
    type: "sku",
    id: "",
    label: "",
  });

  // Inbound Receipt Modal State
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveSkuId, setReceiveSkuId] = useState("");

  // Edit Client Settings State
  const [formName, setFormName] = useState(client.name);
  const [formShortCode, setFormShortCode] = useState(client.short_code);
  const [formEmail, setFormEmail] = useState(client.primary_contact_email || "");
  const [formContactName, setFormContactName] = useState(client.primary_contact_name || "");
  const [formPhone, setFormPhone] = useState(client.primary_contact_phone || "");
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>(client.facility_ids || []);
  const [defaultFacilityId, setDefaultFacilityId] = useState(client.default_facility_id || "");
  const [isUpdatingClient, setIsUpdatingClient] = useState(false);

  // Refresh Balances & SKUs
  const refreshData = async () => {
    const [skuRes, balRes] = await Promise.all([
      getSkus({ clientId: client.id, page: 1, pageSize: 200 }),
      getInventoryBalances({ clientId: client.id, page: 1, pageSize: 200 }),
    ]);
    if (skuRes.skus) setSkus(skuRes.skus);
    if (balRes.balances) setBalances(balRes.balances);
    router.refresh();
  };



  // Stock on Hand aggregation by SKU ID
  const skuStockMap = useMemo(() => {
    const map = new Map<string, number>();
    balances.forEach((bal) => {
      const current = map.get(bal.sku_id) || 0;
      map.set(bal.sku_id, current + Number(bal.on_hand_qty || 0));
    });
    return map;
  }, [balances]);

  // KPI Calculations
  const totalPhysicalUnits = useMemo(() => {
    return balances.reduce((sum, b) => sum + Number(b.on_hand_qty || 0), 0);
  }, [balances]);

  const totalAllocatedUnits = useMemo(() => {
    return balances.reduce((sum, b) => sum + Number(b.allocated_qty || 0), 0);
  }, [balances]);

  const uniqueLocationsCount = useMemo(() => {
    return new Set(balances.map((b) => b.location_id)).size;
  }, [balances]);

  // Filtered SKUs
  const filteredSkus = useMemo(() => {
    return skus.filter((sku) => {
      if (trackingFilter !== "all" && sku.tracking_class !== trackingFilter) return false;
      if (rotationFilter !== "all" && sku.rotation_rule !== rotationFilter) return false;
      if (catalogSearch.trim()) {
        const q = catalogSearch.toLowerCase();
        const matchesCode = sku.code.toLowerCase().includes(q);
        const matchesName = sku.name.toLowerCase().includes(q);
        const matchesBarcode = sku.barcodes?.some((b) => b.barcode.toLowerCase().includes(q));
        if (!matchesCode && !matchesName && !matchesBarcode) return false;
      }
      return true;
    });
  }, [skus, trackingFilter, rotationFilter, catalogSearch]);

  const paginatedSkus = useMemo(() => {
    const start = (catalogPage - 1) * catalogPageSize;
    return filteredSkus.slice(start, start + catalogPageSize);
  }, [filteredSkus, catalogPage, catalogPageSize]);

  // Filtered Balances
  const filteredBalances = useMemo(() => {
    return balances.filter((bal) => {
      if (facilityFilter !== "all" && bal.facility_id !== facilityFilter) return false;
      if (stockFilter === "out_of_stock" && Number(bal.on_hand_qty) > 0) return false;
      if (stockFilter === "in_stock" && Number(bal.on_hand_qty) === 0) return false;
      if (inventorySearch.trim()) {
        const q = inventorySearch.toLowerCase();
        const matchesCode = bal.sku?.code.toLowerCase().includes(q);
        const matchesName = bal.sku?.name.toLowerCase().includes(q);
        const matchesLoc = bal.location?.full_code.toLowerCase().includes(q);
        const matchesLpn = bal.container?.lpn.toLowerCase().includes(q);
        if (!matchesCode && !matchesName && !matchesLoc && !matchesLpn) return false;
      }
      return true;
    });
  }, [balances, facilityFilter, stockFilter, inventorySearch]);

  const paginatedBalances = useMemo(() => {
    const start = (inventoryPage - 1) * inventoryPageSize;
    return filteredBalances.slice(start, start + inventoryPageSize);
  }, [filteredBalances, inventoryPage, inventoryPageSize]);

  // Handlers
  const handleDeleteSku = async (sku: Sku) => {
    if (!confirm(`Are you sure you want to delete ${sku.name} (${sku.code})?`)) return;
    const res = await deleteSkuAction(sku.id);
    if (!res.success) {
      toast.error(res.error || "Failed to delete SKU");
    } else {
      toast.success(`Product ${sku.name} deleted successfully`);
      setSkus((prev) => prev.filter((s) => s.id !== sku.id));
    }
  };

  const handleExportCatalog = () => {
    if (skus.length === 0) {
      toast.info("No SKUs available to export");
      return;
    }
    const csvContent = exportCatalogToCsv(skus);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${client.short_code}_catalog_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${skus.length} SKUs to CSV`);
  };



  const handleSaveClientSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdatingClient(true);
    const fd = new FormData();
    fd.append("name", formName.trim());
    fd.append("short_code", formShortCode.trim());
    fd.append("primary_contact_name", formContactName.trim());
    fd.append("primary_contact_email", formEmail.trim());
    fd.append("primary_contact_phone", formPhone.trim());
    if (defaultFacilityId) fd.append("default_facility_id", defaultFacilityId);
    selectedFacilityIds.forEach((fid) => fd.append("facility_ids", fid));

    const res = await updateClientAccount(client.id, fd);
    if (res.error) {
      toast.error(res.error);
    } else if (res.data) {
      toast.success("Client account settings updated successfully!");
      setClient(res.data);
    }
    setIsUpdatingClient(false);
  };

  const handleToggleStatus = async () => {
    const nextStatus = client.status === "active" ? "suspended" : "active";
    const res = await setClientStatus(client.id, nextStatus);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(`Client account ${nextStatus === "active" ? "reactivated" : "suspended"}`);
      setClient((prev) => ({ ...prev, status: nextStatus }));
    }
  };

  const openTimeline = (type: string, id: string, label: string) => {
    setTimelineEntity({ type, id, label });
    setIsTimelineOpen(true);
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Breadcrumb & Return Bar */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard/clients"
          className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
          <span>Back to All Clients</span>
        </Link>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">Client ID:</span>
          <span className="font-mono font-bold text-foreground bg-muted px-2 py-0.5 rounded border border-border/60">
            {client.short_code}
          </span>
        </div>
      </div>

      {/* Main Client Profile Hero Card */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-7 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start md:items-center gap-4.5">
            {/* Client Avatar Initial */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 via-brand/10 to-primary/5 border border-primary/30 flex items-center justify-center text-primary font-black text-2xl shadow-sm shrink-0">
              {client.name.charAt(0).toUpperCase()}
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
                  {client.name}
                </h1>
                <span className="px-2.5 py-0.5 rounded font-mono font-bold text-xs bg-muted text-foreground border border-border">
                  {client.short_code}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                    client.status === "active"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                  }`}
                >
                  {client.status}
                </span>
              </div>

              {/* Contact Metadata Strip */}
              <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-muted-foreground">
                {client.primary_contact_name && (
                  <span className="flex items-center gap-1.5 font-medium text-foreground/80">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    {client.primary_contact_name}
                  </span>
                )}
                {client.primary_contact_email && (
                  <span className="flex items-center gap-1.5 font-mono">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    {client.primary_contact_email}
                  </span>
                )}
                {client.primary_contact_phone && (
                  <span className="flex items-center gap-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    {client.primary_contact_phone}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Hero Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                if (skus.length > 0 && !receiveSkuId) {
                  setReceiveSkuId(skus[0].id);
                }
                setIsReceiveModalOpen(true);
              }}
              className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Inbound Stock Intake</span>
            </button>

            <ActionDropdown
              variant="primary"
              triggerText="Add Product"
              triggerIcon={<Plus className="w-3.5 h-3.5" />}
              className="px-3.5 py-2 text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-[0.99]"
              align="end"
              width={260}
              actions={[
                {
                  label: "Add Single Product",
                  description: "Detailed form with tracking rules & barcode",
                  icon: <Plus className="w-4 h-4 text-primary" />,
                  onClick: () => setIsCreateSkuOpen(true),
                },
                {
                  label: "Add Multiple Products",
                  description: "Fast multi-line entry in a single table",
                  icon: <Layers className="w-4 h-4 text-primary" />,
                  onClick: () => setIsBatchCreateSkuOpen(true),
                },
              ]}
            />

            <button
              onClick={() => setActiveTab("settings")}
              className="px-3.5 py-2 text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border/60">
          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Catalog SKUs</span>
              <Package className="w-4 h-4 text-primary" />
            </div>
            <div className="text-xl font-extrabold text-foreground">{skus.length}</div>
            <p className="text-[11px] text-muted-foreground">Product lines registered</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Physical Stock</span>
              <Boxes className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-extrabold text-foreground font-mono">
              {totalPhysicalUnits} <span className="text-xs font-normal text-muted-foreground">units</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {totalAllocatedUnits > 0 ? `${totalAllocatedUnits} allocated` : "100% available"}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Occupied Locations</span>
              <MapPin className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-extrabold text-foreground">{uniqueLocationsCount}</div>
            <p className="text-[11px] text-muted-foreground">Racks & staging bins</p>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/30 border border-border/70 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
              <span>Assigned Facilities</span>
              <Building2 className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-extrabold text-foreground">
              {client.facility_ids?.length || 0}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {facilities
                .filter((f) => client.facility_ids?.includes(f.id))
                .map((f) => f.short_code)
                .join(", ") || "None"}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-border text-sm font-semibold gap-1">
        <button
          onClick={() => setActiveTab("catalog")}
          className={`pb-3 px-4 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "catalog"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Product Catalogue</span>
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-mono text-muted-foreground">
            {skus.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("inventory")}
          className={`pb-3 px-4 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "inventory"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Physical Inventory Ledger</span>
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-mono text-muted-foreground">
            {balances.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-3 px-4 border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "settings"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Account Settings & Facilities</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PRODUCT CATALOGUE */}
      {/* ========================================================================= */}
      {activeTab === "catalog" && (
        <div className="space-y-4">
          {/* Catalog Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => {
                  setCatalogSearch(e.target.value);
                  setCatalogPage(1);
                }}
                placeholder="Search products by name, SKU, or barcode..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Tracking filter */}
              <div className="w-36">
                <SearchableSelect
                  value={trackingFilter}
                  onChange={(val) => {
                    setTrackingFilter(val);
                    setCatalogPage(1);
                  }}
                  options={[
                    { value: "all", label: "All Tracking" },
                    { value: "non_unique", label: "Non-Unique" },
                    { value: "lot", label: "Lot Tracked" },
                    { value: "serial", label: "Serialized" },
                  ]}
                  searchable={false}
                  size="sm"
                />
              </div>

              {/* Rotation filter */}
              <div className="w-32">
                <SearchableSelect
                  value={rotationFilter}
                  onChange={(val) => {
                    setRotationFilter(val);
                    setCatalogPage(1);
                  }}
                  options={[
                    { value: "all", label: "All Rotation" },
                    { value: "fifo", label: "FIFO" },
                    { value: "fefo", label: "FEFO" },
                    { value: "lifo", label: "LIFO" },
                  ]}
                  searchable={false}
                  size="sm"
                />
              </div>

              <button
                onClick={handleExportCatalog}
                className="px-3 py-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 text-foreground border border-border rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={() => setIsCreateSkuOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New SKU</span>
              </button>
            </div>
          </div>

          {/* Catalog Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-3.5">Product Name & SKU</th>
                    <th className="px-5 py-3.5">Primary Barcode</th>
                    <th className="px-5 py-3.5">Tracking Class</th>
                    <th className="px-5 py-3.5">Rotation Rule</th>
                    <th className="px-5 py-3.5 text-right">Physical Stock</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedSkus.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground space-y-2">
                        <Package className="w-8 h-8 mx-auto text-muted-foreground/50" />
                        <p className="font-semibold text-foreground text-sm">No SKUs found for this client</p>
                        <p className="text-xs">
                          {catalogSearch
                            ? "Try refining your search filter."
                            : "Click '+ Add Product' to create this client's first product."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedSkus.map((sku) => {
                      const primaryBarcode =
                        sku.barcodes?.find((b) => b.is_primary)?.barcode ||
                        sku.barcodes?.[0]?.barcode ||
                        "—";
                      const onHand = skuStockMap.get(sku.id) || 0;

                      return (
                        <tr key={sku.id} className="hover:bg-muted/30 transition-colors">
                          {/* Product Name & SKU */}
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-foreground text-sm line-clamp-1">
                              {sku.name}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground/50">SKU:</span>
                              <span className="font-normal text-muted-foreground/80">{sku.code}</span>
                            </div>
                          </td>

                          {/* Primary Barcode */}
                          <td className="px-5 py-3.5 font-mono text-xs text-foreground">
                            {primaryBarcode}
                          </td>

                          {/* Tracking Class */}
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted border border-border/80 capitalize">
                              <Shield className="w-3 h-3 text-primary" />
                              {sku.tracking_class.replace(/_/g, " ")}
                            </span>
                          </td>

                          {/* Rotation Rule */}
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-[11px] font-bold text-muted-foreground uppercase bg-muted/60 px-2 py-0.5 rounded">
                              {sku.rotation_rule}
                            </span>
                          </td>

                          {/* Physical Stock Badge */}
                          <td className="px-5 py-3.5 text-right font-mono font-bold">
                            {onHand > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                <span>{onHand} units</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                <span>0 (Out of stock)</span>
                              </span>
                            )}
                          </td>

                          {/* Actions Dropdown */}
                          <td className="px-5 py-3.5 text-right">
                            <ActionDropdown
                              triggerText="Actions"
                              actions={[
                                {
                                  label: "Edit Product & Stock",
                                  icon: <Edit2 className="w-4 h-4 text-primary" />,
                                  onClick: () => setEditingSku(sku),
                                },
                                {
                                  label: "Inbound Intake for SKU",
                                  icon: <Boxes className="w-4 h-4 text-emerald-500" />,
                                  onClick: () => {
                                    setReceiveSkuId(sku.id);
                                    setIsReceiveModalOpen(true);
                                  },
                                },
                                {
                                  label: "Delete SKU",
                                  icon: <Trash2 className="w-4 h-4" />,
                                  danger: true,
                                  onClick: () => handleDeleteSku(sku),
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

            {/* Pagination */}
            {filteredSkus.length > 0 && (
              <div className="p-4 border-t border-border">
                <TablePagination
                  currentPage={catalogPage}
                  totalPages={Math.ceil(filteredSkus.length / catalogPageSize)}
                  itemsPerPage={catalogPageSize}
                  onPageChange={setCatalogPage}
                  onItemsPerPageChange={(val) => {
                    setCatalogPageSize(val);
                    setCatalogPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INVENTORY LEDGER */}
      {/* ========================================================================= */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          {/* Inventory Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-xl border border-border shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={inventorySearch}
                onChange={(e) => {
                  setInventorySearch(e.target.value);
                  setInventoryPage(1);
                }}
                placeholder="Search stock by SKU, product name, or location..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Facility Filter */}
              <div className="w-48">
                <SearchableSelect
                  value={facilityFilter}
                  onChange={(val) => {
                    setFacilityFilter(val);
                    setInventoryPage(1);
                  }}
                  options={[
                    { value: "all", label: "All Facilities" },
                    ...facilities.map((fac) => ({
                      value: fac.id,
                      label: `${fac.name} (${fac.short_code})`,
                    })),
                  ]}
                  searchable={facilities.length > 4}
                  size="sm"
                />
              </div>

              {/* Stock Filter */}
              <div className="w-36">
                <SearchableSelect
                  value={stockFilter}
                  onChange={(val) => {
                    setStockFilter(val as "all" | "in_stock" | "out_of_stock");
                    setInventoryPage(1);
                  }}
                  options={[
                    { value: "all", label: "Stock: All" },
                    { value: "in_stock", label: "In Stock (>0)" },
                    { value: "out_of_stock", label: "Out of Stock (0)" },
                  ]}
                  searchable={false}
                  size="sm"
                />
              </div>

              <button
                onClick={() => {
                  if (skus.length > 0 && !receiveSkuId) {
                    setReceiveSkuId(skus[0].id);
                  }
                  setIsReceiveModalOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Inbound Stock</span>
              </button>

              <button
                onClick={refreshData}
                className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted border border-border transition-colors cursor-pointer"
                title="Refresh Balances"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Balances Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-4">Product Name & SKU</th>
                    <th className="py-3 px-4">Location Address</th>
                    <th className="py-3 px-4">Container (LPN)</th>
                    <th className="py-3 px-4">Tracking (Lot / SN)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">On-Hand Qty</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedBalances.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-muted-foreground space-y-2">
                        <Boxes className="w-8 h-8 mx-auto text-muted-foreground/50" />
                        <p className="font-semibold text-foreground text-sm">No physical stock balances recorded</p>
                        <p className="text-xs">
                          {inventorySearch
                            ? "Try refining your search filter."
                            : "Click '+ Inbound Stock' to record physical on-hand inventory for this client."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedBalances.map((bal) => {
                      const statusColors: Record<string, string> = {
                        available: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                        allocated: "bg-blue-500/10 text-blue-600 border-blue-500/20",
                        hold: "bg-amber-500/10 text-amber-600 border-amber-500/20",
                        damaged: "bg-rose-500/10 text-rose-600 border-rose-500/20",
                        expired: "bg-purple-500/10 text-purple-600 border-purple-500/20",
                      };

                      return (
                        <tr key={bal.id} className="hover:bg-muted/30 transition-colors">
                          {/* Product & SKU */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-foreground text-sm truncate max-w-xs">
                              {bal.sku?.name || "Unnamed Product"}
                            </div>
                            <div className="font-mono text-[11px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground/50">SKU:</span>
                              <span className="font-normal text-muted-foreground/80">{bal.sku?.code}</span>
                            </div>
                          </td>

                          {/* Location */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 font-mono font-semibold text-foreground">
                              <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span>{bal.location?.full_code}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                              {bal.location?.human_path}
                            </div>
                          </td>

                          {/* Container */}
                          <td className="py-3.5 px-4 font-mono">
                            {bal.container ? (
                              <span className="px-2 py-0.5 rounded bg-muted/60 border border-border text-foreground font-semibold flex items-center gap-1.5 w-fit">
                                <Box className="w-3.5 h-3.5 text-primary" />
                                <span>{bal.container.lpn}</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">Loose Units</span>
                            )}
                          </td>

                          {/* Tracking */}
                          <td className="py-3.5 px-4">
                            {bal.lot ? (
                              <div className="font-mono text-xs">
                                <span className="text-muted-foreground">Lot: </span>
                                <span className="font-bold text-foreground">{bal.lot.lot_number}</span>
                                {bal.lot.expiry_date && (
                                  <div className="text-[10px] text-muted-foreground">
                                    Exp: {bal.lot.expiry_date}
                                  </div>
                                )}
                              </div>
                            ) : bal.serial ? (
                              <div className="font-mono text-xs">
                                <span className="text-muted-foreground">SN: </span>
                                <span className="font-bold text-foreground">{bal.serial.serial_number}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">Non-Unique</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                                statusColors[bal.status] || "bg-muted text-muted-foreground"
                              }`}
                            >
                              {bal.status}
                            </span>
                          </td>

                          {/* On-Hand Qty */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span
                                className={`font-mono font-bold text-sm ${
                                  Number(bal.on_hand_qty) === 0
                                    ? "text-rose-500"
                                    : "text-foreground"
                                }`}
                              >
                                {bal.on_hand_qty}
                              </span>
                              {Number(bal.on_hand_qty) === 0 ? (
                                <span className="text-[10px] font-semibold text-rose-500 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20 whitespace-nowrap mt-0.5">
                                  Out of Stock
                                </span>
                              ) : bal.allocated_qty > 0 ? (
                                <span className="block text-[10px] text-blue-500 font-mono">
                                  ({bal.allocated_qty} alloc)
                                </span>
                              ) : null}
                            </div>
                          </td>

                          {/* Actions Dropdown */}
                          <td className="py-3.5 px-4 text-right">
                            <ActionDropdown
                              triggerText="Actions"
                              actions={[
                                {
                                  label: "Relocate Stock",
                                  icon: <ArrowRightLeft className="w-4 h-4 text-primary" />,
                                  onClick: () => {
                                    setSelectedBalanceForMove(bal);
                                    setIsMoveModalOpen(true);
                                  },
                                },
                                {
                                  label: "Adjust Quantity",
                                  icon: <Sliders className="w-4 h-4 text-emerald-500" />,
                                  onClick: () => {
                                    setSelectedBalanceForAdjust(bal);
                                    setIsAdjustModalOpen(true);
                                  },
                                },
                                {
                                  label: "Change Status",
                                  icon: <ShieldAlert className="w-4 h-4 text-amber-500" />,
                                  onClick: () => {
                                    setSelectedBalanceForStatus(bal);
                                    setIsStatusModalOpen(true);
                                  },
                                },
                                {
                                  label: "View History",
                                  icon: <History className="w-4 h-4 text-purple-500" />,
                                  onClick: () => {
                                    if (bal.serial_id) {
                                      openTimeline("serial", bal.serial_id, `Serial: ${bal.serial?.serial_number}`);
                                    } else if (bal.lot_id) {
                                      openTimeline("lot", bal.lot_id, `Lot: ${bal.lot?.lot_number}`);
                                    } else if (bal.container_id) {
                                      openTimeline("container", bal.container_id, `LPN: ${bal.container?.lpn}`);
                                    } else {
                                      openTimeline("sku", bal.sku_id, `${bal.sku?.name || "SKU"}: ${bal.sku?.code}`);
                                    }
                                  },
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

            {/* Pagination */}
            {filteredBalances.length > 0 && (
              <div className="p-4 border-t border-border">
                <TablePagination
                  currentPage={inventoryPage}
                  totalPages={Math.ceil(filteredBalances.length / inventoryPageSize)}
                  itemsPerPage={inventoryPageSize}
                  onPageChange={setInventoryPage}
                  onItemsPerPageChange={(val) => {
                    setInventoryPageSize(val);
                    setInventoryPage(1);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ACCOUNT SETTINGS & FACILITIES */}
      {/* ========================================================================= */}
      {activeTab === "settings" && (
        <div className="bg-card border border-border rounded-2xl p-6 md:p-8 space-y-6 shadow-xs max-w-4xl">
          <div>
            <h2 className="text-lg font-bold text-foreground">Client Account Settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage merchant credentials, serving warehouse facility permissions, and primary contacts.
            </p>
          </div>

          <form onSubmit={handleSaveClientSettings} className="space-y-6">
            {/* General Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Client Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Client Short Code *</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={formShortCode}
                  onChange={(e) => setFormShortCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary uppercase"
                />
              </div>
            </div>

            {/* Contact Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-border">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Contact Person Name</label>
                <input
                  type="text"
                  value={formContactName}
                  onChange={(e) => setFormContactName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Contact Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="contact@brand.com"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Contact Phone</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Serving Warehouse Facilities */}
            <div className="space-y-3 pt-4 border-t border-border">
              <div>
                <label className="text-xs font-semibold text-foreground">Serving Warehouse Facilities</label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Select which warehouses are authorized to intake and store inventory for this brand.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {facilities.map((fac) => {
                  const isChecked = selectedFacilityIds.includes(fac.id);
                  const isDefault = defaultFacilityId === fac.id;

                  return (
                    <div
                      key={fac.id}
                      onClick={() => {
                        setSelectedFacilityIds((prev) =>
                          isChecked ? prev.filter((id) => id !== fac.id) : [...prev, fac.id]
                        );
                        if (isDefault && isChecked) setDefaultFacilityId("");
                      }}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between ${
                        isChecked
                          ? "bg-primary/5 border-primary/40 text-foreground"
                          : "bg-background border-border text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-primary" />
                          <span>{fac.name}</span>
                        </div>
                        <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border">
                          {fac.short_code}
                        </span>
                        {isDefault && (
                          <span className="block text-[10px] font-bold text-primary mt-1">
                            ★ Default Facility
                          </span>
                        )}
                      </div>

                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border mt-0.5 ${
                          isChecked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                        }`}
                      >
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedFacilityIds.length > 0 && (
                <div className="pt-2">
                  <label className="text-xs font-semibold text-foreground">Default Facility</label>
                  <div className="w-64 mt-1.5">
                    <SearchableSelect
                      value={defaultFacilityId}
                      onChange={(val) => setDefaultFacilityId(val)}
                      options={[
                        { value: "", label: "No default facility" },
                        ...facilities
                          .filter((f) => selectedFacilityIds.includes(f.id))
                          .map((f) => ({ value: f.id, label: `${f.name} (${f.short_code})` })),
                      ]}
                      size="sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Account Status Toggle */}
            <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-xl">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-foreground">Account Status</span>
                <p className="text-[11px] text-muted-foreground">
                  Current status: <span className="font-bold uppercase text-foreground">{client.status}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleStatus}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  client.status === "active"
                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20 hover:bg-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20"
                }`}
              >
                {client.status === "active" ? (
                  <>
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>Suspend Account</span>
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Reactivate Account</span>
                  </>
                )}
              </button>
            </div>

            {/* Save Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
              <button
                type="submit"
                disabled={isUpdatingClient}
                className="px-5 py-2 text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {isUpdatingClient ? "Saving Changes..." : "Save Account Settings"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MULTI-LINE INBOUND INTAKE MODAL */}
      {/* ========================================================================= */}
      <BatchInboundReceiptModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        title={`Inbound Stock Intake: ${client.name}`}
        facilities={facilities}
        defaultFacilityId={client.default_facility_id || facilities[0]?.id || ""}
        skus={skus}
        initialSkuId={receiveSkuId}
        clientName={client.name}
        onSuccess={() => {
          setIsReceiveModalOpen(false);
          refreshData();
        }}
      />

      {/* ========================================================================= */}
      {/* CATALOG MODALS */}
      {/* ========================================================================= */}
      <CreateSkuModal
        isOpen={isCreateSkuOpen}
        onClose={() => setIsCreateSkuOpen(false)}
        clients={[{ id: client.id, name: client.name, short_code: client.short_code }]}
        facilities={facilities}
        organizationId={organizationId}
        defaultClientId={client.id}
        onSuccess={() => {
          setIsCreateSkuOpen(false);
          refreshData();
        }}
      />

      <BatchCreateSkuModal
        isOpen={isBatchCreateSkuOpen}
        onClose={() => setIsBatchCreateSkuOpen(false)}
        clients={[{ id: client.id, name: client.name, short_code: client.short_code }]}
        facilities={facilities}
        organizationId={organizationId}
        defaultClientId={client.id}
        onSuccess={() => {
          setIsBatchCreateSkuOpen(false);
          refreshData();
        }}
      />

      <EditSkuModal
        isOpen={!!editingSku}
        onClose={() => setEditingSku(null)}
        sku={editingSku}
        facilities={facilities}
        onSuccess={() => {
          setEditingSku(null);
          refreshData();
        }}
      />

      {/* ========================================================================= */}
      {/* INVENTORY MODALS */}
      {/* ========================================================================= */}
      {selectedBalanceForMove && (
        <MoveInventoryModal
          isOpen={isMoveModalOpen}
          onClose={() => {
            setIsMoveModalOpen(false);
            setSelectedBalanceForMove(null);
          }}
          balance={selectedBalanceForMove}
          facilityId={selectedBalanceForMove.facility_id}
          onSuccess={() => {
            setIsMoveModalOpen(false);
            setSelectedBalanceForMove(null);
            refreshData();
          }}
        />
      )}

      {selectedBalanceForAdjust && (
        <AdjustInventoryModal
          isOpen={isAdjustModalOpen}
          onClose={() => {
            setIsAdjustModalOpen(false);
            setSelectedBalanceForAdjust(null);
          }}
          balance={selectedBalanceForAdjust}
          facilityId={selectedBalanceForAdjust.facility_id}
          reasons={DEFAULT_ADJUSTMENT_REASONS}
          onSuccess={() => {
            setIsAdjustModalOpen(false);
            setSelectedBalanceForAdjust(null);
            refreshData();
          }}
        />
      )}

      {selectedBalanceForStatus && (
        <ChangeStatusModal
          isOpen={isStatusModalOpen}
          onClose={() => {
            setIsStatusModalOpen(false);
            setSelectedBalanceForStatus(null);
          }}
          balance={selectedBalanceForStatus}
          facilityId={selectedBalanceForStatus.facility_id}
          onSuccess={() => {
            setIsStatusModalOpen(false);
            setSelectedBalanceForStatus(null);
            refreshData();
          }}
        />
      )}

      <TimelineDrawer
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        itemType={timelineEntity.type}
        itemId={timelineEntity.id}
        label={timelineEntity.label}
      />
    </div>
  );
}
