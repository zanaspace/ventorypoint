"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Radio, Send, Trash2 } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useFacilityEvents, type FacilityEvent } from "@/lib/realtime/use-facility-events";
import type { BatchEventResult } from "@/lib/events";
import { emitTestEvents } from "./actions";

interface EventTypeOption {
  event_type: string;
  description: string;
  is_floor_event: boolean;
  payload_schema: unknown;
}

interface Received {
  event: FacilityEvent;
  latencyMs: number | null;
  receivedAt: number;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function EventConsoleClient({
  organizationId,
  facilities,
  eventTypes,
}: {
  organizationId: string;
  facilities: { id: string; name: string; code: string }[];
  eventTypes: EventTypeOption[];
}) {
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? "");
  const [eventType, setEventType] = useState("system.synthetic");
  const [count, setCount] = useState(10);
  const [payloadText, setPayloadText] = useState('{\n  "label": "hello from the console"\n}');
  const [received, setReceived] = useState<Received[]>([]);
  const [lastResults, setLastResults] = useState<BatchEventResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { status } = useFacilityEvents({
    facilityIds: facilityId ? [facilityId] : [],
    organizationId,
    onEvent: (event) => {
      const sentAt = Number((event.payload as { client_sent_at?: unknown }).client_sent_at);
      const now = Date.now();
      setReceived((prev) =>
        [{ event, receivedAt: now, latencyMs: Number.isFinite(sentAt) ? now - sentAt : null }, ...prev].slice(0, 500)
      );
    },
  });

  const latencies = received.map((r) => r.latencyMs).filter((v): v is number => v !== null);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const selectedType = eventTypes.find((t) => t.event_type === eventType);

  function emit() {
    setError(null);
    let payload: Record<string, unknown>;
    try {
      const parsed = JSON.parse(payloadText || "{}");
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
      payload = parsed;
    } catch {
      setError("Payload must be a JSON object.");
      return;
    }
    startTransition(async () => {
      const res = await emitTestEvents({
        facilityId: facilityId || null,
        eventType,
        count,
        payload,
        clientSentAt: Date.now(),
      });
      if (res.ok) setLastResults(res.results);
      else setError(res.error);
    });
  }

  const created = lastResults?.filter((r) => r.status === "created").length ?? 0;
  const failed = lastResults?.filter((r) => r.status === "error") ?? [];

  const statusStyle = {
    live: "bg-success-soft text-success-text",
    connecting: "bg-warning-soft text-warning-text",
    error: "bg-danger-soft text-danger-text",
    closed: "bg-muted text-muted-foreground",
  }[status];

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <span className="eyebrow">Developer tool</span>
          <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground">Event console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Emit events through <code>record_events</code> and watch them arrive over Realtime. Events are real and permanent; use{" "}
            <code>system.synthetic</code> for tests. Deliveries show on{" "}
            <Link href="/internal/event-deliveries" className="font-semibold text-brand-text hover:underline">Event pipeline</Link>.
          </p>
        </div>
        <span className={`inline-flex h-8 items-center gap-2 self-start rounded-full px-3 text-xs font-semibold ${statusStyle}`} role="status">
          <Radio className="size-3.5" /> Realtime: {status}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* Emit */}
        <section aria-labelledby="emit-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 self-start">
          <h2 id="emit-heading" className="font-heading text-lg font-medium">Emit</h2>
          <div className="flex flex-col gap-1.5">
            <span id="console-facility" className="text-sm font-semibold">Facility</span>
            <SearchableSelect
              aria-labelledby="console-facility"
              options={[{ value: "", label: "Organization-level (no facility)" }, ...facilities.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` }))]}
              value={facilityId}
              onChange={setFacilityId}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span id="console-type" className="text-sm font-semibold">Event type</span>
            <SearchableSelect
              aria-labelledby="console-type"
              options={eventTypes.map((t) => ({ value: t.event_type, label: t.event_type }))}
              value={eventType}
              onChange={setEventType}
            />
            {selectedType && (
              <span className="text-xs text-muted-foreground">
                {selectedType.description}
                {selectedType.is_floor_event && " Floor event: needs an approved device, so it will be rejected from here."}
              </span>
            )}
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            How many (1–100)
            <input
              type="number"
              min={1}
              max={100}
              value={count}
              onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm font-normal focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/20"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Payload (JSON)
            <textarea
              value={payloadText}
              onChange={(e) => setPayloadText(e.target.value)}
              rows={6}
              spellCheck={false}
              className="rounded-md border border-input bg-card p-3 font-mono text-xs font-normal focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/20"
            />
          </label>
          {error && <p className="text-sm font-medium text-danger-text" role="alert">{error}</p>}
          <button
            type="button"
            onClick={emit}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            <Send className="size-4" /> {isPending ? "Emitting…" : `Emit ${count} event${count === 1 ? "" : "s"}`}
          </button>
          {lastResults && (
            <div className="rounded-lg bg-surface p-3 text-sm" role="status">
              <p>
                <strong>{created}</strong> created
                {failed.length > 0 && <>, <strong className="text-danger-text">{failed.length}</strong> rejected</>}
              </p>
              {failed[0] && failed[0].status === "error" && (
                <p className="mt-1 font-mono text-xs text-danger-text">{failed[0].code}: {failed[0].message}</p>
              )}
            </div>
          )}
        </section>

        {/* Live feed */}
        <section aria-labelledby="feed-heading" className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <h2 id="feed-heading" className="font-heading text-lg font-medium">Live feed</h2>
            <div className="flex items-center gap-4 text-sm">
              <span>Received <strong className="tabular-nums">{received.length}</strong></span>
              <span>p50 <strong className="tabular-nums">{p50 ?? "—"}{p50 !== null && " ms"}</strong></span>
              <span>
                p95{" "}
                <strong className={`tabular-nums ${p95 !== null && p95 > 500 ? "text-danger-text" : ""}`}>
                  {p95 ?? "—"}{p95 !== null && " ms"}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setReceived([])}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Trash2 className="size-3.5" /> Clear
              </button>
            </div>
          </div>
          <p className="border-b border-border bg-surface px-5 py-2 text-xs text-muted-foreground">
            Latency is from pressing Emit to the event arriving here (server action + database + Realtime). Target p95 &lt; 500 ms.
          </p>
          {received.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-muted-foreground" aria-live="polite">
              Waiting for events on {facilityId ? "this facility" : "the organization channel"}…
            </p>
          ) : (
            <ol className="max-h-[32rem] divide-y divide-border overflow-y-auto" aria-live="polite">
              {received.slice(0, 100).map(({ event, latencyMs, receivedAt }) => (
                <li key={`${event.id}-${receivedAt}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">#{event.sequence}</span>
                  <span className="font-mono font-semibold">{event.event_type}</span>
                  <span className="text-xs text-muted-foreground">{event.source}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{format(new Date(receivedAt), "HH:mm:ss.SSS")}</span>
                  {latencyMs !== null && (
                    <span className={`w-16 text-right font-mono text-xs ${latencyMs > 500 ? "text-danger-text" : "text-success-text"}`}>
                      {latencyMs} ms
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
