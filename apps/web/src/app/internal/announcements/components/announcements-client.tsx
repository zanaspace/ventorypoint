"use client";

import { useState } from "react";
import {
  Plus,
  AlertCircle,
  AlertTriangle,
  Info,
  Wrench,
  Trash2,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Megaphone,
  X,
} from "lucide-react";
import { createAnnouncement, toggleAnnouncementActive, deleteAnnouncement } from "../actions";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical" | "maintenance";
  target_audience: "all" | "admins" | "floor_workers" | "specific_orgs";
  target_organization_ids?: string[] | null;
  action_label?: string | null;
  action_url?: string | null;
  dismissible: boolean;
  starts_at: string;
  ends_at?: string | null;
  is_active: boolean;
  created_at: string;
}

interface AnnouncementsClientProps {
  initialAnnouncements: AnnouncementItem[];
}

export function AnnouncementsClient({ initialAnnouncements }: AnnouncementsClientProps) {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>(initialAnnouncements);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical" | "maintenance">("info");
  const [targetAudience, setTargetAudience] = useState<"all" | "admins" | "floor_workers" | "specific_orgs">("all");
  const [actionLabel, setActionLabel] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [dismissible, setDismissible] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const handleToggle = async (a: AnnouncementItem) => {
    const next = !a.is_active;
    const res = await toggleAnnouncementActive(a.id, next);
    if (res.ok) {
      setAnnouncements((prev) =>
        prev.map((item) => (item.id === a.id ? { ...item, is_active: next } : item))
      );
    }
  };

  const handleDelete = async (a: AnnouncementItem) => {
    if (!confirm(`Delete announcement "${a.title}"?`)) return;
    const res = await deleteAnnouncement(a.id);
    if (res.ok) {
      setAnnouncements((prev) => prev.filter((item) => item.id !== a.id));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    const res = await createAnnouncement({
      title,
      message,
      severity,
      targetAudience,
      actionLabel: actionLabel || undefined,
      actionUrl: actionUrl || undefined,
      dismissible,
      startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
      endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
    });

    if (res.ok) {
      setIsModalOpen(false);
      setTitle("");
      setMessage("");
      setActionLabel("");
      setActionUrl("");
      window.location.reload();
    } else {
      setFormError(res.error || "Failed to create announcement");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Announcements broadcast maintenance alerts, critical notices, and updates across customer dashboards and floor terminals.
        </p>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover active:scale-[0.99] self-start sm:self-auto"
        >
          <Plus className="size-4" /> Broadcast Announcement
        </button>
      </div>

      {/* Announcements List */}
      <div className="grid grid-cols-1 gap-3">
        {announcements.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent text-brand-text">
              <Megaphone className="size-6" strokeWidth={1.5} />
            </span>
            <p className="font-heading text-base font-medium text-foreground">No active announcements</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Broadcast a system notice or maintenance window to notify tenants.
            </p>
          </div>
        ) : (
          announcements.map((a) => {
            const severityIcon = {
              critical: <AlertCircle className="size-4 text-red-600 dark:text-red-400" />,
              warning: <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />,
              maintenance: <Wrench className="size-4 text-purple-600 dark:text-purple-400" />,
              info: <Info className="size-4 text-blue-600 dark:text-blue-400" />,
            }[a.severity];

            const severityBadge = {
              critical: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800",
              warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
              maintenance: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
              info: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
            }[a.severity];

            return (
              <div
                key={a.id}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-brand/40"
              >
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {severityIcon}
                    <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                      {a.title}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${severityBadge}`}>
                      {a.severity}
                    </span>
                    <span className="px-2.5 py-1 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 rounded-md text-xs font-mono font-medium">
                      Audience: {a.target_audience}
                    </span>
                    {a.is_active ? (
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" /> Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{a.message}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5 text-gray-400" /> Starts: {new Date(a.starts_at).toLocaleString()}
                    </span>
                    {a.ends_at && (
                      <span>Ends: {new Date(a.ends_at).toLocaleString()}</span>
                    )}
                    {a.action_url && (
                      <a
                        href={a.action_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-brand-text hover:underline cursor-pointer"
                      >
                        {a.action_label || "Link"} <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleToggle(a)}
                    className={`inline-flex cursor-pointer items-center justify-center rounded-lg px-3.5 py-2 text-xs font-semibold shadow-xs transition-all active:scale-[0.98] ${
                      a.is_active
                        ? "border border-border bg-white dark:bg-card text-foreground hover:bg-gray-50 dark:hover:bg-white/5"
                        : "border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
                    }`}
                  >
                    {a.is_active ? "Deactivate" : "Activate"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(a)}
                    className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    title="Delete announcement"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Broadcast Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  Broadcast System Announcement
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Publish a message directly to all active warehouse sessions and dashboards.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg border border-destructive/30 bg-danger-soft p-3 text-xs text-danger-text flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Announcement Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Scheduled Database Maintenance"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Message Details
                </label>
                <textarea
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. Platform services will undergo a brief 10-minute maintenance on Sunday at 02:00 UTC."
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Severity
                  </label>
                  <SearchableSelect
                    value={severity}
                    onChange={(val) => setSeverity(val as any)}
                    options={[
                      { value: "info", label: "Info" },
                      { value: "warning", label: "Warning" },
                      { value: "maintenance", label: "Maintenance" },
                      { value: "critical", label: "Critical" },
                    ]}
                    searchable={false}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Target Audience
                  </label>
                  <SearchableSelect
                    value={targetAudience}
                    onChange={(val) => setTargetAudience(val as any)}
                    options={[
                      { value: "all", label: "All Users" },
                      { value: "admins", label: "Admins & Owners" },
                      { value: "floor_workers", label: "Floor Workers" },
                    ]}
                    searchable={false}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Action Label (optional)
                  </label>
                  <input
                    type="text"
                    value={actionLabel}
                    onChange={(e) => setActionLabel(e.target.value)}
                    placeholder="e.g. View Status Page"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Action URL (optional)
                  </label>
                  <input
                    type="url"
                    value={actionUrl}
                    onChange={(e) => setActionUrl(e.target.value)}
                    placeholder="https://status.example.com"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="dismissible"
                  checked={dismissible}
                  onChange={(e) => setDismissible(e.target.checked)}
                  className="size-4 cursor-pointer rounded border-border text-brand focus:ring-brand"
                />
                <label htmlFor="dismissible" className="cursor-pointer text-xs font-medium text-foreground select-none">
                  Allow users to dismiss this announcement
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-white dark:bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover shadow-xs transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? "Broadcasting..." : "Broadcast"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
