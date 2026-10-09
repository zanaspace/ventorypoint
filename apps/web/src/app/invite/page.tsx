import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getClientIp } from "@/lib/invite";
import { acceptInviteLink } from "@/app/join/actions";

export const metadata = {
  title: "You're invited | VentoryPoint",
  description: "Accept your invitation to join a VentoryPoint workspace.",
};

export default async function InvitePage(props: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await props.searchParams;

  let invalidReason: string | null = token ? null : "This invitation link is missing its token.";
  let info: { organization_name: string; role: string; invitee_email: string | null } | null = null;

  if (token) {
    const admin = createAdminClient();
    const { data } = await admin.rpc("validate_invitation", {
      p_code: null,
      p_token: token,
      p_ip: await getClientIp(),
    });
    if (data?.ok) info = data;
    else invalidReason = data?.error || "This invitation is not valid.";
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-surface">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            {info ? "You're invited" : "Invitation unavailable"}
          </CardTitle>
          <CardDescription>
            {info
              ? `Join ${info.organization_name} as ${info.role.replace("_", " ")}`
              : invalidReason}
          </CardDescription>
        </CardHeader>

        {info && token && (
          <CardContent className="space-y-3">
            {info.invitee_email && (
              <p className="text-sm text-center text-muted-foreground">
                This invitation is for <strong>{info.invitee_email}</strong>. You must sign in with that email.
              </p>
            )}
            {user ? (
              <form action={acceptInviteLink}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="next" value="complete" />
                <button type="submit" className={buttonVariants({ className: "w-full cursor-pointer" })}>
                  Join workspace as {user.email}
                </button>
              </form>
            ) : (
              <>
                <form action={acceptInviteLink}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="next" value="register" />
                  <button type="submit" className={buttonVariants({ className: "w-full cursor-pointer" })}>
                    Create an account
                  </button>
                </form>
                <form action={acceptInviteLink}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="next" value="login" />
                  <button
                    type="submit"
                    className={buttonVariants({ variant: "outline", className: "w-full cursor-pointer" })}
                  >
                    I already have an account
                  </button>
                </form>
              </>
            )}
          </CardContent>
        )}

        <CardFooter className="justify-center">
          <Link href="/join" className="text-sm text-brand-text font-medium hover:underline">
            Have a code instead?
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
