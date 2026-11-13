import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { CatalogClient } from "./components/catalog-client";
import { getSkus } from "./actions";

export const metadata = {
  title: "Product Catalog | VentoryPoint",
  description: "Manage client SKUs, barcode mappings, packaging UoMs, tracking classes, and rotation rules.",
};

export default async function CatalogPage() {
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

  // Fetch client accounts and initial SKUs in parallel
  const [clientsRes, skusRes] = await Promise.all([
    supabase
      .from("client_accounts")
      .select("id, name, short_code")
      .eq("organization_id", context.activeOrg.id)
      .order("name", { ascending: true }),
    getSkus({ organizationId: context.activeOrg.id, page: 1, pageSize: 50 }),
  ]);

  const clients = clientsRes.data || [];
  const { skus, total } = skusRes;
  const facilities = (context.facilities || []).map((f) => ({
    id: f.id,
    name: f.name,
    short_code: f.code,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
          Product & SKU Catalog
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Manage brand product lines, barcode scans, packaging UoMs, expiration date rules, and FIFO/FEFO rotation.
        </p>
      </div>

      <CatalogClient
        initialSkus={skus}
        totalCount={total}
        clients={clients || []}
        facilities={facilities || []}
        organizationId={context.activeOrg.id}
      />
    </div>
  );
}
