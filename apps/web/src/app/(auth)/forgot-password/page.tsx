import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ToastError } from "@/components/ui/toast-error";
import { requestPasswordReset } from "../actions";

export const metadata = {
  title: "Forgot password | VentoryPoint",
  description: "Reset your VentoryPoint password with an email link.",
};

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ message?: string; sent?: string }>;
}) {
  const { sent } = await props.searchParams;

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold">Reset your password</CardTitle>
        <CardDescription>
          {sent
            ? "If an account exists for that email, a reset link is on its way."
            : "Enter your email and we'll send you a link to reset your password."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense>
          <ToastError />
        </Suspense>
        {!sent && (
          <form className="space-y-4" action={requestPasswordReset}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="m@example.com" required />
            </div>
            <button type="submit" className={buttonVariants({ className: "w-full cursor-pointer" })}>
              Send reset link
            </button>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-center">
        <Link href="/login" className="text-sm text-brand-text font-medium hover:underline">
          Back to sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
