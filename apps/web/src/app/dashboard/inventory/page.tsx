import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { InventoryClient } from "./components/inventory-client";
import {
  getInventoryBalances,
  getContainers,
  getLots,
  getSerials,
  getAdjustments,
  getTransactions,
  getAdjustmentReasons,
} from "./actions";

export const metadata = {
  title: "Inventory Ledger & Traceability | VentoryPoint",
  description:
    "Real-time physical inventory balances, LPN license plates, FEFO/FIFO rotation rules, and complete traceability timeline.",
};

export default async function InventoryPage() {
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

  // Fetch facilities for this organization
  const { data: facilities } = await supabase
    .from("facilities")
    .select("id, name, short_code")
    .eq("organization_id", context.activeOrg.id)
    .order("name", { ascending: true });

  // Fetch clients for this organization
  const { data: clients } = await supabase
    .from("client_accounts")
    .select("id, name, short_code")
    .eq("organization_id", context.activeOrg.id)
    .order("name", { ascending: true });

  const activeFacilityId = context.activeFacilityId || facilities?.[0]?.id || "";

  // Fetch initial ledger data
  const [
    balancesRes,
    containersRes,
    lotsRes,
    serialsRes,
    adjustmentsRes,
    transactionsRes,
    reasons,
    skusRes,
  ] = await Promise.all([
    getInventoryBalances({ facilityId: activeFacilityId, page: 1, pageSize: 50 }),
    getContainers({ facilityId: activeFacilityId }),
    getLots(),
    getSerials({ page: 1, pageSize: 50 }),
    getAdjustments(activeFacilityId),
    getTransactions({ facilityId: activeFacilityId, page: 1, pageSize: 50 }),
    getAdjustmentReasons(),
    supabase
      .from("skus")
      .select("id, code, name, tracking_class, rotation_rule, expiry_required, client_account_id")
      .eq("organization_id", context.activeOrg.id)
      .order("name", { ascending: true }),
  ]);

  const skus = (skusRes?.data || []) as any[];

  return (
    <div>
      <InventoryClient
        initialFacilityId={activeFacilityId}
        facilities={facilities || []}
        clients={clients || []}
        skus={skus}
        initialBalances={balancesRes.balances}
        initialBalancesTotal={balancesRes.total}
        initialContainers={containersRes.containers}
        initialLots={lotsRes.lots}
        initialSerials={serialsRes.serials}
        initialSerialsTotal={serialsRes.total}
        initialAdjustments={adjustmentsRes.adjustments}
        initialTransactions={transactionsRes.transactions}
        initialTransactionsTotal={transactionsRes.total}
        adjustmentReasons={reasons}
      />
    </div>
  );
}
