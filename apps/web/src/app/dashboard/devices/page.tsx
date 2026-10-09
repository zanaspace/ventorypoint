import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { DevicesClient, type DeviceRow } from "./components/devices-client";

export const metadata = {
  title: "Devices | VentoryPoint",
  description: "Approve, rename, assign and retire floor terminals and scanners.",
};

const DEVICE_MANAGERS = ["owner", "admin", "ops_manager", "supervisor"];

export default async function DevicesPage() {
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) redirect("/onboarding");
  if (!DEVICE_MANAGERS.includes(context.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase
    .from("floor_devices")
    .select("id, device_name, device_type, facility_id, is_authorized, blocked_at, retired_at, last_active_at, created_at")
    .eq("organization_id", context.activeOrg.id)
    .order("created_at", { ascending: false });

  return (
    <DevicesClient
      devices={(data ?? []) as DeviceRow[]}
      facilities={context.facilities.map((f) => ({ id: f.id, name: f.name, code: f.code }))}
    />
  );
}
