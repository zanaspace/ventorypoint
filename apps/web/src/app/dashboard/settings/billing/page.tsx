import { Metadata } from "next";
import { getBillingDetails } from "./actions";
import { BillingClient } from "./components/billing-client";

export const metadata: Metadata = {
  title: "Plans & Billing | VentoryPoint",
  description: "Manage subscription plans, volume tiers, payment methods, and invoices.",
};

export const dynamic = "force-dynamic";

export default async function BillingSettingsPage() {
  const details = await getBillingDetails();

  return (
    <BillingClient
      initialEntitlements={details.entitlements}
      initialSubscription={details.subscription}
      usageHistory={details.usageHistory}
      isStripeConfigured={details.isStripeConfigured}
    />
  );
}
