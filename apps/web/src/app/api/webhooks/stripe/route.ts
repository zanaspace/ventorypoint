import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  if (webhookSecret && signature && stripe) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error(`[Stripe Webhook] Signature verification failed: ${err.message}`);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
  } else {
    // Development or test mode without secret: parse body directly
    try {
      event = JSON.parse(body) as Stripe.Event;
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }
  }

  const admin = createAdminClient();

  // 1. Idempotency Check: check if already processed
  const { data: existingEvent } = await admin
    .from("stripe_webhook_events")
    .select("id, status")
    .eq("id", event.id)
    .maybeSingle();

  if (existingEvent) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.organization_id;
        const planTier = session.metadata?.plan_tier || "growth";
        const cycle = session.metadata?.billing_cycle || "monthly";
        const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const stripeSubId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        if (orgId) {
          await admin.from("subscriptions").upsert(
            {
              organization_id: orgId,
              stripe_customer_id: stripeCustomerId ?? null,
              stripe_subscription_id: stripeSubId ?? null,
              plan_tier: planTier,
              status: "active",
              billing_cycle: cycle,
              current_period_start: new Date().toISOString(),
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              grace_period_ends_at: null,
            },
            { onConflict: "organization_id" }
          );
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as any;
        const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
        const status = sub.status;
        const planTier = sub.metadata?.plan_tier;

        const updatePayload: Record<string, any> = {
          stripe_subscription_id: sub.id,
          status,
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          current_period_start: sub.current_period_start
            ? new Date(sub.current_period_start * 1000).toISOString()
            : new Date().toISOString(),
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        };

        if (planTier) {
          updatePayload.plan_tier = planTier;
        }

        if (status === "past_due") {
          // Set 14-day grace period
          updatePayload.grace_period_ends_at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        } else if (status === "active") {
          updatePayload.grace_period_ends_at = null;
        }

        if (stripeCustomerId) {
          await admin
            .from("subscriptions")
            .update(updatePayload)
            .eq("stripe_customer_id", stripeCustomerId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as any;
        const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

        if (stripeCustomerId) {
          await admin
            .from("subscriptions")
            .update({
              status: "canceled",
              canceled_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", stripeCustomerId);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as any;
        const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

        if (stripeCustomerId) {
          await admin
            .from("subscriptions")
            .update({
              status: "active",
              grace_period_ends_at: null,
            })
            .eq("stripe_customer_id", stripeCustomerId);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        const stripeCustomerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;

        if (stripeCustomerId) {
          // Trigger 14-day grace period
          await admin
            .from("subscriptions")
            .update({
              status: "past_due",
              grace_period_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq("stripe_customer_id", stripeCustomerId);
        }
        break;
      }

      default:
        // Ignore unhandled events
        break;
    }

    // 2. Record processed event for idempotency & audit
    await admin.from("stripe_webhook_events").insert({
      id: event.id,
      event_type: event.type,
      payload: event as any,
      status: "processed",
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: any) {
    console.error(`[Stripe Webhook Error] ${event.type}:`, err);

    await admin.from("stripe_webhook_events").insert({
      id: event.id,
      event_type: event.type,
      payload: event as any,
      status: "failed",
      error_message: err.message,
    });

    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
