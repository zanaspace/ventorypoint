import { notFound } from "next/navigation";
import { getPlatformStaff } from "@/lib/platform-staff";
import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { EventConsoleClient } from "./event-console-client";
import { devConsoleEnabled } from "./enabled";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Event console | VentoryPoint Internal",
  description: "Emit synthetic warehouse events and watch realtime fan-out.",
};

export default async function EventConsolePage() {
  if (!devConsoleEnabled() || !(await getPlatformStaff())) notFound();
  // Events are emitted into the staff member's own active organization (use a test org).
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) notFound();

  const supabase = await createClient();
  const { data: types } = await supabase
    .from("event_type_registry")
    .select("event_type, description, is_floor_event, payload_schema")
    .eq("is_active", true)
    .order("event_type");

  return (
    <EventConsoleClient
      organizationId={context.activeOrg.id}
      facilities={context.facilities.map((f) => ({ id: f.id, name: f.name, code: f.code }))}
      eventTypes={(types ?? []) as { event_type: string; description: string; is_floor_event: boolean; payload_schema: unknown }[]}
    />
  );
}
