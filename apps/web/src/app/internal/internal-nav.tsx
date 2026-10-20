"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/internal/tenants", label: "Tenants" },
  { href: "/internal/flags", label: "Feature flags" },
  { href: "/internal/announcements", label: "Announcements" },
  { href: "/internal/analytics", label: "Product analytics" },
  { href: "/internal/event-deliveries", label: "Event pipeline" },
  { href: "/internal/event-console", label: "Event console" },
];

export function InternalNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Internal tools" className="flex gap-1">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`cursor-pointer rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
              active ? "bg-white/15 text-white" : "text-purple-200 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
