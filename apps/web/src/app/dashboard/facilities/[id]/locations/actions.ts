"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { parseLocationsCsv } from "@/lib/locations/csv-engine";
import { GeneratedLocation } from "@/lib/locations/range-generator";

export async function getFacilityLocations(
  facilityId: string,
  params: {
    query?: string;
    type?: string;
    area?: string;
    temperature?: string;
    activeOnly?: boolean;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const supabase = await createClient();
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("locations")
    .select("*", { count: "exact" })
    .eq("facility_id", facilityId)
    .order("walk_sequence", { ascending: true })
    .order("full_code", { ascending: true });

  if (params.query?.trim()) {
    const q = params.query.trim();
    query = query.or(`full_code.ilike.%${q}%,barcode.ilike.%${q}%,short_pick_code.ilike.%${q}%,human_path.ilike.%${q}%`);
  }

  if (params.type && params.type !== "all") {
    query = query.eq("location_type", params.type);
  }

  if (params.area && params.area !== "all") {
    query = query.eq("area_code", params.area);
  }

  if (params.temperature && params.temperature !== "all") {
    query = query.eq("temperature_class", params.temperature);
  }

  if (params.activeOnly) {
    query = query.eq("active", true);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error("Error fetching locations:", error);
    return { locations: [], total: 0, error: error.message };
  }

  return { locations: data || [], total: count || 0, error: null };
}

export async function getFacilityHierarchy(facilityId: string) {
  const supabase = await createClient();

  const { data: nodes, error } = await supabase
    .from("location_nodes")
    .select("*")
    .eq("facility_id", facilityId)
    .order("sequence_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    return { nodes: [], error: error.message };
  }

  return { nodes: nodes || [], error: null };
}

export async function getFacilityConvention(facilityId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("facility_naming_conventions")
    .select("*")
    .eq("facility_id", facilityId)
    .maybeSingle();

  if (error) {
    return { convention: null, error: error.message };
  }

  return { convention: data, error: null };
}

export async function saveFacilityConvention(
  facilityId: string,
  organizationId: string,
  payload: {
    rack_template: string;
    floor_grid_template: string;
    bulk_lane_template: string;
    special_area_template: string;
    separator: string;
    odd_even_aisle_sides: boolean;
    bottom_up_levels: boolean;
  }
) {
  const supabase = await createClient();

  const { error } = await supabase.from("facility_naming_conventions").upsert(
    {
      facility_id: facilityId,
      organization_id: organizationId,
      ...payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "facility_id" }
  );

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/facilities/${facilityId}/locations`);
  return { success: true, error: null };
}

export async function bulkInsertLocations(
  facilityId: string,
  locations: GeneratedLocation[]
) {
  const supabase = await createClient();

  if (!locations.length) {
    return { success: false, inserted: 0, error: "No locations to insert" };
  }

  // Batch insert in chunks of 250
  const chunkSize = 250;
  let inserted = 0;

  for (let i = 0; i < locations.length; i += chunkSize) {
    const chunk = locations.slice(i, i + chunkSize);
    const { error } = await supabase.from("locations").upsert(chunk, {
      onConflict: "facility_id,full_code",
    });

    if (error) {
      console.error("Batch insert error:", error);
      return { success: false, inserted, error: error.message };
    }
    inserted += chunk.length;
  }

  revalidatePath(`/dashboard/facilities/${facilityId}/locations`);
  return { success: true, inserted, error: null };
}

export async function updateLocation(
  locationId: string,
  facilityId: string,
  updates: Partial<GeneratedLocation>
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("locations")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", locationId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/facilities/${facilityId}/locations`);
  return { success: true, error: null };
}

export async function deleteLocation(locationId: string, facilityId: string) {
  const supabase = await createClient();

  const { error } = await supabase.from("locations").delete().eq("id", locationId);

  if (error) {
    // If blocked by trigger trg_locations_protect_delete
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/facilities/${facilityId}/locations`);
  return { success: true, error: null };
}

export async function resolveLocationCode(facilityId: string, code: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("resolve_location_by_code", {
    p_facility_id: facilityId,
    p_code: code,
  });

  if (error) {
    return { location: null, error: error.message };
  }

  const match = Array.isArray(data) ? data[0] : data;
  return { location: match || null, error: null };
}

export async function importLocationsCsvAction(
  facilityId: string,
  organizationId: string,
  facilityCode: string,
  csvText: string
) {
  const supabase = await createClient();

  // Fetch existing codes to detect duplicate collisions
  const { data: existingRows } = await supabase
    .from("locations")
    .select("full_code")
    .eq("facility_id", facilityId);

  const existingCodes = new Set((existingRows || []).map((r) => r.full_code));

  const result = parseLocationsCsv(csvText, {
    organizationId,
    facilityId,
    facilityCode,
    existingCodes,
  });

  if (result.errors.length > 0 && result.validLocations.length === 0) {
    return {
      success: false,
      insertedCount: 0,
      errors: result.errors,
      totalRows: result.totalRows,
    };
  }

  // Insert valid locations
  let inserted = 0;
  if (result.validLocations.length > 0) {
    const res = await bulkInsertLocations(facilityId, result.validLocations);
    if (!res.success) {
      return {
        success: false,
        insertedCount: 0,
        errors: [{ row: 0, reason: res.error || "Batch insert failed" }],
        totalRows: result.totalRows,
      };
    }
    inserted = res.inserted;
  }

  revalidatePath(`/dashboard/facilities/${facilityId}/locations`);
  return {
    success: true,
    insertedCount: inserted,
    errors: result.errors,
    totalRows: result.totalRows,
  };
}
