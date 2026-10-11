import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getClientIp, getPendingInvite, PENDING_INVITE_COOKIE } from "@/lib/invite";
import { ACTIVE_FACILITY_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/org-context-types";

/**
 * Redeems the invite stored in the pending_invite cookie for the signed-in user.
 * A route handler (not a page) because it needs to clear the cookie.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/login?invite=1`);
  }

  const pending = await getPendingInvite();
  if (!pending) {
    return NextResponse.redirect(`${origin}/dashboard`);
  }

  const { data, error } = await supabase.rpc("redeem_invitation", {
    p_code: pending.code ?? null,
    p_token: pending.token ?? null,
    p_ip: await getClientIp(),
  });

  const store = await cookies();

  if (error || !data?.ok) {
    // Rate-limited: keep the cookie so they can retry after the cooldown. Anything else is final.
    if (!data?.rate_limited) store.delete(PENDING_INVITE_COOKIE);
    const message = data?.error || error?.message || "Could not join the workspace.";
    return NextResponse.redirect(`${origin}/join?message=${encodeURIComponent(message)}`);
  }

  store.delete(PENDING_INVITE_COOKIE);

  if (data.pending) {
    return NextResponse.redirect(`${origin}/revoked?reason=pending`);
  }

  // Open the workspace they just joined
  if (data.organization_id) {
    const opts = { path: "/", sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 };
    store.set(ACTIVE_ORG_COOKIE, data.organization_id, opts);
    store.set(ACTIVE_FACILITY_COOKIE, "all", opts);
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}
