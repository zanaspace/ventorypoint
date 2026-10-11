import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { MembersClient } from "./components/members-client";
import { getActiveWorkspaceContext } from "@/lib/org-context";

export default async function MembersPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Everything on this page is scoped to the active workspace only, never every org the user belongs to.
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) {
    redirect("/onboarding");
  }
  const orgId = context.activeOrg.id;

  // The caller's own rights in the active workspace
  const { data: myMembership } = await supabase
    .from("organization_members")
    .select("role, can_manage_all_members")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (!myMembership) {
    redirect("/dashboard");
  }

  const organizations = [{ id: orgId, name: context.activeOrg.name }];
  const myRights = {
    [orgId]: { role: myMembership.role as string, canManageAll: !!myMembership.can_manage_all_members },
  };

  // organization_members has two FKs to profiles (user_id, added_by), so the embeds must be explicit.
  const { data: members, error: membersError } = await supabase
    .from("organization_members")
    .select(`
      id,
      user_id,
      organization_id,
      role,
      is_active,
      pending_approval,
      can_manage_all_members,
      all_facilities,
      added_by,
      profiles:profiles!organization_members_user_id_fkey (
        id,
        first_name,
        last_name,
        email
      ),
      inviter:profiles!organization_members_added_by_fkey (
        first_name,
        last_name,
        email
      ),
      member_facility_access (
        facility_id,
        facilities ( name )
      ),
      floor_worker_credentials (
        worker_code,
        badge_token,
        failed_attempts,
        locked_until
      )
    `)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (membersError) {
    console.error("Failed to load members:", membersError.message);
  }

  // Only owners/admins can read invitations (enforced by RLS); others just get an empty list.
  const { data: invites } = await supabase
    .from("invitations")
    .select("id, organization_id, token, code_hint, role, expires_at, uses, max_uses, status, domain_restriction, requires_approval, all_facilities")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, organization_id")
    .eq("organization_id", orgId)
    .order("name");

  const first = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const formattedMembers = (members || []).map((m: any) => ({
    ...m,
    profiles: first(m.profiles),
    inviter: first(m.inviter),
    credential: first(m.floor_worker_credentials),
    facility_ids: (m.member_facility_access || []).map((a: any) => a.facility_id as string),
    facility_names: m.all_facilities
      ? null
      : (m.member_facility_access || [])
          .map((a: any) => first(a.facilities)?.name)
          .filter(Boolean),
  }));

  return (
    <MembersClient
      currentUserId={user.id}
      myRights={myRights}
      initialMembers={formattedMembers}
      initialInvites={invites || []}
      organizations={organizations}
      facilities={facilities || []}
    />
  );
}
