import { getActiveWorkspaceContext } from "@/lib/org-context";
import { redirect } from "next/navigation";
import { SettingsClient } from "./components/settings-client";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Organization Settings | VentoryPoint",
  description: "Configure 3PL workspace preferences, country, timezone, and base currency.",
};

export default async function SettingsPage() {
  const context = await getActiveWorkspaceContext();
  if (!context || !context.activeOrg) {
    redirect("/onboarding");
  }

  // Organization settings: owner, admin, billing. Ops managers and supervisors land on Devices.
  if (!["owner", "admin", "billing"].includes(context.role)) {
    redirect(["ops_manager", "supervisor"].includes(context.role) ? "/dashboard/settings/devices" : "/dashboard");
  }

  const supabase = await createClient();
  const { data: rawOrg } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", context.activeOrg.id)
    .single();

  if (!rawOrg) {
    redirect("/dashboard");
  }

  const org = {
    id: rawOrg.id,
    name: rawOrg.name,
    country: rawOrg.country,
    timezone: rawOrg.timezone,
    currency: rawOrg.default_currency || rawOrg.currency || "USD",
    created_at: rawOrg.created_at,
  };

  return (
    <SettingsClient
      organization={org}
      userRole={context.role}
    />
  );
}
