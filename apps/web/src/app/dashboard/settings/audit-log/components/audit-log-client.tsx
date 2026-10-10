"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowRight, History, Minus, Pencil, Plus, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface AuditEntry {
  id: string;
  table_name: string;
  row_id: string | null;
  action: "insert" | "update" | "delete";
  changed_fields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor_user_id: string | null;
  actor_role: string | null;
  created_at: string;
}

export interface AuditActor {
  id: string;
  name: string;
  role: string;
}

interface Filters {
  table: string;
  actor: string;
  from: string;
  to: string;
  before: string;
}

const TABLE_LABELS: Record<string, string> = {
  organizations: "Organization",
  facilities: "Facility",
  client_accounts: "Client",
  client_facilities: "Client ↔ facility",
  organization_members: "Member",
  member_facility_access: "Member facility access",
  invitations: "Invitation",
  floor_worker_credentials: "Floor worker badge",
  floor_devices: "Device",
};

const ACTION_STYLES = {
  insert: { label: "Created", cls: "bg-success-soft text-success-text", Icon: Plus },
  update: { label: "Changed", cls: "bg-info-soft text-info-text", Icon: Pencil },
  delete: { label: "Deleted", cls: "bg-danger-soft text-danger-text", Icon: Minus },
} as const;

const fieldLabel = (f: string) => f.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  const text = JSON.stringify(v);
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

function recordLabel(e: AuditEntry): string {
  const row = e.after ?? e.before ?? {};
  for (const key of ["name", "device_name", "worker_code", "invitee_email", "email"]) {
    if (typeof row[key] === "string" && row[key]) return row[key] as string;
  }
  return e.row_id ? `#${e.row_id.slice(0, 8)}` : "—";
}

export function AuditLogClient({
  entries,
  actors,
  tables,
  filters,
  nextCursor,
}: {
  entries: AuditEntry[];
  actors: AuditActor[];
  tables: string[];
  filters: Filters;
  nextCursor: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  function hrefWith(changes: Partial<Filters>) {
    const next = { ...filters, before: "", ...changes };
    const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    return qs.size ? `${pathname}?${qs}` : pathname;
  }
  const setFilter = (changes: Partial<Filters>) => router.push(hrefWith(changes));
  const hasFilters = Boolean(filters.table || filters.actor || filters.from || filters.to);

  function who(e: AuditEntry) {
    if (e.actor_user_id) return actorName.get(e.actor_user_id) ?? "Former member";
    return e.actor_role === "service_role" ? "System (server)" : "System";
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground">Change history</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See who changed a setting, when, and what it was before: facilities, clients, members, invitations, badges and devices. This history can&apos;t be edited or deleted.
        </p>
      </div>

      {/* Filters */}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto] lg:items-end">
        <div className="flex flex-col gap-1.5">
          <span id="audit-table-label" className="text-xs font-semibold text-foreground">Setting</span>
          <SearchableSelect
            aria-labelledby="audit-table-label"
            searchable={false}
            options={[{ value: "", label: "All settings" }, ...tables.map((t) => ({ value: t, label: TABLE_LABELS[t] ?? t }))]}
            value={filters.table}
            onChange={(v) => setFilter({ table: v })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span id="audit-actor-label" className="text-xs font-semibold text-foreground">Changed by</span>
          <SearchableSelect
            aria-labelledby="audit-actor-label"
            options={[{ value: "", label: "Anyone" }, ...actors.map((a) => ({ value: a.id, label: a.name }))]}
            value={filters.actor}
            onChange={(v) => setFilter({ actor: v })}
          />
        </div>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
          From
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => setFilter({ from: e.target.value })}
            className="h-[2.625rem] rounded-lg border-[1.5px] border-input bg-card px-3 text-sm font-normal text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-foreground">
          To
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => setFilter({ to: e.target.value })}
            className="h-[2.625rem] rounded-lg border-[1.5px] border-input bg-card px-3 text-sm font-normal text-foreground focus:border-ring focus:outline-none"
          />
        </label>
        {hasFilters ? (
          <Link
            href={pathname}
            className="inline-flex h-[2.625rem] items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold text-brand-text hover:bg-accent"
          >
            <X className="size-4" /> Clear
          </Link>
        ) : (
          <span className="hidden lg:block" />
        )}
      </div>

      {/* Entries */}
      <section aria-label="Audit entries" className="overflow-hidden rounded-xl border border-border bg-card">
        {entries.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent text-brand-text">
              <History className="size-6" strokeWidth={1.5} />
            </span>
            <p className="font-heading text-base font-medium text-foreground">No changes found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasFilters ? "Try a wider date range or clear the filters." : "Changes to settings will appear here."}
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {entries.map((e) => {
              const style = ACTION_STYLES[e.action];
              return (
                <li key={e.id} className="grid gap-3 px-5 py-4 md:grid-cols-[11rem_1fr]">
                  <div className="text-xs text-muted-foreground">
                    <time dateTime={e.created_at} className="block font-medium text-foreground">
                      {format(new Date(e.created_at), "MMM d, yyyy · HH:mm:ss")}
                    </time>
                    <span>{who(e)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold ${style.cls}`}>
                        <style.Icon className="size-3.5" strokeWidth={2} />
                        {style.label}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{TABLE_LABELS[e.table_name] ?? e.table_name}</span>
                      <span className="text-sm text-muted-foreground">{recordLabel(e)}</span>
                    </div>
                    {e.action === "update" && (
                      <dl className="mt-2 flex flex-col gap-1">
                        {e.changed_fields.map((f) => (
                          <div key={f} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                            <dt className="font-medium text-foreground">{fieldLabel(f)}</dt>
                            <dd className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-xs">
                              <span className="break-all text-danger-text line-through decoration-1">{formatValue(e.before?.[f])}</span>
                              <ArrowRight className="size-3 shrink-0 self-center text-muted-foreground" aria-label="changed to" />
                              <span className="break-all text-success-text">{formatValue(e.after?.[f])}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {(nextCursor || filters.before) && (
          <div className="flex justify-between border-t border-border px-5 py-3 text-sm">
            {filters.before ? (
              <Link href={hrefWith({})} className="font-semibold text-brand-text hover:underline">Newest</Link>
            ) : (
              <span />
            )}
            {nextCursor && (
              <Link href={hrefWith({ before: nextCursor })} className="inline-flex items-center gap-1 font-semibold text-brand-text hover:underline">
                Older <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
