"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export interface SettingsResult {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function updateOrganizationSettings(
  orgId: string,
  formData: FormData
): Promise<SettingsResult> {
  const name = (formData.get("name") as string || "").trim();
  const country = (formData.get("country") as string || "").trim();
  const timezone = (formData.get("timezone") as string || "").trim();
  const currency = (formData.get("currency") as string || "").trim();

  if (!name) {
    return { ok: false, error: "Organization name is required." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      country: country || "US",
      timezone: timezone || "America/New_York",
      default_currency: currency || "USD",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orgId);

  if (error) {
    return { ok: false, error: error.message || "Failed to update organization settings." };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Organization settings updated successfully." };
}

export async function requestDataExportAction(orgId: string, format: "json" | "csv" = "json") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  // Check role
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new Error("Only organization owners and admins can request tenant data exports.");
  }

  // Fetch tenant datasets
  const [orgRes, facilitiesRes, membersRes, auditRes, subRes] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", orgId).single(),
    supabase.from("facilities").select("*").eq("organization_id", orgId),
    supabase.from("organization_members").select("id, role, is_active, created_at, user_id").eq("organization_id", orgId),
    supabase.from("audit_log").select("*").eq("organization_id", orgId).order("performed_at", { ascending: false }).limit(200),
    supabase.from("subscriptions").select("*").eq("organization_id", orgId).maybeSingle(),
  ]);

  const exportPayload = {
    metadata: {
      exported_at: new Date().toISOString(),
      organization_id: orgId,
      requested_by: user.id,
      format,
      version: "1.0",
    },
    organization: orgRes.data,
    facilities: facilitiesRes.data ?? [],
    members: membersRes.data ?? [],
    subscriptions: subRes.data ?? null,
    recent_audit_trail: auditRes.data ?? [],
  };

  const totalRecords =
    1 +
    (facilitiesRes.data?.length ?? 0) +
    (membersRes.data?.length ?? 0) +
    (auditRes.data?.length ?? 0);

  const jsonString = JSON.stringify(exportPayload, null, 2);
  const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(jsonString)}`;

  // Record export job in database
  const { data: job, error: jobError } = await supabase
    .from("data_export_jobs")
    .insert({
      organization_id: orgId,
      requested_by: user.id,
      format,
      status: "completed",
      record_count: totalRecords,
      file_url: dataUri,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("id, created_at, expires_at, record_count")
    .single();

  if (jobError) {
    console.error("Failed to log data_export_jobs:", jobError);
  }

  return {
    ok: true,
    jobId: job?.id,
    recordCount: totalRecords,
    expiresAt: job?.expires_at,
    filename: `ventorypoint-export-${orgRes.data?.slug || "tenant"}-${new Date().toISOString().split("T")[0]}.${format}`,
    dataContent: jsonString,
  };
}

export async function getRecentExportJobsAction(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("data_export_jobs")
    .select("id, status, format, record_count, created_at, expires_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(5);

  return data ?? [];
}

