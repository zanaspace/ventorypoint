"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// All member/invitation writes go through security-definer RPCs so the database
// enforces the Owner/Admin two-level rules and only allow-listed fields can change.

export async function removeMember(memberId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", { p_member_id: memberId });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/members");
  return { success: true };
}

export async function toggleMemberStatus(memberId: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_active_status", {
    p_member_id: memberId,
    p_active: isActive,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/members");
  return { success: true };
}

const EDITABLE_ROLES = ["admin", "ops_manager", "supervisor", "billing", "floor_worker", "client_user"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Changes a member's role and facility access (rules enforced by update_member_access). */
export async function updateMemberAccess(
  memberId: string,
  role: string,
  allFacilities: boolean,
  facilityIds: string[]
) {
  if (!EDITABLE_ROLES.includes(role)) return { error: "Choose a valid role." };
  const ids = allFacilities ? [] : facilityIds.filter((id) => UUID_RE.test(id));
  if (!allFacilities && ids.length === 0) {
    return { error: "Choose at least one facility, or give access to all facilities." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_member_access", {
    p_member_id: memberId,
    p_role: role,
    p_all_facilities: allFacilities,
    p_facility_ids: ids,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/members");
  return { success: true };
}

export async function setAdminPrivilege(memberId: string, value: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_admin_privilege", {
    p_member_id: memberId,
    p_value: value,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/members");
  return { success: true };
}

export async function generateInviteCode(formData: FormData) {
  const supabase = await createClient();

  const organization_id = formData.get("organization_id") as string;
  const role = formData.get("role") as string;
  const unlimited = formData.get("unlimited_uses") === "on";
  const maxUsesRaw = parseInt(formData.get("max_uses") as string);
  const days_valid = parseInt(formData.get("days_valid") as string) || 7;
  const domain = ((formData.get("domain_restriction") as string) || "").trim();
  const requires_approval = formData.get("requires_approval") === "on";
  const scope = formData.get("facility_scope") as string;
  const all_facilities = scope !== "specific";
  const facility_ids = formData.getAll("facility_ids").map(String);

  if (!organization_id || !role) {
    return { error: "Organization and role are required." };
  }

  const { data, error } = await supabase.rpc("create_invite_code", {
    p_organization_id: organization_id,
    p_role: role,
    p_max_uses: unlimited ? null : Number.isFinite(maxUsesRaw) ? maxUsesRaw : 1,
    p_days_valid: days_valid,
    p_domain: domain || null,
    p_requires_approval: requires_approval,
    p_all_facilities: all_facilities,
    p_facility_ids: all_facilities ? [] : facility_ids,
    p_invitee_email: null,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/members");
  // `code` and `token` are only ever returned here, once. Only a hash is stored.
  return { data: data as { id: string; code: string; token: string } };
}

export async function revokeInvite(invitationId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId });
  if (error) return { error: error.message };

  revalidatePath("/dashboard/members");
  return { success: true };
}
