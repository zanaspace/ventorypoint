import { createClient } from "@/utils/supabase/server";
import { PLAN_TIERS, PlanConfig } from "./stripe";

export interface OrgEntitlementStatus {
  organizationId: string;
  planTier: string;
  planConfig: PlanConfig;
  status: string;
  isRestricted: boolean;
  inGracePeriod: boolean;
  daysUntilGraceExpires: number;
  currentFacilityCount: number;
  currentClientCount: number;
  currentMonthlyShippedOrders: number;
  limits: {
    maxFacilities: number | "unlimited";
    maxClients: number | "unlimited";
    maxMonthlyOrders: number | "unlimited";
    canAddFacility: boolean;
    canAddClient: boolean;
    canUseAdvancedAnalytics: boolean;
    canUseCustomRoles: boolean;
    canUseMultiFacilityRouting: boolean;
    canUseDirectApi: boolean;
  };
}

export async function getOrgEntitlements(organizationId: string): Promise<OrgEntitlementStatus> {
  const supabase = await createClient();

  // 1. Get subscription details via database helper
  const { data: subData } = await supabase.rpc("get_org_subscription", {
    p_org_id: organizationId,
  });

  const planTier = subData?.plan_tier || "launch";
  const planConfig = PLAN_TIERS[planTier] || PLAN_TIERS.launch;
  const isRestricted = !!subData?.is_restricted;
  const inGracePeriod = !!subData?.in_grace_period;
  const daysUntilGraceExpires = subData?.days_until_grace_expires ?? 0;
  const status = subData?.status || "active";

  // 2. Count existing facilities
  const { count: facilityCount } = await supabase
    .from("facilities")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  // 3. Count existing brand clients if table exists
  let clientCount = 0;
  try {
    const { count } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    clientCount = count ?? 0;
  } catch {
    clientCount = 0;
  }

  // 4. Count monthly usage for current month
  let monthlyShipped = 0;
  try {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0];
    const { data: usageData } = await supabase
      .from("subscription_usage")
      .select("shipped_orders_count")
      .eq("organization_id", organizationId)
      .eq("period_start", startOfMonth)
      .maybeSingle();

    if (usageData) {
      monthlyShipped = usageData.shipped_orders_count ?? 0;
    }
  } catch {
    monthlyShipped = 0;
  }

  const currentFacilities = facilityCount ?? 0;
  const canAddFacility =
    !isRestricted &&
    (planConfig.maxFacilities === "unlimited" || currentFacilities < planConfig.maxFacilities);

  const canAddClient =
    !isRestricted &&
    (planConfig.maxClients === "unlimited" || clientCount < planConfig.maxClients);

  const canUseAdvancedAnalytics = ["growth", "scale", "enterprise"].includes(planTier);
  const canUseCustomRoles = ["growth", "scale", "enterprise"].includes(planTier);
  const canUseMultiFacilityRouting = ["scale", "enterprise"].includes(planTier);
  const canUseDirectApi = ["growth", "scale", "enterprise"].includes(planTier);

  return {
    organizationId,
    planTier,
    planConfig,
    status,
    isRestricted,
    inGracePeriod,
    daysUntilGraceExpires,
    currentFacilityCount: currentFacilities,
    currentClientCount: clientCount,
    currentMonthlyShippedOrders: monthlyShipped,
    limits: {
      maxFacilities: planConfig.maxFacilities,
      maxClients: planConfig.maxClients,
      maxMonthlyOrders: planConfig.maxMonthlyOrders,
      canAddFacility,
      canAddClient,
      canUseAdvancedAnalytics,
      canUseCustomRoles,
      canUseMultiFacilityRouting,
      canUseDirectApi,
    },
  };
}

/**
 * Asserts whether an organization can add a facility.
 * Throws an error with user-facing message if restricted or limit exceeded.
 */
export async function assertCanAddFacility(organizationId: string) {
  const entitlements = await getOrgEntitlements(organizationId);

  if (entitlements.isRestricted) {
    throw new Error(
      "Configuration is restricted due to an unpaid subscription past its 14-day grace period. Please update your payment method in Settings > Plans & Billing to add facilities. (Floor operations remain active)."
    );
  }

  if (!entitlements.limits.canAddFacility) {
    throw new Error(
      `Your current plan (${entitlements.planConfig.name}) allows up to ${entitlements.limits.maxFacilities} warehouse facilities. You currently have ${entitlements.currentFacilityCount}. Please upgrade to Growth or Scale in Settings > Plans & Billing to add more facilities.`
    );
  }
}
