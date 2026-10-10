import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import { AuditLogClient, type AuditEntry, type AuditActor } from "./components/audit-log-client";

export const metadata = {
  title: "Change history | VentoryPoint",
  description: "Who changed which setting, when, and what it was before.",
};

const PAGE_SIZE = 50;
const TABLES = [
  "organizations",
  "facilities",
  "client_accounts",
  "client_facilities",
  "organization_members",
  "member_facility_access",
  "invitations",
  "floor_worker_credentials",
  "floor_devices",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AuditLogPage(props: {
  searchParams: Promise<{ table?: string; actor?: string; from?: string; to?: string; before?: string }>;
}) {
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) redirect("/onboarding");
  if (!["owner", "admin"].includes(context.role)) redirect("/dashboard");

  // Only allow-listed filter values reach the query
  const params = await props.searchParams;
  const table = params.table && TABLES.includes(params.table) ? params.table : "";
  const actor = params.actor && UUID_RE.test(params.actor) ? params.actor : "";
  const from = params.from && DATE_RE.test(params.from) ? params.from : "";
  const to = params.to && DATE_RE.test(params.to) ? params.to : "";
  const before = params.before && !Number.isNaN(Date.parse(params.before)) ? params.before : "";

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select("id, table_name, row_id, action, changed_fields, before, after, actor_user_id, actor_role, created_at")
    .eq("organization_id", context.activeOrg.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (table) query = query.eq("table_name", table);
  if (actor) query = query.eq("actor_user_id", actor);
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);
  if (before) query = query.lt("created_at", before);

  const [{ data: rows }, { data: members }] = await Promise.all([
    query,
    supabase.from("organization_members").select("user_id, role").eq("organization_id", context.activeOrg.id),
  ]);

  const entries = (rows ?? []) as AuditEntry[];
  const hasMore = entries.length > PAGE_SIZE;

  // Names: current members plus anyone who appears in these entries. Two plain queries:
  // organization_members has two links to profiles (user_id, added_by), so an embed is ambiguous.
  const roleById = new Map((members ?? []).map((m) => [m.user_id as string, m.role as string]));
  const ids = [...new Set([...roleById.keys(), ...entries.map((e) => e.actor_user_id).filter((id): id is string => !!id)])];
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, first_name, last_name, email").in("id", ids)
    : { data: [] };

  const actors: AuditActor[] = (profiles ?? []).map((p) => ({
    id: p.id as string,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ") || (p.email as string | null) || "Unknown user",
    role: roleById.get(p.id as string) ?? "former member",
  }));

  return (
    <AuditLogClient
      entries={entries.slice(0, PAGE_SIZE)}
      actors={actors}
      tables={TABLES}
      filters={{ table, actor, from, to, before }}
      nextCursor={hasMore ? entries[PAGE_SIZE - 1].created_at : null}
    />
  );
}
