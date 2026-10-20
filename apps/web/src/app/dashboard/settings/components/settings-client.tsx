"use client";

import { useState, useTransition } from "react";
import { Building2, Globe, Clock, DollarSign, Copy, Check, ShieldAlert, Save, Download, FileArchive, CheckCircle2 } from "lucide-react";
import { updateOrganizationSettings, requestDataExportAction } from "../actions";
import { SearchableSelect } from "@/components/ui/searchable-select";

const COUNTRY_OPTIONS = [
  { value: "US", label: "United States (US)" },
  { value: "CA", label: "Canada (CA)" },
  { value: "GB", label: "United Kingdom (GB)" },
  { value: "AU", label: "Australia (AU)" },
  { value: "DE", label: "Germany (DE)" },
  { value: "FR", label: "France (FR)" },
  { value: "NL", label: "Netherlands (NL)" },
  { value: "SG", label: "Singapore (SG)" },
];

interface SettingsClientProps {
  organization: {
    id: string;
    name: string;
    country?: string;
    timezone?: string;
    currency?: string;
    created_at: string;
  };
  userRole: string;
}

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Dubai",
  "Australia/Sydney",
];

const COMMON_CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD - US Dollar" },
  { code: "EUR", symbol: "€", label: "EUR - Euro" },
  { code: "GBP", symbol: "£", label: "GBP - British Pound" },
  { code: "CAD", symbol: "CA$", label: "CAD - Canadian Dollar" },
  { code: "AUD", symbol: "AU$", label: "AUD - Australian Dollar" },
  { code: "JPY", symbol: "¥", label: "JPY - Japanese Yen" },
];

export function SettingsClient({ organization, userRole }: SettingsClientProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ filename: string; recordCount: number; expiresAt?: string } | null>(null);

  const canEdit = ["owner", "admin"].includes(userRole);

  const handleExportData = async (format: "json" | "csv" = "json") => {
    setIsExporting(true);
    try {
      const res = await requestDataExportAction(organization.id, format);
      if (res.ok && res.dataContent) {
        const blob = new Blob([res.dataContent], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setExportResult({
          filename: res.filename,
          recordCount: res.recordCount,
          expiresAt: res.expiresAt,
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err.message || "Failed to generate export." });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyOrgId = () => {
    navigator.clipboard.writeText(organization.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canEdit) return;

    const formData = new FormData(e.currentTarget);
    setFeedback(null);

    startTransition(async () => {
      const res = await updateOrganizationSettings(organization.id, formData);
      if (res.ok) {
        setFeedback({ type: "success", message: res.message || "Settings updated successfully." });
      } else {
        setFeedback({ type: "error", message: res.error || "Failed to update settings." });
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Organization Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your 3PL company profile, default operational timezones, and system currencies.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border flex items-center justify-between animate-in fade-in duration-150 ${
            feedback.type === "success"
              ? "bg-success-soft border-success/30 text-success-text"
              : "bg-danger-soft border-destructive/30 text-danger-text"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card: General Information */}
        <div className="bg-background border border-border rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent border border-brand/20 flex items-center justify-center text-brand-text">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">General Profile</h2>
                <p className="text-xs text-muted-foreground">Company identity and identifier</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono bg-surface border border-border px-2.5 py-1 rounded-md">
                {organization.id.slice(0, 8)}...
              </span>
              <button
                type="button"
                onClick={handleCopyOrgId}
                className="text-xs flex items-center gap-1 text-brand-text hover:text-accent-foreground px-2 py-1 rounded-md hover:bg-accent border border-transparent hover:border-brand/20 transition-all cursor-pointer"
                title="Copy Full Organization ID"
              >
                {copiedId ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success" />
                    <span className="text-success-text font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Organization Legal Name <span className="text-danger-text">*</span>
              </label>
              <input
                type="text"
                name="name"
                defaultValue={organization.name}
                required
                disabled={!canEdit || isPending}
                className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
              />
            </div>

            <div className="space-y-1.5">
              <label id="settings-country-label" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                Country Code
              </label>
              <SearchableSelect
                name="country"
                aria-labelledby="settings-country-label"
                defaultValue={organization.country || "US"}
                disabled={!canEdit || isPending}
                options={COUNTRY_OPTIONS}
              />
            </div>
          </div>
        </div>

        {/* Card: Localization & Defaults */}
        <div className="bg-background border border-border rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            <div className="w-9 h-9 rounded-lg bg-accent border border-brand/20 flex items-center justify-center text-brand-text">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Localization & Cutoffs</h2>
              <p className="text-xs text-muted-foreground">Default facility timezone and billing currency</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label id="settings-timezone-label" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Default Operational Timezone
              </label>
              <SearchableSelect
                name="timezone"
                aria-labelledby="settings-timezone-label"
                defaultValue={organization.timezone || "America/New_York"}
                disabled={!canEdit || isPending}
                options={COMMON_TIMEZONES.map((tz) => ({ value: tz, label: tz }))}
              />
            </div>

            <div className="space-y-1.5">
              <label id="settings-currency-label" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                Base Currency
              </label>
              <SearchableSelect
                name="currency"
                aria-labelledby="settings-currency-label"
                defaultValue={organization.currency || "USD"}
                disabled={!canEdit || isPending}
                options={COMMON_CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
              />
            </div>
          </div>

          <div className="pt-2 text-xs text-muted-foreground bg-surface border border-border p-3 rounded-lg">
            Created on: {new Date(organization.created_at).toLocaleDateString(undefined, { dateStyle: "long" })}
          </div>
        </div>

        {/* Submit Actions */}
        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-sm shadow-md transition-all disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
                  Saving Changes...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Organization Settings
                </>
              )}
            </button>
          </div>
        )}
      </form>

      {/* Customer Data Export */}
      {["owner", "admin"].includes(userRole) && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand-text shrink-0">
                <FileArchive className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Customer Data Export & Portability</h2>
                <p className="text-xs text-muted-foreground">
                  Export complete tenant records (facilities, team members, audit trails, and subscriptions) into machine-readable JSON.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleExportData("json")}
              disabled={isExporting}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-surface border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-xs disabled:opacity-50 shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-muted-foreground" />
              {isExporting ? "Compiling Export..." : "Export Tenant Data (JSON)"}
            </button>
          </div>

          {exportResult && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Downloaded <strong>{exportResult.filename}</strong> ({exportResult.recordCount} total records). Expiring link logged to audit trail.
                </span>
              </div>
              <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                Expires in 7 days
              </span>
            </div>
          )}
        </div>
      )}

      {/* Danger Zone */}
      {userRole === "owner" && (
        <div className="bg-danger-soft border border-destructive/25 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center text-danger-text">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-danger-text">Danger Zone</h2>
              <p className="text-xs text-muted-foreground">
                Critical actions affecting all members and 3PL operational data
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">Transfer or Delete Organization</div>
              <div className="text-xs text-muted-foreground">
                Permanently purge all warehouse facilities, client allocations, and member accounts.
              </div>
            </div>
            <button
              type="button"
              onClick={() => alert("Organization deletion requires multi-factor confirmation and no active client inventory.")}
              className="px-3.5 py-2 text-xs font-semibold text-danger-text bg-card border border-destructive/40 rounded-md hover:bg-destructive hover:text-white hover:border-destructive transition-colors cursor-pointer"
            >
              Delete Organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
