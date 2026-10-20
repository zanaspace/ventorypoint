import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type PlatformStaffRole = "platform_admin" | "support" | "customer_success" | "finance";

export interface PlatformStaff {
  id: string;
  userId: string;
  email: string;
  role: PlatformStaffRole;
  isActive: boolean;
}

/**
 * Platform staff = your internal company team, not customer tenants.
 * Checks the `platform_staff` table and seamlessly falls back to PLATFORM_ADMIN_EMAILS.
 */
export async function getPlatformStaff(): Promise<PlatformStaff | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email || !user.email_confirmed_at) return null;
  const email = user.email.toLowerCase();

  // 1. Check database platform_staff table
  try {
    const admin = createAdminClient();
    const { data: staffRow } = await admin
      .from("platform_staff")
      .select("id, user_id, role, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (staffRow) {
      return {
        id: staffRow.id,
        userId: staffRow.user_id,
        email,
        role: staffRow.role as PlatformStaffRole,
        isActive: staffRow.is_active,
      };
    }
  } catch {
    // If table doesn't exist yet, fall through to env check
  }

  // 2. Fallback to PLATFORM_ADMIN_EMAILS environment variable
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.includes(email)) {
    return {
      id: user.id,
      userId: user.id,
      email,
      role: "platform_admin",
      isActive: true,
    };
  }

  return null;
}

export async function hasStaffPermission(requiredRole?: PlatformStaffRole): Promise<boolean> {
  const staff = await getPlatformStaff();
  if (!staff) return false;
  if (!requiredRole) return true;
  if (staff.role === "platform_admin") return true; // admin has superuser permissions
  return staff.role === requiredRole;
}
