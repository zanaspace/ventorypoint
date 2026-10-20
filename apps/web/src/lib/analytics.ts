import { createAdminClient } from "@/utils/supabase/admin";
import crypto from "crypto";

const FORBIDDEN_PII_KEYS = new Set([
  "email",
  "name",
  "first_name",
  "last_name",
  "phone",
  "address",
  "street",
  "ssn",
  "tax_id",
  "card",
]);

/**
 * Sanitizes properties object by removing any forbidden PII keys
 */
function sanitizeProperties(props: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!FORBIDDEN_PII_KEYS.has(key.toLowerCase())) {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Hashes an identifier (org ID, user ID) to preserve privacy
 */
function hashIdentifier(id: string): string {
  return crypto.createHash("sha256").update(id).digest("hex");
}

/**
 * Captures product analytics events without PII
 * Used to measure onboarding time, 15-minute floor task rule, and feature adoption
 */
export async function trackAnalyticsEvent(
  organizationId: string,
  userId: string,
  eventName: string,
  properties: Record<string, any> = {}
) {
  try {
    const admin = createAdminClient();
    const orgHash = hashIdentifier(organizationId);
    const userHash = hashIdentifier(userId);
    const sanitizedProps = sanitizeProperties(properties);

    await admin.from("product_analytics_events").insert({
      org_id_hash: orgHash,
      user_id_hash: userHash,
      event_name: eventName,
      properties: sanitizedProps,
    });

    return { ok: true };
  } catch (err: any) {
    console.error(`[Analytics Error] Failed to record event ${eventName}:`, err.message);
    return { ok: false, error: err.message };
  }
}
