"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Activity, AlertOctagon, PauseCircle, RefreshCw, RotateCcw, Timer } from "lucide-react";
import { replayAllDead, replayDelivery } from "../actions";

export interface ConsumerHealth {
  consumer: string;
  description: string;
  is_enabled: boolean;
  backlog: number;
  dead: number;
  lag_seconds: number;
  lag_alert_seconds: number;
}

export interface ProblemDelivery {
  id: string;
  consumer: string;
  status: "pending" | "dead";
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  updated_at: string;
  organizations: { name: string } | null;
  warehouse_events: { event_type: string; occurred_at: string } | null;
}

function formatLag(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

const label = (name: string) => name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function DeliveriesClient({ stats, problems }: { stats: ConsumerHealth[]; problems: ProblemDelivery[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Keep the numbers fresh while the page is open
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [router]);

  function run(action: () => Promise<{ ok: boolean; error?: string; count?: number }>, success: (count?: number) => string) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) toast.success(success(res.count));
      else toast.error(res.error || "Something went wrong.");
    });
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground">Event pipeline</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Back-end consumers across all customers. Failures retry automatically; dead deliveries need a fix and a replay.
          </p>
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => router.refresh())}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-4 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand hover:text-white"
        >
          <RefreshCw className={`size-4 ${isPending ? "animate-spin" : ""}`} strokeWidth={1.75} />
          Refresh
        </button>
      </div>

      <section aria-labelledby="consumers-heading" className="flex flex-col gap-3">
        <h2 id="consumers-heading" className="eyebrow">Consumers</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((s) => {
            const backlog = Number(s.backlog);
            const lagging = s.is_enabled && backlog > 0 && s.lag_seconds > s.lag_alert_seconds;
            return (
              <div key={s.consumer} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-heading text-lg font-medium text-card-foreground">{label(s.consumer)}</div>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                  {s.is_enabled ? (
                    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-xs font-semibold text-success-text">
                      <Activity className="size-3.5" strokeWidth={1.75} /> Running
                    </span>
                  ) : (
                    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs font-semibold text-muted-foreground">
                      <PauseCircle className="size-3.5" strokeWidth={1.75} /> Not active yet
                    </span>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg bg-surface p-2">
                    <dt className="text-[11px] font-semibold text-muted-foreground">Queued</dt>
                    <dd className="font-heading text-xl tabular-nums text-foreground">{backlog}</dd>
                  </div>
                  <div className="rounded-lg bg-surface p-2">
                    <dt className="text-[11px] font-semibold text-muted-foreground">Dead</dt>
                    <dd className={`font-heading text-xl tabular-nums ${Number(s.dead) > 0 ? "text-danger-text" : "text-foreground"}`}>{s.dead}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className={`inline-flex items-center gap-1 ${lagging ? "font-semibold text-danger-text" : ""}`}>
                    <Timer className="size-3.5" strokeWidth={1.75} />
                    Lag {backlog > 0 ? formatLag(s.lag_seconds) : "0s"}
                    {lagging && ` (alert above ${formatLag(s.lag_alert_seconds)})`}
                  </span>
                </div>

                {Number(s.dead) > 0 && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => run(() => replayAllDead(s.consumer), (n) => `${n ?? 0} deliveries sent back to the queue across all organizations.`)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45"
                  >
                    <RotateCcw className="size-4" /> Replay {s.dead} dead
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="problems-heading" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid size-8 place-items-center rounded-lg bg-danger-soft text-danger-text">
            <AlertOctagon className="size-4" strokeWidth={1.5} />
          </span>
          <h2 id="problems-heading" className="font-heading text-lg font-medium text-card-foreground">Failed deliveries</h2>
        </div>
        {problems.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing is failing. Every delivery succeeded or is waiting its turn.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="responsive-table w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface text-xs font-semibold text-muted-foreground">
                  <th className="px-5 py-3">Event</th>
                  <th className="px-5 py-3">Organization</th>
                  <th className="px-5 py-3">Consumer</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last error</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {problems.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td data-primary className="px-5 py-3">
                      <div className="font-mono text-sm font-semibold text-foreground">{p.warehouse_events?.event_type ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.warehouse_events && formatDistanceToNow(new Date(p.warehouse_events.occurred_at), { addSuffix: true })}
                      </div>
                    </td>
                    <td data-label="Organization" className="px-5 py-3 text-sm">{p.organizations?.name ?? "—"}</td>
                    <td data-label="Consumer" className="px-5 py-3 text-sm">{label(p.consumer)}</td>
                    <td data-label="Status" className="px-5 py-3">
                      {p.status === "dead" ? (
                        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-danger-soft px-2.5 text-xs font-semibold text-danger-text">
                          <AlertOctagon className="size-3.5" strokeWidth={1.75} /> Dead after {p.attempts} tries
                        </span>
                      ) : (
                        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-warning-soft px-2.5 text-xs font-semibold text-warning-text">
                          <RefreshCw className="size-3.5" strokeWidth={1.75} /> Retry {p.attempts + 1}{" "}
                          {formatDistanceToNow(new Date(p.next_attempt_at), { addSuffix: true })}
                        </span>
                      )}
                    </td>
                    <td data-label="Last error" className="md:max-w-md px-5 py-3 font-mono text-xs text-muted-foreground break-words">{p.last_error ?? "—"}</td>
                    <td data-actions className="px-5 py-3 text-right">
                      {p.status === "dead" && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => run(() => replayDelivery(p.id), () => "Delivery sent back to the queue.")}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand hover:text-white disabled:opacity-45"
                        >
                          <RotateCcw className="size-3.5" /> Replay
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
