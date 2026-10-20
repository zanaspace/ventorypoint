"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle, Info, Wrench, X, ExternalLink } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export interface ActiveAnnouncement {
  id: string;
  title: string;
  message: string;
  severity: "info" | "warning" | "critical" | "maintenance";
  action_label?: string | null;
  action_url?: string | null;
  dismissible: boolean;
  starts_at: string;
}

interface AnnouncementBannerProps {
  organizationId?: string | null;
  initialAnnouncements?: ActiveAnnouncement[];
}

export function AnnouncementBanner({ organizationId, initialAnnouncements = [] }: AnnouncementBannerProps) {
  const [announcements, setAnnouncements] = useState<ActiveAnnouncement[]>(initialAnnouncements);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // If not passed initially or on organization change, fetch
    if (initialAnnouncements.length === 0) {
      async function load() {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.rpc("get_active_announcements_for_user", {
            p_organization_id: organizationId ?? null,
          });
          if (!error && Array.isArray(data)) {
            setAnnouncements(data);
          }
        } catch {
          // Ignore fetch errors
        }
      }
      load();
    }
  }, [organizationId, initialAnnouncements.length]);

  const handleDismiss = async (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    const supabase = createClient();
    try {
      await supabase.rpc("dismiss_announcement", { p_announcement_id: id });
    } catch {
      // Dismissed locally
    }
  };

  const visible = announcements.filter((a) => !dismissedIds.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-4 py-2 sm:px-6 lg:px-8">
      {visible.map((item) => {
        const severityStyles = {
          critical: {
            container: "bg-red-50 text-red-950 border-red-200 dark:bg-red-950/40 dark:border-red-800/60 dark:text-red-200",
            icon: <AlertCircle className="size-4 shrink-0 text-red-600 dark:text-red-400 animate-pulse" />,
            badge: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800",
          },
          warning: {
            container: "bg-amber-50 text-amber-950 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-200",
            icon: <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />,
            badge: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-800",
          },
          maintenance: {
            container: "bg-purple-50 text-purple-950 border-purple-200 dark:bg-purple-950/40 dark:border-purple-800/60 dark:text-purple-200",
            icon: <Wrench className="size-4 shrink-0 text-purple-600 dark:text-purple-400" />,
            badge: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-800",
          },
          info: {
            container: "bg-blue-50 text-blue-950 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800/60 dark:text-blue-200",
            icon: <Info className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />,
            badge: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800",
          },
        }[item.severity] ?? {
          container: "bg-brand/10 border-brand/20 text-foreground",
          icon: <Info className="size-4 shrink-0 text-brand" />,
          badge: "bg-brand/20 text-brand",
        };

        return (
          <div
            key={item.id}
            role="alert"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-sm backdrop-blur-sm transition-all duration-200 ${severityStyles.container}`}
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
              {severityStyles.icon}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider border ${severityStyles.badge}`}>
                  {item.severity}
                </span>
                <span className="font-semibold text-foreground">{item.title}:</span>
                <span className="text-muted-foreground">{item.message}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {item.action_url && item.action_label && (
                <a
                  href={item.action_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold underline underline-offset-4 hover:opacity-80 transition-opacity"
                >
                  {item.action_label}
                  <ExternalLink className="size-3" />
                </a>
              )}
              {item.dismissible && (
                <button
                  type="button"
                  onClick={() => handleDismiss(item.id)}
                  aria-label="Dismiss announcement"
                  className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
