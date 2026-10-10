"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Building,
  Settings,
  Menu,
  Bell,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  LogOut,
  Shield,
  Smartphone,
} from "lucide-react";
import { ThemeToggle } from "./ui/theme-toggle";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { BrandMark } from "./brand-mark";
import type { WorkspaceContext } from "@/lib/org-context-types";
import { createClient } from "@/utils/supabase/client";

interface AppShellProps {
  children: React.ReactNode;
  context?: WorkspaceContext | null;
}

export function AppShell({ children, context }: AppShellProps) {
  const pathname = usePathname();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close the account menu on outside click or Escape
  useEffect(() => {
    if (!isUserMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (!userMenuRef.current?.contains(event.target as Node)) setIsUserMenuOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsUserMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isUserMenuOpen]);

  // The mobile drawer always opens fully expanded; on desktop the rail collapses unless pinned or hovered.
  const isCollapsed = !isPinned && !isHovered && !isMobileOpen;
  const userRole = context?.role || "member";

  // Role-Aware Navigation
  const allNavigation = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner", "admin", "ops_manager", "supervisor", "floor_worker", "billing", "client_user"] },
    { name: "Facilities", href: "/dashboard/facilities", icon: Building, roles: ["owner", "admin", "ops_manager", "supervisor"] },
    { name: "Clients", href: "/dashboard/clients", icon: Users, roles: ["owner", "admin", "ops_manager", "supervisor", "billing"] },
    { name: "Members", href: "/dashboard/members", icon: Shield, roles: ["owner", "admin", "ops_manager"] },
  ];

  const filteredNavigation = allNavigation.filter((item) =>
    item.roles.includes(userRole)
  );

  // Settings: organization (owner/admin/billing), devices (ops managers, supervisors), change history (owner/admin)
  const canAccessSettings = ["owner", "admin", "billing", "ops_manager", "supervisor"].includes(userRole);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const userInitials =
    context?.user?.firstName && context?.user?.lastName
      ? `${context.user.firstName[0]}${context.user.lastName[0]}`.toUpperCase()
      : context?.user?.email?.slice(0, 2).toUpperCase() || "VP";

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          isCollapsed ? "w-20" : "w-64"
        } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Floating Desktop Collapse Toggle */}
        <button
          onClick={() => setIsPinned(!isPinned)}
          className="hidden lg:flex absolute -right-3 top-5 items-center justify-center w-6 h-6 bg-card border border-border rounded-full text-muted-foreground hover:text-brand-text hover:border-brand transition-colors z-50 shadow-sm cursor-pointer"
          aria-label={isPinned ? "Collapse sidebar" : "Pin sidebar open"}
        >
          {isPinned ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Logo Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex items-center gap-3 font-heading font-semibold text-lg tracking-tight text-foreground overflow-hidden whitespace-nowrap">
            <BrandMark />
            {!isCollapsed && <span>VentoryPoint</span>}
          </Link>
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Organization & Facility Switcher */}
        {context && (
          <WorkspaceSwitcher
            organizations={context.organizations}
            activeOrg={context.activeOrg}
            facilities={context.facilities}
            activeFacilityId={context.activeFacilityId}
            isCollapsed={isCollapsed}
          />
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-hide">
          {!isCollapsed && (
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.06em] mb-2 px-3">
              Management
            </div>
          )}
          {filteredNavigation.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                aria-current={isActive ? "page" : undefined}
                className={`group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-sidebar-foreground font-medium hover:bg-muted hover:text-foreground"
                } ${isCollapsed ? "justify-center px-0" : ""}`}
                title={isCollapsed ? item.name : undefined}
              >
                <div className="flex items-center justify-center p-1">
                  <item.icon
                    className={`w-[18px] h-[18px] shrink-0 ${isActive ? "text-brand-text" : "text-muted-foreground group-hover:text-foreground"}`}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                </div>
                {!isCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer actions / Settings */}
        <div className="p-3 border-t border-sidebar-border flex flex-col gap-1">
          {/* Quick link to Floor Terminal */}
          <Link
            href="/floor-login"
            className={`group flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
              isCollapsed ? "justify-center px-0" : ""
            }`}
            title={isCollapsed ? "Floor Terminal" : undefined}
          >
            <div className="flex items-center justify-center p-1">
              <Smartphone className="w-[18px] h-[18px] shrink-0 text-muted-foreground group-hover:text-brand-text" strokeWidth={1.5} />
            </div>
            {!isCollapsed && <span>Floor Terminal</span>}
          </Link>

          {canAccessSettings && (
            <Link
              href="/dashboard/settings"
              aria-current={pathname.startsWith("/dashboard/settings") ? "page" : undefined}
              className={`group flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                pathname.startsWith("/dashboard/settings")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground font-medium hover:bg-muted hover:text-foreground"
              } ${isCollapsed ? "justify-center px-0" : ""}`}
              title={isCollapsed ? "Settings" : undefined}
            >
              <div className="flex items-center justify-center p-1">
                <Settings
                  className={`w-[18px] h-[18px] shrink-0 ${pathname.startsWith("/dashboard/settings") ? "text-brand-text" : "text-muted-foreground group-hover:text-foreground"}`}
                  strokeWidth={1.5}
                />
              </div>
              {!isCollapsed && <span>Settings</span>}
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-background border-b border-border flex items-center justify-between px-4 lg:px-6 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              className="lg:hidden -ml-2 grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              onClick={() => setIsMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <Link href="/dashboard" className="lg:hidden" aria-label="VentoryPoint home">
              <BrandMark className="size-7" />
            </Link>
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" strokeWidth={1.5} />
              <input
                type="search"
                aria-label="Search"
                placeholder="Search facilities, clients, SKUs..."
                className="h-9 pl-9 pr-4 text-sm bg-card border border-input rounded-md w-48 md:w-72 placeholder:text-gray-500 hover:border-gray-400 focus:outline-none focus:border-ring focus:ring-3 focus:ring-ring/20 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4">
            <div className="hidden md:flex items-center gap-2 h-8 px-3 bg-success-soft rounded-full text-xs font-semibold text-success-text" role="status">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden"></span>
                <span className="relative inline-flex size-2 rounded-full bg-success"></span>
              </span>
              <span>{context?.activeOrg?.name || "Live"}</span>
              <span className="opacity-60" aria-hidden="true">•</span>
              <span className="capitalize">
                {userRole.replace("_", " ")}
              </span>
            </div>

            <button
              className="relative grid place-items-center size-9 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />
              <span className="absolute -top-1 -right-1 size-2.5 bg-brand rounded-full border-2 border-card"></span>
            </button>

            <ThemeToggle />

            {/* User Menu */}
            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className={`w-9 h-9 rounded-full bg-accent text-brand-text flex items-center justify-center font-bold text-xs cursor-pointer transition-shadow hover:ring-2 hover:ring-brand/30 ${
                  isUserMenuOpen ? "ring-2 ring-ring" : ""
                }`}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
              >
                {userInitials}
              </button>

              {isUserMenuOpen && (
                <div role="menu" aria-label="Account" className="dropdown-panel absolute right-0 top-full mt-2 w-60 z-50">
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {context?.user?.firstName} {context?.user?.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {context?.user?.email}
                    </p>
                    <span className="inline-block mt-1.5 text-[11px] font-semibold capitalize px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                      {userRole.replace("_", " ")}
                    </span>
                  </div>
                  <div className="dropdown-separator" />

                  {canAccessSettings && (
                    <Link
                      href="/dashboard/settings"
                      role="menuitem"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="dropdown-item"
                    >
                      <Settings strokeWidth={1.5} />
                      <span>Settings</span>
                    </Link>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleSignOut}
                    data-variant="danger"
                    className="dropdown-item"
                  >
                    <LogOut strokeWidth={1.5} />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-surface p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
