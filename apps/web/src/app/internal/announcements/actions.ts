"use server";

import { revalidatePath } from "next/cache";
import { getPlatformStaff } from "@/lib/platform-staff";
import { createAdminClient } from "@/utils/supabase/admin";

export async function createAnnouncement(data: {
  title: string;
  message: string;
  severity: "info" | "warning" | "critical" | "maintenance";
  targetAudience: "all" | "admins" | "floor_workers" | "specific_orgs";
  targetOrganizationIds?: string[];
  actionLabel?: string;
  actionUrl?: string;
  dismissible: boolean;
  startsAt?: string;
  endsAt?: string;
}) {
  const staff = await getPlatformStaff();
  if (!staff || (staff.role !== "platform_admin" && staff.role !== "customer_success")) {
    return { ok: false, error: "Unauthorized" };
  }

  const trimmedTitle = data.title.trim();
  const trimmedMessage = data.message.trim();
  if (!trimmedTitle || !trimmedMessage) {
    return { ok: false, error: "Title and message are required" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("announcements").insert({
    title: trimmedTitle,
    message: trimmedMessage,
    severity: data.severity,
    target_audience: data.targetAudience,
    target_organization_ids: data.targetOrganizationIds && data.targetOrganizationIds.length > 0 ? data.targetOrganizationIds : null,
    action_label: data.actionLabel?.trim() || null,
    action_url: data.actionUrl?.trim() || null,
    dismissible: data.dismissible,
    starts_at: data.startsAt || new Date().toISOString(),
    ends_at: data.endsAt || null,
    is_active: true,
    created_by: staff.userId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/internal/announcements");
  return { ok: true };
}

export async function toggleAnnouncementActive(announcementId: string, isActive: boolean) {
  const staff = await getPlatformStaff();
  if (!staff || (staff.role !== "platform_admin" && staff.role !== "customer_success")) {
    return { ok: false, error: "Unauthorized" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("announcements")
    .update({ is_active: isActive })
    .eq("id", announcementId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/internal/announcements");
  return { ok: true };
}

export async function deleteAnnouncement(announcementId: string) {
  const staff = await getPlatformStaff();
  if (!staff || staff.role !== "platform_admin") {
    return { ok: false, error: "Unauthorized" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("announcements").delete().eq("id", announcementId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/internal/announcements");
  return { ok: true };
}
