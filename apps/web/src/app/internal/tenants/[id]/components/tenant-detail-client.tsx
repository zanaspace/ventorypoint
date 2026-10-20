"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Warehouse,
  Users,
  Flag,
  FileText,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Send,
  Sliders,
  Building2,
  Clock,
  Shield,
  ShieldCheck,
  Lock,
} from "lucide-react";
import {
  toggleTenantStatus,
  updateTenantPlan,
  addTenantInternalNote,
  setTenantFeatureFlag,
} from "../../actions";
import { SearchableSelect } from "@/components/ui/searchable-select";

interface FacilityItem {
  id: string;
  name: string;
  short_code: string;
  city: string | null;
  state: string | null;
  country: string;
}

interface MemberItem {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  status: string;
  created_at: string;
}

interface FeatureFlagItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  effective_enabled: boolean;
  is_overridden: boolean;
}

interface NoteItem {
  id: string;
  content: string;
  created_at: string;
  author_email?: string | null;
}

interface ActiveSupportGrant {
  id: string;
  scope: string;
  duration_hours: number;
  reason: string | null;
  starts_at: string;
  expires_at: string;
}

interface TenantDetailClientProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
    plan: string;
    is_active: boolean;
    country: string;
    timezone: string;
    currency: string;
  };
  facilities: FacilityItem[];
  members: MemberItem[];
  featureFlags: FeatureFlagItem[];
  notes: NoteItem[];
  activeGrant?: ActiveSupportGrant | null;
}

export function TenantDetailClient({
  tenant,
  facilities,
  members,
  featureFlags,
  notes: initialNotes,
  activeGrant,
}: TenantDetailClientProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "facilities" | "members" | "flags">("overview");
  const [isActive, setIsActive] = useState(tenant.is_active);
  const [plan, setPlan] = useState(tenant.plan || "launch");
  const [flags, setFlags] = useState(featureFlags);
  const [notes, setNotes] = useState(initialNotes);
  const [newNote, setNewNote] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [savingFlag, setSavingFlag] = useState<string | null>(null);

  const handleToggleStatus = async () => {
    const next = !isActive;
    if (!confirm(`Are you sure you want to ${next ? "activate" : "suspend"} tenant "${tenant.name}"?`)) return;
    setIsActive(next);
    await toggleTenantStatus(tenant.id, next);
  };

  const handlePlanChange = async (newPlan: string) => {
    setPlan(newPlan);
    await updateTenantPlan(tenant.id, newPlan);
  };

  const handleToggleFlag = async (flag: FeatureFlagItem, targetState: boolean) => {
    setSavingFlag(flag.id);
    const res = await setTenantFeatureFlag(tenant.id, flag.id, targetState);
    if (res.ok) {
      setFlags((prev) =>
        prev.map((f) =>
          f.id === flag.id
            ? { ...f, effective_enabled: targetState, is_overridden: true }
            : f
        )
      );
    }
    setSavingFlag(null);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || isSubmittingNote) return;

    setIsSubmittingNote(true);
    const res = await addTenantInternalNote(tenant.id, newNote);
    if (res.ok) {
      setNotes((prev) => [
        {
          id: Math.random().toString(),
          content: newNote.trim(),
          created_at: new Date().toISOString(),
          author_email: "You",
        },
        ...prev,
      ]);
      setNewNote("");
    }
    setIsSubmittingNote(false);
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/internal/tenants"
          className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Back to Tenants
        </Link>
      </div>

      {/* Tenant Header Card */}
      <div className="overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                {tenant.name}
              </h1>
              <span className="px-2.5 py-1 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 rounded-md text-xs font-mono font-medium">
                /{tenant.slug}
              </span>
              {isActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" /> Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                  <AlertTriangle className="size-3.5 text-red-600 dark:text-red-400" /> Suspended
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              ID: {tenant.id} · Joined {new Date(tenant.created_at).toLocaleDateString()} · Timezone: {tenant.timezone} · Currency: {tenant.currency}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap self-start sm:self-auto">
            {/* Plan Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-semibold">Plan:</span>
              <div className="w-36">
                <SearchableSelect
                  value={plan}
                  onChange={(val) => handlePlanChange(val)}
                  size="sm"
                  searchable={false}
                  options={[
                    { value: "launch", label: "Launch Plan" },
                    { value: "growth", label: "Growth Plan" },
                    { value: "scale", label: "Scale Plan" },
                    { value: "enterprise", label: "Enterprise Plan" },
                  ]}
                />
              </div>
            </div>

            {/* Suspend/Activate Button */}
            <button
              type="button"
              onClick={handleToggleStatus}
              className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-xs transition-colors ${
                isActive
                  ? "border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                  : "border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
              }`}
            >
              {isActive ? "Suspend Tenant" : "Reactivate Tenant"}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-6 flex border-b border-border gap-2">
          {[
            { id: "overview", label: "Overview & Notes", icon: FileText },
            { id: "facilities", label: `Warehouses (${facilities.length})`, icon: Warehouse },
            { id: "members", label: `Members (${members.length})`, icon: Users },
            { id: "flags", label: `Feature Flags (${flags.length})`, icon: Flag },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                  active
                    ? "border-brand text-brand-text font-bold"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Overview & Notes */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Warehouses</div>
                <div className="font-heading text-2xl font-bold mt-1 text-foreground">{facilities.length}</div>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Team Members</div>
                <div className="font-heading text-2xl font-bold mt-1 text-foreground">{members.length}</div>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
                <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Flag Overrides</div>
                <div className="font-heading text-2xl font-bold mt-1 text-foreground">
                  {flags.filter((f) => f.is_overridden).length}
                </div>
              </div>
            </div>

            {/* Consented Support Access Quick Info */}
            {activeGrant ? (
              <div className="overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 shadow-xs space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                      </span>
                      <h4 className="text-sm font-semibold text-emerald-950 dark:text-emerald-100 flex items-center gap-1.5">
                        <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
                        Support Access Active
                      </h4>
                    </div>
                    <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 leading-relaxed">
                      The tenant owner granted time-boxed support access. Platform staff are granted the dynamic <code className="font-mono font-semibold bg-emerald-500/10 px-1 py-0.5 rounded text-[11px]">support</code> role under RLS.
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                      {activeGrant.scope === "read_write" ? "Read & Write" : "Read-Only"}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock className="size-3" />
                      Expires {new Date(activeGrant.expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>

                {activeGrant.reason && (
                  <div className="rounded-lg border border-emerald-500/20 bg-background/60 p-2.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Grant Reason: </span>
                    {activeGrant.reason}
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-accent/40 p-5 shadow-xs flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Lock className="size-4 text-muted-foreground" /> Consented Support Access
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Tenant account data is strictly consent-driven. Internal staff have <strong className="text-foreground">zero standing access</strong> to inventory or orders under RLS. The tenant owner can grant time-boxed access from their Settings &gt; Support Access page.
                  </p>
                </div>
                <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground whitespace-nowrap shadow-xs">
                  RLS Enforced
                </span>
              </div>
            )}
          </div>

          {/* Internal Staff Notes */}
          <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
              <FileText className="size-4 text-brand-text" /> Internal Notes (Staff Only)
            </h3>

            <form onSubmit={handleAddNote} className="space-y-3">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Log internal context, customer success updates, or tickets..."
                rows={3}
                className="w-full rounded-lg border border-border bg-surface p-3 text-sm text-foreground placeholder:text-muted-foreground shadow-xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <button
                type="submit"
                disabled={isSubmittingNote || !newNote.trim()}
                className="w-full inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50 transition-colors shadow-xs"
              >
                <Send className="size-3" /> Post Note
              </button>
            </form>

            <div className="space-y-3 max-h-[350px] overflow-y-auto divide-y divide-border">
              {notes.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6">
                  No internal notes logged yet.
                </div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="pt-3 text-xs space-y-1">
                    <div className="flex justify-between text-muted-foreground font-mono text-[10px]">
                      <span className="font-semibold text-foreground">{n.author_email ?? "Staff"}</span>
                      <span>{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-foreground whitespace-pre-wrap leading-relaxed">{n.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Facilities */}
      {activeTab === "facilities" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <tr>
                <th className="px-5 py-3.5">Warehouse Name</th>
                <th className="px-4 py-3.5">Short Code</th>
                <th className="px-4 py-3.5">Location</th>
                <th className="px-4 py-3.5">Country</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {facilities.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    <Warehouse className="mx-auto size-8 text-muted-foreground/50 mb-2" />
                    No facilities configured for this tenant.
                  </td>
                </tr>
              ) : (
                facilities.map((f) => (
                  <tr key={f.id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-5 py-4 font-semibold text-foreground">{f.name}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-md border border-border bg-muted px-2.5 py-0.5 font-mono text-xs font-medium text-foreground">
                        {f.short_code}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {[f.city, f.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-4 text-foreground font-medium">{f.country}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Members */}
      {activeTab === "members" && (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <tr>
                <th className="px-5 py-3.5">Member</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    <Users className="mx-auto size-8 text-muted-foreground/50 mb-2" />
                    No members found.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.id} className="hover:bg-accent/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-foreground">{m.full_name || "—"}</div>
                      <div className="text-muted-foreground font-mono text-xs">{m.email}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="capitalize font-medium text-foreground">{m.role.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold capitalize text-success-text">
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground font-mono text-xs">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Feature Flags */}
      {activeTab === "flags" && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs">
            <h3 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
              <Sliders className="size-4 text-brand-text" /> Tenant Feature Flag Overrides
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Override global defaults for this specific tenant organization without code deployment.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {flags.map((flag) => (
              <div
                key={flag.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-brand/40"
              >
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                      {flag.name}
                    </span>
                    <code className="px-2.5 py-1 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 rounded-md text-xs font-mono font-medium">
                      {flag.key}
                    </code>
                    {flag.is_overridden && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        Overridden
                      </span>
                    )}
                  </div>
                  {flag.description && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{flag.description}</p>
                  )}
                  <div className="text-xs text-muted-foreground pt-0.5">
                    Global Default: <strong className="text-foreground">{flag.is_enabled ? "Enabled" : "Disabled"}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 self-end sm:self-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={flag.effective_enabled}
                    disabled={savingFlag === flag.id}
                    onClick={() => handleToggleFlag(flag, !flag.effective_enabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ${
                      flag.effective_enabled ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
                    } ${savingFlag === flag.id ? "opacity-50" : ""}`}
                    title={flag.effective_enabled ? "Click to disable for this tenant" : "Click to enable for this tenant"}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        flag.effective_enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={savingFlag === flag.id}
                    onClick={() => handleToggleFlag(flag, !flag.effective_enabled)}
                    className="cursor-pointer text-xs font-semibold text-foreground hover:text-brand-text transition-colors select-none min-w-[70px] text-left"
                  >
                    {savingFlag === flag.id
                      ? "Saving…"
                      : flag.effective_enabled
                      ? "Enabled"
                      : "Disabled"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
