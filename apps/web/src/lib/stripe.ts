import Stripe from "stripe";

// Initialize Stripe instance if STRIPE_SECRET_KEY is present
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2025-02-24.acacia" as any,
      appInfo: {
        name: "VentoryPoint WOS",
        version: "1.0.0",
      },
    })
  : null;

export interface PlanConfig {
  id: "launch" | "growth" | "scale" | "enterprise";
  name: string;
  badge?: string;
  description: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number;
  maxMonthlyOrders: number | "unlimited";
  maxFacilities: number | "unlimited";
  maxClients: number | "unlimited";
  features: string[];
  stripeMonthlyPriceId?: string;
  stripeAnnualPriceId?: string;
}

export const PLAN_TIERS: Record<string, PlanConfig> = {
  launch: {
    id: "launch",
    name: "Launch",
    description: "For emerging 3PLs establishing automated floor operations.",
    monthlyPriceUsd: 499,
    annualPriceUsd: 419, // billed annually ($5,028/yr)
    maxMonthlyOrders: 5000,
    maxFacilities: 1,
    maxClients: 5,
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_LAUNCH_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_LAUNCH_ANNUAL,
    features: [
      "Up to 5,000 shipped orders/mo",
      "1 Warehouse facility",
      "Up to 5 Brand clients",
      "Unlimited floor users & handheld devices",
      "Real-time event backbone & audit trail",
      "Barcode scanning & inventory locations",
      "Standard email support",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    badge: "Most Popular",
    description: "For expanding 3PLs scaling client rosters and throughput.",
    monthlyPriceUsd: 1299,
    annualPriceUsd: 1099, // billed annually ($13,188/yr)
    maxMonthlyOrders: 25000,
    maxFacilities: 3,
    maxClients: 25,
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
    features: [
      "Up to 25,000 shipped orders/mo",
      "Up to 3 Warehouse facilities",
      "Up to 25 Brand clients",
      "Unlimited floor users & devices",
      "Advanced inventory analytics & velocity reports",
      "Custom member roles & permissions",
      "Direct API & Webhook integrations",
      "Priority business-hours support",
    ],
  },
  scale: {
    id: "scale",
    name: "Scale",
    description: "For high-volume multi-facility 3PL operations.",
    monthlyPriceUsd: 2499,
    annualPriceUsd: 2099, // billed annually ($25,188/yr)
    maxMonthlyOrders: 100000,
    maxFacilities: 10,
    maxClients: 100,
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_SCALE_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_SCALE_ANNUAL,
    features: [
      "Up to 100,000 shipped orders/mo",
      "Up to 10 Warehouse facilities",
      "Up to 100 Brand clients",
      "Multi-facility inventory routing & split orders",
      "Automated replenishment & cycle count approvals",
      "Dedicated Technical Account Manager (TAM)",
      "99.95% uptime SLA guarantee",
      "Consented support SLA: 1-hour response",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise / Network",
    description: "For nationwide warehouse networks and custom high-volume operations.",
    monthlyPriceUsd: 4999,
    annualPriceUsd: 4199,
    maxMonthlyOrders: "unlimited",
    maxFacilities: "unlimited",
    maxClients: "unlimited",
    stripeMonthlyPriceId: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    stripeAnnualPriceId: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL,
    features: [
      "Custom & unlimited monthly shipped volume",
      "Unlimited warehouse facilities & nodes",
      "Unlimited brand clients & portals",
      "Dedicated database isolation option",
      "Custom integration connectors & ERP sync",
      "24/7/365 floor emergency phone line",
      "Executive quarterly business reviews (QBR)",
    ],
  },
};
