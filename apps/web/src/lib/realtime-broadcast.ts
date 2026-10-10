import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fast path for live updates. Supabase's "Broadcast from Database" (the
 * realtime.send() call in the warehouse_events insert trigger) released messages
 * in bursts every few seconds on the hosted project (measured 2026-10-10: p95 3.8 s),
 * while Realtime's direct broadcast API measured p95 258 ms. So after an event is
 * saved, server code also broadcasts it directly. The trigger stays as the backup;
 * clients ignore the copy they already have (by event id).
 *
 * Server-only: uses the service role key.
 */

// Same fields, in the same shape, as the trigger's broadcast (on_warehouse_event_inserted)
const COLUMNS =
  "id, sequence, organization_id, facility_id, client_account_id, event_type, event_version, entity_type, entity_id, payload, actor_user_id, actor_worker_id, device_id, source, correlation_id, occurred_at, received_at";

interface EventRow {
  id: string;
  organization_id: string;
  facility_id: string | null;
  [key: string]: unknown;
}

export async function broadcastWarehouseEvents(
  admin: SupabaseClient,
  eventIds: string[],
  {
    url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
    timeoutMs = 3000,
  }: { url?: string; serviceKey?: string; timeoutMs?: number } = {}
): Promise<{ sent: number }> {
  if (eventIds.length === 0 || !url || !serviceKey) return { sent: 0 };

  const { data, error } = await admin.from("warehouse_events").select(COLUMNS).in("id", eventIds);
  if (error) throw new Error(`Read-back failed: ${error.message}`);
  const rows = (data ?? []) as EventRow[];
  if (rows.length === 0) return { sent: 0 };

  const messages = rows.map((row) => ({
    topic: row.facility_id ? `facility:${row.facility_id}` : `org:${row.organization_id}`,
    event: "warehouse_event",
    payload: row,
    private: true,
  }));

  const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Realtime broadcast failed: HTTP ${res.status}`);
  return { sent: messages.length };
}
