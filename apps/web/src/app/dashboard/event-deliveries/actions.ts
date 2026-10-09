"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/org-context";

type ActionResult = { ok: true; count?: number } | { ok: false; error: string };

/** Sends one dead delivery back to the queue. */
export async function replayDelivery(deliveryId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("replay_event_delivery", { p_delivery_id: deliveryId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/event-deliveries");
  return { ok: true };
}

/** Sends every dead delivery for one consumer back to the queue. */
export async function replayAllDead(consumer: string): Promise<ActionResult> {
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) return { ok: false, error: "Select an organization first." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("replay_dead_deliveries", {
    p_organization_id: context.activeOrg.id,
    p_consumer: consumer,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard/event-deliveries");
  return { ok: true, count: data as number };
}
