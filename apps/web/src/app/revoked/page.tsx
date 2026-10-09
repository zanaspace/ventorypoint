import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldOff, Clock } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { signOut } from "@/app/revoked/actions";

export const metadata = {
  title: "Access unavailable | VentoryPoint",
  description: "Your access to this workspace is revoked or awaiting approval.",
};

export default async function RevokedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("is_active, pending_approval")
    .eq("user_id", user.id);

  // If they actually have an active membership, they don't belong here.
  if ((memberships ?? []).some((m) => m.is_active)) redirect("/dashboard");
  if (!memberships || memberships.length === 0) redirect("/onboarding");

  const pending = memberships.some((m) => m.pending_approval);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-surface">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-sm text-center space-y-5">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            pending ? "bg-warning-soft text-warning-text" : "bg-danger-soft text-danger-text"
          }`}
        >
          {pending ? <Clock className="h-7 w-7" /> : <ShieldOff className="h-7 w-7" />}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          {pending ? "Waiting for approval" : "Access revoked"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {pending
            ? "An admin needs to approve your request before you can access this workspace. You'll be able to sign in as soon as they do."
            : "Your access to this workspace has been revoked. If you think this is a mistake, contact your workspace owner."}
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href="/join"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-gray-50 dark:hover:bg-white/10"
          >
            Join another workspace
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary-hover cursor-pointer"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
