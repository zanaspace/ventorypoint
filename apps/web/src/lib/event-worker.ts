import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Event consumer worker (Sprint 2 §3.4). Claims due deliveries per enabled consumer,
 * runs the consumer's handler, then completes or fails each delivery. Delivery is
 * at-least-once; handlers make their effects exactly-once with mark_event_processed.
 *
 * Runs from /api/internal/event-worker (cron) today; the same function can run in a
 * long-lived Node worker if consumer throughput needs it (Sprint 2 open question).
 */

export interface ClaimedEvent {
  delivery_id: string;
  attempt: number;
  event_id: string;
  organization_id: string;
  facility_id: string | null;
  event_type: string;
  event_version: number;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
  sequence: number;
}

/**
 * A consumer handles a whole claimed batch (in event order) and reports the
 * deliveries that failed; everything else is acknowledged in one call.
 * Handlers make effects exactly-once with mark_events_processed.
 */
export type ConsumerHandler = (
  events: ClaimedEvent[],
  admin: SupabaseClient
) => Promise<{ failed?: { delivery_id: string; error: string }[] } | void>;

/** Handlers by consumer name. Consumers without a handler here are left for their own sprint. */
export const CONSUMER_HANDLERS: Record<string, ConsumerHandler> = {
  // Proves the pipeline end to end: records that it saw each event, nothing else.
  test_consumer: async (events, admin) => {
    const { error } = await admin.rpc("mark_events_processed", {
      p_consumer: "test_consumer",
      p_event_ids: events.map((e) => e.event_id),
    });
    if (error) throw new Error(error.message);
  },
};

export interface WorkerRunSummary {
  worker: string;
  durationMs: number;
  consumers: Record<string, { succeeded: number; failed: number; dead: number }>;
}

async function failDelivery(admin: SupabaseClient, worker: string, deliveryId: string, message: string) {
  const { data: status } = await admin.rpc("fail_event_delivery", {
    p_delivery_id: deliveryId,
    p_worker: worker,
    p_error: message,
  });
  return status as "pending" | "dead" | null;
}

export async function runEventWorker(
  admin: SupabaseClient,
  { budgetMs = 20_000, batchSize = 200 }: { budgetMs?: number; batchSize?: number } = {}
): Promise<WorkerRunSummary> {
  const started = Date.now();
  const worker = `web-${crypto.randomUUID().slice(0, 8)}`;
  const summary: WorkerRunSummary = { worker, durationMs: 0, consumers: {} };

  const { data: consumers, error } = await admin.from("event_consumers").select("name").eq("is_enabled", true);
  if (error) throw new Error(`Could not load consumers: ${error.message}`);

  for (const { name } of consumers ?? []) {
    const handler = CONSUMER_HANDLERS[name];
    if (!handler) continue;
    const stats = (summary.consumers[name] = { succeeded: 0, failed: 0, dead: 0 });

    while (Date.now() - started < budgetMs) {
      const { data: batch, error: claimError } = await admin.rpc("claim_event_deliveries", {
        p_consumer: name,
        p_worker: worker,
        p_limit: batchSize,
        p_lease_seconds: 60,
      });
      if (claimError) throw new Error(`Claim failed for ${name}: ${claimError.message}`);
      const events = (batch ?? []) as ClaimedEvent[];
      if (events.length === 0) break;

      // 1 round trip for the handler (typically), 1 to acknowledge the batch
      let failed: { delivery_id: string; error: string }[] = [];
      try {
        failed = (await handler(events, admin))?.failed ?? [];
      } catch (err) {
        // The whole batch failed (e.g. database unreachable): retry each with backoff
        const message = err instanceof Error ? err.message : String(err);
        failed = events.map((e) => ({ delivery_id: e.delivery_id, error: message }));
      }

      const failedIds = new Set(failed.map((f) => f.delivery_id));
      const succeededIds = events.map((e) => e.delivery_id).filter((id) => !failedIds.has(id));
      if (succeededIds.length > 0) {
        const { data: completed, error: completeError } = await admin.rpc("complete_event_deliveries", {
          p_delivery_ids: succeededIds,
          p_worker: worker,
        });
        // If the acknowledgement fails, leases expire and the batch is redelivered;
        // mark_events_processed keeps effects exactly-once.
        if (completeError) throw new Error(`Acknowledge failed for ${name}: ${completeError.message}`);
        stats.succeeded += Number(completed ?? 0);
      }
      for (const f of failed) {
        const status = await failDelivery(admin, worker, f.delivery_id, f.error);
        if (status === "dead") stats.dead++;
        else stats.failed++;
      }
    }
  }

  summary.durationMs = Date.now() - started;
  return summary;
}
