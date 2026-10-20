"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export interface SupportGrant {
  id: string;
  organization_id: string;
  scope: "read_only" | "read_write";
  duration_hours: number;
  reason?: string | null;
  starts_at: string;
  expires_at: string;
  revoked_at?: string | null;
  granted_by: string;
  grantor_email?: string | null;
  is_active: boolean;
}

export async function getActiveSupportGrant(organizationId: string): Promise<SupportGrant | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("support_access_grants")
      .select("id, organization_id, scope, duration_hours, reason, starts_at, expires_at, revoked_at, granted_by")
      .eq("organization_id", organizationId)
      .lte("starts_at", now)
      .gt("expires_at", now)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Fetch grantor email
    let grantorEmail: string | null = null;
    const { data: userData } = await admin.auth.admin.getUserById(data.granted_by);
    if (userData?.user?.email) {
      grantorEmail = userData.user.email;
    }

    return {
      id: data.id,
      organization_id: data.organization_id,
      scope: data.scope as "read_only" | "read_write",
      duration_hours: data.duration_hours,
      reason: data.reason,
      starts_at: data.starts_at,
      expires_at: data.expires_at,
      revoked_at: data.revoked_at,
      granted_by: data.granted_by,
      grantor_email: grantorEmail,
      is_active: true,
    };
  } catch {
    return null;
  }
}

export async function getSupportGrantHistory(organizationId: string): Promise<SupportGrant[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("support_access_grants")
      .select("id, organization_id, scope, duration_hours, reason, starts_at, expires_at, revoked_at, granted_by, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error || !data) return [];

    return data.map((d) => ({
      id: d.id,
      organization_id: d.organization_id,
      scope: d.scope as "read_only" | "read_write",
      duration_hours: d.duration_hours,
      reason: d.reason,
      starts_at: d.starts_at,
      expires_at: d.expires_at,
      revoked_at: d.revoked_at,
      granted_by: d.granted_by,
      is_active: !d.revoked_at && new Date(d.expires_at) > new Date(now),
    }));
  } catch {
    return [];
  }
}

export async function grantSupportAccessAction(data: {
  organizationId: string;
  scope: "read_only" | "read_write";
  durationHours: number;
  reason?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  // Verify caller is owner or admin in this organization
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", data.organizationId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!member || !["owner", "admin"].includes(member.role)) {
    return { ok: false, error: "Unauthorized: only owners and admins can grant support access" };
  }

  const validDurations = [1, 4, 8, 24, 72, 168];
  if (!validDurations.includes(data.durationHours)) {
    return { ok: false, error: "Invalid duration selected" };
  }

  try {
    const admin = createAdminClient();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + data.durationHours * 60 * 60 * 1000);

    // Revoke any previous active grant for this organization
    await admin
      .from("support_access_grants")
      .update({
        revoked_at: now.toISOString(),
        revoked_by: user.id,
        updated_at: now.toISOString(),
      })
      .eq("organization_id", data.organizationId)
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString());

    // Insert new grant
    const { data: newGrant, error } = await admin
      .from("support_access_grants")
      .insert({
        organization_id: data.organizationId,
        granted_by: user.id,
        scope: data.scope,
        duration_hours: data.durationHours,
        reason: data.reason?.trim() || null,
        starts_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    revalidatePath("/dashboard/settings/support");
    revalidatePath("/dashboard");
    revalidatePath(`/internal/tenants/${data.organizationId}`);
    return { ok: true, grantId: newGrant.id };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to grant support access" };
  }
}

export async function revokeSupportAccessAction(grantId: string, organizationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await admin
      .from("support_access_grants")
      .update({
        revoked_at: now,
        revoked_by: user.id,
        updated_at: now,
      })
      .eq("id", grantId)
      .eq("organization_id", organizationId);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/dashboard/settings/support");
    revalidatePath("/dashboard");
    revalidatePath(`/internal/tenants/${organizationId}`);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message || "Failed to revoke support access" };
  }
}
