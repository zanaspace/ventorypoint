#!/usr/bin/env node
// Long-running event consumer worker (Decision 1.2.1: a long-running Node worker,
// e.g. on Fly.io, instead of a once-a-minute cron). Polls the delivery queue
// continuously so consumer lag stays within seconds.
//
// Runs the same code as /api/internal/event-worker (src/lib/event-worker.ts).
// Requires Node 22.18+ (TypeScript type stripping).
//
//   pnpm --filter web worker            # uses apps/web/.env.local
//
// Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//      optional WORKER_IDLE_MS (default 500), WORKER_BATCH (default 200).
// Safe to run several copies: deliveries are claimed with SKIP LOCKED + leases.

import { createClient } from "@supabase/supabase-js";
import { runEventWorker } from "../src/lib/event-worker.ts";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const idleMs = Number(process.env.WORKER_IDLE_MS || 500);
const batchSize = Number(process.env.WORKER_BATCH || 200);
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log(`${signal} received: finishing the current batch, then stopping (press again to force).`);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const totals = { succeeded: 0, failed: 0, dead: 0 };
let errorBackoffMs = 1000;
let lastReport = Date.now();

console.log(`Event worker started (idle poll ${idleMs} ms, batch ${batchSize}).`);

while (!stopping) {
  try {
    // Short budget so shutdown is prompt; loops straight back when there is more work
    const summary = await runEventWorker(admin, { budgetMs: 10_000, batchSize });
    let processed = 0;
    for (const s of Object.values(summary.consumers)) {
      totals.succeeded += s.succeeded;
      totals.failed += s.failed;
      totals.dead += s.dead;
      processed += s.succeeded + s.failed + s.dead;
    }
    errorBackoffMs = 1000;

    if (Date.now() - lastReport > 60_000) {
      console.log(`[${new Date().toISOString()}] processed ${totals.succeeded} ok, ${totals.failed} retrying, ${totals.dead} dead (last minute)`);
      totals.succeeded = totals.failed = totals.dead = 0;
      lastReport = Date.now();
    }
    if (processed === 0) await sleep(idleMs);
  } catch (err) {
    // Database/network trouble: back off (max 30 s) and keep going
    console.error(`Worker error: ${err instanceof Error ? err.message : err}. Retrying in ${errorBackoffMs / 1000}s.`);
    await sleep(errorBackoffMs);
    errorBackoffMs = Math.min(errorBackoffMs * 2, 30_000);
  }
}

console.log("Event worker stopped.");
