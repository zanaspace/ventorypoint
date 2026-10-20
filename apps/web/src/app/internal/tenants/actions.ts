"use server";

import { revalidatePath } from "next/cache";
import { getPlatformStaff } from "@/lib/platform-staff";
import { createAdminClient } from "@/utils/supabase/admin";

export async function toggleTenantStatus(organizationId: string, isActive: boolean) {
  const staff = await getPlatformStaff();
  if (!staff || (staff.role !== "platform_admin" && staff.role !== "customer_success")) {
    return { ok: false, error: "Unauthorized" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", organizationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/internal/tenants`);
  revalidatePath(`/internal/tenants/${organizationId}`);
  return { ok: true };
}

export async function updateTenantPlan(organizationId: string, plan: string) {
  const staff = await getPlatformStaff();
  if (!staff || (staff.role !== "platform_admin" && staff.role !== "finance")) {
    return { ok: false, error: "Unauthorized" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ plan, updated_at: new Date().toISOString() })
    .eq("id", organizationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/internal/tenants`);
  revalidatePath(`/internal/tenants/${organizationId}`);
  return { ok: true };
}

export async function addTenantInternalNote(organizationId: string, content: string) {
  const staff = await getPlatformStaff();
  if (!staff) return { ok: false, error: "Unauthorized" };

  const trimmed = content.trim();
  if (!trimmed) return { ok: false, error: "Note cannot be empty" };

  const admin = createAdminClient();
  const { error } = await admin.from("tenant_internal_notes").insert({
    organization_id: organizationId,
    author_id: staff.userId,
    content: trimmed,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/internal/tenants/${organizationId}`);
  return { ok: true };
}

export async function setTenantFeatureFlag(
  organizationId: string,
  flagId: string,
  isEnabled: boolean,
  notes?: string
) {
  const staff = await getPlatformStaff();
  if (!staff || (staff.role !== "platform_admin" && staff.role !== "customer_success")) {
    return { ok: false, error: "Unauthorized" };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("organization_feature_flags").upsert(
    {
      organization_id: organizationId,
      feature_flag_id: flagId,
      is_enabled: isEnabled,
      notes: notes ?? "Toggled by platform staff",
      updated_by: staff.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,feature_flag_id" }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/internal/tenants/${organizationId}`);
  return { ok: true };
}
