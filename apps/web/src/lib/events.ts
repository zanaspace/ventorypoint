import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { broadcastWarehouseEvents } from "./realtime-broadcast";

/**
 * Typed wrappers over the Sprint 2 event write API (record_event / record_events /
 * record_floor_event(s)). Database errors carry a stable code in their hint.
 */

export type EventErrorCode =
  | "not_authenticated"
  | "scope_denied"
  | "invalid_idempotency_key"
  | "unknown_event_type"
  | "invalid_payload"
  | "occurred_in_future"
  | "occurred_too_old"
  | "backdate_not_allowed"
  | "unknown_device"
  | "device_retired"
  | "device_blocked"
  | "device_not_authorized"
  | "device_required"
  | "facility_required"
  | "session_invalid"
  | "invalid_batch"
  | "batch_too_large"
  | "error";

export interface EventInput {
  event_type: string;
  /** Client-generated and stable across retries (e.g. crypto.randomUUID()). */
  idempotency_key: string;
  payload?: Record<string, unknown>;
  event_version?: number;
  facility_id?: string;
  entity_id?: string;
  entity_type?: string;
  client_account_id?: string;
  device_id?: string;
  occurred_at?: string;
  correlation_id?: string;
  causation_id?: string;
  /** Supervisor+ only, for events older than 72 hours. */
  backdate_reason?: string;
}

export type EventResult =
  | { ok: true; eventId: string }
  | { ok: false; code: EventErrorCode; message: string };

export type BatchEventResult =
  | { index: number; status: "created" | "duplicate"; event_id: string }
  | { index: number; status: "error"; code: EventErrorCode; message: string };

function toError(error: { message: string; hint?: string | null }): EventResult {
  return { ok: false, code: (error.hint as EventErrorCode) || "error", message: error.message };
}

/**
 * Live-update fast path: broadcast newly created events straight to Realtime once the
 * response is sent (the database trigger remains the slower backup). Never affects the write.
 */
function publishLive(eventIds: string[]) {
  if (eventIds.length === 0) return;
  after(async () => {
    try {
      await broadcastWarehouseEvents(createAdminClient(), eventIds);
    } catch (err) {
      console.warn("Live broadcast skipped (trigger backup will deliver):", err instanceof Error ? err.message : err);
    }
  });
}

const createdIds = (results: BatchEventResult[]) =>
  results.flatMap((r) => (r.status === "created" ? [r.event_id] : []));

/** Records one event as the signed-in member. Safe to retry with the same idempotency_key. */
export async function recordEvent(
  supabase: SupabaseClient,
  organizationId: string,
  event: EventInput
): Promise<EventResult> {
  const { data, error } = await supabase.rpc("record_event", {
    p_organization_id: organizationId,
    p_event_type: event.event_type,
    p_idempotency_key: event.idempotency_key,
    p_payload: event.payload ?? {},
    p_facility_id: event.facility_id ?? null,
    p_entity_id: event.entity_id ?? null,
    p_occurred_at: event.occurred_at ?? null,
    p_client_account_id: event.client_account_id ?? null,
    p_device_id: event.device_id ?? null,
    p_event_version: event.event_version ?? 1,
    p_correlation_id: event.correlation_id ?? null,
    p_causation_id: event.causation_id ?? null,
    p_backdate_reason: event.backdate_reason ?? null,
  });
  if (error) return toError(error);
  publishLive([data as string]); // a retried duplicate re-broadcasts harmlessly (clients de-duplicate)
  return { ok: true, eventId: data as string };
}

/** Records up to 100 events; each succeeds or fails independently. */
export async function recordEvents(
  supabase: SupabaseClient,
  organizationId: string,
  events: EventInput[]
): Promise<{ ok: true; results: BatchEventResult[] } | { ok: false; code: EventErrorCode; message: string }> {
  const { data, error } = await supabase.rpc("record_events", {
    p_organization_id: organizationId,
    p_events: events,
  });
  if (error) return toError(error) as { ok: false; code: EventErrorCode; message: string };
  publishLive(createdIds(data as BatchEventResult[]));
  return { ok: true, results: data as BatchEventResult[] };
}

/** Records one event from a floor terminal session (org, worker and device come from the session). */
export async function recordFloorEvent(
  supabase: SupabaseClient,
  sessionToken: string,
  event: Omit<EventInput, "device_id" | "backdate_reason">
): Promise<EventResult> {
  const { data, error } = await supabase.rpc("record_floor_event", {
    p_session_token: sessionToken,
    p_event: event,
  });
  if (error) return toError(error);
  publishLive([data as string]); // a retried duplicate re-broadcasts harmlessly (clients de-duplicate)
  return { ok: true, eventId: data as string };
}

/** Flushes a floor reconnect queue (up to 100 events). */
export async function recordFloorEvents(
  supabase: SupabaseClient,
  sessionToken: string,
  events: Omit<EventInput, "device_id" | "backdate_reason">[]
): Promise<{ ok: true; results: BatchEventResult[] } | { ok: false; code: EventErrorCode; message: string }> {
  const { data, error } = await supabase.rpc("record_floor_events", {
    p_session_token: sessionToken,
    p_events: events,
  });
  if (error) return toError(error) as { ok: false; code: EventErrorCode; message: string };
  publishLive(createdIds(data as BatchEventResult[]));
  return { ok: true, results: data as BatchEventResult[] };
}
