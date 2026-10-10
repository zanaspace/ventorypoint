import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";

// Event pipeline health for uptime monitors (Sprint 2 §5 observability).
// 200 = healthy, 503 = an enabled consumer is lagging past its alert threshold
// or has dead deliveries. Authorization: Bearer <EVENT_WORKER_SECRET>.
export const dynamic = "force-dynamic";

interface ConsumerHealth {
  consumer: string;
  is_enabled: boolean;
  backlog: number;
  dead: number;
  lag_seconds: number;
  lag_alert_seconds: number;
}

function authorized(request: NextRequest) {
  const secret = process.env.EVENT_WORKER_SECRET || process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("event_pipeline_health");
  if (error) {
    return NextResponse.json({ status: "down", error: "Could not read pipeline health" }, { status: 503 });
  }

  const consumers = ((data ?? []) as ConsumerHealth[]).map((c) => {
    const lagging = c.is_enabled && Number(c.backlog) > 0 && c.lag_seconds > c.lag_alert_seconds;
    const hasDead = c.is_enabled && Number(c.dead) > 0;
    return { ...c, healthy: !lagging && !hasDead, problems: [lagging && "lagging", hasDead && "dead deliveries"].filter(Boolean) };
  });
  const healthy = consumers.every((c) => c.healthy);

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checked_at: new Date().toISOString(),
      totals: {
        backlog: consumers.filter((c) => c.is_enabled).reduce((n, c) => n + Number(c.backlog), 0),
        dead: consumers.reduce((n, c) => n + Number(c.dead), 0),
        max_lag_seconds: Math.max(0, ...consumers.filter((c) => c.is_enabled && Number(c.backlog) > 0).map((c) => c.lag_seconds)),
      },
      consumers,
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
