import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { ToastError } from "@/components/ui/toast-error";
import { submitInviteCode } from "./actions";

export const metadata = {
  title: "Join a workspace | VentoryPoint",
  description: "Enter your workspace invite code to join your team on VentoryPoint.",
};

export default function JoinPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-surface">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Join a workspace</CardTitle>
          <CardDescription>Enter the invite code you were given (e.g. K7QM-4XPD)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense>
            <ToastError />
          </Suspense>
          <form action={submitInviteCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Invite code</Label>
              <Input
                id="code"
                name="code"
                required
                autoFocus
                autoComplete="off"
                maxLength={12}
                placeholder="XXXX-XXXX"
                className="text-center font-mono text-lg tracking-widest uppercase"
              />
            </div>
            <button type="submit" className={buttonVariants({ className: "w-full cursor-pointer" })}>
              Continue
            </button>
          </form>
          <p className="text-xs text-center text-muted-foreground">
            New here? You&apos;ll be asked to create an account next. Already have one? You&apos;ll be added right away.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-brand-text font-medium hover:underline">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
