import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { ClientsClient } from "./components/clients-client";
import { getActiveWorkspaceContext } from "@/lib/org-context";

export default async function ClientsPage() {
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

  // Fetch client accounts for the active workspace
  const { data: clients } = await supabase
    .from("client_accounts")
    .select("*, client_facilities(facility_id)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, organization_id")
    .eq("organization_id", orgId)
    .order("name");

  const formattedClients = (clients || []).map((c: any) => ({
    ...c,
    facility_ids: (c.client_facilities || []).map((cf: any) => cf.facility_id),
  }));

  return (
    <ClientsClient 
      initialClients={formattedClients} 
      organizations={organizations}
      facilities={facilities || []}
    />
  );
}
