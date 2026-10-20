import { notFound } from "next/navigation";
import { getPlatformStaff } from "@/lib/platform-staff";
import { createAdminClient } from "@/utils/supabase/admin";
import { getOrgFeatureFlags } from "@/lib/feature-flags";
import { TenantDetailClient } from "./components/tenant-detail-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return {
    title: `Tenant ${id} | VentoryPoint Internal`,
  };
}

export default async function InternalTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const staff = await getPlatformStaff();
  if (!staff) notFound();

  const { id } = await params;
  const admin = createAdminClient();

  // 1. Fetch organization
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id, name, slug, created_at, plan, is_active, country, timezone, currency")
    .eq("id", id)
    .single();

  if (orgError || !org) notFound();

  // 2. Fetch facilities
  const { data: facilities } = await admin
    .from("facilities")
    .select("id, name, short_code, city, state, country")
    .eq("organization_id", id)
    .order("name");

  // 3. Fetch members with profiles (explicit FK embed as established in Sprint 1)
  const { data: members } = await admin
    .from("organization_members")
    .select(`
      id,
      role,
      is_active,
      pending_approval,
      created_at,
      user_id,
      profiles:profiles!organization_members_user_id_fkey (
        first_name,
        last_name,
        email
      )
    `)
    .eq("organization_id", id)
    .order("created_at", { ascending: false });

  const formattedMembers = (members ?? []).map((m: any) => ({
    id: m.id,
    role: m.role,
    status: m.pending_approval ? "pending" : m.is_active ? "active" : "inactive",
    created_at: m.created_at,
    email: m.profiles?.email ?? null,
    full_name: [m.profiles?.first_name, m.profiles?.last_name].filter(Boolean).join(" ") || null,
  }));

  // 4. Fetch feature flags with tenant overrides
  const featureFlags = await getOrgFeatureFlags(id);

  // 5. Fetch internal notes if table exists
  let notes: Array<{ id: string; content: string; created_at: string; author_email?: string }> = [];
  try {
    const { data: notesData } = await admin
      .from("tenant_internal_notes")
      .select("id, content, created_at, author_id")
      .eq("organization_id", id)
      .order("created_at", { ascending: false });

    if (notesData) {
      notes = notesData.map((n: any) => ({
        id: n.id,
        content: n.content,
        created_at: n.created_at,
      }));
    }
  } catch {
    // If notes table doesn't exist yet, proceed with empty notes
  }

  // 6. Fetch active support grant if any
  let activeGrant = null;
  try {
    const { data: grantData } = await admin
      .from("support_access_grants")
      .select("id, scope, duration_hours, reason, starts_at, expires_at")
      .eq("organization_id", id)
      .lte("starts_at", new Date().toISOString())
      .gt("expires_at", new Date().toISOString())
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (grantData) {
      activeGrant = grantData;
    }
  } catch {
    // If table doesn't exist yet, proceed with null
  }

  return (
    <div className="mx-auto max-w-7xl">
      <TenantDetailClient
        tenant={{
          id: org.id,
          name: org.name,
          slug: org.slug,
          created_at: org.created_at,
          plan: org.plan || "launch",
          is_active: org.is_active !== false,
          country: org.country || "US",
          timezone: org.timezone || "America/New_York",
          currency: org.currency || "USD",
        }}
        facilities={facilities ?? []}
        members={formattedMembers}
        featureFlags={featureFlags}
        notes={notes}
        activeGrant={activeGrant}
      />
    </div>
  );
}
