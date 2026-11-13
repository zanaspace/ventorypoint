"use client";

import { useState } from "react";
import {
  Boxes,
  Search,
  Plus,
  ArrowRightLeft,
  Sliders,
  ShieldAlert,
  History,
  Calendar,
  Box,
  Barcode,
  Layers,
  FileCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
  MapPin,
  ChevronRight,
  Filter,
  Pencil,
  Trash2,
} from "lucide-react";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  InventoryBalance,
  InventoryTransaction,
  Container,
  Lot,
  Serial,
  InventoryAdjustment,
  AdjustmentReason,
  WhereIsResult,
} from "@/lib/types/inventory";
import { WhereIsDrawer } from "./where-is-drawer";
import { TimelineDrawer } from "./timeline-drawer";
import { MoveInventoryModal } from "./move-inventory-modal";
import { AdjustInventoryModal } from "./adjust-inventory-modal";
import { ChangeStatusModal } from "./change-status-modal";
import { ContainerModal } from "./container-modal";
import { AdjustmentApprovalModal } from "./adjustment-approval-modal";
import { BatchInboundReceiptModal } from "./batch-inbound-receipt-modal";
import { Sku } from "@/lib/types/catalog";
import { useRouter } from "next/navigation";
import { evaluateExpiryAction, runReconciliationAction, deleteContainerAction } from "../actions";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ActionDropdown } from "@/components/ui/action-dropdown";

interface FacilityOption {
  id: string;
  name: string;
  short_code: string;
}

interface ClientOption {
  id: string;
  name: string;
  short_code: string;
}

interface InventoryClientProps {
  initialFacilityId: string;
  facilities: FacilityOption[];
  clients: ClientOption[];
  initialBalances: InventoryBalance[];
  initialBalancesTotal: number;
  initialContainers: Container[];
  initialLots: Lot[];
  initialSerials: Serial[];
  initialSerialsTotal: number;
  initialAdjustments: InventoryAdjustment[];
  initialTransactions: InventoryTransaction[];
  initialTransactionsTotal: number;
  adjustmentReasons: AdjustmentReason[];
  skus?: Sku[];
}

export function InventoryClient({
  initialFacilityId,
  facilities,
  clients,
  initialBalances,
  initialBalancesTotal,
  initialContainers,
  initialLots,
  initialSerials,
  initialSerialsTotal,
  initialAdjustments,
  initialTransactions,
  initialTransactionsTotal,
  adjustmentReasons,
  skus = [],
}: InventoryClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    "balances" | "containers" | "lots" | "serials" | "adjustments" | "transactions"
  >("balances");

  const [selectedFacilityId, setSelectedFacilityId] = useState(
    initialFacilityId && initialFacilityId !== "all"
      ? initialFacilityId
      : facilities[0]?.id || "all"
  );
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "out_of_stock">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Drawers state
  const [isWhereIsDrawerOpen, setIsWhereIsDrawerOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [timelineEntity, setTimelineEntity] = useState<{ type: string; id: string; label: string }>({
    type: "sku",
    id: "",
    label: "",
  });

  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedBalanceForMove, setSelectedBalanceForMove] = useState<InventoryBalance | WhereIsResult | null>(null);

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedBalanceForAdjust, setSelectedBalanceForAdjust] = useState<InventoryBalance | null>(null);

  const [isBatchReceiveOpen, setIsBatchReceiveOpen] = useState(false);

  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedBalanceForStatus, setSelectedBalanceForStatus] = useState<InventoryBalance | null>(null);

  const [isContainerModalOpen, setIsContainerModalOpen] = useState(false);
  const [containerModalMode, setContainerModalMode] = useState<"create" | "edit" | "move">("create");
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [deletingContainerId, setDeletingContainerId] = useState<string | null>(null);

  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<InventoryAdjustment | null>(null);

  // Status Action Message
  const [bannerMsg, setBannerMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [isEvaluatingExpiry, setIsEvaluatingExpiry] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);

  // Filtered in-memory data
  const filteredBalances = initialBalances.filter((b) => {
    if (selectedFacilityId !== "all" && b.facility_id !== selectedFacilityId) return false;
    if (selectedClientId !== "all" && b.sku?.client_account_id !== selectedClientId) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (stockFilter === "in_stock" && Number(b.on_hand_qty) <= 0) return false;
    if (stockFilter === "out_of_stock" && Number(b.on_hand_qty) > 0) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const codeMatch = b.sku?.code.toLowerCase().includes(q);
      const nameMatch = b.sku?.name.toLowerCase().includes(q);
      const locMatch = b.location?.full_code.toLowerCase().includes(q);
      const lpnMatch = b.container?.lpn.toLowerCase().includes(q);
      const lotMatch = b.lot?.lot_number.toLowerCase().includes(q);
      const snMatch = b.serial?.serial_number.toLowerCase().includes(q);
      return codeMatch || nameMatch || locMatch || lpnMatch || lotMatch || snMatch;
    }
    return true;
  });

  const filteredContainers = initialContainers.filter((c) => {
    if (selectedFacilityId !== "all" && c.facility_id !== selectedFacilityId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return c.lpn.toLowerCase().includes(q) || c.location?.full_code.toLowerCase().includes(q);
    }
    return true;
  });

  const filteredLots = initialLots.filter((l) => {
    if (selectedClientId !== "all" && l.client_account_id !== selectedClientId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return l.lot_number.toLowerCase().includes(q) || l.sku?.code.toLowerCase().includes(q);
    }
    return true;
  });

  const pendingAdjustmentsCount = initialAdjustments.filter((a) => a.approval_status === "pending").length;

  const handleEvaluateExpiry = async () => {
    setIsEvaluatingExpiry(true);
    setBannerMsg(null);
    try {
      const res = await evaluateExpiryAction();
      if (res.success) {
        setBannerMsg({
          text: `Expiry evaluation complete: ${res.data?.lots_marked_expired} expired lots updated, ${res.data?.balances_moved_to_expired} balances moved to expired status.`,
          type: "success",
        });
      } else {
        setBannerMsg({ text: res.error || "Failed to evaluate expiry.", type: "error" });
      }
    } catch (err: unknown) {
      setBannerMsg({ text: "Error running expiry evaluation.", type: "error" });
    } finally {
      setIsEvaluatingExpiry(false);
    }
  };

  const handleRunReconciliation = async () => {
    if (!selectedFacilityId) return;
    setIsReconciling(true);
    setBannerMsg(null);
    try {
      const res = await runReconciliationAction(selectedFacilityId);
      if (res.success) {
        setBannerMsg({
          text: `Ledger reconciliation verified clean: ${res.data?.total_checked} balances checked, 0 discrepancies found.`,
          type: "success",
        });
      } else {
        setBannerMsg({ text: res.error || "Failed to run reconciliation.", type: "error" });
      }
    } catch (err: unknown) {
      setBannerMsg({ text: "Error running reconciliation.", type: "error" });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleDeleteContainer = async (c: Container) => {
    if (!confirm(`Are you sure you want to delete container LPN "${c.lpn}"? This cannot be undone.`)) {
      return;
    }

    setDeletingContainerId(c.id);
    try {
      const res = await deleteContainerAction(c.id);
      if (!res.success) {
        setBannerMsg({ text: res.error || "Failed to delete container.", type: "error" });
      } else {
        setBannerMsg({ text: `Container ${c.lpn} deleted successfully.`, type: "success" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error deleting container";
      setBannerMsg({ text: msg, type: "error" });
    } finally {
      setDeletingContainerId(null);
    }
  };

  const openTimeline = (type: string, id: string, label: string) => {
    setTimelineEntity({ type, id, label });
    setIsTimelineOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Alert */}
      {bannerMsg && (
        <div
          className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between border animate-in fade-in ${
            bannerMsg.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-600 border-rose-500/20"
          }`}
        >
          <span>{bannerMsg.text}</span>
          <button onClick={() => setBannerMsg(null)} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
      )}

      {/* Header and Quick Actions Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Inventory Ledger</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-accent text-accent-foreground border border-accent-foreground/20">
              Live Physical Ledger
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Real-time balance projection, LPN license plates, FEFO rotation, and append-only audit trail
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 w-full lg:w-auto">
          {/* Facility Selector */}
          <div className="w-full sm:w-56">
            <SearchableSelect
              value={selectedFacilityId}
              onChange={(val) => setSelectedFacilityId(val)}
              options={[
                { value: "all", label: "All Facilities" },
                ...facilities.map((fac) => ({
                  value: fac.id,
                  label: `Facility: ${fac.name} (${fac.short_code})`,
                })),
              ]}
              searchable={facilities.length > 5}
            />
          </div>

          {/* Quick Actions Mobile Grid (2-col on mobile, flex on tablet/desktop) */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Unified "Where Is It?" Search Button */}
            <button
              onClick={() => setIsWhereIsDrawerOpen(true)}
              className="col-span-2 sm:col-auto px-4 py-2 bg-primary text-primary-foreground hover:bg-primary-hover rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[38px]"
            >
              <Search className="w-3.5 h-3.5 text-primary-foreground" />
              <span>&ldquo;Where Is It?&rdquo; Scan</span>
            </button>

            {/* Inbound Stock Intake */}
            <button
              onClick={() => setIsBatchReceiveOpen(true)}
              className="col-span-1 sm:col-auto px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[38px]"
            >
              <Boxes className="w-3.5 h-3.5 text-white" />
              <span>Inbound Receipt</span>
            </button>

            {/* New Container LPN Button */}
            <button
              onClick={() => {
                setContainerModalMode("create");
                setSelectedContainer(null);
                setIsContainerModalOpen(true);
              }}
              className="col-span-1 sm:col-auto px-3.5 py-2 bg-surface hover:bg-muted text-foreground border border-border rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>New LPN</span>
            </button>

            {/* Evaluate Expiry Button */}
            <button
              onClick={handleEvaluateExpiry}
              disabled={isEvaluatingExpiry}
              className="col-span-1 sm:col-auto px-3 py-2 bg-surface hover:bg-muted text-muted-foreground hover:text-foreground border border-border rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]"
              title="Evaluate FEFO shelf-life rules and auto-segregate expired lots"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvaluatingExpiry ? "animate-spin text-primary" : ""}`} />
              <span>FEFO Expiry</span>
            </button>

            {/* Reconcile Ledger Button */}
            <button
              onClick={handleRunReconciliation}
              disabled={isReconciling}
              className="col-span-1 sm:col-auto px-3 py-2 bg-surface hover:bg-muted text-muted-foreground hover:text-foreground border border-border rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]"
              title="Verify live balances match complete event projection"
            >
              <FileCheck className={`w-3.5 h-3.5 ${isReconciling ? "animate-spin text-primary" : ""}`} />
              <span>Reconcile</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Bar with smooth horizontal swipe on touch devices */}
      <div className="flex border-b border-border overflow-x-auto no-scrollbar gap-1 -mx-3 px-3 sm:mx-0 sm:px-0">
        <button
          onClick={() => setActiveTab("balances")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === "balances"
              ? "border-primary text-primary bg-accent/40"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Balances by SKU & Location</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground">
            {filteredBalances.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("containers")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === "containers"
              ? "border-primary text-primary bg-accent/40"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Box className="w-4 h-4" />
          <span>Containers & LPNs</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground">
            {filteredContainers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("lots")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === "lots"
              ? "border-primary text-primary bg-accent/40"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Lots & Expiry (FEFO)</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground">
            {filteredLots.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("serials")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === "serials"
              ? "border-primary text-primary bg-accent/40"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Barcode className="w-4 h-4" />
          <span>Unique Serials</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground">
            {initialSerials.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("adjustments")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === "adjustments"
              ? "border-primary text-primary bg-accent/40"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>Approval Queue</span>
          {pendingAdjustmentsCount > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {pendingAdjustmentsCount}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground">0</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("transactions")}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all whitespace-nowrap shrink-0 ${
            activeTab === "transactions"
              ? "border-primary text-primary bg-accent/40"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Ledger Audit Trail</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-muted text-muted-foreground">
            {initialTransactionsTotal}
          </span>
        </button>
      </div>

      {/* Filter Bar: Responsive Stacking */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-surface border border-border">
        {/* Search Input - Full width on mobile */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by SKU, Location, LPN, Lot, Serial..."
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono transition-all"
          />
        </div>

        {/* Dropdowns Row - 2-col grid on mobile, flex on tablet/desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-row items-center gap-2 w-full sm:w-auto">
          {activeTab === "balances" && (
            <>
              <div className="w-full sm:w-44">
                <SearchableSelect
                  value={stockFilter}
                  onChange={(val) => setStockFilter(val as any)}
                  options={[
                    { value: "all", label: "Stock: All (incl. 0)" },
                    { value: "in_stock", label: "Stock: In Stock (> 0)" },
                    { value: "out_of_stock", label: "Stock: Out of Stock (0)" },
                  ]}
                  searchable={false}
                  size="sm"
                />
              </div>

              <div className="w-full sm:w-36">
                <SearchableSelect
                  value={statusFilter}
                  onChange={(val) => setStatusFilter(val)}
                  options={[
                    { value: "all", label: "All Statuses" },
                    { value: "available", label: "Available" },
                    { value: "allocated", label: "Allocated" },
                    { value: "hold", label: "Hold" },
                    { value: "damaged", label: "Damaged" },
                    { value: "expired", label: "Expired" },
                  ]}
                  searchable={false}
                  size="sm"
                />
              </div>
            </>
          )}

          <div className="w-full sm:w-48">
            <SearchableSelect
              value={selectedClientId}
              onChange={(val) => setSelectedClientId(val)}
              options={[
                { value: "all", label: "All Clients" },
                ...clients.map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.short_code})`,
                })),
              ]}
              searchable={clients.length > 5}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Tab 1: Balances by SKU & Location */}
      {activeTab === "balances" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Mobile Card List (< md) */}
          <div className="block md:hidden divide-y divide-border">
            {filteredBalances.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2 px-4">
                <Boxes className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">No inventory balances recorded</p>
                <p className="text-xs">Inbound receiving or transfers will populate this live ledger.</p>
              </div>
            ) : (
              filteredBalances.map((bal) => {
                const statusColors: Record<string, string> = {
                  available: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                  allocated: "bg-blue-500/10 text-blue-600 border-blue-500/20",
                  hold: "bg-amber-500/10 text-amber-600 border-amber-500/20",
                  damaged: "bg-rose-500/10 text-rose-600 border-rose-500/20",
                  expired: "bg-purple-500/10 text-purple-600 border-purple-500/20",
                };

                return (
                  <div key={bal.id} className="p-4 space-y-3 hover:bg-muted/20 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-foreground text-sm leading-snug">{bal.sku?.name || "Unnamed Product"}</div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-muted text-foreground">
                            {bal.sku?.code}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${statusColors[bal.status] || "bg-muted text-muted-foreground"}`}>
                            {bal.status}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-base text-foreground">
                          {bal.on_hand_qty} <span className="text-[10px] text-muted-foreground font-normal">units</span>
                        </div>
                        {bal.allocated_qty > 0 && (
                          <div className="text-[10px] text-blue-500 font-mono">({bal.allocated_qty} alloc)</div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/50">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Location</span>
                        <div className="flex items-center gap-1 font-mono font-semibold text-foreground text-xs mt-0.5">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          <span className="truncate">{bal.location?.full_code}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Container</span>
                        <div className="font-mono text-xs mt-0.5 truncate">
                          {bal.container ? (
                            <span className="font-semibold text-foreground flex items-center gap-1">
                              <Box className="w-3 h-3 text-primary shrink-0" />
                              {bal.container.lpn}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Loose Units</span>
                          )}
                        </div>
                      </div>

                      <div className="col-span-2">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Tracking</span>
                        <div className="font-mono text-xs mt-0.5">
                          {bal.lot ? (
                            <span className="text-foreground">
                              Lot: <strong>{bal.lot.lot_number}</strong> {bal.lot.expiry_date ? `(Exp: ${bal.lot.expiry_date})` : ""}
                            </span>
                          ) : bal.serial ? (
                            <span className="text-foreground">
                              SN: <strong>{bal.serial.serial_number}</strong>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Non-Unique Product</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mobile Action Row */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
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
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop & Tablet Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[850px] text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-4">Product Name & SKU</th>
                  <th className="py-3 px-4">Location Address</th>
                  <th className="py-3 px-4">Container (LPN)</th>
                  <th className="py-3 px-4">Tracking (Lot / SN)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">On-Hand Qty</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-muted-foreground space-y-2">
                      <Boxes className="w-8 h-8 mx-auto text-muted-foreground/60" />
                      <p className="font-semibold text-foreground">No inventory balances recorded</p>
                      <p className="text-xs">Inbound receiving or transfers will populate this live ledger.</p>
                    </td>
                  </tr>
                ) : (
                  filteredBalances.map((bal) => {
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
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 font-mono font-semibold text-foreground">
                            <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>{bal.location?.full_code}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                            {bal.location?.human_path}
                          </div>
                        </td>

                        {/* Container */}
                        <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                          {bal.container ? (
                            <span className="px-2 py-0.5 rounded bg-muted/60 border border-border text-foreground font-semibold flex items-center gap-1.5 w-fit">
                              <Box className="w-3.5 h-3.5 text-primary" />
                              <span>{bal.container.lpn}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic">Loose Units</span>
                          )}
                        </td>

                        {/* Tracking (Lot / Serial) */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
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
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                              statusColors[bal.status] || "bg-muted text-muted-foreground"
                            }`}
                          >
                            {bal.status}
                          </span>
                        </td>

                        {/* On-Hand Qty */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-mono font-bold text-sm ${
                                Number(bal.on_hand_qty) === 0
                                  ? "text-rose-500 dark:text-rose-400"
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

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
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
        </div>
      )}

      {/* Tab 2: Containers / LPNs */}
      {activeTab === "containers" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Mobile Card List (< md) */}
          <div className="block md:hidden divide-y divide-border">
            {filteredContainers.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground space-y-2">
                <Box className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">No license plates provisioned</p>
                <p className="text-xs">Create pallet, case, or tote containers with &ldquo;New LPN&rdquo;.</p>
              </div>
            ) : (
              filteredContainers.map((c) => (
                <div key={c.id} className="p-4 space-y-2.5 hover:bg-muted/10 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-mono font-bold text-foreground text-sm">{c.lpn}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                      {c.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Type</span>
                      <span className="capitalize font-medium text-foreground">{c.container_type}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">Parent LPN</span>
                      <span className="font-mono text-muted-foreground text-xs">
                        {c.parent_container ? c.parent_container.lpn : <em className="text-muted-foreground/70">Top-level</em>}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <div className="flex items-center gap-1.5 font-mono text-xs text-foreground truncate max-w-[200px]">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{c.location?.full_code || "Unassigned"}</span>
                    </div>
                    <ActionDropdown
                      triggerText="Actions"
                      actions={[
                        {
                          label: "Relocate Container",
                          icon: <ArrowRightLeft className="w-4 h-4 text-primary" />,
                          onClick: () => {
                            setSelectedContainer(c);
                            setContainerModalMode("move");
                            setIsContainerModalOpen(true);
                          },
                        },
                        {
                          label: "Edit Details",
                          icon: <Pencil className="w-4 h-4 text-muted-foreground" />,
                          onClick: () => {
                            setSelectedContainer(c);
                            setContainerModalMode("edit");
                            setIsContainerModalOpen(true);
                          },
                        },
                        {
                          label: "View History",
                          icon: <History className="w-4 h-4 text-purple-500" />,
                          onClick: () => openTimeline("container", c.id, `LPN: ${c.lpn}`),
                        },
                        {
                          label: "Delete Container",
                          icon: <Trash2 className="w-4 h-4" />,
                          danger: true,
                          onClick: () => handleDeleteContainer(c),
                        },
                      ]}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop & Tablet Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[750px] text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-4">LPN Barcode</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Current Location</th>
                  <th className="py-3 px-4">Parent Container</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredContainers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground space-y-2">
                      <Box className="w-8 h-8 mx-auto text-muted-foreground/60" />
                      <p className="font-semibold text-foreground">No license plates provisioned</p>
                      <p className="text-xs">Create pallet, case, or tote containers with &ldquo;New LPN&rdquo;.</p>
                    </td>
                  </tr>
                ) : (
                  filteredContainers.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground text-sm whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Box className="w-4 h-4 text-primary shrink-0" />
                          <span>{c.lpn}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 capitalize font-medium text-foreground whitespace-nowrap">
                        {c.container_type}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-foreground">
                          {c.location?.full_code || "Unassigned"}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                          {c.location?.human_path}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                        {c.parent_container ? (
                          <span>{c.parent_container.lpn}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Top-level</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                          {c.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <ActionDropdown
                          triggerText="Actions"
                          actions={[
                            {
                              label: "Relocate Container",
                              icon: <ArrowRightLeft className="w-4 h-4 text-primary" />,
                              onClick: () => {
                                setSelectedContainer(c);
                                setContainerModalMode("move");
                                setIsContainerModalOpen(true);
                              },
                            },
                            {
                              label: "Edit Details",
                              icon: <Pencil className="w-4 h-4 text-muted-foreground" />,
                              onClick: () => {
                                setSelectedContainer(c);
                                setContainerModalMode("edit");
                                setIsContainerModalOpen(true);
                              },
                            },
                            {
                              label: "View History",
                              icon: <History className="w-4 h-4 text-purple-500" />,
                              onClick: () => openTimeline("container", c.id, `LPN: ${c.lpn}`),
                            },
                            {
                              label: "Delete Container",
                              icon: <Trash2 className="w-4 h-4" />,
                              danger: true,
                              onClick: () => handleDeleteContainer(c),
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
        </div>
      )}

      {/* Tab 3: Lots & Expiry (FEFO) */}
      {activeTab === "lots" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Mobile Card List (< md) */}
          <div className="block md:hidden divide-y divide-border">
            {filteredLots.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground space-y-2">
                <Calendar className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">No lot numbers recorded</p>
                <p className="text-xs">Lot-controlled receipts will register lots and shelf-life dates here.</p>
              </div>
            ) : (
              filteredLots.map((lot) => {
                const expiryBadge = {
                  ok: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                  near_expiry: "bg-amber-500/10 text-amber-600 border-amber-500/20",
                  expired: "bg-rose-500/10 text-rose-600 border-rose-500/20",
                }[lot.expiry_status] || "bg-muted text-muted-foreground";

                return (
                  <div key={lot.id} className="p-4 space-y-2.5 hover:bg-muted/10 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-foreground text-sm">
                          {lot.lot_number}
                        </span>
                        <div className="text-xs font-semibold text-foreground mt-0.5">
                          {lot.sku?.name || lot.sku?.code}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground">
                          SKU: {lot.sku?.code} · {lot.client?.name}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider shrink-0 ${expiryBadge}`}>
                        {lot.expiry_status.replace(/_/g, " ")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground font-mono">
                        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span>Expiry: {lot.expiry_date || "None"}</span>
                      </div>
                      <button
                        onClick={() => openTimeline("lot", lot.id, `Lot: ${lot.lot_number}`)}
                        className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors flex items-center gap-1 cursor-pointer"
                        title="Lot History Timeline"
                      >
                        <History className="w-3.5 h-3.5 text-purple-500" />
                        <span>History</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop & Tablet Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[750px] text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-4">Lot Number</th>
                  <th className="py-3 px-4">SKU Code & Title</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4 text-center">Rotation Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {filteredLots.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground space-y-2">
                      <Calendar className="w-8 h-8 mx-auto text-muted-foreground/60" />
                      <p className="font-semibold text-foreground">No lot numbers recorded</p>
                      <p className="text-xs">Lot-controlled receipts will register lots and shelf-life dates here.</p>
                    </td>
                  </tr>
                ) : (
                  filteredLots.map((lot) => {
                    const expiryBadge = {
                      ok: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
                      near_expiry: "bg-amber-500/10 text-amber-600 border-amber-500/20",
                      expired: "bg-rose-500/10 text-rose-600 border-rose-500/20",
                    }[lot.expiry_status] || "bg-muted text-muted-foreground";

                    return (
                      <tr key={lot.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-foreground text-sm whitespace-nowrap">
                          {lot.lot_number}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-foreground">{lot.sku?.code}</span>
                          <span className="block text-xs text-muted-foreground">{lot.sku?.name}</span>
                        </td>
                        <td className="py-3.5 px-4 font-medium text-foreground whitespace-nowrap">
                          {lot.client?.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono whitespace-nowrap">
                          {lot.expiry_date || <span className="text-muted-foreground italic">None</span>}
                        </td>
                        <td className="py-3.5 px-4 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${expiryBadge}`}
                          >
                            {lot.expiry_status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => openTimeline("lot", lot.id, `Lot: ${lot.lot_number}`)}
                            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors cursor-pointer"
                            title="Lot History Timeline"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Unique Serials */}
      {activeTab === "serials" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Mobile Card List (< md) */}
          <div className="block md:hidden divide-y divide-border">
            {initialSerials.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground space-y-2">
                <Barcode className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">No serialized units registered</p>
                <p className="text-xs">Serialized product receipts will record individual unit identities here.</p>
              </div>
            ) : (
              initialSerials.map((sr) => (
                <div key={sr.id} className="p-4 space-y-2.5 hover:bg-muted/10 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Barcode className="w-4 h-4 text-purple-500 shrink-0" />
                      <span className="font-mono font-bold text-foreground text-sm break-all">
                        {sr.serial_number}
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider shrink-0">
                      {sr.status}
                    </span>
                  </div>

                  <div>
                    <div className="font-semibold text-foreground text-xs">{sr.sku?.name || "Unnamed Product"}</div>
                    <div className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      SKU: {sr.sku?.code}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs">
                    <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-foreground font-semibold">{sr.location?.full_code || "Unassigned"}</span>
                      {sr.container && (
                        <span className="text-muted-foreground">· LPN: {sr.container.lpn}</span>
                      )}
                    </div>
                    <button
                      onClick={() => openTimeline("serial", sr.id, `Serial: ${sr.serial_number}`)}
                      className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors flex items-center gap-1 ml-auto cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-purple-500" />
                      <span>History</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop & Tablet Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-4">Serial / Unique ID</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Current Location</th>
                  <th className="py-3 px-4">Container (LPN)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {initialSerials.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground space-y-2">
                      <Barcode className="w-8 h-8 mx-auto text-muted-foreground/60" />
                      <p className="font-semibold text-foreground">No serialized units registered</p>
                      <p className="text-xs">Serialized product receipts will record individual unit identities here.</p>
                    </td>
                  </tr>
                ) : (
                  initialSerials.map((sr) => (
                    <tr key={sr.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground text-sm whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Barcode className="w-4 h-4 text-purple-500 shrink-0" />
                          <span>{sr.serial_number}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-foreground text-xs">{sr.sku?.name || "Unnamed Product"}</div>
                        <div className="font-mono text-[11px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground/50">SKU:</span>
                          <span className="font-normal text-muted-foreground/80">{sr.sku?.code}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                        {sr.location?.full_code || <span className="text-muted-foreground italic">Unassigned</span>}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                        {sr.container?.lpn || <span className="text-muted-foreground italic">Loose</span>}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                          {sr.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <ActionDropdown
                          triggerText="Actions"
                          actions={[
                            {
                              label: "View History",
                              icon: <History className="w-4 h-4 text-purple-500" />,
                              onClick: () => openTimeline("serial", sr.id, `Serial: ${sr.serial_number}`),
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
        </div>
      )}

      {/* Tab 5: Supervisor Approval Queue */}
      {activeTab === "adjustments" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Mobile Card List (< md) */}
          <div className="block md:hidden divide-y divide-border">
            {initialAdjustments.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground space-y-2">
                <FileCheck className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">Approval queue is empty</p>
                <p className="text-xs">Any physical count adjustments exceeding 10 units will appear here for review.</p>
              </div>
            ) : (
              initialAdjustments.map((adj) => (
                <div key={adj.id} className="p-4 space-y-3 hover:bg-muted/10 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono font-bold text-foreground text-sm">{adj.sku?.code}</span>
                      <span className="block text-xs font-mono text-muted-foreground mt-0.5">{adj.location?.full_code}</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider shrink-0 ${
                        adj.approval_status === "pending"
                          ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                          : adj.approval_status === "approved"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                      }`}
                    >
                      {adj.approval_status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-background border border-border text-center font-mono">
                    <div>
                      <span className="text-[10px] font-sans font-bold uppercase text-muted-foreground block">Current</span>
                      <span className="text-xs font-bold text-foreground">{adj.current_qty}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold uppercase text-muted-foreground block">Delta</span>
                      <span className={`text-xs font-bold ${adj.quantity_delta > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {adj.quantity_delta > 0 ? `+${adj.quantity_delta}` : adj.quantity_delta}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-sans font-bold uppercase text-muted-foreground block">Target</span>
                      <span className="text-xs font-bold text-foreground">{adj.target_qty}</span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <span className="font-semibold text-foreground block capitalize">
                      {adj.reason_code.replace(/_/g, " ")}
                    </span>
                    {adj.notes && <span className="text-muted-foreground block italic text-[11px]">&ldquo;{adj.notes}&rdquo;</span>}
                  </div>

                  <div className="pt-2 border-t border-border/50 flex justify-end">
                    {adj.approval_status === "pending" ? (
                      <button
                        onClick={() => {
                          setSelectedAdjustment(adj);
                          setIsApprovalModalOpen(true);
                        }}
                        className="w-full sm:w-auto px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary-hover transition-colors cursor-pointer"
                      >
                        Review Adjustment
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">Decision Completed</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop & Tablet Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-4">SKU & Location</th>
                  <th className="py-3 px-4 text-center">Current Qty</th>
                  <th className="py-3 px-4 text-center">Proposed Delta</th>
                  <th className="py-3 px-4 text-center">Target Qty</th>
                  <th className="py-3 px-4">Reason & Notes</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {initialAdjustments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-muted-foreground space-y-2">
                      <FileCheck className="w-8 h-8 mx-auto text-muted-foreground/60" />
                      <p className="font-semibold text-foreground">Approval queue is empty</p>
                      <p className="text-xs">Any physical count adjustments exceeding 10 units will appear here for review.</p>
                    </td>
                  </tr>
                ) : (
                  initialAdjustments.map((adj) => (
                    <tr key={adj.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="font-mono font-bold text-foreground text-sm">{adj.sku?.code}</span>
                        <span className="block text-xs font-mono text-muted-foreground">{adj.location?.full_code}</span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold text-foreground whitespace-nowrap">
                        {adj.current_qty}
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold whitespace-nowrap">
                        <span className={adj.quantity_delta > 0 ? "text-emerald-500" : "text-rose-500"}>
                          {adj.quantity_delta > 0 ? `+${adj.quantity_delta}` : adj.quantity_delta}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-center font-mono font-bold text-foreground whitespace-nowrap">
                        {adj.target_qty}
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <span className="font-semibold text-foreground block capitalize whitespace-nowrap">
                          {adj.reason_code.replace(/_/g, " ")}
                        </span>
                        {adj.notes && <span className="text-muted-foreground truncate block italic">{adj.notes}</span>}
                      </td>

                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                            adj.approval_status === "pending"
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              : adj.approval_status === "approved"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                          }`}
                        >
                          {adj.approval_status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {adj.approval_status === "pending" ? (
                          <button
                            onClick={() => {
                              setSelectedAdjustment(adj);
                              setIsApprovalModalOpen(true);
                            }}
                            className="px-3 py-1 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary-hover transition-colors cursor-pointer"
                          >
                            Review
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground font-mono">Completed</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Transaction History */}
      {activeTab === "transactions" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          {/* Mobile Card List (< md) */}
          <div className="block md:hidden divide-y divide-border">
            {initialTransactions.length === 0 ? (
              <div className="py-12 px-4 text-center text-muted-foreground space-y-2">
                <History className="w-8 h-8 mx-auto text-muted-foreground/60" />
                <p className="font-semibold text-foreground text-sm">No ledger transactions</p>
                <p className="text-xs">All movements, adjustments, and receipts generate immutable transaction lines.</p>
              </div>
            ) : (
              initialTransactions.map((tx) => (
                <div key={tx.id} className="p-4 space-y-2 hover:bg-muted/10 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider bg-muted text-foreground">
                      {tx.transaction_type.replace(/_/g, " ")}
                    </span>
                    <span className={`font-mono font-bold text-sm ${tx.quantity > 0 ? "text-emerald-500" : "text-foreground"}`}>
                      {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-foreground">{tx.sku?.code}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(tx.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono text-xs pt-1 border-t border-border/50">
                    <span className="text-muted-foreground">
                      {tx.from_location?.full_code || "Inbound"}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-primary font-bold">
                      {tx.to_location?.full_code || "Outbound"}
                    </span>
                  </div>

                  {(tx.reason_code || tx.notes) && (
                    <div className="text-[11px] text-muted-foreground pt-1">
                      {tx.reason_code && <span className="capitalize font-medium text-foreground mr-1.5">{tx.reason_code.replace(/_/g, " ")}</span>}
                      {tx.notes && <span className="italic truncate block">&ldquo;{tx.notes}&rdquo;</span>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Desktop & Tablet Table (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[850px] text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">SKU Code</th>
                  <th className="py-3 px-4">Physical Movement</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs">
                {initialTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-muted-foreground space-y-2">
                      <History className="w-8 h-8 mx-auto text-muted-foreground/60" />
                      <p className="font-semibold text-foreground">No ledger transactions</p>
                      <p className="text-xs">All movements, adjustments, and receipts generate immutable transaction lines.</p>
                    </td>
                  </tr>
                ) : (
                  initialTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider bg-muted text-foreground">
                          {tx.transaction_type.replace(/_/g, " ")}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-foreground whitespace-nowrap">
                        {tx.sku?.code}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">
                            {tx.from_location?.full_code || "Inbound"}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-primary font-bold">
                            {tx.to_location?.full_code || "Outbound"}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground whitespace-nowrap">
                        {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}
                      </td>

                      <td className="py-3.5 px-4 text-muted-foreground max-w-xs truncate">
                        {tx.reason_code && <span className="capitalize">{tx.reason_code.replace(/_/g, " ")}</span>}
                        {tx.notes && <span className="italic block truncate">&ldquo;{tx.notes}&rdquo;</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawers and Modals */}
      <WhereIsDrawer
        isOpen={isWhereIsDrawerOpen}
        onClose={() => setIsWhereIsDrawerOpen(false)}
        facilityId={selectedFacilityId}
        onSelectMove={(res) => {
          setSelectedBalanceForMove(res);
          setIsWhereIsDrawerOpen(false);
          setIsMoveModalOpen(true);
        }}
        onSelectTimeline={(type, id, label) => {
          setIsWhereIsDrawerOpen(false);
          openTimeline(type, id, label);
        }}
      />

      <TimelineDrawer
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        itemType={timelineEntity.type}
        itemId={timelineEntity.id}
        label={timelineEntity.label}
      />

      <MoveInventoryModal
        isOpen={isMoveModalOpen}
        onClose={() => setIsMoveModalOpen(false)}
        balance={selectedBalanceForMove}
        facilityId={selectedFacilityId}
        onSuccess={() => {
          setBannerMsg({ text: "Inventory successfully relocated.", type: "success" });
        }}
      />

      <AdjustInventoryModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        balance={selectedBalanceForAdjust}
        facilityId={selectedFacilityId}
        reasons={adjustmentReasons}
        onSuccess={() => {
          setBannerMsg({ text: "Adjustment processed successfully.", type: "success" });
        }}
      />

      <ChangeStatusModal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        balance={selectedBalanceForStatus}
        facilityId={selectedFacilityId}
        onSuccess={() => {
          setBannerMsg({ text: "Inventory status updated.", type: "success" });
        }}
      />

      <ContainerModal
        isOpen={isContainerModalOpen}
        onClose={() => setIsContainerModalOpen(false)}
        facilityId={selectedFacilityId}
        facilities={facilities}
        existingContainer={selectedContainer}
        mode={containerModalMode}
        onSuccess={() => {
          setBannerMsg({
            text:
              containerModalMode === "create"
                ? "Container LPN provisioned."
                : containerModalMode === "edit"
                ? "Container settings updated."
                : "Container relocated.",
            type: "success",
          });
        }}
      />

      <AdjustmentApprovalModal
        isOpen={isApprovalModalOpen}
        onClose={() => setIsApprovalModalOpen(false)}
        adjustment={selectedAdjustment}
        onSuccess={() => {
          setBannerMsg({ text: "Adjustment decision recorded.", type: "success" });
        }}
      />

      <BatchInboundReceiptModal
        isOpen={isBatchReceiveOpen}
        onClose={() => setIsBatchReceiveOpen(false)}
        facilities={facilities}
        defaultFacilityId={selectedFacilityId !== "all" ? selectedFacilityId : facilities[0]?.id || ""}
        skus={skus}
        onSuccess={() => {
          setIsBatchReceiveOpen(false);
          setBannerMsg({ text: "Inbound receipt recorded into ledger.", type: "success" });
          router.refresh();
        }}
      />
    </div>
  );
}
