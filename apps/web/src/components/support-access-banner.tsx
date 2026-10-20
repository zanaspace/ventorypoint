"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, ArrowRight, Clock } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface SupportAccessBannerProps {
  organizationId?: string | null;
}

interface ActiveGrantData {
  id: string;
  scope: string;
  expires_at: string;
}

export function SupportAccessBanner({ organizationId }: SupportAccessBannerProps) {
  const [grant, setGrant] = useState<ActiveGrantData | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setGrant(null);
      return;
    }

    async function checkGrant() {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("get_active_support_grant", {
          p_organization_id: organizationId,
        });

        if (!error && Array.isArray(data) && data.length > 0) {
          setGrant({
            id: data[0].id,
            scope: data[0].scope,
            expires_at: data[0].expires_at,
          });
        } else {
          setGrant(null);
        }
      } catch {
        setGrant(null);
      }
    }

    checkGrant();
    // Poll every 60 seconds or on org change
    const interval = setInterval(checkGrant, 60_000);
    return () => clearInterval(interval);
  }, [organizationId]);

  if (!grant) return null;

  const diffMs = new Date(grant.expires_at).getTime() - new Date().getTime();
  if (diffMs <= 0) return null;

  const hoursRemaining = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));

  return (
    <div
      role="status"
      className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-950 dark:text-amber-200 transition-colors"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Support Access Active:</strong> VentoryPoint platform team has temporary{" "}
            <span className="capitalize font-semibold">{grant.scope.replace("_", " ")}</span> access to your workspace (expires in ~{hoursRemaining}h).
          </span>
        </div>

        <Link
          href="/dashboard/settings/support"
          className="inline-flex cursor-pointer items-center gap-1 font-semibold text-amber-800 dark:text-amber-300 underline underline-offset-4 hover:opacity-80"
        >
          Manage or Revoke <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}
