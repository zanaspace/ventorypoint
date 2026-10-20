import { notFound } from "next/navigation";
import { getPlatformStaff } from "@/lib/platform-staff";
import { createAdminClient } from "@/utils/supabase/admin";
import { TenantsClient, type TenantSummary } from "./components/tenants-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tenants | VentoryPoint Internal",
};

export default async function InternalTenantsPage() {
  const staff = await getPlatformStaff();
  if (!staff) notFound();

  const admin = createAdminClient();

  // Try RPC get_internal_tenants_overview first
  const { data: rpcData, error: rpcError } = await admin.rpc("get_internal_tenants_overview");

  let tenants: TenantSummary[] = [];

  if (!rpcError && Array.isArray(rpcData)) {
    tenants = rpcData.map((r: any) => ({
      id: r.organization_id,
      name: r.name,
      slug: r.slug,
      created_at: r.created_at,
      plan: r.plan || "launch",
      status: r.status === "suspended" ? "suspended" : "active",
      facilities_count: Number(r.facilities_count || 0),
      members_count: Number(r.members_count || 0),
      clients_count: Number(r.clients_count || 0),
      devices_count: Number(r.devices_count || 0),
      events_count_30d: Number(r.events_count_30d || 0),
      notes_count: Number(r.notes_count || 0),
    }));
  } else {
    // Fallback direct query if migration hasn't been applied to DB yet
    const { data: orgs } = await admin
      .from("organizations")
      .select("id, name, slug, created_at, plan, is_active")
      .order("created_at", { ascending: false });

    if (orgs && orgs.length > 0) {
      const orgIds = orgs.map((o) => o.id);

      // Fetch counts in parallel
      const [facRes, memRes, cliRes, devRes, evtRes] = await Promise.all([
        admin.from("facilities").select("organization_id"),
        admin.from("organization_members").select("organization_id").eq("is_active", true),
        admin.from("client_accounts").select("organization_id"),
        admin.from("floor_devices").select("organization_id").eq("is_authorized", true),
        admin
          .from("warehouse_events")
          .select("organization_id")
          .gte("occurred_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      ]);

      const countBy = (items: Array<{ organization_id: string }> | null) => {
        const map = new Map<string, number>();
        for (const item of items ?? []) {
          map.set(item.organization_id, (map.get(item.organization_id) ?? 0) + 1);
        }
        return map;
      };

      const facMap = countBy(facRes.data);
      const memMap = countBy(memRes.data);
      const cliMap = countBy(cliRes.data);
      const devMap = countBy(devRes.data);
      const evtMap = countBy(evtRes.data);

      tenants = orgs.map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        created_at: o.created_at,
        plan: o.plan || "launch",
        status: o.is_active === false ? "suspended" : "active",
        facilities_count: facMap.get(o.id) ?? 0,
        members_count: memMap.get(o.id) ?? 0,
        clients_count: cliMap.get(o.id) ?? 0,
        devices_count: devMap.get(o.id) ?? 0,
        events_count_30d: evtMap.get(o.id) ?? 0,
        notes_count: 0,
      }));
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Tenants
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Overview and controls for all 3PL accounts, feature entitlements, operating warehouses, and scan volume.
          </p>
        </div>
      </div>

      <TenantsClient tenants={tenants} />
    </div>
  );
}
