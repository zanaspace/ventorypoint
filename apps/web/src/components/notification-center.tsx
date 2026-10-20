"use client";

import { useState, useEffect, useRef } from "react";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Clock,
  CreditCard,
  CheckCircle2,
  Sliders,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import {
  getUserNotifications,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  sendTestNotificationAction,
} from "@/app/dashboard/notifications/actions";

interface NotificationItem {
  id: string;
  template_key: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  data: Record<string, any>;
}

export function NotificationCenter({ organizationId }: { organizationId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const data = await getUserNotifications();
      setNotifications(data as NotificationItem[]);
    } catch (e) {
      // Non-blocking in background
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000); // 20s poll
    return () => clearInterval(interval);
  }, []);

  // Dismiss dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const handleMarkRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    await markNotificationReadAction(id);
  };

  const handleMarkAllRead = async () => {
    if (!organizationId) return;
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    await markAllNotificationsReadAction(organizationId);
  };

  const handleSendTestNotification = async (type: "hold" | "expiry" | "billing" | "approval") => {
    if (!organizationId) return;
    setIsLoading(true);
    await sendTestNotificationAction(organizationId, type);
    await fetchNotifications();
    setIsLoading(false);
  };

  const displayedList =
    filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications;

  const getNotificationIcon = (templateKey: string) => {
    switch (templateKey) {
      case "hold_action_needed":
        return <AlertTriangle className="size-4 text-amber-500 shrink-0" />;
      case "near_expiry_stock":
        return <Clock className="size-4 text-orange-500 shrink-0" />;
      case "billing_period_ready":
      case "subscription_dunning":
        return <CreditCard className="size-4 text-blue-500 shrink-0" />;
      default:
        return <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative grid place-items-center size-9 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        aria-label="Open notifications"
        aria-expanded={isOpen}
      >
        <Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-primary-foreground border-2 border-card">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-3.5 bg-surface/50">
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-sm font-bold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-brand/10 text-brand px-2 py-0.5 text-[11px] font-semibold">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center border-b border-border/60 bg-surface/30 px-3 py-1.5 gap-2 text-xs">
            <button
              onClick={() => setFilter("all")}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors ${
                filter === "all"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors ${
                filter === "unread"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
            {displayedList.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Bell className="size-8 text-muted-foreground/40 mx-auto" strokeWidth={1} />
                <p className="text-xs text-muted-foreground font-medium">
                  {filter === "unread" ? "No unread alerts" : "You have no notifications yet"}
                </p>
              </div>
            ) : (
              displayedList.map((item) => (
                <div
                  key={item.id}
                  onClick={() => !item.read_at && handleMarkRead(item.id)}
                  className={`p-3.5 transition-colors cursor-pointer flex items-start gap-3 hover:bg-accent/40 ${
                    !item.read_at ? "bg-accent/15" : "bg-card opacity-80"
                  }`}
                >
                  <div className="mt-0.5">{getNotificationIcon(item.template_key)}</div>
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4
                        className={`text-xs truncate ${
                          !item.read_at ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                        }`}
                      >
                        {item.title}
                      </h4>
                      {!item.read_at && (
                        <span className="size-2 rounded-full bg-brand shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {item.message}
                    </p>
                    <span className="text-[10px] text-muted-foreground/80 block pt-0.5">
                      {new Date(item.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Test Alert Simulator Quick Actions (For Sprint Validation) */}
          <div className="border-t border-border bg-surface/50 p-2.5">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-1 pb-1 flex items-center justify-between">
              <span>Simulate Trigger (Event Test)</span>
              <Sparkles className="size-3 text-brand-text" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handleSendTestNotification("hold")}
                disabled={isLoading}
                className="cursor-pointer text-left rounded border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
              >
                + Order Hold Alert
              </button>
              <button
                onClick={() => handleSendTestNotification("expiry")}
                disabled={isLoading}
                className="cursor-pointer text-left rounded border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
              >
                + Near-Expiry Alert
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
