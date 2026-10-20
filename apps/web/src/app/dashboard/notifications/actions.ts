"use server";

import { createClient } from "@/utils/supabase/server";
import { notify, NotificationPayload } from "@/lib/notifications";
import { revalidatePath } from "next/cache";

export async function getUserNotifications() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: notifications } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return notifications ?? [];
}

export async function markNotificationReadAction(notificationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });

  return { ok: !error };
}

export async function markAllNotificationsReadAction(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read", {
    p_org_id: organizationId,
  });

  return { ok: !error, count: data ?? 0 };
}

export async function sendTestNotificationAction(
  organizationId: string,
  type: "hold" | "expiry" | "billing" | "approval"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const configs: Record<string, { key: NotificationPayload["templateKey"]; title: string; message: string }> = {
    hold: {
      key: "hold_action_needed",
      title: "Order Hold: Address Verification Required",
      message: "Order #VP-9021 from Brand 'Glow Organics' is on hold pending postal address verification.",
    },
    expiry: {
      key: "near_expiry_stock",
      title: "Near-Expiry Stock Warning",
      message: "Batch LOT-2026-X in Location A-02-B expires in 14 days. Review FIFO pick priority.",
    },
    billing: {
      key: "billing_period_ready",
      title: "Monthly Statement Ready",
      message: "Your monthly volume review is ready in Settings > Plans & Billing. 3,420 orders shipped this cycle.",
    },
    approval: {
      key: "count_approval",
      title: "Cycle Count Approval Needed",
      message: "Supervisor approval requested for variance reconciliation in Zone B (+2 units, SKU-9901).",
    },
  };

  const selected = configs[type] || configs.hold;

  await notify({
    organizationId,
    userId: user.id,
    templateKey: selected.key,
    title: selected.title,
    message: selected.message,
    channel: "in_app",
  });

  return { ok: true };
}
