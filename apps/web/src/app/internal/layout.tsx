import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { getPlatformStaff } from "@/lib/platform-staff";
import { InternalNav } from "./internal-nav";

// Always check staff access per request (never pre-render).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Internal | VentoryPoint",
  robots: { index: false, follow: false },
};

// Staff-only area. Anyone else gets a 404, so the area doesn't reveal itself.
export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const staff = await getPlatformStaff();
  if (!staff) notFound();

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-white/10 bg-gradient-brand text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <div className="font-heading text-base font-semibold leading-tight">VentoryPoint Internal</div>
              <div className="flex items-center gap-1 text-xs text-purple-200">
                <ShieldAlert className="size-3.5" /> Staff only · {staff.email}
              </div>
            </div>
          </div>
          <InternalNav />
          <Link href="/dashboard" className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-purple-200 hover:text-white">
            <ArrowLeft className="size-4" /> Back to app
          </Link>
        </div>
      </header>
      <main className="px-4 py-6 md:px-6 lg:px-8">{children}</main>
    </div>
  );
}
