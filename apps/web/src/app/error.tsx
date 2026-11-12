"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-surface">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm text-center space-y-6">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-accent text-brand-text">
          <AlertCircle className="size-6 text-brand-text" strokeWidth={1.5} />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred while loading this page. You can try refreshing or return to your dashboard.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className={buttonVariants({ variant: "default", className: "w-full sm:w-auto cursor-pointer" })}
          >
            <RefreshCw className="size-4 mr-2" />
            Try again
          </button>
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "outline", className: "w-full sm:w-auto" })}
          >
            <Home className="size-4 mr-2" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
