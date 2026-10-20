"use client";

import { useState } from "react";
import {
  Flag,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Sliders,
  Trash2,
  Shield,
  AlertTriangle,
  X,
} from "lucide-react";
import { type FeatureFlag } from "@/lib/feature-flags";
import { toggleGlobalFeatureFlag, createFeatureFlag, deleteFeatureFlag } from "../actions";

interface FlagsClientProps {
  initialFlags: FeatureFlag[];
}

export function FlagsClient({ initialFlags }: FlagsClientProps) {
  const [flags, setFlags] = useState<FeatureFlag[]>(initialFlags);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Form states
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newEnabled, setNewEnabled] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filtered = flags.filter(
    (f) =>
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.key.toLowerCase().includes(search.toLowerCase()) ||
      (f.description && f.description.toLowerCase().includes(search.toLowerCase()))
  );

  const handleToggle = async (flag: FeatureFlag) => {
    setTogglingId(flag.id);
    const next = !flag.is_enabled;
    const res = await toggleGlobalFeatureFlag(flag.id, next);
    if (res.ok) {
      setFlags((prev) =>
        prev.map((f) => (f.id === flag.id ? { ...f, is_enabled: next } : f))
      );
    }
    setTogglingId(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    const res = await createFeatureFlag({
      key: newKey,
      name: newName,
      description: newDescription,
      isEnabled: newEnabled,
    });

    if (res.ok) {
      setIsModalOpen(false);
      setNewKey("");
      setNewName("");
      setNewDescription("");
      setNewEnabled(false);
      window.location.reload();
    } else {
      setFormError(res.error || "Failed to create feature flag");
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (flag: FeatureFlag) => {
    if (flag.is_system) return;
    if (!confirm(`Are you sure you want to delete feature flag "${flag.name}"?`)) return;

    const res = await deleteFeatureFlag(flag.id);
    if (res.ok) {
      setFlags((prev) => prev.filter((f) => f.id !== flag.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Search and Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search feature flags by name, key, or description..."
            className="h-10 w-full rounded-lg border border-border bg-white dark:bg-black/20 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground shadow-xs transition-all focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover active:scale-[0.99]"
        >
          <Plus className="size-4" /> Create Feature Flag
        </button>
      </div>

      {/* Flags List */}
      <div className="grid grid-cols-1 gap-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent text-brand-text">
              <Flag className="size-6" strokeWidth={1.5} />
            </span>
            <p className="font-heading text-base font-semibold text-foreground">No feature flags found</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Try adjusting your search terms or create a new flag above.
            </p>
          </div>
        ) : (
          filtered.map((flag) => (
            <div
              key={flag.id}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-brand/40"
            >
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="font-heading text-base font-semibold tracking-tight text-foreground">
                    {flag.name}
                  </span>
                  <code className="px-2.5 py-1 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-white/10 rounded-md text-xs font-mono font-medium">
                    {flag.key}
                  </code>
                  {flag.is_system && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      <Shield className="size-3" /> System
                    </span>
                  )}
                  {flag.is_enabled ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" /> Globally Enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                      <XCircle className="size-3.5 text-gray-400" /> Globally Disabled
                    </span>
                  )}
                </div>
                {flag.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {flag.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                {/* Switch Toggle */}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={flag.is_enabled}
                    disabled={togglingId === flag.id}
                    onClick={() => handleToggle(flag)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ${
                      flag.is_enabled ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"
                    } ${togglingId === flag.id ? "opacity-50" : ""}`}
                    title={flag.is_enabled ? "Click to disable globally" : "Click to enable globally"}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        flag.is_enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={togglingId === flag.id}
                    onClick={() => handleToggle(flag)}
                    className="cursor-pointer text-xs font-semibold text-foreground hover:text-brand-text transition-colors select-none min-w-[70px] text-left"
                  >
                    {togglingId === flag.id
                      ? "Updating…"
                      : flag.is_enabled
                      ? "Enabled"
                      : "Disabled"}
                  </button>
                </div>

                {/* Delete button (non-system flags) */}
                {!flag.is_system && (
                  <button
                    type="button"
                    onClick={() => handleDelete(flag)}
                    className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    title="Delete Flag"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Flag Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-heading text-lg font-bold tracking-tight text-foreground">
                  Create Feature Flag
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create a new platform feature flag. Set a global default and override it on specific 3PL tenants.
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
                <AlertTriangle className="size-4 shrink-0" />
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Flag Key (snake_case)
                </label>
                <input
                  type="text"
                  required
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder="e.g. dynamic_wave_allocation"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Dynamic Wave Allocation"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Explain what functionality this feature flag controls..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="newEnabled"
                  checked={newEnabled}
                  onChange={(e) => setNewEnabled(e.target.checked)}
                  className="size-4 cursor-pointer rounded border-border text-brand focus:ring-brand"
                />
                <label htmlFor="newEnabled" className="cursor-pointer text-xs font-medium text-foreground select-none">
                  Enable globally by default
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
                  {isSubmitting ? "Creating..." : "Create Flag"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
