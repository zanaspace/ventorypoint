import { notFound, redirect } from "next/navigation";
import { getPlatformStaff } from "@/lib/platform-staff";

export const dynamic = "force-dynamic";

export default async function InternalHome() {
  // Layouts and pages render in parallel: every internal page checks staff access itself.
  if (!(await getPlatformStaff())) notFound();
  redirect("/internal/event-deliveries");
}
