import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { MembersClient } from "./components/members-client";

export default async function MembersPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Get user's active organizations (and their own rights in each)
  const { data: userMemberships } = await supabase
    .from("organization_members")
    .select("organization_id, role, can_manage_all_members, organizations(id, name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (!userMemberships || userMemberships.length === 0) {
    redirect("/onboarding");
  }

  const orgIds = userMemberships.map((m: any) => m.organization_id);

  const organizations = userMemberships
    .map((m: any) => (Array.isArray(m.organizations) ? m.organizations[0] : m.organizations))
    .filter((org: any): org is { id: string; name: string } => org !== null && org !== undefined);

  const myRights = Object.fromEntries(
    userMemberships.map((m: any) => [
      m.organization_id,
      { role: m.role as string, canManageAll: !!m.can_manage_all_members },
    ])
  );

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
    .in("organization_id", orgIds)
    .order("created_at", { ascending: false });

  if (membersError) {
    console.error("Failed to load members:", membersError.message);
  }

  // Only owners/admins can read invitations (enforced by RLS); others just get an empty list.
  const { data: invites } = await supabase
    .from("invitations")
    .select("id, organization_id, token, code_hint, role, expires_at, uses, max_uses, status, domain_restriction, requires_approval, all_facilities")
    .in("organization_id", orgIds)
    .order("created_at", { ascending: false });

  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, organization_id")
    .in("organization_id", orgIds)
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
