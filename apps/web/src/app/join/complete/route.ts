import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { getPendingInvite, PENDING_INVITE_COOKIE } from "@/lib/invite";
import { ACTIVE_FACILITY_COOKIE, ACTIVE_ORG_COOKIE } from "@/lib/org-context-types";

function getBaseUrl(request: Request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || (process.env.NODE_ENV === "development" ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

function getIpFromRequest(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Redeems the invite stored in the pending_invite cookie for the signed-in user.
 * A route handler (not a page) that clears the pending invite cookie on every response
 * to prevent infinite redirect loops.
 */
export async function GET(request: Request) {
  const origin = getBaseUrl(request);
  const cookieOpts = {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      const res = NextResponse.redirect(`${origin}/login?invite=1`);
      res.cookies.delete(PENDING_INVITE_COOKIE);
      return res;
    }

    const pending = await getPendingInvite();
    if (!pending) {
      const res = NextResponse.redirect(`${origin}/dashboard`);
      res.cookies.delete(PENDING_INVITE_COOKIE);
      return res;
    }

    const { data, error } = await supabase.rpc("redeem_invitation", {
      p_code: pending.code ?? null,
      p_token: pending.token ?? null,
      p_ip: getIpFromRequest(request),
    });

    if (error || !data?.ok) {
      // Always delete the cookie to prevent redirect loop / rate limit cascade
      const message = data?.error || error?.message || "Could not join the workspace.";
      const res = NextResponse.redirect(`${origin}/join?message=${encodeURIComponent(message)}`);
      res.cookies.delete(PENDING_INVITE_COOKIE);
      return res;
    }

    if (data.pending) {
      const res = NextResponse.redirect(`${origin}/revoked?reason=pending`);
      res.cookies.delete(PENDING_INVITE_COOKIE);
      return res;
    }

    // Successfully redeemed (or already a member): open the target workspace
    const res = NextResponse.redirect(`${origin}/dashboard`);
    res.cookies.delete(PENDING_INVITE_COOKIE);

    if (data.organization_id) {
      res.cookies.set(ACTIVE_ORG_COOKIE, String(data.organization_id), {
        ...cookieOpts,
        maxAge: 60 * 60 * 24 * 365,
      });
      res.cookies.set(ACTIVE_FACILITY_COOKIE, "all", {
        ...cookieOpts,
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return res;
  } catch (err: any) {
    console.error("Error in /join/complete:", err);
    // On unexpected error, cleanly redirect to dashboard and clear the pending cookie
    const res = NextResponse.redirect(`${origin}/dashboard`);
    res.cookies.delete(PENDING_INVITE_COOKIE);
    return res;
  }
}

