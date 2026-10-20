import { notFound } from "next/navigation";
import { getPlatformStaff } from "@/lib/platform-staff";
import { createAdminClient } from "@/utils/supabase/admin";
import { AnnouncementsClient, type AnnouncementItem } from "./components/announcements-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Announcements | VentoryPoint Internal",
};

export default async function InternalAnnouncementsPage() {
  const staff = await getPlatformStaff();
  if (!staff) notFound();

  const admin = createAdminClient();
  let announcements: AnnouncementItem[] = [];

  try {
    const { data, error } = await admin
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      announcements = data as AnnouncementItem[];
    }
  } catch {
    // If announcements table doesn't exist yet, proceed with empty
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            System Announcements
          </h1>
          <p className="text-sm text-muted-foreground">
            Broadcast maintenance alerts, system notices, and operational announcements across the platform.
          </p>
        </div>
      </div>

      <AnnouncementsClient initialAnnouncements={announcements} />
    </div>
  );
}
