import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { DeliveriesClient, type ConsumerStats, type ProblemDelivery } from "./components/deliveries-client";

export const metadata = {
  title: "Event deliveries | VentoryPoint",
  description: "Health of the event pipeline: consumer lag, retries, failures and replay.",
};

export default async function EventDeliveriesPage() {
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) redirect("/onboarding");
  if (!["owner", "admin"].includes(context.role)) redirect("/dashboard");

  const supabase = await createClient();
  const [{ data: stats }, { data: problems }] = await Promise.all([
    supabase.rpc("get_event_delivery_stats", { p_organization_id: context.activeOrg.id }),
    supabase
      .from("event_deliveries")
      .select("id, consumer, status, attempts, last_error, next_attempt_at, updated_at, warehouse_events(event_type, occurred_at, idempotency_key)")
      .eq("organization_id", context.activeOrg.id)
      .or("status.eq.dead,and(status.eq.pending,attempts.gt.0)")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <DeliveriesClient
      stats={(stats ?? []) as ConsumerStats[]}
      problems={(problems ?? []) as unknown as ProblemDelivery[]}
    />
  );
}
