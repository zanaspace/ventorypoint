"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsNav({ sections }: { sections: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div>
      <p className="eyebrow mb-2">Settings</p>
      <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {sections.map((s) => {
          const active = s.href === "/dashboard/settings" ? pathname === s.href : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors ${
                active
                  ? "border-purple-500 font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
