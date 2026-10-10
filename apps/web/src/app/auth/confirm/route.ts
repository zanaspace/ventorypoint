import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

// Landing point for links in our own (Resend) auth emails: verifies the
// single-use token with Supabase, which signs the user in, then continues.
const ALLOWED_TYPES: EmailOtpType[] = ["recovery"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextParam = searchParams.get("next");
  // Only same-site relative redirects
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const message = "That reset link is invalid or has expired. Request a new one.";
  return NextResponse.redirect(`${origin}/forgot-password?message=${encodeURIComponent(message)}`);
}
