"use client";

import { useState } from "react";
import {
  Activity,
  TrendingUp,
  Clock,
  Zap,
  ShieldCheck,
  BarChart3,
  Users,
  Warehouse,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface AnalyticsClientProps {
  kpis: {
    totalEvents: number;
    weeklyActiveFacilities: number;
    fifteenMinutePickRate: number; // percentage
    medianTimeToFirstReceiptHours: number;
  };
  featureAdoption: Array<{
    name: string;
    category: string;
    adoptionPct: number;
    activeTenantsCount: number;
  }>;
  recentEvents: Array<{
    id: string;
    event_name: string;
    org_id_hash: string;
    created_at: string;
    properties: Record<string, any>;
  }>;
}

export function AnalyticsClient({
  kpis,
  featureAdoption,
  recentEvents,
}: AnalyticsClientProps) {
  const [filterEvent, setFilterEvent] = useState<string>("all");

  const filteredEvents =
    filterEvent === "all"
      ? recentEvents
      : recentEvents.filter((e) => e.event_name === filterEvent);

  const eventTypes = Array.from(new Set(recentEvents.map((e) => e.event_name)));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Product Analytics & Platform KPIs
          </h1>
          <p className="font-sans text-sm text-muted-foreground mt-1">
            Pseudonymous product metrics measuring onboarding velocity, floor throughput, and the 15-minute rule.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="size-3.5" /> PII Strip Enforced
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: 15-Minute Rule */}
        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">15-Min Pick Rule</span>
            <Zap className="size-4 text-amber-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-foreground">
            {kpis.fifteenMinutePickRate}%
          </div>
          <p className="text-[11px] text-muted-foreground">
            Picks completed &lt; 15 mins from order import. Target: &gt; 90%.
          </p>
        </div>

        {/* KPI 2: Time to First Receipt */}
        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Time to 1st Receipt</span>
            <Clock className="size-4 text-brand-text" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-foreground">
            {kpis.medianTimeToFirstReceiptHours}h
          </div>
          <p className="text-[11px] text-muted-foreground">
            Median onboarding to live ASN scan. Target: &lt; 24h.
          </p>
        </div>

        {/* KPI 3: Weekly Active Facilities */}
        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Facilities</span>
            <Warehouse className="size-4 text-emerald-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-foreground">
            {kpis.weeklyActiveFacilities}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Warehouses performing floor scans in the past 7 days.
          </p>
        </div>

        {/* KPI 4: Total Events */}
        <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Telemetry Events</span>
            <Activity className="size-4 text-purple-500" />
          </div>
          <div className="font-heading text-3xl font-extrabold text-foreground">
            {kpis.totalEvents.toLocaleString()}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Aggregated pseudonymous usage telemetry.
          </p>
        </div>
      </div>

      {/* Feature Adoption Breakdown */}
      <div className="overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div>
          <h3 className="font-heading text-base font-bold text-foreground">
            Core Feature Adoption Matrix
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Adoption rate across active tenants for key wedge and Phase 1 capabilities.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {featureAdoption.map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-border/60 bg-surface/50 p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-foreground">{item.name}</h4>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
                    {item.category}
                  </span>
                </div>
                <span className="font-heading text-base font-extrabold text-foreground">
                  {item.adoptionPct}%
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all duration-500"
                  style={{ width: `${item.adoptionPct}%` }}
                />
              </div>

              <div className="text-[11px] text-muted-foreground">
                {item.activeTenantsCount} active tenants configured
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Telemetry Stream Log */}
      <div className="overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-bold text-foreground">
              Live Pseudonymous Event Stream
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated PII scrubbing guarantees no names, emails, or phone numbers enter analytics storage.
            </p>
          </div>

          {/* Event Filter */}
          <div className="flex items-center gap-2 min-w-[200px]">
            <SearchableSelect
              value={filterEvent}
              onChange={(val) => setFilterEvent(val)}
              options={[
                { value: "all", label: "All Events" },
                ...eventTypes.map((et) => ({ value: et, label: et })),
              ]}
              size="sm"
            />
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            No telemetry events matching filter. Telemetry logs continuously as warehouse floor actions occur.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">Event Name</th>
                  <th className="py-2.5 px-3">Tenant (Hashed)</th>
                  <th className="py-2.5 px-3">Properties</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredEvents.map((e) => (
                  <tr key={e.id} className="hover:bg-accent/30 font-mono">
                    <td className="py-2.5 px-3 font-semibold text-foreground">
                      <span className="rounded bg-brand/10 text-brand px-2 py-0.5 text-[11px]">
                        {e.event_name}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {e.org_id_hash.slice(0, 12)}...
                    </td>
                    <td className="py-2.5 px-3 text-foreground/80 max-w-xs truncate">
                      {JSON.stringify(e.properties)}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                      {new Date(e.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
