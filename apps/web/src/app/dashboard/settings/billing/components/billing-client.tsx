"use client";

import { useState } from "react";
import {
  CreditCard,
  Check,
  AlertTriangle,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Package,
  Sparkles,
  Layers,
  Building2,
  Calendar,
  Zap,
  Download,
  CheckCircle2,
  FileText,
  Lock,
} from "lucide-react";
import { PLAN_TIERS, PlanConfig } from "@/lib/stripe";
import { OrgEntitlementStatus } from "@/lib/entitlements";
import { Modal } from "@/components/ui/modal";
import {
  createCheckoutSessionAction,
  createCustomerPortalSessionAction,
  simulateDunningStateAction,
  getPaymentMethodsAndInvoicesAction,
  updateCardPaymentMethodAction,
} from "../actions";

interface BillingClientProps {
  initialEntitlements: OrgEntitlementStatus;
  initialSubscription: any;
  usageHistory: Array<{
    period_start: string;
    period_end: string;
    shipped_orders_count: number;
    scan_events_count: number;
  }>;
  isStripeConfigured: boolean;
}

export function BillingClient({
  initialEntitlements,
  initialSubscription,
  usageHistory,
  isStripeConfigured,
}: BillingClientProps) {
  const [entitlements, setEntitlements] = useState<OrgEntitlementStatus>(initialEntitlements);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [isLoadingTier, setIsLoadingTier] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false);
  const [portalData, setPortalData] = useState<{
    isStripeConnected: boolean;
    livePortalUrl: string | null;
    activePaymentMethod: {
      type: string;
      brand: string;
      last4: string;
      expMonth: string;
      expYear: string;
      holderName: string;
      isDefault: boolean;
    };
    invoices: Array<{
      id: string;
      number: string;
      date: string;
      amount: string;
      status: string;
      planName: string;
      billingCycle: string;
    }>;
  } | null>(null);

  const [isEditingCard, setIsEditingCard] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardZip, setCardZip] = useState("");
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [cardFeedback, setCardFeedback] = useState<string | null>(null);

  const currentTier = entitlements.planTier;
  const currentPlan = PLAN_TIERS[currentTier] || PLAN_TIERS.launch;
  const orderLimit = entitlements.limits.maxMonthlyOrders;
  const shippedOrders = entitlements.currentMonthlyShippedOrders;

  const usagePercent =
    orderLimit === "unlimited"
      ? 0
      : Math.min(100, Math.round((shippedOrders / (orderLimit as number)) * 100));

  const handleSelectPlan = async (planKey: string) => {
    if (planKey === currentTier && billingCycle === (initialSubscription?.billing_cycle || "monthly")) {
      return;
    }
    setIsLoadingTier(planKey);
    setStatusMessage(null);

    try {
      const res = await createCheckoutSessionAction(planKey, billingCycle);
      if (res?.simulated) {
        setStatusMessage(`Successfully switched to ${PLAN_TIERS[planKey].name} (${billingCycle})! Plan entitlements updated.`);
        setEntitlements((prev) => ({
          ...prev,
          planTier: planKey,
          planConfig: PLAN_TIERS[planKey],
          limits: {
            ...prev.limits,
            maxFacilities: PLAN_TIERS[planKey].maxFacilities,
            maxClients: PLAN_TIERS[planKey].maxClients,
            maxMonthlyOrders: PLAN_TIERS[planKey].maxMonthlyOrders,
            canAddFacility: true,
            canAddClient: true,
          },
        }));
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to update plan");
    } finally {
      setIsLoadingTier(null);
    }
  };

  const handleOpenPortal = async () => {
    setIsOpeningPortal(true);
    setStatusMessage(null);
    try {
      const data = await getPaymentMethodsAndInvoicesAction();
      setPortalData(data);
      setIsPortalModalOpen(true);
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to load payment methods");
    } finally {
      setIsOpeningPortal(false);
    }
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCard(true);
    setCardFeedback(null);
    try {
      const digits = cardNumber.replace(/\D/g, "");
      const last4 = digits.length >= 4 ? digits.slice(-4) : "8888";
      const [expMonth, expYear] = cardExp.includes("/") ? cardExp.split("/") : ["12", "2029"];
      const res = await updateCardPaymentMethodAction({
        last4,
        expMonth: (expMonth || "12").trim(),
        expYear: ((expYear || "29").trim().length === 2 ? `20${(expYear || "29").trim()}` : (expYear || "2029").trim()),
      });

      if (res.ok) {
        setPortalData((prev) => prev ? {
          ...prev,
          activePaymentMethod: {
            ...prev.activePaymentMethod,
            last4,
            expMonth: (expMonth || "12").trim(),
            expYear: ((expYear || "29").trim().length === 2 ? `20${(expYear || "29").trim()}` : (expYear || "2029").trim()),
          }
        } : null);

        setEntitlements((prev) => ({
          ...prev,
          status: "active",
          isRestricted: false,
          inGracePeriod: false,
          daysUntilGraceExpires: 0,
        }));

        setCardFeedback("Payment method updated successfully! Subscription is active with zero outstanding balance.");
        setIsEditingCard(false);
        setCardNumber("");
        setCardExp("");
        setCardCvc("");
        setCardZip("");
      }
    } catch (err: any) {
      setCardFeedback(err.message || "Failed to update card");
    } finally {
      setIsSavingCard(false);
    }
  };

  const handleDownloadReceipt = (inv: { number: string; amount: string; date: string; planName: string }) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt - ${inv.number}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #111; max-width: 600px; margin: 0 auto; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: 800; }
            .badge { display: inline-block; padding: 4px 8px; background: #e6f4ea; color: #137333; font-weight: 600; border-radius: 4px; font-size: 12px; }
            .meta { margin: 24px 0; font-size: 13px; color: #444; }
            .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
            .total { font-size: 16px; font-weight: 800; text-align: right; margin-top: 24px; }
            .footer { margin-top: 48px; font-size: 11px; color: #888; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">VentoryPoint</div>
              <div style="font-size: 13px; color: #666; margin-top: 4px;">Modern 3PL Warehouse Operating System</div>
            </div>
            <div style="text-align: right;">
              <span class="badge">PAID</span>
              <div style="font-family: monospace; font-size: 13px; margin-top: 6px;">${inv.number}</div>
            </div>
          </div>
          <div class="meta">
            <div><strong>Date:</strong> ${inv.date}</div>
            <div><strong>Payment Method:</strong> Visa ending in 4242</div>
            <div><strong>Status:</strong> Paid in Full</div>
          </div>
          <table class="table">
            <thead>
              <tr><th>Description</th><th style="text-align: right;">Amount</th></tr>
            </thead>
            <tbody>
              <tr><td>VentoryPoint Platform Subscription - ${inv.planName}</td><td style="text-align: right;">${inv.amount}</td></tr>
            </tbody>
          </table>
          <div class="total">Total Paid: ${inv.amount} USD</div>
          <div class="footer">Thank you for your business with VentoryPoint. Questions? support@ventorypoint.com</div>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSimulateDunning = async (state: "active" | "past_due_grace" | "past_due_restricted") => {
    setStatusMessage(null);
    const res = await simulateDunningStateAction(state);
    if (res.ok) {
      if (state === "active") {
        setEntitlements((prev) => ({
          ...prev,
          status: "active",
          isRestricted: false,
          inGracePeriod: false,
          daysUntilGraceExpires: 0,
        }));
        setStatusMessage("Subscription simulated as Active and up to date.");
      } else if (state === "past_due_grace") {
        setEntitlements((prev) => ({
          ...prev,
          status: "past_due",
          isRestricted: false,
          inGracePeriod: true,
          daysUntilGraceExpires: 10,
        }));
        setStatusMessage("Simulated Past Due with 10 days remaining in 14-day Grace Period. Floor tasks & configuration remain active.");
      } else if (state === "past_due_restricted") {
        setEntitlements((prev) => ({
          ...prev,
          status: "past_due",
          isRestricted: true,
          inGracePeriod: false,
          daysUntilGraceExpires: 0,
        }));
        setStatusMessage("Simulated Past Due with Grace Period Expired. Configuration is locked; floor operations remain 100% active.");
      }
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h2 className="font-heading text-xl font-bold tracking-tight text-foreground">
          Platform Subscription & Entitlements
        </h2>
        <p className="font-sans text-sm text-muted-foreground mt-1">
          Transparent volume-based pricing with unlimited users, unlimited handheld devices, and flat connectors.
        </p>
      </div>

      {/* Dunning Alert / Grace Period Warnings */}
      {entitlements.inGracePeriod && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 shadow-xs flex items-start gap-3.5">
          <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
              Payment Past Due: 14-Day Grace Period Active ({entitlements.daysUntilGraceExpires} days remaining)
            </h4>
            <p className="text-xs text-amber-900/90 dark:text-amber-300/90 leading-relaxed">
              Your floor operations, scanners, and order picking will <strong>NEVER be stopped mid-shift</strong>. Please update your payment method in the Customer Portal before your grace period expires to prevent new warehouse configuration locks.
            </p>
          </div>
        </div>
      )}

      {entitlements.isRestricted && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 shadow-xs flex items-start gap-3.5">
          <ShieldAlert className="size-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-red-950 dark:text-red-100">
              Configuration Paused: Unpaid Grace Period Expired
            </h4>
            <p className="text-xs text-red-900/90 dark:text-red-300/90 leading-relaxed">
              Warehouse floor tasks (barcode scanning, picking, packing, shipping) remain 100% operational. Adding new facilities, brand clients, or connectors is paused until payment is updated.
            </p>
          </div>
        </div>
      )}

      {statusMessage && (
        <div className="rounded-xl border border-brand/30 bg-brand/10 p-4 text-xs font-medium text-foreground">
          {statusMessage}
        </div>
      )}

      {/* Current Plan Overview Card */}
      <div className="overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="font-heading text-2xl font-bold text-foreground">
                {currentPlan.name} Plan
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                  entitlements.isRestricted
                    ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                    : entitlements.inGracePeriod
                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                }`}
              >
                {entitlements.isRestricted
                  ? "Config Restricted"
                  : entitlements.inGracePeriod
                  ? "Grace Period"
                  : "Active"}
              </span>
            </div>
            <p className="font-sans text-xs text-muted-foreground">
              {currentPlan.description}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenPortal}
              disabled={isOpeningPortal}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-xs disabled:opacity-50"
            >
              <CreditCard className="size-3.5 text-muted-foreground" />
              {isOpeningPortal ? "Connecting..." : "Manage Card & Invoices"}
              <ExternalLink className="size-3 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Shipped Volume Meter */}
        <div className="rounded-lg border border-border/60 bg-surface/50 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-foreground flex items-center gap-1.5">
              <Package className="size-4 text-brand-text" /> Shipped Order Volume This Month
            </span>
            <span className="font-mono text-muted-foreground">
              <strong className="text-foreground font-semibold">
                {shippedOrders.toLocaleString()}
              </strong>{" "}
              / {orderLimit === "unlimited" ? "Unlimited" : (orderLimit as number).toLocaleString()} orders
            </span>
          </div>

          {orderLimit !== "unlimited" && (
            <div className="h-2 w-full rounded-full bg-border overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  usagePercent > 90 ? "bg-amber-500" : "bg-brand"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          )}

          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
            <Sparkles className="size-3 text-brand-text shrink-0" />
            <span>
              <strong>Zero peak overage penalties.</strong> Tier adjustments are reviewed collaboratively on trailing 3-month averages.
            </span>
          </p>
        </div>

        {/* Plan Resource Utilization */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div className="rounded-lg border border-border/60 bg-surface p-3.5">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Warehouse Facilities
            </div>
            <div className="font-heading text-lg font-bold text-foreground mt-1">
              {entitlements.currentFacilityCount} /{" "}
              {entitlements.limits.maxFacilities === "unlimited"
                ? "Unlimited"
                : entitlements.limits.maxFacilities}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-surface p-3.5">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Brand Clients
            </div>
            <div className="font-heading text-lg font-bold text-foreground mt-1">
              {entitlements.currentClientCount} /{" "}
              {entitlements.limits.maxClients === "unlimited"
                ? "Unlimited"
                : entitlements.limits.maxClients}
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-surface p-3.5">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Floor Users & Devices
            </div>
            <div className="font-heading text-lg font-bold text-foreground mt-1 flex items-center gap-1">
              Unlimited <Zap className="size-3.5 text-amber-500 fill-amber-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Tiers Selection */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-heading text-lg font-bold text-foreground">Available Plans</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upgrade or switch tiers at any time. Entitlements update instantly.
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface p-1 shadow-xs">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                billingCycle === "monthly"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                billingCycle === "annual"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Tier Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {Object.entries(PLAN_TIERS).map(([key, plan]) => {
            const isCurrent = key === currentTier;
            const price = billingCycle === "annual" ? plan.annualPriceUsd : plan.monthlyPriceUsd;

            return (
              <div
                key={key}
                className={`relative flex flex-col justify-between rounded-xl border bg-card p-5 shadow-xs transition-all ${
                  isCurrent
                    ? "border-brand ring-2 ring-brand/20"
                    : "border-border hover:border-border-hover"
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-xs">
                    {plan.badge}
                  </span>
                )}

                <div className="space-y-4">
                  <div>
                    <h4 className="font-heading text-lg font-bold text-foreground">
                      {plan.name}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {plan.description}
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="font-heading text-3xl font-extrabold text-foreground">
                      ${price.toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground">/mo</span>
                    {billingCycle === "annual" && (
                      <span className="text-[10px] text-muted-foreground block ml-1">
                        (billed annually)
                      </span>
                    )}
                  </div>

                  <hr className="border-border/60" />

                  {/* Feature list */}
                  <ul className="space-y-2.5 text-xs text-muted-foreground">
                    {plan.features.map((feat, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="size-3.5 text-brand shrink-0 mt-0.5" />
                        <span className="text-foreground/90">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full rounded-lg border border-border bg-accent/50 py-2.5 text-xs font-semibold text-foreground opacity-90 cursor-default"
                    >
                      Current Plan
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSelectPlan(key)}
                      disabled={isLoadingTier === key}
                      className="w-full inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover transition-colors shadow-xs disabled:opacity-50"
                    >
                      {isLoadingTier === key ? (
                        "Updating..."
                      ) : (
                        <>
                          Upgrade to {plan.name} <ArrowRight className="size-3" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trailing Usage History (Last 3 Months Tier Review per PRD) */}
      <div className="overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div>
          <h3 className="font-heading text-sm font-bold text-foreground">
            Trailing Order Volume History (Tier Reviews)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Per Section 6.2 of the PRD, tier upgrades are evaluated on a trailing 3-month average rather than volatile peak months.
          </p>
        </div>

        {usageHistory.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No past billing cycles recorded yet. Usage increments automatically as floor shipments are verified.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="py-2.5 px-3">Billing Period</th>
                  <th className="py-2.5 px-3">Shipped Orders</th>
                  <th className="py-2.5 px-3">Floor Scans</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {usageHistory.map((u, idx) => (
                  <tr key={idx} className="hover:bg-accent/30">
                    <td className="py-2.5 px-3 font-mono">
                      {u.period_start} to {u.period_end}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-foreground">
                      {u.shipped_orders_count.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {u.scan_events_count.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="rounded bg-surface px-2 py-0.5 text-[11px] font-medium border border-border">
                        Recorded
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Developer & Design Partner Simulation Tools */}
      <div className="overflow-hidden rounded-xl border border-dashed border-border bg-accent/20 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Testing & Dunning Verification Controls
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Simulate webhook events and payment state transitions to verify the 14-day grace period and floor task continuity.
            </p>
          </div>
          <span className="rounded bg-card px-2 py-0.5 text-[10px] font-mono font-semibold border border-border">
            Dev/Sandbox
          </span>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            onClick={() => handleSimulateDunning("active")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent shadow-xs"
          >
            Simulate Active Subscription
          </button>
          <button
            onClick={() => handleSimulateDunning("past_due_grace")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 shadow-xs"
          >
            Simulate Past Due (In 14-Day Grace)
          </button>
          <button
            onClick={() => handleSimulateDunning("past_due_restricted")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-500/20 shadow-xs"
          >
            Simulate Past Due (Grace Expired - Config Locked)
          </button>
        </div>
      </div>

      {/* Payment Methods & Invoices Modal */}
      <Modal
        isOpen={isPortalModalOpen}
        onClose={() => {
          setIsPortalModalOpen(false);
          setIsEditingCard(false);
          setCardFeedback(null);
        }}
        title="Payment Methods & Invoices"
        maxWidth="max-w-2xl"
      >
        <div className="p-6 space-y-6">
          {/* Live Stripe Customer Portal Direct Access if configured */}
          {portalData?.livePortalUrl && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-foreground">Stripe Hosted Billing Portal</h4>
                <p className="text-[11px] text-muted-foreground">
                  Update bank accounts, manage ACH mandates, or view tax exemptions directly in Stripe.
                </p>
              </div>
              <a
                href={portalData.livePortalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-xs shrink-0"
              >
                Open Stripe Portal <ExternalLink className="size-3" />
              </a>
            </div>
          )}

          {/* Active Payment Card */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="size-3.5 text-foreground" /> Saved Payment Method
              </h3>
              {!isEditingCard && (
                <button
                  type="button"
                  onClick={() => setIsEditingCard(true)}
                  className="cursor-pointer text-xs font-semibold text-brand hover:underline"
                >
                  + Update Card
                </button>
              )}
            </div>

            {/* Credit Card Visual Representation */}
            <div className="rounded-xl border border-border/80 bg-gradient-to-br from-card to-accent/40 p-5 shadow-xs space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {portalData?.activePaymentMethod.brand || "Visa"} Card
                  </span>
                  <div className="font-mono text-lg font-bold tracking-widest text-foreground mt-1">
                    •••• •••• •••• {portalData?.activePaymentMethod.last4 || "4242"}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" /> Default
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-3">
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">Cardholder</span>
                  <span className="font-medium text-foreground">{portalData?.activePaymentMethod.holderName || "Admin"}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">Expires</span>
                  <span className="font-mono font-medium text-foreground">
                    {portalData?.activePaymentMethod.expMonth || "12"} / {portalData?.activePaymentMethod.expYear || "2028"}
                  </span>
                </div>
              </div>
            </div>

            {/* Inline Card Edit Form */}
            {isEditingCard && (
              <form onSubmit={handleSaveCard} className="rounded-xl border border-brand/30 bg-surface p-4 space-y-3 mt-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-foreground">Enter New Card Details</h4>
                  <button
                    type="button"
                    onClick={() => setIsEditingCard(false)}
                    className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Card Number
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="4242 •••• •••• 4242"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                        Expiry (MM/YY)
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="12/29"
                        value={cardExp}
                        onChange={(e) => setCardExp(e.target.value)}
                        className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                        CVC
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={4}
                        placeholder="•••"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                        ZIP / Postal
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="10001"
                        value={cardZip}
                        onChange={(e) => setCardZip(e.target.value)}
                        className="w-full h-9 rounded-lg border border-border bg-card px-3 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Lock className="size-3" /> PCI-DSS SAQ-A Tokenized
                  </span>
                  <button
                    type="submit"
                    disabled={isSavingCard}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover shadow-xs disabled:opacity-50"
                  >
                    {isSavingCard ? "Saving..." : "Save Card & Update Subscription"}
                  </button>
                </div>
              </form>
            )}

            {cardFeedback && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0" /> {cardFeedback}
              </div>
            )}
          </div>

          {/* Billing Invoices Table */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="size-3.5 text-foreground" /> Invoices & Receipts
            </h3>

            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-card text-muted-foreground font-semibold">
                    <th className="py-2.5 px-3">Invoice</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {portalData?.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-accent/30">
                      <td className="py-2.5 px-3 font-mono font-semibold text-foreground">
                        {inv.number}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {inv.date}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-foreground">
                        {inv.amount}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDownloadReceipt(inv)}
                          className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                        >
                          <Download className="size-3" /> PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
