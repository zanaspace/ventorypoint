import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { ClientHubClient } from "./components/client-hub-client";
import { getSkus } from "@/app/dashboard/catalog/actions";
import { getInventoryBalances } from "@/app/dashboard/inventory/actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id: clientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) {
    redirect("/onboarding");
  }

  // 1. Fetch Client Account details
  const { data: client, error: clientError } = await supabase
    .from("client_accounts")
    .select("*, client_facilities(facility_id)")
    .eq("id", clientId)
    .eq("organization_id", context.activeOrg.id)
    .maybeSingle();

  if (clientError || !client) {
    notFound();
  }

  // 2. Fetch all facilities in organization
  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, short_code, organization_id")
    .eq("organization_id", context.activeOrg.id)
    .order("name", { ascending: true });

  // 3. Fetch SKUs belonging to this client
  const { skus, total: totalSkus } = await getSkus({
    clientId,
    page: 1,
    pageSize: 100,
  });

  // 4. Fetch Inventory Balances for this client
  const { balances, total: totalBalances } = await getInventoryBalances({
    clientId,
    page: 1,
    pageSize: 100,
  });

  const formattedClient = {
    ...client,
    facility_ids: (client.client_facilities || []).map((cf: { facility_id: string }) => cf.facility_id),
  };

  return (
    <ClientHubClient
      client={formattedClient}
      initialSkus={skus}
      totalSkus={totalSkus}
      initialBalances={balances}
      totalBalances={totalBalances}
      facilities={facilities || []}
      organizationId={context.activeOrg.id}
    />
  );
}
