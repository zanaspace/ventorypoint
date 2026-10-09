import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { runEventWorker } from "@/lib/event-worker";

// Processes queued event deliveries. Call on a schedule (pg_cron + pg_net, Vercel Cron,
// or any scheduler) with `Authorization: Bearer <EVENT_WORKER_SECRET>`.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.EVENT_WORKER_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runEventWorker(createAdminClient(), { budgetMs: 45_000 });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("event-worker failed", err);
    return NextResponse.json({ error: "Worker run failed" }, { status: 500 });
  }
}

export const GET = handle; // Vercel Cron sends GET
export const POST = handle;
