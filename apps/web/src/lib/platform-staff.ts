import { createClient } from "@/utils/supabase/server";

/**
 * Platform staff = your own team, not customers. Interim gate until the Sprint 02A
 * internal console adds staff roles + MFA: a verified email listed in PLATFORM_ADMIN_EMAILS
 * (comma-separated). Returns the staff member's email, or null.
 */
export async function getPlatformStaff(): Promise<{ id: string; email: string } | null> {
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!user || !email || !user.email_confirmed_at || !allowed.includes(email)) return null;
  return { id: user.id, email };
}
