import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { getPlatformStaff } from "@/lib/platform-staff";
import { DeliveriesClient, type ConsumerHealth, type ProblemDelivery } from "./components/deliveries-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Event pipeline | VentoryPoint Internal",
};

export default async function EventPipelinePage() {
  if (!(await getPlatformStaff())) notFound();

  // Cross-organization operational view: service role, staff-only (checked above).
  const admin = createAdminClient();
  const [{ data: health }, { data: consumers }, { data: problems }] = await Promise.all([
    admin.rpc("event_pipeline_health"),
    admin.from("event_consumers").select("name, description"),
    admin
      .from("event_deliveries")
      .select("id, consumer, status, attempts, last_error, next_attempt_at, updated_at, organizations(name), warehouse_events(event_type, occurred_at)")
      .or("status.eq.dead,and(status.eq.pending,attempts.gt.0)")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const descriptions = new Map((consumers ?? []).map((c) => [c.name as string, c.description as string]));
  const stats: ConsumerHealth[] = ((health ?? []) as Omit<ConsumerHealth, "description">[])
    .map((h) => ({ ...h, description: descriptions.get(h.consumer) ?? "" }))
    .sort((a, b) => Number(b.is_enabled) - Number(a.is_enabled) || a.consumer.localeCompare(b.consumer));

  return <DeliveriesClient stats={stats} problems={(problems ?? []) as unknown as ProblemDelivery[]} />;
}
