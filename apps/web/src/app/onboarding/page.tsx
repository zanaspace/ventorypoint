import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { ToastError } from "@/components/ui/toast-error";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { hasPendingInvite } from "@/lib/invite";
import { acceptInviteLink } from "@/app/join/actions";
import { createOrganization } from "@/app/onboarding/actions";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const COUNTRIES = [
  { label: "United States", value: "US" },
  { label: "Canada", value: "CA" },
  { label: "United Kingdom", value: "GB" },
  { label: "Mexico", value: "MX" },
  { label: "Germany", value: "DE" },
  { label: "France", value: "FR" },
  { label: "Netherlands", value: "NL" },
  { label: "Australia", value: "AU" },
  { label: "Nigeria", value: "NG" },
  { label: "Other", value: "OTHER" },
];

const TIMEZONES = [
  { label: "Eastern (New York)", value: "America/New_York" },
  { label: "Central (Chicago)", value: "America/Chicago" },
  { label: "Mountain (Denver)", value: "America/Denver" },
  { label: "Pacific (Los Angeles)", value: "America/Los_Angeles" },
  { label: "London", value: "Europe/London" },
  { label: "Central Europe (Berlin)", value: "Europe/Berlin" },
  { label: "Lagos", value: "Africa/Lagos" },
  { label: "Sydney", value: "Australia/Sydney" },
  { label: "UTC", value: "UTC" },
];

const CURRENCIES = [
  { label: "USD — US Dollar", value: "USD" },
  { label: "CAD — Canadian Dollar", value: "CAD" },
  { label: "GBP — British Pound", value: "GBP" },
  { label: "EUR — Euro", value: "EUR" },
  { label: "AUD — Australian Dollar", value: "AUD" },
  { label: "NGN — Nigerian Naira", value: "NGN" },
  { label: "MXN — Mexican Peso", value: "MXN" },
];

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Already a working member? Straight to the dashboard. Inactive-only? Revoked screen.
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("is_active")
    .eq("user_id", user.id);

  if (memberships?.some((m) => m.is_active)) redirect("/dashboard");
  if (memberships && memberships.length > 0) redirect("/revoked");

  // Came here mid invite-flow (e.g. just signed up with a code)? Finish joining first.
  if (await hasPendingInvite()) redirect("/join/complete");

  // Invitations sent to this user's verified email
  const { data: pendingInvites } = await supabase.rpc("my_pending_invitations");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Suspense>
        <ToastError />
      </Suspense>
      <div className="w-full max-w-md space-y-6">
        {pendingInvites && pendingInvites.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
            <h2 className="text-lg font-semibold">Pending invitations</h2>
            {pendingInvites.map((inv: any) => (
              <form
                key={inv.id}
                action={acceptInviteLink}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <input type="hidden" name="token" value={inv.token} />
                <input type="hidden" name="next" value="complete" />
                <div className="text-sm">
                  <div className="font-medium">{inv.organization_name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    as {String(inv.role).replace("_", " ")}
                  </div>
                </div>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary-hover cursor-pointer"
                >
                  Join
                </button>
              </form>
            ))}
          </div>
        )}

        <div className="space-y-8 rounded-xl border border-border bg-card p-8 shadow-sm">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight">Welcome aboard!</h1>
            <p className="text-muted-foreground">
              Set up your organization. You can invite team members later.
            </p>
          </div>

          <form action={createOrganization} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium leading-none">
                Organization name
              </label>
              <input id="name" name="name" type="text" placeholder="Acme Logistics Inc." required className={inputClass} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Country</label>
              <SearchableSelect name="country" defaultValue="US" options={COUNTRIES} placeholder="Select country..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Timezone</label>
                <SearchableSelect name="timezone" defaultValue="America/New_York" options={TIMEZONES} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Currency</label>
                <SearchableSelect name="currency" defaultValue="USD" options={CURRENCIES} />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover cursor-pointer"
            >
              Create Organization
            </button>
          </form>

          <div className="text-center text-sm text-muted-foreground">
            Joining a team instead?{" "}
            <Link href="/join" className="text-brand-text font-medium hover:underline">
              Enter an invite code
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
