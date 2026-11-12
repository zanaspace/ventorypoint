"use client";

import { useState, useEffect } from "react";
import {
  Box,
  X,
  MapPin,
  Layers,
  Barcode,
  Loader2,
  Printer,
  CheckCircle,
} from "lucide-react";
import {
  createContainerAction,
  moveContainerAction,
  updateContainerAction,
  getFacilityLocationsAction,
  FacilityLocationOption,
} from "../actions";
import { Container, ContainerType, ContainerStatus } from "@/lib/types/inventory";
import { SearchableSelect } from "@/components/ui/searchable-select";

const CONTAINER_TYPE_OPTIONS = [
  { value: "pallet", label: "Pallet (Standard Wood / Plastic)" },
  { value: "case", label: "Master Shipping Case" },
  { value: "tote", label: "Picking Tote" },
  { value: "cart", label: "Mobile Floor Cart" },
];

const CONTAINER_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  { value: "archived", label: "Archived" },
];

interface ContainerModalProps {
  isOpen: boolean;
  onClose: () => void;
  facilityId: string;
  facilities?: { id: string; name: string; short_code?: string }[];
  existingContainer?: Container | null;
  mode: "create" | "edit" | "move";
  onSuccess?: () => void;
}

export function ContainerModal({
  isOpen,
  onClose,
  facilityId,
  facilities,
  existingContainer,
  mode,
  onSuccess,
}: ContainerModalProps) {
  const defaultFacilityId =
    facilityId && facilityId !== "all"
      ? facilityId
      : (facilities && facilities.length > 0 ? facilities[0].id : "");

  const [targetFacilityId, setTargetFacilityId] = useState(defaultFacilityId);

  useEffect(() => {
    if (facilityId && facilityId !== "all") {
      setTargetFacilityId(facilityId);
    } else if (facilities && facilities.length > 0) {
      setTargetFacilityId(facilities[0].id);
    }
  }, [facilityId, facilities, isOpen]);

  // Locations state for searchable dropdown
  const [locations, setLocations] = useState<FacilityLocationOption[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  const activeLocationFacilityId =
    mode === "move" && existingContainer?.facility_id
      ? existingContainer.facility_id
      : targetFacilityId;

  useEffect(() => {
    if (!isOpen) return;
    if (!activeLocationFacilityId || activeLocationFacilityId === "all") return;

    let isMounted = true;
    setIsLoadingLocations(true);
    getFacilityLocationsAction(activeLocationFacilityId)
      .then((locs) => {
        if (isMounted) {
          setLocations(locs);
          setIsLoadingLocations(false);
        }
      })
      .catch(() => {
        if (isMounted) setIsLoadingLocations(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeLocationFacilityId]);

  // Create mode state
  const [lpn, setLpn] = useState(`LPN-${Math.floor(100000 + Math.random() * 900000)}`);
  const [containerType, setContainerType] = useState<ContainerType>("pallet");
  const [currentLocationId, setCurrentLocationId] = useState("");
  const [parentContainerId, setParentContainerId] = useState("");

  // Edit mode state
  const [editContainerType, setEditContainerType] = useState<ContainerType>("pallet");
  const [editStatus, setEditStatus] = useState<ContainerStatus>("active");
  const [editTareWeight, setEditTareWeight] = useState("0");
  const [editMaxWeight, setEditMaxWeight] = useState("");

  useEffect(() => {
    if (existingContainer && mode === "edit") {
      setEditContainerType(existingContainer.container_type);
      setEditStatus(existingContainer.status);
      setEditTareWeight(String(existingContainer.tare_weight_kg ?? 0));
      setEditMaxWeight(existingContainer.max_weight_kg ? String(existingContainer.max_weight_kg) : "");
    }
  }, [existingContainer, mode, isOpen]);

  // Move mode state
  const [targetLocationId, setTargetLocationId] = useState("");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      if (mode === "create") {
        if (!targetFacilityId || targetFacilityId === "all") {
          setError("Please select a valid facility to provision this LPN container.");
          return;
        }

        setIsSubmitting(true);
        const res = await createContainerAction({
          facilityId: targetFacilityId,
          lpn: lpn.trim(),
          containerType,
          currentLocationId: currentLocationId.trim() || null,
          parentContainerId: parentContainerId.trim() || null,
        });

        if (!res.success) {
          setError(res.error || "Failed to create container.");
        } else {
          onSuccess?.();
          onClose();
        }
      } else if (mode === "edit") {
        if (!existingContainer) return;
        setIsSubmitting(true);
        const res = await updateContainerAction({
          id: existingContainer.id,
          containerType: editContainerType,
          status: editStatus,
          tareWeightKg: parseFloat(editTareWeight) || 0,
          maxWeightKg: editMaxWeight ? parseFloat(editMaxWeight) : null,
        });

        if (!res.success) {
          setError(res.error || "Failed to update container.");
        } else {
          onSuccess?.();
          onClose();
        }
      } else {
        if (!existingContainer) return;
        setIsSubmitting(true);
        const res = await moveContainerAction({
          lpn: existingContainer.lpn,
          toLocationId: targetLocationId.trim(),
          notes: notes.trim() || undefined,
        });

        if (!res.success) {
          setError(res.error || "Failed to move container.");
        } else {
          onSuccess?.();
          onClose();
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error executing action";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl max-w-lg w-full max-h-[min(90vh,740px)] shadow-2xl overflow-hidden flex flex-col my-auto">
        {/* Pinned Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">
                {mode === "create"
                  ? "Provision License Plate (LPN)"
                  : mode === "edit"
                  ? "Edit Container LPN Settings"
                  : "Relocate Container LPN"}
              </h2>
              <p className="text-xs text-muted-foreground font-mono">
                {mode === "create"
                  ? "Track pallets, cases, totes, and mobile carts"
                  : mode === "edit"
                  ? `Configure properties for ${existingContainer?.lpn}`
                  : `Moving ${existingContainer?.lpn} and all contents`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body with Scrollable Area and Pinned Footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-xl">
                {error}
              </div>
            )}

          {mode === "create" ? (
            <>
              {/* Facility Selection */}
              {facilities && facilities.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Facility *</label>
                  <SearchableSelect
                    value={targetFacilityId}
                    onChange={(val) => setTargetFacilityId(val)}
                    options={facilities.map((fac) => ({
                      value: fac.id,
                      label: `Facility: ${fac.name} (${fac.short_code || fac.id.slice(0, 8)})`,
                    }))}
                    searchable={facilities.length > 5}
                  />
                </div>
              )}

              {/* LPN Barcode */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>LPN Barcode Identifier *</span>
                  <button
                    type="button"
                    onClick={() => setLpn(`LPN-${Math.floor(100000 + Math.random() * 900000)}`)}
                    className="text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Generate New
                  </button>
                </label>
                <div className="relative">
                  <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={lpn}
                    onChange={(e) => setLpn(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {/* Container Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Container Type *</label>
                <SearchableSelect
                  value={containerType}
                  onChange={(val) => setContainerType(val as ContainerType)}
                  options={CONTAINER_TYPE_OPTIONS}
                  searchable={false}
                />
              </div>

              {/* Initial Location */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Initial Physical Location (Optional)</span>
                  <span className="text-[11px] text-muted-foreground">Dock, Staging or Rack</span>
                </label>
                <SearchableSelect
                  value={currentLocationId}
                  onChange={(val) => setCurrentLocationId(val)}
                  placeholder={
                    isLoadingLocations
                      ? "Loading facility locations..."
                      : "Select location (or leave unassigned)..."
                  }
                  options={[
                    { value: "", label: "Unassigned (Dock / Receiving Floor)" },
                    ...locations.map((loc) => ({
                      value: loc.id,
                      label: loc.full_code,
                      description: loc.human_path || undefined,
                      badge: loc.location_type.replace(/_/g, " "),
                    })),
                  ]}
                  searchable={locations.length > 5}
                  allowCustomValue={true}
                  customValueLabel={(query) => `Custom Code / Scan: "${query}"`}
                />
              </div>

              {/* Parent Container (Nesting) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Parent Container / Pallet LPN (Optional)</span>
                  <span className="text-[11px] text-muted-foreground">Nesting hierarchy</span>
                </label>
                <div className="relative">
                  <Layers className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={parentContainerId}
                    onChange={(e) => setParentContainerId(e.target.value)}
                    placeholder="Parent pallet LPN (e.g. LPN-100234)..."
                    className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </>
          ) : mode === "edit" ? (
            <>
              {/* LPN Identifier Banner */}
              <div className="p-3 rounded-lg bg-muted/40 border border-border flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">LPN Identifier</div>
                  <div className="font-mono font-bold text-sm text-foreground">{existingContainer?.lpn}</div>
                </div>
                <div className="text-right space-y-0.5">
                  <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Current Location</div>
                  <div className="font-mono text-xs text-foreground font-semibold">
                    {existingContainer?.location?.full_code || "Unassigned"}
                  </div>
                </div>
              </div>

              {/* Container Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Container Type *</label>
                <SearchableSelect
                  value={editContainerType}
                  onChange={(val) => setEditContainerType(val as ContainerType)}
                  options={CONTAINER_TYPE_OPTIONS}
                  searchable={false}
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Container Status *</label>
                <SearchableSelect
                  value={editStatus}
                  onChange={(val) => setEditStatus(val as ContainerStatus)}
                  options={CONTAINER_STATUS_OPTIONS}
                  searchable={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Tare Weight */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Tare Weight (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editTareWeight}
                    onChange={(e) => setEditTareWeight(e.target.value)}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                {/* Max Weight */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground">Max Capacity (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editMaxWeight}
                    onChange={(e) => setEditMaxWeight(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Move Mode */}
              <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Moving LPN:</span>
                  <span className="font-mono font-bold text-foreground">{existingContainer?.lpn}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Current Location:</span>
                  <span className="font-mono text-muted-foreground">
                    {existingContainer?.location?.full_code || "Unassigned"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">Target Destination Location *</label>
                  {isLoadingLocations ? (
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin text-primary" /> Loading racks...
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Search or Browse</span>
                  )}
                </div>
                <SearchableSelect
                  value={targetLocationId}
                  onChange={(val) => setTargetLocationId(val)}
                  placeholder={
                    isLoadingLocations
                      ? "Loading warehouse locations..."
                      : locations.length === 0
                      ? "No locations found (type code or scan barcode)..."
                      : "Search by code, aisle, bay, or location type..."
                  }
                  options={locations.map((loc) => ({
                    value: loc.id,
                    label: loc.full_code,
                    description: loc.human_path || undefined,
                    badge: loc.location_type.replace(/_/g, " "),
                  }))}
                  searchable={true}
                  allowCustomValue={true}
                  customValueLabel={(query) => `Custom Code / Scan: "${query}"`}
                />
                <p className="text-[11px] text-muted-foreground">
                  Choose from the facility&apos;s registered racks/bays or type to filter by aisle, bay, or location type.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Forklift / Move Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional movement reference or driver badge..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>
            </>
          )}

          </div>

          {/* Sticky Actions Footer */}
          <div className="px-6 py-3.5 border-t border-border bg-muted/10 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-border rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {mode === "create" ? "Provision LPN" : mode === "edit" ? "Save Changes" : "Relocate Container"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
