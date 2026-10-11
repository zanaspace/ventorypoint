"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { ChevronDown, Check, Building2, Warehouse, Globe, Plus } from "lucide-react";
import Link from "next/link";
import {
  switchActiveOrganization,
  switchActiveFacility,
} from "@/lib/org-context";
import { useRouter } from "next/navigation";
import type {
  WorkspaceOrganization,
  WorkspaceFacility,
} from "@/lib/org-context-types";

interface WorkspaceSwitcherProps {
  organizations: WorkspaceOrganization[];
  activeOrg: WorkspaceOrganization | null;
  facilities: WorkspaceFacility[];
  activeFacilityId: string;
  isCollapsed?: boolean;
}

export function WorkspaceSwitcher({
  organizations,
  activeOrg,
  facilities,
  activeFacilityId,
  isCollapsed = false,
}: WorkspaceSwitcherProps) {
  const [orgOpen, setOrgOpen] = useState(false);
  const [facilityOpen, setFacilityOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const orgRef = useRef<HTMLDivElement>(null);
  const facilityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (orgRef.current && !orgRef.current.contains(event.target as Node)) {
        setOrgOpen(false);
      }
      if (facilityRef.current && !facilityRef.current.contains(event.target as Node)) {
        setFacilityOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOrgOpen(false);
        setFacilityOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const handleSelectOrg = (orgId: string) => {
    if (orgId === activeOrg?.id) {
      setOrgOpen(false);
      return;
    }
    setOrgOpen(false);
    startTransition(async () => {
      await switchActiveOrganization(orgId);
      window.location.href = "/dashboard";
    });
  };

  const handleSelectFacility = (facId: string) => {
    if (facId === activeFacilityId) {
      setFacilityOpen(false);
      return;
    }
    setFacilityOpen(false);
    startTransition(async () => {
      await switchActiveFacility(facId);
      router.refresh();
    });
  };

  const activeFacility =
    activeFacilityId === "all"
      ? null
      : facilities.find((f) => f.id === activeFacilityId);

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center gap-2 py-2 px-1">
        <div
          title={`${activeOrg?.name || "Organization"} (${activeOrg?.role || "Member"})`}
          className="w-9 h-9 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground font-bold text-xs shadow-sm cursor-pointer"
          onClick={() => setOrgOpen(!orgOpen)}
        >
          {activeOrg?.name?.slice(0, 2).toUpperCase() || "VP"}
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 space-y-2 border-b border-border">
      {/* Organization Switcher Dropdown */}
      <div className="relative" ref={orgRef}>
        <button
          type="button"
          disabled={isPending}
          aria-haspopup="listbox"
          aria-expanded={orgOpen}
          onClick={() => {
            setOrgOpen(!orgOpen);
            setFacilityOpen(false);
          }}
          className="dropdown-trigger h-auto py-2 px-2 bg-surface"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-accent border border-brand/20 flex items-center justify-center text-brand-text font-bold text-xs shrink-0">
              <Building2 className="w-4 h-4 text-brand-text" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-foreground truncate">
                {activeOrg?.name || "Select Org"}
              </div>
              <div className="text-[10px] text-muted-foreground capitalize flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success"></span>
                {activeOrg?.role?.replace("_", " ") || "Member"}
              </div>
            </div>
          </div>
          <ChevronDown className="dropdown-chevron size-3.5" strokeWidth={1.5} />
        </button>

        {orgOpen && (
          <div className="dropdown-panel absolute left-0 right-0 top-full mt-1 z-50" role="listbox" aria-label="Workspaces">
            <div className="dropdown-label">Your workspaces</div>
            <div className="dropdown-list max-h-48">
              {organizations.map((org) => {
                const isSelected = org.id === activeOrg?.id;
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => handleSelectOrg(org.id)}
                    role="option"
                    aria-selected={isSelected}
                    className="dropdown-item"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{org.name}</div>
                      <div className="text-xs font-normal text-muted-foreground capitalize">
                        {org.role.replace("_", " ")}
                      </div>
                    </div>
                    {isSelected && <Check className="dropdown-check" strokeWidth={2} />}
                  </button>
                );
              })}
            </div>

            <div className="dropdown-separator" />
            <div>
              <button
                type="button"
                onClick={() => {
                  setOrgOpen(false);
                  router.push("/onboarding?new=true");
                }}
                className="dropdown-item font-medium text-brand-text w-full text-left"
              >
                <Plus strokeWidth={1.5} />
                <span>Create or join existing one</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Facility Scope Switcher */}
      <div className="relative" ref={facilityRef}>
        <button
          type="button"
          disabled={isPending || facilities.length === 0}
          aria-haspopup="listbox"
          aria-expanded={facilityOpen}
          onClick={() => {
            setFacilityOpen(!facilityOpen);
            setOrgOpen(false);
          }}
          className="dropdown-trigger h-9 px-2"
          data-size="sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Warehouse className="w-3.5 h-3.5 text-brand-text shrink-0" />
            <div className="text-[11px] font-medium text-foreground truncate">
              {activeFacility ? `${activeFacility.name} (${activeFacility.code})` : "All Facilities (HQ)"}
            </div>
          </div>
          <ChevronDown className="dropdown-chevron size-3.5" strokeWidth={1.5} />
        </button>

        {facilityOpen && (
          <div className="dropdown-panel absolute left-0 right-0 top-full mt-1 z-50" role="listbox" aria-label="Facility scope">
            <div className="dropdown-label flex items-center justify-between">
              <span>Facility scope</span>
              <span className="font-medium normal-case tracking-normal">{facilities.length} active</span>
            </div>

            <button
              type="button"
              onClick={() => handleSelectFacility("all")}
              role="option"
              aria-selected={activeFacilityId === "all"}
              className="dropdown-item"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Globe strokeWidth={1.5} />
                <span className="truncate">All Facilities (HQ Overview)</span>
              </div>
              {activeFacilityId === "all" && <Check className="dropdown-check" strokeWidth={2} />}
            </button>

            <div className="dropdown-separator" />
            <div className="dropdown-list max-h-40">
              {facilities.map((fac) => {
                const isSelected = fac.id === activeFacilityId;
                return (
                  <button
                    key={fac.id}
                    type="button"
                    onClick={() => handleSelectFacility(fac.id)}
                    role="option"
                    aria-selected={isSelected}
                    className="dropdown-item"
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="truncate">{fac.name}</div>
                              <div className="text-xs font-normal text-muted-foreground">
                        <span className="font-mono">{fac.code}</span> {fac.city ? `• ${fac.city}` : ""}
                      </div>
                    </div>
                    {isSelected && <Check className="dropdown-check" strokeWidth={2} />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
