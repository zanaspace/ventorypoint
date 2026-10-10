"use server";

import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { recordFloorEvents, type EventInput } from "@/lib/events";

// The cookie holds only an opaque session token. Worker, organization and device
// are looked up server-side (floor_sessions), so editing the cookie can't impersonate anyone.
const SESSION_COOKIE = "vp_floor_session";

export interface FloorDevice {
  id: string;
  name: string;
  is_authorized: boolean;
  is_blocked: boolean;
  facility_id: string | null;
  facility_name?: string | null;
  /** Present only while the terminal has no warehouse yet. */
  facility_choices?: { id: string; name: string; code: string | null }[] | null;
}

export interface FloorWorkerSession {
  member_id: string;
  worker_code: string;
  first_name: string;
  last_name: string;
  organization_id: string;
  organization_name: string;
  all_facilities: boolean;
  login_at: string;
  expires_at: string;
  device: FloorDevice | null;
}

export interface FloorLoginResult {
  ok: boolean;
  error?: string;
  locked?: boolean;
  session?: FloorWorkerSession;
}

interface FloorSessionRow {
  started_at: string;
  expires_at: string;
  member_id: string;
  worker_code: string;
  first_name: string | null;
  last_name: string | null;
  organization_id: string;
  organization_name: string;
  all_facilities: boolean;
  device: FloorDevice | null;
}

function toSession(row: FloorSessionRow): FloorWorkerSession {
  return {
    member_id: row.member_id,
    worker_code: row.worker_code,
    first_name: row.first_name || "Floor",
    last_name: row.last_name || "Worker",
    organization_id: row.organization_id,
    organization_name: row.organization_name || "Organization",
    all_facilities: row.all_facilities ?? true,
    login_at: row.started_at,
    expires_at: row.expires_at,
    device: row.device,
  };
}

async function readSession(token: string): Promise<FloorWorkerSession | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_floor_session", { p_session_token: token });
  if (error || !data) return null;
  return toSession(data as FloorSessionRow);
}

export async function loginFloorWorker(
  badgeToken: string,
  pin: string,
  deviceToken?: string | null
): Promise<FloorLoginResult> {
  const cleanBadge = (badgeToken || "").trim();
  const cleanPin = (pin || "").trim();

  if (!cleanBadge) {
    return { ok: false, error: "Please scan your badge or enter your badge token." };
  }
  if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 6 || !/^\d+$/.test(cleanPin)) {
    return { ok: false, error: "Please enter a 4 to 6 digit numeric PIN." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("floor_worker_login", {
    p_badge_token: cleanBadge,
    p_pin: cleanPin,
    p_device_token: deviceToken?.trim() || null,
  });

  if (error) {
    return { ok: false, error: "Authentication failed. Please try again." };
  }

  const res = data as { ok: boolean; error?: string; locked?: boolean; session_token?: string; session_expires_at?: string };
  if (!res?.ok || !res.session_token) {
    return { ok: false, error: res?.error || "Invalid credentials.", locked: res?.locked || false };
  }

  const session = await readSession(res.session_token);
  if (!session) {
    return { ok: false, error: "Could not start your shift. Please try again." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, res.session_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: new Date(session.expires_at),
  });

  return { ok: true, session };
}

export async function getFloorWorkerSession(): Promise<FloorWorkerSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSession(token);
}

export async function logoutFloorWorker() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const supabase = await createClient();
    await supabase.rpc("end_floor_session", { p_session_token: token });
  }
  cookieStore.delete(SESSION_COOKIE);
}

/** Records floor events for the current session (used by the floor workspace from Sprint 6). */
export async function submitFloorEvents(events: Omit<EventInput, "device_id" | "backdate_reason">[]) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) {
    return { ok: false as const, code: "session_invalid" as const, message: "Sign in with your badge to continue." };
  }
  const supabase = await createClient();
  return recordFloorEvents(supabase, token, events);
}

/** First-time setup: the worker picks which warehouse this terminal is in (only while it has none). */
export async function chooseTerminalFacility(
  facilityId: string
): Promise<{ ok: true; session: FloorWorkerSession } | { ok: false; error: string }> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { ok: false, error: "Sign in with your badge to continue." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_floor_device_facility", {
    p_session_token: token,
    p_facility_id: facilityId,
  });
  if (error) return { ok: false, error: error.message };

  const session = await readSession(token);
  if (!session) return { ok: false, error: "Your session has ended. Sign in again." };
  return { ok: true, session };
}
