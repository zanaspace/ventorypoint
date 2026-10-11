"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { switchActiveOrganization } from "@/lib/org-context";

// new=true keeps existing members on this page (otherwise onboarding sends them to the dashboard)
const back = (message: string) => `/onboarding?new=true&message=${encodeURIComponent(message)}`;

export async function createOrganization(formData: FormData) {
  const name = ((formData.get("name") as string) || "").trim();
  const country = (formData.get("country") as string) || null;
  const timezone = (formData.get("timezone") as string) || "UTC";
  const currency = (formData.get("currency") as string) || "USD";
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!name) {
    return redirect(back("Organization name is required"));
  }

  // Single transaction in the database: creates the org and makes the caller its Owner.
  // No service-role key needed, the RPC derives the user from the session.
  const { data: newOrgId, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_country: country,
    p_timezone: timezone,
    p_currency: currency,
  });

  if (error) {
    return redirect(back(error.message));
  }

  // Open the new workspace straight away
  if (newOrgId) await switchActiveOrganization(newOrgId as string);

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
