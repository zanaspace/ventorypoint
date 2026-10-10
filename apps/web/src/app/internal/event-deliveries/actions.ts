"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPlatformStaff } from "@/lib/platform-staff";

type ActionResult = { ok: true; count?: number } | { ok: false; error: string };

/** Sends one dead delivery back to the queue (platform staff only). */
export async function replayDelivery(deliveryId: string): Promise<ActionResult> {
  if (!(await getPlatformStaff())) return { ok: false, error: "Not allowed." };
  const { data, error } = await createAdminClient().rpc("platform_replay_event_delivery", { p_delivery_id: deliveryId });
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Only dead deliveries can be replayed." };
  revalidatePath("/internal/event-deliveries");
  return { ok: true };
}

/** Sends every dead delivery of one consumer, across all organizations, back to the queue. */
export async function replayAllDead(consumer: string): Promise<ActionResult> {
  if (!(await getPlatformStaff())) return { ok: false, error: "Not allowed." };
  const { data, error } = await createAdminClient().rpc("platform_replay_dead_deliveries", { p_consumer: consumer });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/internal/event-deliveries");
  return { ok: true, count: data as number };
}
