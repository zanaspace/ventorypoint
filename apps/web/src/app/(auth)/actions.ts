"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { passwordChangedEmail, passwordResetEmail } from "@/lib/email/templates";
import { hasPendingInvite } from "@/lib/invite";

async function getOrigin() {
  const headersList = await headers();
  const host = headersList.get("host") || "localhost:3000";
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}`;
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return redirect(`/login?message=${error.message}`);
  }

  // After successful login, redirect to dashboard.
  // The dashboard route will bounce them to /onboarding if they have no org.
  revalidatePath("/", "layout");
  if (await hasPendingInvite()) redirect("/join/complete");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const firstName = formData.get("first-name") as string;
  const lastName = formData.get("last-name") as string;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (error) {
    return redirect(`/register?message=${error.message}`);
  }

  // Redirect to onboarding
  revalidatePath("/", "layout");
  if (await hasPendingInvite()) redirect("/join/complete");
  redirect("/onboarding?success=Account created successfully");
}

// ---------------------------------------------------------------------------
// Password reset (email + password accounts)
// Supabase generates the single-use recovery token; we deliver it via Resend as
// both a 6-digit code and a link. Without Resend configured we fall back to
// Supabase's built-in reset email (link only).
// ---------------------------------------------------------------------------

const RESET_COOKIE = "vp_reset_email";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Public site URL for links in emails. Never derived from the request Host header in production. */
function getSiteUrl(fallbackOrigin: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  return process.env.NODE_ENV === "development" ? fallbackOrigin : null;
}

async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

const emailKey = (email: string) => createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32);

async function withinLimit(key: string, max: number, windowSeconds: number) {
  const { data, error } = await createAdminClient().rpc("hit_auth_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  // If the limiter itself is unavailable, fail open rather than lock everyone out
  return error ? true : Boolean(data);
}

export async function requestPasswordReset(formData: FormData) {
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return redirect(`/forgot-password?message=${encodeURIComponent("Enter a valid email address.")}`);
  }

  const ip = await clientIp();
  if (!(await withinLimit(`reset:ip:${ip}`, 10, 3600)) || !(await withinLimit(`reset:email:${emailKey(email)}`, 3, 900))) {
    return redirect(
      `/forgot-password?message=${encodeURIComponent("Too many reset requests. Please wait a few minutes and try again.")}`
    );
  }

  const origin = await getOrigin();
  const siteUrl = getSiteUrl(origin);
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60,
  };

  if (isEmailConfigured() && siteUrl) {
    // Code + link via Resend. Unknown emails get the same response (no account enumeration).
    const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email });
    if (!error && data?.properties?.email_otp && data.properties.hashed_token) {
      const link = `${siteUrl}/auth/confirm?type=recovery&token_hash=${encodeURIComponent(
        data.properties.hashed_token
      )}&next=/reset-password`;
      const message = passwordResetEmail({
        code: data.properties.email_otp,
        link,
        minutesValid: Number(process.env.RESET_CODE_MINUTES || 60),
      });
      const sent = await sendEmail({ to: email, ...message, tag: "password-reset" });
      if (!sent.ok) console.error("Password reset email failed:", sent.error);
    }
    cookieStore.set(RESET_COOKIE, JSON.stringify({ email, mode: "code" }), cookieOptions);
    return redirect("/forgot-password?sent=1");
  }

  // Fallback: Supabase's own reset email (link only)
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl ?? origin}/auth/callback?next=/reset-password`,
  });
  if (error && !/rate limit/i.test(error.message)) {
    console.error("Supabase reset email failed:", error.message);
  }
  cookieStore.set(RESET_COOKIE, JSON.stringify({ email, mode: "link" }), cookieOptions);
  redirect("/forgot-password?sent=1");
}

/** Second step when using the emailed code instead of the link. */
export async function verifyResetCode(formData: FormData) {
  const cookieStore = await cookies();
  let email = "";
  try {
    email = JSON.parse(cookieStore.get(RESET_COOKIE)?.value || "{}").email || "";
  } catch {
    email = "";
  }
  const code = ((formData.get("code") as string) || "").replace(/\D/g, "");

  if (!email) {
    return redirect(`/forgot-password?message=${encodeURIComponent("Your reset request expired. Start again.")}`);
  }
  if (code.length < 6 || code.length > 10) {
    return redirect(`/forgot-password?sent=1&message=${encodeURIComponent("Enter the code from the email.")}`);
  }
  if (!(await withinLimit(`reset-verify:${emailKey(email)}`, 5, 900))) {
    return redirect(
      `/forgot-password?sent=1&message=${encodeURIComponent("Too many attempts. Request a new code in a few minutes.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error) {
    return redirect(
      `/forgot-password?sent=1&message=${encodeURIComponent("That code is wrong or has expired. Check the email or request a new one.")}`
    );
  }

  cookieStore.delete(RESET_COOKIE);
  redirect("/reset-password");
}

/** Starts over (e.g. wrong email entered, or a new code is needed). */
export async function restartPasswordReset() {
  (await cookies()).delete(RESET_COOKIE);
  redirect("/forgot-password");
}

export async function updatePassword(formData: FormData) {
  const supabase = await createClient();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!password || password.length < 8) {
    return redirect(`/reset-password?message=${encodeURIComponent("Password must be at least 8 characters.")}`);
  }
  if (password !== confirm) {
    return redirect(`/reset-password?message=${encodeURIComponent("Passwords do not match.")}`);
  }

  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) {
    return redirect(`/reset-password?message=${encodeURIComponent(error.message)}`);
  }

  // Security notice: tell the account owner their password changed
  const to = data.user?.email;
  const siteUrl = getSiteUrl(await getOrigin());
  if (to && isEmailConfigured() && siteUrl) {
    const notice = passwordChangedEmail({
      when: new Date().toUTCString(),
      supportUrl: `${siteUrl}/forgot-password`,
    });
    const sent = await sendEmail({ to, ...notice, tag: "password-changed" });
    if (!sent.ok) console.error("Password changed email failed:", sent.error);
  }

  (await cookies()).delete(RESET_COOKIE);
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signInWithGithub() {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirect(data.url);
  }
}

export async function signInWithAzure() {
  const supabase = await createClient();
  const origin = await getOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return redirect(`/login?message=${encodeURIComponent(error.message)}`);
  }

  if (data.url) {
    redirect(data.url);
  }
}

