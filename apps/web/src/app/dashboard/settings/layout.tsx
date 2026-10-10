import { redirect } from "next/navigation";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { SettingsNav } from "./settings-nav";
import { SETTINGS_SECTIONS } from "./sections";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) redirect("/onboarding");

  const sections = SETTINGS_SECTIONS.filter((s) => s.roles.includes(context.role));
  if (sections.length === 0) redirect("/dashboard");

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <SettingsNav sections={sections.map(({ href, label }) => ({ href, label }))} />
      {children}
    </div>
  );
}
