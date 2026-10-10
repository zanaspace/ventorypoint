#!/usr/bin/env node
// Sprint 2 §4.2 load test: sustained event throughput against a real Supabase project.
//
// Targets (Sprint 2 PRD §5): 200 events/s per facility sustained, record_event p95 < 50 ms,
// batch of 100 < 300 ms, consumer lag < 5 s.
//
// Usage (from apps/web):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//   LOAD_TEST_EMAIL=owner@example.com LOAD_TEST_PASSWORD=... \
//   LOAD_TEST_ORG_ID=<uuid> LOAD_TEST_FACILITY_ID=<uuid> \
//   [RATE=200] [DURATION_S=60] [BATCH=20] [SUPABASE_SERVICE_ROLE_KEY=... to report consumer lag] \
//   node scripts/load-test-events.mjs
//
// Writes real, permanent system.synthetic events. Use a staging project and a test organization.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const env = (name, fallback) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return v;
};

const url = env("SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = env("SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const orgId = env("LOAD_TEST_ORG_ID");
const facilityId = env("LOAD_TEST_FACILITY_ID");
const rate = Number(env("RATE", "200"));
const durationS = Number(env("DURATION_S", "60"));
const batchSize = Math.min(100, Number(env("BATCH", "20")));
const duplicateRatio = 0.05;

const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
const { error: signInError } = await supabase.auth.signInWithPassword({
  email: env("LOAD_TEST_EMAIL"),
  password: env("LOAD_TEST_PASSWORD"),
});
if (signInError) {
  console.error("Sign-in failed:", signInError.message);
  process.exit(1);
}

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
};

const runId = randomUUID().slice(0, 8);
const sentKeys = [];
const batchLatencies = [];
const singleLatencies = [];
let created = 0;
let duplicates = 0;
let errors = 0;
const errorSamples = new Set();

function makeEvent(i) {
  const reuse = sentKeys.length > 0 && Math.random() < duplicateRatio;
  const key = reuse ? sentKeys[Math.floor(Math.random() * sentKeys.length)] : `load-${runId}-${i}`;
  if (!reuse) sentKeys.push(key);
  return {
    event_type: "system.synthetic",
    idempotency_key: key,
    facility_id: facilityId,
    payload: { label: `load ${runId}`, sequence: i },
  };
}

async function sendBatch(startIndex) {
  const events = Array.from({ length: batchSize }, (_, j) => makeEvent(startIndex + j));
  const t0 = performance.now();
  const { data, error } = await supabase.rpc("record_events", { p_organization_id: orgId, p_events: events });
  batchLatencies.push(performance.now() - t0);
  if (error) {
    errors += events.length;
    errorSamples.add(error.message);
    return;
  }
  for (const r of data) {
    if (r.status === "created") created++;
    else if (r.status === "duplicate") duplicates++;
    else {
      errors++;
      errorSamples.add(`${r.code}: ${r.message}`);
    }
  }
}

async function sendSingle(i) {
  const t0 = performance.now();
  const { error } = await supabase.rpc("record_event", {
    p_organization_id: orgId,
    p_event_type: "system.synthetic",
    p_idempotency_key: `load-${runId}-single-${i}`,
    p_payload: { label: `load ${runId} single`, sequence: i },
    p_facility_id: facilityId,
  });
  singleLatencies.push(performance.now() - t0);
  if (error) {
    errors++;
    errorSamples.add(error.message);
  }
}

console.log(`Run ${runId}: ${rate} events/s for ${durationS}s in batches of ${batchSize} (+ 1 single record_event/s for latency)`);

const batchesPerSecond = rate / batchSize;
const intervalMs = 1000 / batchesPerSecond;
const totalBatches = Math.round(batchesPerSecond * durationS);
const inflight = [];
const started = performance.now();

for (let b = 0; b < totalBatches; b++) {
  const due = started + b * intervalMs;
  const wait = due - performance.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  inflight.push(sendBatch(b * batchSize));
  if (b % Math.max(1, Math.round(batchesPerSecond)) === 0) inflight.push(sendSingle(b));
}
await Promise.all(inflight);
const elapsedS = (performance.now() - started) / 1000;

console.log("\nResults");
console.log(`  Sent          ${totalBatches * batchSize} batched events in ${elapsedS.toFixed(1)}s (${Math.round((created + duplicates) / elapsedS)} accepted/s)`);
console.log(`  Created       ${created}`);
console.log(`  Duplicates    ${duplicates} (expected ≈ ${Math.round(totalBatches * batchSize * duplicateRatio)})`);
console.log(`  Errors        ${errors}${errorSamples.size ? ` e.g. ${[...errorSamples].slice(0, 3).join(" | ")}` : ""}`);
console.log(`  Batch of ${batchSize}  p50 ${pct(batchLatencies, 50)} ms · p95 ${pct(batchLatencies, 95)} ms (target for 100: < 300 ms)`);
console.log(`  record_event  p50 ${pct(singleLatencies, 50)} ms · p95 ${pct(singleLatencies, 95)} ms (target < 50 ms, includes network)`);

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await admin.rpc("event_pipeline_health");
  const test = (data ?? []).find((c) => c.consumer === "test_consumer");
  if (test) console.log(`  test_consumer backlog ${test.backlog}, lag ${test.lag_seconds}s (target < 5s with the worker running)`);
}
