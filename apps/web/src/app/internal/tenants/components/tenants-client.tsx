"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  Warehouse,
  Users,
  Smartphone,
  Activity,
  Search,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Filter,
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  plan: string;
  status: "active" | "suspended";
  facilities_count: number;
  members_count: number;
  clients_count: number;
  devices_count: number;
  events_count_30d: number;
  notes_count: number;
}

interface TenantsClientProps {
  tenants: TenantSummary[];
}

export function TenantsClient({ tenants }: TenantsClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");

  const stats = useMemo(() => {
    return {
      totalOrgs: tenants.length,
      totalFacilities: tenants.reduce((acc, t) => acc + t.facilities_count, 0),
      totalMembers: tenants.reduce((acc, t) => acc + t.members_count, 0),
      totalDevices: tenants.reduce((acc, t) => acc + t.devices_count, 0),
      totalEvents: tenants.reduce((acc, t) => acc + t.events_count_30d, 0),
    };
  }, [tenants]);

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchSearch =
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.slug.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchPlan =
        planFilter === "all" || t.plan.toLowerCase() === planFilter.toLowerCase();
      return matchSearch && matchStatus && matchPlan;
    });
  }, [tenants, search, statusFilter, planFilter]);

  return (
    <div className="space-y-6">
      {/* Platform KPI Summary Header */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Building2 className="size-4 text-brand" /> Tenants
          </div>
          <div className="mt-2 font-heading text-3xl font-medium tracking-tight text-foreground">
            {stats.totalOrgs}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Active 3PL accounts</div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Warehouse className="size-4 text-blue-500" /> Warehouses
          </div>
          <div className="mt-2 font-heading text-3xl font-medium tracking-tight text-foreground">
            {stats.totalFacilities}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Operating facilities</div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="size-4 text-emerald-500" /> Users & Staff
          </div>
          <div className="mt-2 font-heading text-3xl font-medium tracking-tight text-foreground">
            {stats.totalMembers}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Operators & managers</div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Smartphone className="size-4 text-amber-500" /> Floor Terminals
          </div>
          <div className="mt-2 font-heading text-3xl font-medium tracking-tight text-foreground">
            {stats.totalDevices}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Active scanning stations</div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="size-4 text-purple-500" /> 30D Events
          </div>
          <div className="mt-2 font-heading text-3xl font-medium tracking-tight text-foreground">
            {stats.totalEvents.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Warehouse events recorded</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organizations by name or slug..."
            className="h-10 w-full rounded-lg border border-border bg-white dark:bg-black/20 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition-all focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Filter className="size-3.5" /> Filter:
          </div>
          <div className="w-36">
            <SearchableSelect
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "active", label: "Active" },
                { value: "suspended", label: "Suspended" },
              ]}
              searchable={false}
              size="sm"
            />
          </div>

          <div className="w-36">
            <SearchableSelect
              value={planFilter}
              onChange={(val) => setPlanFilter(val)}
              options={[
                { value: "all", label: "All Plans" },
                { value: "launch", label: "Launch" },
                { value: "growth", label: "Growth" },
                { value: "scale", label: "Scale" },
              ]}
              searchable={false}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-gray-50/60 dark:bg-white/5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <tr>
                <th className="px-5 py-3.5">Tenant Organization</th>
                <th className="px-3 py-3.5">Plan</th>
                <th className="px-3 py-3.5 text-center">Warehouses</th>
                <th className="px-3 py-3.5 text-center">Members</th>
                <th className="px-3 py-3.5 text-center">Brands</th>
                <th className="px-3 py-3.5 text-center">Devices</th>
                <th className="px-3 py-3.5 text-right">30D Scans</th>
                <th className="px-3 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-muted-foreground">
                    <Building2 className="mx-auto size-8 text-muted-foreground/50 mb-2" />
                    No tenant organizations found matching filters.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const planBadgeClass = {
                    launch: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800",
                    growth: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800",
                    scale: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
                  }[t.plan.toLowerCase()] ?? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700";

                  return (
                    <tr key={t.id} className="hover:bg-accent/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-heading font-semibold text-foreground text-sm">
                          {t.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">
                          /{t.slug} · Joined {new Date(t.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold capitalize border ${planBadgeClass}`}
                        >
                          {t.plan}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center font-medium text-foreground">
                        {t.facilities_count}
                      </td>
                      <td className="px-3 py-4 text-center font-medium text-foreground">
                        {t.members_count}
                      </td>
                      <td className="px-3 py-4 text-center font-medium text-foreground">
                        {t.clients_count}
                      </td>
                      <td className="px-3 py-4 text-center font-medium text-foreground">
                        {t.devices_count}
                      </td>
                      <td className="px-3 py-4 text-right font-mono text-xs font-medium text-foreground">
                        {t.events_count_30d.toLocaleString()}
                      </td>
                      <td className="px-3 py-4 text-center">
                        {t.status === "active" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                            <AlertCircle className="size-3.5 text-red-600 dark:text-red-400" /> Suspended
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/internal/tenants/${t.id}`}
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-gray-50 dark:hover:bg-white/5 hover:border-brand hover:text-brand-text transition-all shadow-xs"
                        >
                          Manage <ExternalLink className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
