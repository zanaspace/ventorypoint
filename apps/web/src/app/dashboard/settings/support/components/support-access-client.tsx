"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  Lock,
  KeyRound,
  Eye,
  FileEdit,
  ArrowRight,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "sonner";
import {
  type SupportGrant,
  grantSupportAccessAction,
  revokeSupportAccessAction,
} from "../actions";

interface SupportAccessClientProps {
  organizationId: string;
  organizationName: string;
  userRole: string;
  initialActiveGrant: SupportGrant | null;
  initialHistory: SupportGrant[];
}

const DURATION_OPTIONS = [
  { hours: 1, label: "1 hour", sub: "Quick check" },
  { hours: 4, label: "4 hours", sub: "Half day" },
  { hours: 8, label: "8 hours", sub: "Single shift" },
  { hours: 24, label: "24 hours", sub: "Full day (Default)" },
  { hours: 72, label: "3 days", sub: "Weekend / Deep dive" },
  { hours: 168, label: "7 days", sub: "Extended onboarding" },
];

export function SupportAccessClient({
  organizationId,
  organizationName,
  userRole,
  initialActiveGrant,
  initialHistory,
}: SupportAccessClientProps) {
  const [activeGrant, setActiveGrant] = useState<SupportGrant | null>(initialActiveGrant);
  const [history, setHistory] = useState<SupportGrant[]>(initialHistory);
  const [isPending, startTransition] = useTransition();

  // Form states
  const [selectedScope, setSelectedScope] = useState<"read_only" | "read_write">("read_only");
  const [selectedDuration, setSelectedDuration] = useState<number>(24);
  const [reason, setReason] = useState("");

  // Live countdown state
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!activeGrant) return;

    function update() {
      if (!activeGrant) return;
      const now = new Date().getTime();
      const exp = new Date(activeGrant.expires_at).getTime();
      const diff = exp - now;

      if (diff <= 0) {
        setTimeLeft("Expired just now");
        setActiveGrant(null);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setTimeLeft(`${hours}h ${minutes}m remaining`);
      }
    }

    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [activeGrant]);

  const handleGrant = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await grantSupportAccessAction({
        organizationId,
        scope: selectedScope,
        durationHours: selectedDuration,
        reason,
      });

      if (res.ok) {
        toast.success("Support access granted to VentoryPoint platform staff.");
        const now = new Date();
        const expiresAt = new Date(now.getTime() + selectedDuration * 3600 * 1000).toISOString();
        const newGrant: SupportGrant = {
          id: res.grantId || Math.random().toString(),
          organization_id: organizationId,
          scope: selectedScope,
          duration_hours: selectedDuration,
          reason,
          starts_at: now.toISOString(),
          expires_at: expiresAt,
          granted_by: "You",
          is_active: true,
        };
        setActiveGrant(newGrant);
        setHistory((prev) => [newGrant, ...prev]);
        setReason("");
      } else {
        toast.error(res.error || "Failed to grant support access.");
      }
    });
  };

  const handleRevoke = (grantId: string) => {
    if (!confirm("Are you sure you want to revoke support access immediately? Platform engineers will lose access right away.")) {
      return;
    }

    startTransition(async () => {
      const res = await revokeSupportAccessAction(grantId, organizationId);
      if (res.ok) {
        toast.success("Support access revoked successfully.");
        setActiveGrant(null);
        setHistory((prev) =>
          prev.map((g) =>
            g.id === grantId
              ? { ...g, is_active: false, revoked_at: new Date().toISOString() }
              : g
          )
        );
      } else {
        toast.error(res.error || "Failed to revoke support access.");
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Support Access
        </h1>
        <p className="font-sans text-sm text-muted-foreground mt-1">
          Grant time-boxed, consented technical assistance access to the VentoryPoint platform team. Internal staff never have standing access to your records.
        </p>
      </div>

      {/* Active Grant Status Card */}
      {activeGrant ? (
        <div className="overflow-hidden rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 shrink-0">
                <ShieldCheck className="size-6" />
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-heading text-lg font-bold text-emerald-950 dark:text-emerald-100">
                    Support Access is Active
                  </h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                    <Clock className="size-3" /> {timeLeft || "Active"}
                  </span>
                </div>
                <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1">
                  VentoryPoint platform engineers have temporary{" "}
                  <strong className="capitalize">{activeGrant.scope.replace("_", " ")}</strong> permissions.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isPending}
              onClick={() => handleRevoke(activeGrant.id)}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors shadow-xs active:scale-[0.98] self-start sm:self-center"
            >
              <ShieldAlert className="size-3.5" /> Revoke Access Now
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/40 text-xs">
            <div>
              <span className="text-muted-foreground block font-medium">Access Scope</span>
              <span className="font-semibold text-foreground capitalize mt-0.5 inline-flex items-center gap-1">
                {activeGrant.scope === "read_write" ? (
                  <>
                    <FileEdit className="size-3.5 text-amber-600" /> Read & Write
                  </>
                ) : (
                  <>
                    <Eye className="size-3.5 text-blue-600" /> Read-Only
                  </>
                )}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">Expires At</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {format(new Date(activeGrant.expires_at), "MMM d, yyyy · HH:mm:ss")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block font-medium">Reason / Ticket</span>
              <span className="font-semibold text-foreground mt-0.5 block truncate">
                {activeGrant.reason || "General technical assistance"}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Standby Status Card */
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-purple-50 dark:bg-purple-950/40 text-brand-text shrink-0">
              <Lock className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-base font-bold text-foreground">
                No Standing Access (Secure by Default)
              </h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                VentoryPoint enforces strict tenant isolation. Platform staff, support engineers, and customer success cannot view or alter your facilities, inventory, orders, or clients without an explicit, time-boxed consent grant.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Grant Form Card (only visible when not active) */}
      {!activeGrant && (
        <form onSubmit={handleGrant} className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-6">
          <div className="border-b border-border pb-4">
            <h2 className="font-heading text-lg font-bold text-foreground flex items-center gap-2">
              <KeyRound className="size-5 text-brand-text" /> Grant Temporary Support Access
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Select permission level and duration. You can revoke access at any second.
            </p>
          </div>

          {/* Scope Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-foreground">
              Select Access Scope <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                  selectedScope === "read_only"
                    ? "border-brand bg-purple-50/40 dark:bg-purple-950/20 shadow-xs ring-1 ring-brand"
                    : "border-border bg-surface hover:bg-gray-50/60 dark:hover:bg-white/5"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="read_only"
                  checked={selectedScope === "read_only"}
                  onChange={() => setSelectedScope("read_only")}
                  className="size-4 cursor-pointer text-brand focus:ring-brand mt-0.5"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">Read-Only Access</span>
                    <span className="rounded-md bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Platform engineers can view facilities, device telemetry, error logs, and inventory to diagnose issues without modifying anything.
                  </p>
                </div>
              </label>

              <label
                className={`relative flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all ${
                  selectedScope === "read_write"
                    ? "border-brand bg-purple-50/40 dark:bg-purple-950/20 shadow-xs ring-1 ring-brand"
                    : "border-border bg-surface hover:bg-gray-50/60 dark:hover:bg-white/5"
                }`}
              >
                <input
                  type="radio"
                  name="scope"
                  value="read_write"
                  checked={selectedScope === "read_write"}
                  onChange={() => setSelectedScope("read_write")}
                  className="size-4 cursor-pointer text-brand focus:ring-brand mt-0.5"
                />
                <div>
                  <span className="text-sm font-semibold text-foreground">Read & Write Access</span>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Allows support engineers to reconfigure settings, re-deliver stuck event pipelines, or fix data blocks on your behalf.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Duration Selector */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-foreground">
              Access Duration <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = selectedDuration === opt.hours;
                return (
                  <button
                    key={opt.hours}
                    type="button"
                    onClick={() => setSelectedDuration(opt.hours)}
                    className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border p-3 text-center transition-all ${
                      isSelected
                        ? "border-brand bg-primary text-primary-foreground shadow-xs ring-2 ring-brand/30"
                        : "border-border bg-surface text-foreground hover:bg-gray-50 dark:hover:bg-white/5"
                    }`}
                  >
                    <span className="text-xs font-bold">{opt.label}</span>
                    <span className={`text-[10px] mt-0.5 ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                      {opt.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason / Reference */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              Reason / Ticket Reference (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Ticket #318: Troubleshoot mobile scanner connection on East dock"
              className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {/* Submit CTA */}
          <div className="flex items-center justify-end pt-3 border-t border-border">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover shadow-xs transition-colors disabled:opacity-50 active:scale-[0.99]"
            >
              <Shield className="size-4" />
              {isPending ? "Activating Grant..." : `Grant ${selectedDuration}h Support Access`}
            </button>
          </div>
        </form>
      )}

      {/* Grant History Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <h3 className="font-heading text-sm font-semibold text-foreground">Access Grant History</h3>
          </div>
          <span className="text-xs text-muted-foreground">Logged in configuration audit log</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-gray-50/60 dark:bg-white/5 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              <tr>
                <th className="px-5 py-3">Granted Date</th>
                <th className="px-3 py-3">Scope</th>
                <th className="px-3 py-3">Duration</th>
                <th className="px-4 py-3">Reason / Context</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-muted-foreground">
                    No support access history recorded.
                  </td>
                </tr>
              ) : (
                history.map((g) => (
                  <tr key={g.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-foreground font-medium">
                      {format(new Date(g.starts_at), "MMM d, yyyy · HH:mm")}
                    </td>
                    <td className="px-3 py-3.5 text-xs capitalize text-foreground">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {g.scope === "read_write" ? (
                          <span className="text-amber-600 dark:text-amber-400">Read & Write</span>
                        ) : (
                          <span className="text-blue-600 dark:text-blue-400">Read-Only</span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-xs text-muted-foreground">
                      {g.duration_hours}h
                    </td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground max-w-xs truncate">
                      {g.reason || "—"}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {g.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="size-3 text-emerald-600" /> Active
                        </span>
                      ) : g.revoked_at ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800">
                          Revoked
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                          Expired
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {g.is_active && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(g.id)}
                          className="cursor-pointer text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
