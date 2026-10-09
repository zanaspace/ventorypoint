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

export type ConsumerHandler = (event: ClaimedEvent, admin: SupabaseClient) => Promise<void>;

/** Handlers by consumer name. Consumers without a handler here are left for their own sprint. */
export const CONSUMER_HANDLERS: Record<string, ConsumerHandler> = {
  // Proves the pipeline end to end: records that it saw the event, nothing else.
  test_consumer: async (event, admin) => {
    const { error } = await admin.rpc("mark_event_processed", {
      p_consumer: "test_consumer",
      p_event_id: event.event_id,
    });
    if (error) throw new Error(error.message);
  },
};

export interface WorkerRunSummary {
  worker: string;
  durationMs: number;
  consumers: Record<string, { succeeded: number; failed: number; dead: number }>;
}

export async function runEventWorker(
  admin: SupabaseClient,
  { budgetMs = 20_000, batchSize = 50 }: { budgetMs?: number; batchSize?: number } = {}
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

      // In order: per-entity ordering is (occurred_at, sequence)
      for (const event of events) {
        try {
          await handler(event, admin);
          await admin.rpc("complete_event_delivery", { p_delivery_id: event.delivery_id, p_worker: worker });
          stats.succeeded++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const { data: status } = await admin.rpc("fail_event_delivery", {
            p_delivery_id: event.delivery_id,
            p_worker: worker,
            p_error: message,
          });
          if (status === "dead") stats.dead++;
          else stats.failed++;
        }
      }
    }
  }

  summary.durationMs = Date.now() - started;
  return summary;
}
