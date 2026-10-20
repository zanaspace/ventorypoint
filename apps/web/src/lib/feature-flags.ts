import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrgFeatureFlagOverride {
  id: string;
  organization_id: string;
  feature_flag_id: string;
  is_enabled: boolean;
  notes: string | null;
  flag_key: string;
  flag_name: string;
}

/**
 * Checks whether a feature flag is enabled for a given tenant organization.
 * Hierarchy:
 * 1. Specific organization override (if defined)
 * 2. Global feature flag state
 * 3. Default fallback: false
 */
export async function isFeatureEnabled(
  organizationId: string | null | undefined,
  flagKey: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("is_feature_enabled", {
      p_organization_id: organizationId ?? null,
      p_flag_key: flagKey,
    });

    if (!error && typeof data === "boolean") {
      return data;
    }
  } catch {
    // Database call failed or function does not exist
  }

  // Graceful fallback defaults if DB RPC is unavailable
  const DEFAULTS: Record<string, boolean> = {
    billing_portal_enabled: false,
    data_export_enabled: true,
    camera_barcode_scanner: true,
    realtime_telemetry_hud: true,
    developer_console_access: true,
  };

  return DEFAULTS[flagKey] ?? false;
}

/**
 * Lists all global feature flags (for platform staff).
 */
export async function getAllFeatureFlags(): Promise<FeatureFlag[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("feature_flags")
    .select("*")
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data as FeatureFlag[];
}

/**
 * Gets all flags with their effective state for a given organization.
 */
export async function getOrgFeatureFlags(
  organizationId: string
): Promise<Array<FeatureFlag & { effective_enabled: boolean; is_overridden: boolean }>> {
  const admin = createAdminClient();
  const { data: flags } = await admin.from("feature_flags").select("*").order("name");
  const { data: overrides } = await admin
    .from("organization_feature_flags")
    .select("*")
    .eq("organization_id", organizationId);

  if (!flags) return [];

  const overrideMap = new Map<string, boolean>();
  for (const o of overrides ?? []) {
    overrideMap.set(o.feature_flag_id, o.is_enabled);
  }

  return flags.map((f) => {
    const hasOverride = overrideMap.has(f.id);
    const effective = hasOverride ? overrideMap.get(f.id)! : f.is_enabled;
    return {
      ...f,
      effective_enabled: effective,
      is_overridden: hasOverride,
    };
  });
}
