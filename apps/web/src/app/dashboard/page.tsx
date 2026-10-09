import Link from "next/link";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import {
  Building2,
  Users,
  ShieldCheck,
  Plus,
  ArrowRight,
  Warehouse,
  MapPin,
  Zap,
  UserPlus,
} from "lucide-react";

// Greeting + date in the organization's timezone (falls back to UTC if the zone is invalid)
function getGreeting(timezone: string) {
  const now = new Date();
  let hour = now.getUTCHours();
  let dateLabel = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now));
    dateLabel = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", timeZone: timezone });
  } catch {
    // keep UTC values
  }
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return { greeting, dateLabel };
}

interface StatTileProps {
  href: string;
  label: string;
  value: number;
  unit: string;
  cta: string;
  icon: LucideIcon;
  hero?: boolean;
}

function StatTile({ href, label, value, unit, cta, icon: Icon, hero }: StatTileProps) {
  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-xl p-5 transition-shadow duration-200 ${
        hero
          ? "bg-gradient-brand text-white hover:shadow-glow"
          : "bg-card border border-border hover:border-purple-200 hover:shadow-float dark:hover:border-purple-800"
      }`}
    >
      {hero && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-[radial-gradient(circle,rgba(118,111,255,0.45),transparent_65%)]"
        />
      )}
      <div className="relative flex items-center justify-between">
        <span className={`text-sm font-medium ${hero ? "text-purple-200" : "text-muted-foreground"}`}>{label}</span>
        <span
          className={`grid size-9 place-items-center rounded-lg ${
            hero ? "bg-white/10 text-white" : "bg-accent text-brand-text"
          }`}
        >
          <Icon className="size-[18px]" strokeWidth={1.5} />
        </span>
      </div>
      <div className="relative mt-4 flex items-baseline gap-2">
        <span className={`font-heading text-3xl font-medium tracking-tight tabular-nums ${hero ? "text-white" : "text-card-foreground"}`}>
          {value}
        </span>
        <span className={`text-xs ${hero ? "text-purple-200" : "text-muted-foreground"}`}>{unit}</span>
      </div>
      <div
        className={`relative mt-4 flex items-center gap-1 text-xs font-semibold ${
          hero ? "text-white" : "text-brand-text"
        }`}
      >
        <span>{cta}</span>
        <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

const quickActions = [
  {
    href: "/dashboard/facilities",
    icon: MapPin,
    title: "Manage facilities & geocoding",
    description: "Configure operating hours, carrier cutoffs and addresses",
  },
  {
    href: "/dashboard/clients",
    icon: Users,
    title: "Client account assignments",
    description: "Assign brand clients to serving facilities",
  },
  {
    href: "/dashboard/members",
    icon: ShieldCheck,
    title: "Staff & floor workers",
    description: "Invite teammates, create floor worker badges and manage roles",
  },
];

export default async function DashboardPage() {
  const context = await getActiveWorkspaceContext();
  if (!context || !context.activeOrg) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const orgId = context.activeOrg.id;

  // Fetch counts for the active organization
  const [
    { count: facilitiesCount },
    { count: clientsCount },
    { count: membersCount },
    { count: floorWorkersCount },
  ] = await Promise.all([
    supabase.from("facilities").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("client_accounts").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("organization_members").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_active", true),
    supabase.from("floor_worker_credentials").select("*", { count: "exact", head: true }).eq("organization_id", orgId).eq("is_active", true),
  ]);

  const canManage = ["owner", "admin", "ops_manager"].includes(context.role);
  const timezone = context.activeOrg.timezone || "UTC";
  const { greeting, dateLabel } = getGreeting(timezone);
  const firstName = context.user?.firstName;

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground">
            {greeting}
            {firstName ? (
              <>
                , <span className="text-brand-text">{firstName}</span>
              </>
            ) : null}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{context.activeOrg.name}</span>
            {" · "}
            <span className="font-semibold text-brand-text">{facilitiesCount ?? 0} facilities</span>
            {" and "}
            <span className="font-semibold text-brand-text">{floorWorkersCount ?? 0} floor workers</span>
            {" · "}
            <span className="capitalize">{context.role.replace("_", " ")}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground">
            {dateLabel}
          </span>
          {canManage && (
            <>
              <Link
                href="/dashboard/members"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3.5 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand hover:text-white"
              >
                <UserPlus className="size-4" strokeWidth={1.5} />
                <span>Invite member</span>
              </Link>
              <Link
                href="/dashboard/facilities"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                <Plus className="size-4" />
                <span>Add facility</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
        <h2 id="overview-heading" className="eyebrow">01 · Workspace overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            hero
            href="/dashboard/facilities"
            label="Warehouses"
            value={facilitiesCount ?? 0}
            unit="active facilities"
            cta="Manage facilities"
            icon={Building2}
          />
          <StatTile
            href="/dashboard/clients"
            label="Client accounts"
            value={clientsCount ?? 0}
            unit="brands"
            cta="View clients"
            icon={Users}
          />
          <StatTile
            href="/dashboard/members"
            label="Team members"
            value={membersCount ?? 0}
            unit="active staff"
            cta="Manage permissions"
            icon={ShieldCheck}
          />
          <StatTile
            href="/dashboard/members"
            label="Floor workers"
            value={floorWorkersCount ?? 0}
            unit="badge accounts"
            cta="Manage badges & PINs"
            icon={Warehouse}
          />
        </div>
      </section>

      {/* Facilities + quick actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <section aria-labelledby="facilities-heading" className="bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-accent text-brand-text">
                <Building2 className="size-4" strokeWidth={1.5} />
              </span>
              <h2 id="facilities-heading" className="font-heading text-lg font-medium text-card-foreground">
                Warehouse facilities
              </h2>
            </div>
            {canManage && (
              <Link
                href="/dashboard/facilities"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-text hover:underline underline-offset-4"
              >
                View all <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>

          {context.facilities.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent text-brand-text">
                <Warehouse className="size-6" strokeWidth={1.5} />
              </span>
              <p className="font-heading text-base font-medium text-card-foreground">No facilities yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Add your first warehouse to start receiving inventory.</p>
              {canManage && (
                <Link
                  href="/dashboard/facilities"
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  <Plus className="size-3.5" /> Add facility
                </Link>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {context.facilities.slice(0, 5).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-card-foreground">{f.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded border border-border px-1.5 py-px font-mono font-semibold text-foreground">{f.code}</span>
                      {f.city && <span>{f.city}</span>}
                    </div>
                  </div>
                  <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-success-soft px-2.5 text-xs font-semibold text-success-text">
                    <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                    Active
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="actions-heading" className="bg-card border border-border rounded-xl">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-brand-text">
              <Zap className="size-4" strokeWidth={1.5} />
            </span>
            <h2 id="actions-heading" className="font-heading text-lg font-medium text-card-foreground">
              Quick actions
            </h2>
          </div>

          <div className="flex flex-col gap-2 p-3">
            {quickActions.map(({ href, icon: Icon, title, description }) => (
              <Link
                key={title}
                href={href}
                className="group flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors group-hover:border-purple-200 group-hover:text-brand-text dark:group-hover:border-purple-800">
                  <Icon className="size-[18px]" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-card-foreground">{title}</div>
                  <div className="text-xs text-muted-foreground">{description}</div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-text" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
