import { redirect } from "next/navigation";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { getActiveSupportGrant, getSupportGrantHistory } from "./actions";
import { SupportAccessClient } from "./components/support-access-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Support Access | Settings | VentoryPoint",
  description: "Grant time-boxed, consented technical support access to the VentoryPoint platform engineering team.",
};

export default async function SupportAccessPage() {
  const context = await getActiveWorkspaceContext();
  if (!context || !context.activeOrg) {
    redirect("/onboarding");
  }

  // Support access can only be managed by owners and admins
  if (!["owner", "admin"].includes(context.role)) {
    redirect("/dashboard/settings");
  }

  const [activeGrant, history] = await Promise.all([
    getActiveSupportGrant(context.activeOrg.id),
    getSupportGrantHistory(context.activeOrg.id),
  ]);

  return (
    <SupportAccessClient
      organizationId={context.activeOrg.id}
      organizationName={context.activeOrg.name}
      userRole={context.role}
      initialActiveGrant={activeGrant}
      initialHistory={history}
    />
  );
}
