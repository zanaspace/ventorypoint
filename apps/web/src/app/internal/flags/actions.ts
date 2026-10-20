"use server";

import { revalidatePath } from "next/cache";
import { getPlatformStaff } from "@/lib/platform-staff";
import { createAdminClient } from "@/utils/supabase/admin";

export async function toggleGlobalFeatureFlag(flagId: string, isEnabled: boolean) {
  const staff = await getPlatformStaff();
  if (!staff || (staff.role !== "platform_admin" && staff.role !== "customer_success")) {
    return { ok: false, error: "Unauthorized: only Platform Admin or Customer Success can modify flags" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("feature_flags")
    .update({
      is_enabled: isEnabled,
      updated_at: new Date().toISOString(),
      updated_by: staff.userId,
    })
    .eq("id", flagId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/internal/flags");
  return { ok: true };
}

export async function createFeatureFlag(data: {
  key: string;
  name: string;
  description?: string;
  isEnabled: boolean;
}) {
  const staff = await getPlatformStaff();
  if (!staff || staff.role !== "platform_admin") {
    return { ok: false, error: "Unauthorized: only Platform Admin can create flags" };
  }

  const trimmedKey = data.key.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(trimmedKey)) {
    return { ok: false, error: "Flag key must only contain lowercase letters, numbers, and underscores" };
  }

  const trimmedName = data.name.trim();
  if (!trimmedName) {
    return { ok: false, error: "Flag name is required" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("feature_flags").insert({
    key: trimmedKey,
    name: trimmedName,
    description: data.description?.trim() || null,
    is_enabled: data.isEnabled,
    is_system: false,
    updated_by: staff.userId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/internal/flags");
  return { ok: true };
}

export async function deleteFeatureFlag(flagId: string) {
  const staff = await getPlatformStaff();
  if (!staff || staff.role !== "platform_admin") {
    return { ok: false, error: "Unauthorized: only Platform Admin can delete flags" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("feature_flags")
    .delete()
    .eq("id", flagId)
    .eq("is_system", false);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/internal/flags");
  return { ok: true };
}
