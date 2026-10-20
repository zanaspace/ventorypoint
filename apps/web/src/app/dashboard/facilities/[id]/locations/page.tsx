import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { LocationsClient } from "./components/locations-client";
import { getFacilityLocations, getFacilityConvention, getFacilityHierarchy } from "./actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function FacilityLocationsPage({ params }: PageProps) {
  const { id: facilityId } = await params;
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

  // Load facility record
  const { data: facility, error: facError } = await supabase
    .from("facilities")
    .select("*")
    .eq("id", facilityId)
    .eq("organization_id", context.activeOrg.id)
    .single();

  if (facError || !facility) {
    notFound();
  }

  // Load initial locations
  const { locations, total } = await getFacilityLocations(facilityId, { page: 1, pageSize: 50 });

  // Load convention settings
  const { convention } = await getFacilityConvention(facilityId);

  // Load hierarchy nodes
  const { nodes } = await getFacilityHierarchy(facilityId);

  return (
    <LocationsClient
      facility={facility}
      organization={context.activeOrg}
      initialLocations={locations}
      totalCount={total}
      convention={convention}
      hierarchyNodes={nodes}
    />
  );
}
