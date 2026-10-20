import { notFound } from "next/navigation";
import { getPlatformStaff } from "@/lib/platform-staff";
import { getAllFeatureFlags } from "@/lib/feature-flags";
import { FlagsClient } from "./components/flags-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Feature Flags | VentoryPoint Internal",
};

export default async function InternalFeatureFlagsPage() {
  const staff = await getPlatformStaff();
  if (!staff) notFound();

  const flags = await getAllFeatureFlags();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            Feature Flags
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure global feature gates, toggle platform kill switches, and rollout capabilities across 3PL tenants without code deploys.
          </p>
        </div>
      </div>

      <FlagsClient initialFlags={flags} />
    </div>
  );
}
