import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { FacilitiesClient } from "./components/facilities-client";
import { getActiveWorkspaceContext } from "@/lib/org-context";

export default async function FacilitiesPage() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Scoped to the active workspace only, never every org the user belongs to.
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) {
    redirect("/onboarding");
  }
  const orgId = context.activeOrg.id;
  const organizations = [{ id: orgId, name: context.activeOrg.name }];

  // Facilities in the active workspace (RLS also limits rows to orgs the user belongs to)
  const { data: facilities } = await supabase
    .from("facilities")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return (
    <FacilitiesClient 
      initialFacilities={facilities || []} 
      organizations={organizations}
    />
  );
}
