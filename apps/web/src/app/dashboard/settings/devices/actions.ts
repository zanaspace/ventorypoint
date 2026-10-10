"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceContext } from "@/lib/org-context";

const DEVICE_TYPES = ["browser", "scanner", "tablet", "kiosk", "printer_station"] as const;
type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: { message: string } | null, fallback: string): ActionResult {
  return { ok: false, error: error?.message || fallback };
}

/** Registers (or re-registers) a browser as an approved floor device. */
export async function registerDevice(input: {
  deviceToken: string;
  name: string;
  deviceType: string;
  facilityId: string | null;
}): Promise<ActionResult> {
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg) return { ok: false, error: "Select an organization first." };

  const name = input.name.trim();
  if (!name || name.length > 80) return { ok: false, error: "Device name must be 1 to 80 characters." };
  if (!DEVICE_TYPES.includes(input.deviceType as (typeof DEVICE_TYPES)[number])) {
    return { ok: false, error: "Choose a device type." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_device", {
    p_organization_id: context.activeOrg.id,
    p_device_token: input.deviceToken,
    p_device_name: name,
    p_device_type: input.deviceType,
    p_facility_id: input.facilityId,
  });
  if (error) return fail(error, "Could not register this device.");

  revalidatePath("/dashboard/settings/devices");
  return { ok: true };
}

/** Renames, re-assigns, approves or blocks a device. */
export async function updateDevice(input: {
  deviceId: string;
  name?: string;
  facilityId?: string | null;
  isAuthorized?: boolean;
}): Promise<ActionResult> {
  if (input.name !== undefined && (!input.name.trim() || input.name.trim().length > 80)) {
    return { ok: false, error: "Device name must be 1 to 80 characters." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_device", {
    p_device_id: input.deviceId,
    p_device_name: input.name?.trim() ?? null,
    p_facility_id: input.facilityId ?? null,
    p_is_authorized: input.isAuthorized ?? null,
  });
  if (error) return fail(error, "Could not update this device.");

  revalidatePath("/dashboard/settings/devices");
  return { ok: true };
}

/** Retires a device and ends any floor session running on it. */
export async function retireDevice(deviceId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("retire_device", { p_device_id: deviceId });
  if (error) return fail(error, "Could not retire this device.");

  revalidatePath("/dashboard/settings/devices");
  return { ok: true };
}

/** Turns supervisor approval for new terminals on or off (owners and admins). */
export async function setRequireDeviceApproval(required: boolean): Promise<ActionResult> {
  const context = await getActiveWorkspaceContext();
  if (!context?.activeOrg || !["owner", "admin"].includes(context.role)) {
    return { ok: false, error: "Only owners and admins can change this setting." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ require_device_approval: required, updated_at: new Date().toISOString() })
    .eq("id", context.activeOrg.id);
  if (error) return fail(error, "Could not update the setting.");

  revalidatePath("/dashboard/settings/devices");
  return { ok: true };
}
