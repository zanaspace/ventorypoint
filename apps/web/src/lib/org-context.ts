"use server";

import { cache } from "react";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import {
  ACTIVE_ORG_COOKIE,
  ACTIVE_FACILITY_COOKIE,
  type WorkspaceOrganization,
  type WorkspaceFacility,
  type WorkspaceContext,
} from "./org-context-types";

const getCachedWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // 1 & 2. Fetch user's profile and active memberships concurrently
  const [{ data: profile }, { data: members }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_members")
      .select("organization_id, role, all_facilities")
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  if (!members || members.length === 0) return null;

  const orgIds = members.map((m: any) => m.organization_id);

  // 3. Fetch organizations details directly
  const { data: orgsData } = await supabase
    .from("organizations")
    .select("*")
    .in("id", orgIds);

  const orgMap = new Map<string, any>();
  (orgsData || []).forEach((o: any) => orgMap.set(o.id, o));

  const rawOrgs: (WorkspaceOrganization | null)[] = members.map((m: any) => {
    const org = orgMap.get(m.organization_id);
    if (!org) return null;
    return {
      id: String(org.id),
      name: String(org.name),
      role: String(m.role),
      country: org.country ? String(org.country) : undefined,
      timezone: org.timezone ? String(org.timezone) : undefined,
      currency: org.default_currency || org.currency ? String(org.default_currency || org.currency) : undefined,
    };
  });

  const organizations = rawOrgs.filter((org): org is WorkspaceOrganization => org !== null);

  if (organizations.length === 0) return null;

  // 4. Resolve active organization ID
  const cookieStore = await cookies();
  const savedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const activeOrg =
    organizations.find((o) => o.id === savedOrgId) || organizations[0];

  // 5. Fetch facilities for the active organization
  const { data: facilitiesData } = await supabase
    .from("facilities")
    .select("id, name, short_code, city, is_active")
    .eq("organization_id", activeOrg.id)
    .order("name", { ascending: true });

  const facilities: WorkspaceFacility[] = (facilitiesData || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    code: f.short_code || f.code || "",
    city: f.city || "",
    is_active: f.is_active ?? true,
  }));

  // 6. Resolve active facility ID
  const savedFacilityId = cookieStore.get(ACTIVE_FACILITY_COOKIE)?.value;
  const activeFacilityId =
    savedFacilityId && (savedFacilityId === "all" || facilities.some((f) => f.id === savedFacilityId))
      ? savedFacilityId
      : "all";

  return {
    user: {
      id: user.id,
      email: profile?.email || user.email || "",
      firstName: profile?.first_name || "",
      lastName: profile?.last_name || "",
    },
    organizations,
    activeOrg,
    facilities,
    activeFacilityId,
    role: activeOrg.role,
  };
});

export async function getActiveWorkspaceContext(): Promise<WorkspaceContext | null> {
  return getCachedWorkspaceContext();
}

export async function switchActiveOrganization(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  // Reset active facility when switching organization
  cookieStore.set(ACTIVE_FACILITY_COOKIE, "all", {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}

export async function switchActiveFacility(facilityId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_FACILITY_COOKIE, facilityId, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}
