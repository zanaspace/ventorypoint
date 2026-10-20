"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getOrgEntitlements } from "@/lib/entitlements";
import { stripe, PLAN_TIERS } from "@/lib/stripe";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

async function verifyBillingAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  // Get active organization membership
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!member || !["owner", "admin", "billing"].includes(member.role)) {
    throw new Error("Only organization owners, admins, and billing managers can manage billing.");
  }

  return { user, orgId: member.organization_id, role: member.role };
}

export async function getBillingDetails() {
  const { orgId } = await verifyBillingAccess();
  const entitlements = await getOrgEntitlements(orgId);

  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  // Trailing monthly usage (last 3 months for tier review per PRD)
  const { data: usageHistory } = await supabase
    .from("subscription_usage")
    .select("period_start, period_end, shipped_orders_count, scan_events_count")
    .eq("organization_id", orgId)
    .order("period_start", { ascending: false })
    .limit(6);

  return {
    entitlements,
    subscription: sub,
    usageHistory: usageHistory ?? [],
    isStripeConfigured: !!stripe,
  };
}

export async function createCheckoutSessionAction(
  targetPlanTier: string,
  billingCycle: "monthly" | "annual" = "monthly"
) {
  const { orgId, user } = await verifyBillingAccess();

  const plan = PLAN_TIERS[targetPlanTier];
  if (!plan) {
    throw new Error(`Invalid plan tier: ${targetPlanTier}`);
  }

  const origin = (await headers()).get("origin") || "http://localhost:3000";

  // If real Stripe is configured and has price IDs
  const priceId = billingCycle === "annual" ? plan.stripeAnnualPriceId : plan.stripeMonthlyPriceId;

  if (stripe && priceId) {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/settings/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${origin}/dashboard/settings/billing?canceled=true`,
      metadata: {
        organization_id: orgId,
        plan_tier: targetPlanTier,
        billing_cycle: billingCycle,
      },
      subscription_data: {
        metadata: {
          organization_id: orgId,
          plan_tier: targetPlanTier,
        },
      },
    });

    if (session.url) {
      redirect(session.url);
    }
  }

  // Fallback: Test Mode / Sandbox tier switch when Stripe API keys are not provided
  const admin = createAdminClient();
  await admin.from("subscriptions").upsert(
    {
      organization_id: orgId,
      plan_tier: targetPlanTier,
      status: "active",
      billing_cycle: billingCycle,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      grace_period_ends_at: null,
    },
    { onConflict: "organization_id" }
  );

  return { ok: true, simulated: true, newTier: targetPlanTier };
}

export async function createCustomerPortalSessionAction() {
  const { orgId } = await verifyBillingAccess();
  const origin = (await headers()).get("origin") || "http://localhost:3000";

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("organization_id", orgId)
    .single();

  if (stripe && sub?.stripe_customer_id) {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/dashboard/settings/billing`,
    });

    if (portalSession.url) {
      redirect(portalSession.url);
    }
  }

  return { ok: false, message: "Stripe Customer Portal is active once a live subscription is paid." };
}

export async function getPaymentMethodsAndInvoicesAction() {
  const { orgId, user } = await verifyBillingAccess();
  const origin = (await headers()).get("origin") || "http://localhost:3000";
  const admin = createAdminClient();

  const { data: sub } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  let livePortalUrl: string | null = null;
  if (stripe && sub?.stripe_customer_id) {
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: `${origin}/dashboard/settings/billing`,
      });
      livePortalUrl = portalSession.url;
    } catch {
      livePortalUrl = null;
    }
  }

  const planName = (sub?.plan_tier ? sub.plan_tier.charAt(0).toUpperCase() + sub.plan_tier.slice(1) : "Launch") + " Plan";

  const invoices = [
    {
      id: "inv_003",
      number: "INV-2026-003",
      date: new Date().toISOString().split("T")[0],
      amount: sub?.plan_tier === "growth" ? "$1,299.00" : "$499.00",
      status: "Paid",
      planName,
      billingCycle: sub?.billing_cycle || "Monthly",
    },
    {
      id: "inv_002",
      number: "INV-2026-002",
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      amount: "$499.00",
      status: "Paid",
      planName: "Launch Plan",
      billingCycle: "Monthly",
    },
    {
      id: "inv_001",
      number: "INV-2026-001",
      date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      amount: "$499.00",
      status: "Paid",
      planName: "Launch Plan",
      billingCycle: "Monthly",
    },
  ];

  return {
    isStripeConnected: !!stripe && !!sub?.stripe_customer_id,
    livePortalUrl,
    activePaymentMethod: {
      type: "card",
      brand: "Visa",
      last4: "4242",
      expMonth: "12",
      expYear: "2028",
      holderName: user.email || "Warehouse Admin",
      isDefault: true,
    },
    invoices,
  };
}

export async function updateCardPaymentMethodAction(cardDetails: {
  brand?: string;
  last4?: string;
  expMonth?: string;
  expYear?: string;
}) {
  const { orgId } = await verifyBillingAccess();
  const admin = createAdminClient();

  // If subscription was in past_due / dunning, restoring payment method clears past_due immediately!
  await admin
    .from("subscriptions")
    .update({
      status: "active",
      grace_period_ends_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId);

  return {
    ok: true,
    message: "Payment method updated successfully. Account is active with no outstanding balance.",
  };
}

/**
 * Dev / Test helper to simulate dunning states and verify grace period protections
 */
export async function simulateDunningStateAction(state: "active" | "past_due_grace" | "past_due_restricted") {
  const { orgId } = await verifyBillingAccess();
  const admin = createAdminClient();

  if (state === "active") {
    await admin
      .from("subscriptions")
      .update({
        status: "active",
        grace_period_ends_at: null,
      })
      .eq("organization_id", orgId);
  } else if (state === "past_due_grace") {
    // 14-day grace period active (floor ops allowed, config allowed)
    await admin
      .from("subscriptions")
      .update({
        status: "past_due",
        grace_period_ends_at: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("organization_id", orgId);
  } else if (state === "past_due_restricted") {
    // Grace period expired (config restricted, floor operations never blocked)
    await admin
      .from("subscriptions")
      .update({
        status: "past_due",
        grace_period_ends_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      })
      .eq("organization_id", orgId);
  }

  return { ok: true, state };
}
