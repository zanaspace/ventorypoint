import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { MailCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ToastError } from "@/components/ui/toast-error";
import { requestPasswordReset, restartPasswordReset, verifyResetCode } from "../actions";

export const metadata = {
  title: "Forgot password | VentoryPoint",
  description: "Reset your VentoryPoint password with a code or link sent to your email.",
};

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ message?: string; sent?: string }>;
}) {
  const { sent } = await props.searchParams;

  let pending: { email?: string; mode?: "code" | "link" } = {};
  try {
    pending = JSON.parse((await cookies()).get("vp_reset_email")?.value || "{}");
  } catch {
    pending = {};
  }
  const step = sent && pending.email ? (pending.mode === "code" ? "code" : "link") : "email";

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1 text-center">
        {step !== "email" && (
          <span className="mx-auto mb-2 grid size-12 place-items-center rounded-xl bg-accent text-brand-text">
            <MailCheck className="size-6" strokeWidth={1.5} />
          </span>
        )}
        <CardTitle className="text-2xl font-bold">
          {step === "email" ? "Reset your password" : "Check your email"}
        </CardTitle>
        <CardDescription>
          {step === "email" && "Enter your email and we'll send you a code to reset your password."}
          {step === "code" &&
            `If an account exists for ${maskEmail(pending.email!)}, we sent a reset code. Enter it below, or click the link in the email.`}
          {step === "link" &&
            `If an account exists for ${maskEmail(pending.email!)}, we sent a link to reset your password. It may take a minute to arrive.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Suspense>
          <ToastError />
        </Suspense>

        {step === "email" && (
          <form className="space-y-4" action={requestPasswordReset}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="m@example.com" required />
            </div>
            <button type="submit" className={buttonVariants({ className: "w-full cursor-pointer" })}>
              Send reset code
            </button>
          </form>
        )}

        {step === "code" && (
          <form className="space-y-4" action={verifyResetCode}>
            <div className="space-y-2">
              <Label htmlFor="code">Reset code</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,12}"
                maxLength={12}
                placeholder="Enter code"
                className="h-12 text-center font-mono text-2xl tracking-[0.4em]"
                required
                autoFocus
              />
            </div>
            <button type="submit" className={buttonVariants({ className: "w-full cursor-pointer" })}>
              Continue
            </button>
          </form>
        )}

        {step !== "email" && (
          <form action={restartPasswordReset} className="text-center text-sm text-muted-foreground">
            Didn&apos;t get it, or used the wrong email?{" "}
            <button type="submit" className="font-medium text-brand-text hover:underline cursor-pointer">
              Start again
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
