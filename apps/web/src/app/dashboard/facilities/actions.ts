"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { assertCanAddFacility } from "@/lib/entitlements";

type Hours = Record<string, { closed: boolean; open: string; close: string }>;
type Cutoff = { carrier: string; time: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function str(formData: FormData, key: string) {
  const v = (formData.get(key) as string | null)?.trim();
  return v ? v : null;
}

function num(formData: FormData, key: string) {
  const raw = str(formData, key);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function parseJson<T>(formData: FormData, key: string): T | null {
  const raw = formData.get(key) as string | null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Allow-listed, validated facility fields. Never reads organization_id for updates. */
function parseFacilityFields(formData: FormData) {
  const latitude = num(formData, "latitude");
  const longitude = num(formData, "longitude");
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { error: "Latitude and longitude must be numbers." } as const;
  }
  if ((latitude !== null && (latitude < -90 || latitude > 90)) || (longitude !== null && (longitude < -180 || longitude > 180))) {
    return { error: "Latitude/longitude are out of range." } as const;
  }
  if ((latitude === null) !== (longitude === null)) {
    return { error: "Provide both latitude and longitude, or neither." } as const;
  }

  const hoursIn = parseJson<Hours>(formData, "operating_hours");
  let operating_hours: Hours | null = null;
  if (hoursIn) {
    operating_hours = {};
    for (const day of DAYS) {
      const d = hoursIn[day];
      if (!d) continue;
      if (!d.closed && (!TIME_RE.test(d.open) || !TIME_RE.test(d.close))) {
        return { error: `Invalid opening hours for ${day.toUpperCase()}.` } as const;
      }
      if (!d.closed && d.open >= d.close) {
        return { error: `${day.toUpperCase()}: closing time must be after opening time.` } as const;
      }
      operating_hours[day] = { closed: !!d.closed, open: d.open, close: d.close };
    }
  }

  const cutoffsIn = parseJson<Cutoff[]>(formData, "carrier_cutoffs") ?? [];
  const carrier_cutoffs: Cutoff[] = [];
  for (const c of cutoffsIn) {
    const carrier = (c.carrier || "").trim();
    if (!carrier && !c.time) continue; // blank row
    if (!carrier || !TIME_RE.test(c.time)) {
      return { error: "Each carrier cutoff needs a carrier name and a valid time." } as const;
    }
    carrier_cutoffs.push({ carrier, time: c.time });
  }

  const requestedStatus = str(formData, "geocode_status");
  const geocode_status =
    latitude === null
      ? "unverified"
      : requestedStatus === "verified" || requestedStatus === "manual"
      ? requestedStatus
      : "manual";

  return {
    fields: {
      name: str(formData, "name"),
      short_code: str(formData, "short_code"),
      timezone: str(formData, "timezone") || "UTC",
      address: str(formData, "address"),
      city: str(formData, "city"),
      state: str(formData, "state"),
      zip_code: str(formData, "zip_code"),
      county: str(formData, "county"),
      country: str(formData, "country"),
      latitude,
      longitude,
      geocode_status,
      geocoded_at: latitude === null ? null : new Date().toISOString(),
      operating_hours,
      carrier_cutoffs,
    },
  } as const;
}

export async function createFacility(formData: FormData) {
  const supabase = await createClient();
  const organization_id = formData.get("organization_id") as string;

  const parsed = parseFacilityFields(formData);
  if ("error" in parsed) return { error: parsed.error };

  if (!parsed.fields.name || !parsed.fields.short_code || !organization_id) {
    return { error: "Missing required fields" };
  }

  try {
    await assertCanAddFacility(organization_id);
  } catch (err: any) {
    return { error: err.message };
  }

  const { data, error } = await supabase
    .from("facilities")
    .insert({ organization_id, ...parsed.fields })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard/facilities");
  return { data };
}

export async function updateFacility(id: string, formData: FormData) {
  const supabase = await createClient();

  const parsed = parseFacilityFields(formData);
  if ("error" in parsed) return { error: parsed.error };
  if (!parsed.fields.name || !parsed.fields.short_code) {
    return { error: "Missing required fields" };
  }

  // Only re-stamp geocoded_at when the pin actually moved, so unrelated edits
  // (e.g. a cutoff time) don't look like a new geocode in the change history.
  const { geocoded_at, ...fields } = parsed.fields;
  const { data: current } = await supabase.from("facilities").select("latitude, longitude").eq("id", id).single();
  const pinMoved = !current || current.latitude !== fields.latitude || current.longitude !== fields.longitude;

  const { data, error } = await supabase
    .from("facilities")
    .update(pinMoved ? { ...fields, geocoded_at } : fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath("/dashboard/facilities");
  return { data };
}

export async function deleteFacility(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("facilities").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard/facilities");
  return { success: true };
}

export type GeocodeResult =
  | {
      ok: true;
      latitude: number;
      longitude: number;
      /** "exact" = the street address matched; "approximate" = only the area (city/ZIP) matched. */
      precision: "exact" | "approximate";
      street: string | null;
      city: string | null;
      state: string | null;
      zip_code: string | null;
      county: string | null;
      country: string | null;
      display_name: string;
    }
  | { ok: false; error: string };

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string | undefined>;
}

// OpenStreetMap Nominatim: no API key, ~1 request/second fair-use limit.
// Swap these fetches for Google/Mapbox later without touching the UI.
const NOMINATIM = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS = { "User-Agent": "VentoryPoint/1.0 (facility geocoding)", Accept: "application/json" };

function toResult(r: NominatimResult, precision: "exact" | "approximate"): GeocodeResult {
  const a = r.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(" ") || null;
  return {
    ok: true,
    latitude: Number(r.lat),
    longitude: Number(r.lon),
    precision,
    street,
    city: a.city || a.town || a.village || a.hamlet || a.suburb || null,
    state: a.state || null,
    zip_code: a.postcode || null,
    county: a.county || null,
    country: a.country_code ? a.country_code.toUpperCase() : null,
    display_name: r.display_name,
  };
}

async function search(q: string): Promise<NominatimResult | null | "unavailable"> {
  const res = await fetch(`${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`, {
    headers: NOMINATIM_HEADERS,
    cache: "no-store",
  });
  if (!res.ok) return "unavailable";
  const results = (await res.json()) as NominatimResult[];
  return results[0] ?? null;
}

/**
 * Finds coordinates for an address. Tries the full address first; if that fails
 * (common with suite/unit numbers or new buildings), falls back to city/state/ZIP
 * and reports the pin as approximate.
 */
export async function geocodeAddress(input: {
  street: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<GeocodeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const area = [input.city, input.state, input.zip].map((s) => s?.trim()).filter(Boolean).join(", ");
  const full = [input.street.trim(), area].filter(Boolean).join(", ");
  if (full.length < 5) return { ok: false, error: "Enter a street address or city first." };

  try {
    const exact = await search(full);
    if (exact === "unavailable") return { ok: false, error: "The address lookup service is unavailable. Use your current location or enter coordinates." };
    if (exact) return toResult(exact, "exact");

    if (area && area !== full) {
      const approx = await search(area);
      if (approx && approx !== "unavailable") return toResult(approx, "approximate");
    }
    return {
      ok: false,
      error: "We couldn't find this address. Check it, use your current location, or enter coordinates manually.",
    };
  } catch {
    return { ok: false, error: "Address lookup failed. Use your current location or enter coordinates manually." };
  }
}

/** Looks up the address at a coordinate (used after "Use my current location"). */
export async function reverseGeocode(latitude: number, longitude: number): Promise<GeocodeResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { ok: false, error: "Invalid coordinates." };
  }

  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`,
      { headers: NOMINATIM_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return { ok: false, error: "The address lookup service is unavailable." };
    const r = (await res.json()) as NominatimResult & { error?: string };
    if (r.error || !r.lat) return { ok: false, error: "No address found at this location." };
    return { ...(toResult(r, "exact") as Extract<GeocodeResult, { ok: true }>), latitude, longitude };
  } catch {
    return { ok: false, error: "Address lookup failed." };
  }
}
