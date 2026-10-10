import { Suspense } from "react";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToastError } from "@/components/ui/toast-error";
import { createClient } from "@/utils/supabase/server";
import { updatePassword } from "../actions";

export const metadata = {
  title: "Choose a new password | VentoryPoint",
  description: "Set a new password for your VentoryPoint account.",
};

export default async function ResetPasswordPage() {
  // Only reachable after verifying the emailed code or link (which signs the user in)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/forgot-password?message=${encodeURIComponent("Your reset session has expired. Request a new code.")}`);
  }

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">Choose a new password</CardTitle>
        <CardDescription>
          For <span className="font-medium text-foreground">{user.email}</span>. Use at least 8 characters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense>
          <ToastError />
        </Suspense>
        <form className="space-y-4" action={updatePassword}>
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <button type="submit" className={buttonVariants({ className: "w-full cursor-pointer" })}>
            Update password
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
