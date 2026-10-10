"use server";

import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { recordEvents, type BatchEventResult } from "@/lib/events";
import { devConsoleEnabled } from "./enabled";
import { getPlatformStaff } from "@/lib/platform-staff";

export interface EmitInput {
  facilityId: string | null;
  eventType: string;
  count: number;
  payload: Record<string, unknown>;
  /** Client clock when the user pressed Emit; echoed in the payload to measure latency. */
  clientSentAt: number;
}

export async function emitTestEvents(
  input: EmitInput
): Promise<{ ok: true; results: BatchEventResult[] } | { ok: false; error: string }> {
  if (!devConsoleEnabled() || !(await getPlatformStaff())) return { ok: false, error: "Not allowed." };
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) return { ok: false, error: "Select an organization first." };
  const count = Math.min(100, Math.max(1, Math.floor(input.count)));

  const supabase = await createClient();
  const res = await recordEvents(
    supabase,
    context.activeOrg.id,
    Array.from({ length: count }, (_, i) => ({
      event_type: input.eventType,
      idempotency_key: `dev-${crypto.randomUUID()}`,
      facility_id: input.facilityId ?? undefined,
      payload: { ...input.payload, client_sent_at: input.clientSentAt, sequence: i + 1 },
    }))
  );
  if (!res.ok) return { ok: false, error: res.message };
  return { ok: true, results: res.results };
}
