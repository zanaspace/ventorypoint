"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { parseCatalogCsv, exportCatalogToCsv } from "@/lib/catalog/csv-engine";
import { Sku, CatalogCompleteness } from "@/lib/types/catalog";

export async function getSkus(params: {
  clientId?: string;
  query?: string;
  trackingClass?: string;
  rotationRule?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("skus")
    .select(`
      *,
      client:client_accounts(id, name, short_code),
      uoms:sku_uoms(*),
      barcodes:sku_barcodes(*)
    `, { count: "exact" })
    .order("code", { ascending: true });

  if (params.clientId && params.clientId !== "all") {
    query = query.eq("client_account_id", params.clientId);
  }

  if (params.trackingClass && params.trackingClass !== "all") {
    query = query.eq("tracking_class", params.trackingClass);
  }

  if (params.rotationRule && params.rotationRule !== "all") {
    query = query.eq("rotation_rule", params.rotationRule);
  }

  if (params.query?.trim()) {
    const q = params.query.trim();
    query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%,brand.ilike.%${q}%`);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error("Error fetching SKUs:", error);
    return { skus: [], total: 0, error: error.message };
  }

  return { skus: (data || []) as Sku[], total: count || 0, error: null };
}

export async function getClientCompleteness(clientId: string): Promise<CatalogCompleteness> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_client_catalog_completeness", {
    p_client_id: clientId,
  });

  if (error || !data || data.length === 0) {
    return {
      total_skus: 0,
      with_barcode: 0,
      with_dimensions: 0,
      with_weight: 0,
      with_image: 0,
      completeness_score_pct: 0,
    };
  }

  const row = data[0];
  return {
    total_skus: Number(row.total_skus || 0),
    with_barcode: Number(row.with_barcode || 0),
    with_dimensions: Number(row.with_dimensions || 0),
    with_weight: Number(row.with_weight || 0),
    with_image: Number(row.with_image || 0),
    completeness_score_pct: Number(row.completeness_score_pct || 0),
  };
}

export async function resolveBarcodeAction(barcode: string, clientId?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { match: null, error: "Unauthorized" };

  // Get active org
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  if (!member) return { match: null, error: "No organization membership found" };

  const { data, error } = await supabase.rpc("resolve_barcode", {
    p_organization_id: member.organization_id,
    p_barcode: barcode.trim(),
    p_client_id: clientId || null,
  });

  if (error) {
    return { match: null, candidates: [], error: error.message };
  }

  return {
    match: data && data.length === 1 ? data[0] : null,
    candidates: data || [],
    error: null,
  };
}

export async function createSkuAction(payload: {
  organizationId: string;
  clientId: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  brand?: string;
  trackingClass: string;
  serialSource?: string;
  serialCapturePoint?: string;
  rotationRule: string;
  expiryRequired: boolean;
  shelfLifeDays?: number;
  minShelfLifeReceiptDays?: number;
  minShelfLifeShipDays?: number;
  temperatureClass: string;
  hazmatClass?: string;
  fragile?: boolean;
  countryOfOrigin?: string;
  hsCode?: string;
  barcode?: string;
  barcodeType?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  initialStock?: {
    facilityId: string;
    locationId: string;
    quantity: number;
    containerLpn?: string | null;
    lotNumber?: string | null;
    expiryDate?: string | null;
  };
}) {
  const supabase = await createClient();

  // 1. Insert SKU master
  const { data: sku, error: skuError } = await supabase
    .from("skus")
    .insert({
      organization_id: payload.organizationId,
      client_account_id: payload.clientId,
      code: payload.code.trim().toUpperCase(),
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      category: payload.category?.trim() || null,
      brand: payload.brand?.trim() || null,
      tracking_class: payload.trackingClass,
      serial_source: payload.trackingClass.includes("serial") ? payload.serialSource || "manufacturer" : null,
      serial_capture_point: payload.trackingClass.includes("serial") ? payload.serialCapturePoint || "receipt" : null,
      rotation_rule: payload.rotationRule,
      expiry_required: payload.rotationRule === "fefo" ? true : !!payload.expiryRequired,
      shelf_life_days: payload.shelfLifeDays || null,
      min_shelf_life_receipt_days: payload.minShelfLifeReceiptDays || null,
      min_shelf_life_ship_days: payload.minShelfLifeShipDays || null,
      temperature_class: payload.temperatureClass || "ambient",
      hazmat_class: payload.hazmatClass?.trim() || null,
      fragile: !!payload.fragile,
      country_of_origin: payload.countryOfOrigin?.trim() || null,
      hs_code: payload.hsCode?.trim() || null,
    })
    .select()
    .single();

  if (skuError) {
    return { success: false, error: skuError.message };
  }

  // 2. Update default Each UoM with dimensions & weight
  if (payload.weightKg || payload.lengthCm || payload.widthCm || payload.heightCm) {
    await supabase
      .from("sku_uoms")
      .update({
        weight_kg: payload.weightKg || null,
        length_cm: payload.lengthCm || null,
        width_cm: payload.widthCm || null,
        height_cm: payload.heightCm || null,
      })
      .eq("sku_id", sku.id)
      .eq("uom_level", "each");
  }

  // 3. Add primary barcode if provided
  if (payload.barcode?.trim()) {
    const { data: eachUom } = await supabase
      .from("sku_uoms")
      .select("id")
      .eq("sku_id", sku.id)
      .eq("uom_level", "each")
      .single();

    await supabase.from("sku_barcodes").insert({
      organization_id: payload.organizationId,
      client_account_id: payload.clientId,
      sku_id: sku.id,
      uom_id: eachUom?.id || null,
      barcode: payload.barcode.trim(),
      barcode_type: payload.barcodeType || "upc",
      is_primary: true,
    });
  }

  // 4. Record initial opening stock if requested
  if (payload.initialStock && payload.initialStock.quantity > 0) {
    const { data: { user } } = await supabase.auth.getUser();
    const stock = payload.initialStock;

    // Resolve or provision container if LPN specified
    let containerId: string | null = null;
    if (stock.containerLpn?.trim()) {
      const lpn = stock.containerLpn.trim();
      const { data: existingCont } = await supabase
        .from("containers")
        .select("id")
        .eq("facility_id", stock.facilityId)
        .eq("lpn", lpn)
        .maybeSingle();

      if (existingCont?.id) {
        containerId = existingCont.id;
      } else {
        const { data: newCont } = await supabase
          .from("containers")
          .insert({
            organization_id: payload.organizationId,
            facility_id: stock.facilityId,
            lpn,
            container_type: "pallet",
            current_location_id: stock.locationId,
          })
          .select("id")
          .single();
        containerId = newCont?.id || null;
      }
    }

    // Resolve or insert lot if specified
    let lotId: string | null = null;
    if (stock.lotNumber?.trim()) {
      const lotNum = stock.lotNumber.trim();
      const { data: existingLot } = await supabase
        .from("lots")
        .select("id")
        .eq("sku_id", sku.id)
        .eq("lot_number", lotNum)
        .maybeSingle();

      if (existingLot?.id) {
        lotId = existingLot.id;
      } else {
        const { data: newLot } = await supabase
          .from("lots")
          .insert({
            organization_id: payload.organizationId,
            client_account_id: payload.clientId,
            sku_id: sku.id,
            lot_number: lotNum,
            expiry_date: stock.expiryDate || null,
          })
          .select("id")
          .single();
        lotId = newLot?.id || null;
      }
    }

    // Resolve locationId to UUID if user entered code/barcode
    let locationId = stock.locationId.trim();
    const isLocUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId);
    if (!isLocUuid) {
      const { data: loc } = await supabase
        .from("locations")
        .select("id")
        .eq("facility_id", stock.facilityId)
        .or(`full_code.eq.${locationId},barcode.eq.${locationId}`)
        .maybeSingle();
      if (loc?.id) {
        locationId = loc.id;
      }
    }

    // Generate serial numbers if SKU is serialized and none were provided
    let serialsToPass: string[] | null = null;
    if (payload.trackingClass === "serial" || payload.trackingClass === "lot_serial") {
      const count = Math.max(1, Math.min(Math.floor(stock.quantity), 100));
      serialsToPass = Array.from(
        { length: count },
        (_, i) => `${sku.code}-SN-${String(Date.now()).slice(-4)}-${String(i + 1).padStart(3, "0")}`
      );
    }

    // Call canonical receive_into RPC (handles RLS bypass, lot resolution, UPSERT, and event ledger)
    const { error: rpcError } = await supabase.rpc("receive_into", {
      p_facility_id: stock.facilityId,
      p_location_id: locationId,
      p_container_id: containerId || null,
      p_sku_id: sku.id,
      p_lot_number: stock.lotNumber?.trim() || null,
      p_mfg_date: null,
      p_expiry_date: stock.expiryDate || null,
      p_serial_numbers: serialsToPass,
      p_quantity: stock.quantity,
      p_notes: "Initial opening stock recorded via SKU Catalog",
      p_actor_id: user?.id || null,
    });

    if (rpcError) {
      console.error("receive_into error:", rpcError);
      return { success: false, error: rpcError.message };
    }

    revalidatePath("/dashboard/inventory");
    revalidatePath(`/dashboard/clients/${payload.clientId}`);
  }

  revalidatePath("/dashboard/catalog");
  return { success: true, sku };
}

// Multi-Product Batch SKU Creation
export interface BatchSkuItem {
  code?: string;
  name: string;
  barcode?: string;
  trackingClass?: string;
  rotationRule?: string;
  category?: string;
  brand?: string;
  initialStock?: {
    facilityId: string;
    locationId: string;
    quantity: number;
    containerLpn?: string | null;
    lotNumber?: string | null;
    expiryDate?: string | null;
  };
}

export interface CreateBatchSkusPayload {
  organizationId: string;
  clientId: string;
  items: BatchSkuItem[];
}

export async function createBatchSkusAction(payload: CreateBatchSkusPayload) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!payload.organizationId || !payload.clientId) {
    return { success: false, error: "Missing organization or client identifier." };
  }

  if (!payload.items || payload.items.length === 0) {
    return { success: false, error: "Please provide at least one product item." };
  }

  const validItems = payload.items.filter((item) => item.name && item.name.trim().length > 0);
  if (validItems.length === 0) {
    return { success: false, error: "All product items must have a product name." };
  }

  let createdCount = 0;
  let totalOpeningUnits = 0;
  const errors: string[] = [];

  for (let i = 0; i < validItems.length; i++) {
    const item = validItems[i];
    const rowNum = i + 1;

    // Determine or generate SKU code
    let skuCode = (item.code || "").trim().toUpperCase();
    if (!skuCode) {
      skuCode = item.name
        .trim()
        .replace(/[^a-zA-Z0-9\s-]/g, " ")
        .split(/[\s-]+/)
        .filter(Boolean)
        .slice(0, 4)
        .map((w) => (w.length <= 8 ? w.toUpperCase() : w.substring(0, 6).toUpperCase()))
        .join("-");
    }
    if (!skuCode) {
      skuCode = `SKU-${Date.now().toString().slice(-6)}-${rowNum}`;
    }

    const trackingClass = item.trackingClass || "non_unique";
    const rotationRule = item.rotationRule || "fifo";

    const { data: sku, error: skuError } = await supabase
      .from("skus")
      .insert({
        organization_id: payload.organizationId,
        client_account_id: payload.clientId,
        code: skuCode,
        name: item.name.trim(),
        category: item.category?.trim() || null,
        brand: item.brand?.trim() || null,
        tracking_class: trackingClass,
        serial_source: trackingClass.includes("serial") ? "manufacturer" : null,
        serial_capture_point: trackingClass.includes("serial") ? "receipt" : null,
        rotation_rule: rotationRule,
        expiry_required: rotationRule === "fefo",
        temperature_class: "ambient",
      })
      .select()
      .single();

    if (skuError) {
      errors.push(`Row #${rowNum} ("${item.name}"): ${skuError.message}`);
      continue;
    }

    createdCount++;

    // Primary barcode if provided
    if (item.barcode?.trim()) {
      const { data: eachUom } = await supabase
        .from("sku_uoms")
        .select("id")
        .eq("sku_id", sku.id)
        .eq("uom_level", "each")
        .maybeSingle();

      await supabase.from("sku_barcodes").insert({
        organization_id: payload.organizationId,
        client_account_id: payload.clientId,
        sku_id: sku.id,
        uom_id: eachUom?.id || null,
        barcode: item.barcode.trim(),
        barcode_type: "upc",
        is_primary: true,
      });
    }

    // Optional opening stock
    if (item.initialStock && item.initialStock.quantity > 0 && item.initialStock.locationId?.trim()) {
      const stock = item.initialStock;

      let locationId = stock.locationId.trim();
      const isLocUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId);
      if (!isLocUuid) {
        const { data: loc } = await supabase
          .from("locations")
          .select("id")
          .eq("facility_id", stock.facilityId)
          .or(`full_code.eq.${locationId},barcode.eq.${locationId}`)
          .maybeSingle();
        if (loc?.id) {
          locationId = loc.id;
        }
      }

      let containerId: string | null = null;
      if (stock.containerLpn?.trim()) {
        const lpn = stock.containerLpn.trim();
        const { data: existingCont } = await supabase
          .from("containers")
          .select("id")
          .eq("facility_id", stock.facilityId)
          .eq("lpn", lpn)
          .maybeSingle();

        if (existingCont?.id) {
          containerId = existingCont.id;
        } else {
          const { data: newCont } = await supabase
            .from("containers")
            .insert({
              organization_id: payload.organizationId,
              facility_id: stock.facilityId,
              lpn,
              container_type: "pallet",
              current_location_id: locationId,
            })
            .select("id")
            .single();
          containerId = newCont?.id || null;
        }
      }

      let serialsToPass: string[] | null = null;
      if (trackingClass === "serial" || trackingClass === "lot_serial") {
        const count = Math.max(1, Math.min(Math.floor(stock.quantity), 100));
        serialsToPass = Array.from(
          { length: count },
          (_, idx) => `${sku.code}-SN-${String(Date.now()).slice(-4)}-${String(i + 1).padStart(2, "0")}-${String(idx + 1).padStart(3, "0")}`
        );
      }

      const { error: rpcError } = await supabase.rpc("receive_into", {
        p_facility_id: stock.facilityId,
        p_location_id: locationId,
        p_container_id: containerId || null,
        p_sku_id: sku.id,
        p_lot_number: stock.lotNumber?.trim() || null,
        p_mfg_date: null,
        p_expiry_date: stock.expiryDate || null,
        p_serial_numbers: serialsToPass,
        p_quantity: stock.quantity,
        p_notes: `Initial opening stock recorded during batch product creation (${item.name})`,
        p_actor_id: user?.id || null,
      });

      if (!rpcError) {
        totalOpeningUnits += Number(stock.quantity);
      }
    }
  }

  revalidatePath("/dashboard/catalog");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/dashboard/clients/${payload.clientId}`);

  if (errors.length > 0) {
    if (createdCount === 0) {
      return { success: false, error: errors.join(" • ") };
    }
    return {
      success: true,
      partialWarning: `Created ${createdCount} of ${validItems.length} products. Some rows had errors: ${errors.join("; ")}`,
      createdCount,
      totalOpeningUnits,
    };
  }

  return {
    success: true,
    createdCount,
    totalOpeningUnits,
  };
}

export async function updateSkuAction(
  skuId: string,
  payload: {
    name?: string;
    description?: string;
    category?: string;
    brand?: string;
    status?: string;
    trackingClass?: string;
    rotationRule?: string;
    expiryRequired?: boolean;
    shelfLifeDays?: number;
    minShelfLifeReceiptDays?: number;
    temperatureClass?: string;
    hazmatClass?: string;
    fragile?: boolean;
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    barcode?: string;
    addStock?: {
      facilityId: string;
      locationId: string;
      quantity: number;
      containerLpn?: string | null;
      lotNumber?: string | null;
      expiryDate?: string | null;
    };
  }
) {
  const supabase = await createClient();

  const updateFields: any = {
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) updateFields.name = payload.name.trim();
  if (payload.description !== undefined) updateFields.description = payload.description.trim() || null;
  if (payload.category !== undefined) updateFields.category = payload.category.trim() || null;
  if (payload.brand !== undefined) updateFields.brand = payload.brand.trim() || null;
  if (payload.status !== undefined) updateFields.status = payload.status;
  if (payload.trackingClass !== undefined) updateFields.tracking_class = payload.trackingClass;
  if (payload.rotationRule !== undefined) {
    updateFields.rotation_rule = payload.rotationRule;
    if (payload.rotationRule === "fefo") updateFields.expiry_required = true;
  }
  if (payload.expiryRequired !== undefined && payload.rotationRule !== "fefo") {
    updateFields.expiry_required = payload.expiryRequired;
  }
  if (payload.shelfLifeDays !== undefined) updateFields.shelf_life_days = payload.shelfLifeDays || null;
  if (payload.minShelfLifeReceiptDays !== undefined) {
    updateFields.min_shelf_life_receipt_days = payload.minShelfLifeReceiptDays || null;
  }
  if (payload.temperatureClass !== undefined) updateFields.temperature_class = payload.temperatureClass;
  if (payload.hazmatClass !== undefined) updateFields.hazmat_class = payload.hazmatClass?.trim() || null;
  if (payload.fragile !== undefined) updateFields.fragile = payload.fragile;

  const { error: skuError } = await supabase.from("skus").update(updateFields).eq("id", skuId);

  if (skuError) {
    return { success: false, error: skuError.message };
  }

  // Update UoM dimensions if provided
  if (
    payload.weightKg !== undefined ||
    payload.lengthCm !== undefined ||
    payload.widthCm !== undefined ||
    payload.heightCm !== undefined
  ) {
    await supabase
      .from("sku_uoms")
      .update({
        weight_kg: payload.weightKg || null,
        length_cm: payload.lengthCm || null,
        width_cm: payload.widthCm || null,
        height_cm: payload.heightCm || null,
      })
      .eq("sku_id", skuId)
      .eq("uom_level", "each");
  }

  // Update or insert primary barcode if provided
  if (payload.barcode?.trim()) {
    const { data: existingBarcode } = await supabase
      .from("sku_barcodes")
      .select("id")
      .eq("sku_id", skuId)
      .eq("is_primary", true)
      .single();

    if (existingBarcode) {
      await supabase
        .from("sku_barcodes")
        .update({ barcode: payload.barcode.trim() })
        .eq("id", existingBarcode.id);
    }
  }

  // Add physical stock to inventory if requested
  if (payload.addStock && payload.addStock.quantity > 0) {
    const stock = payload.addStock;
    const { data: { user } } = await supabase.auth.getUser();

    const { data: skuRecord } = await supabase
      .from("skus")
      .select("id, organization_id, client_account_id, code, tracking_class")
      .eq("id", skuId)
      .single();

    if (skuRecord) {
      // Container / LPN resolution
      let containerId: string | null = null;
      if (stock.containerLpn?.trim()) {
        const lpn = stock.containerLpn.trim();
        const { data: existingCont } = await supabase
          .from("containers")
          .select("id")
          .eq("facility_id", stock.facilityId)
          .eq("lpn", lpn)
          .maybeSingle();

        if (existingCont?.id) {
          containerId = existingCont.id;
        } else {
          const { data: newCont } = await supabase
            .from("containers")
            .insert({
              organization_id: skuRecord.organization_id,
              facility_id: stock.facilityId,
              lpn,
              container_type: "pallet",
              current_location_id: stock.locationId,
            })
            .select("id")
            .single();
          containerId = newCont?.id || null;
        }
      }

      // Lot resolution
      let lotId: string | null = null;
      if (stock.lotNumber?.trim()) {
        const lotNum = stock.lotNumber.trim();
        const { data: existingLot } = await supabase
          .from("lots")
          .select("id")
          .eq("sku_id", skuId)
          .eq("lot_number", lotNum)
          .maybeSingle();

        if (existingLot?.id) {
          lotId = existingLot.id;
        } else {
          const { data: newLot } = await supabase
            .from("lots")
            .insert({
              organization_id: skuRecord.organization_id,
              client_account_id: skuRecord.client_account_id,
              sku_id: skuId,
              lot_number: lotNum,
              expiry_date: stock.expiryDate || null,
            })
            .select("id")
            .single();
          lotId = newLot?.id || null;
        }
      }

      // Resolve locationId to UUID if user entered code/barcode
      let locationId = stock.locationId.trim();
      const isLocUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId);
      if (!isLocUuid) {
        const { data: loc } = await supabase
          .from("locations")
          .select("id")
          .eq("facility_id", stock.facilityId)
          .or(`full_code.eq.${locationId},barcode.eq.${locationId}`)
          .maybeSingle();
        if (loc?.id) {
          locationId = loc.id;
        }
      }

      // Generate serial numbers if SKU is serialized and none were provided
      let serialsToPass: string[] | null = null;
      const effectiveTrackingClass = payload.trackingClass || skuRecord.tracking_class;
      if (effectiveTrackingClass === "serial" || effectiveTrackingClass === "lot_serial") {
        const count = Math.max(1, Math.min(Math.floor(stock.quantity), 100));
        serialsToPass = Array.from(
          { length: count },
          (_, i) => `${skuRecord.code}-SN-${String(Date.now()).slice(-4)}-${String(i + 1).padStart(3, "0")}`
        );
      }

      // Call canonical receive_into RPC (handles RLS bypass, lot resolution, UPSERT, and event ledger)
      const { error: rpcError } = await supabase.rpc("receive_into", {
        p_facility_id: stock.facilityId,
        p_location_id: locationId,
        p_container_id: containerId || null,
        p_sku_id: skuId,
        p_lot_number: stock.lotNumber?.trim() || null,
        p_mfg_date: null,
        p_expiry_date: stock.expiryDate || null,
        p_serial_numbers: serialsToPass,
        p_quantity: stock.quantity,
        p_notes: "Stock added via SKU Catalog Edit modal",
        p_actor_id: user?.id || null,
      });

      if (rpcError) {
        console.error("receive_into error:", rpcError);
        return { success: false, error: rpcError.message };
      }

      revalidatePath("/dashboard/inventory");
      if (skuRecord.client_account_id) {
        revalidatePath(`/dashboard/clients/${skuRecord.client_account_id}`);
      }
    }
  }

  revalidatePath("/dashboard/catalog");
  return { success: true };
}

export async function getSkuStockSummaryAction(skuId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_balances")
    .select(`
      id,
      on_hand_qty,
      allocated_qty,
      status,
      facility:facilities(id, name, short_code),
      location:locations(id, full_code)
    `)
    .eq("sku_id", skuId);

  if (error || !data) return { totalQty: 0, balances: [] };
  const totalQty = data.reduce((sum, row) => sum + Number(row.on_hand_qty || 0), 0);
  return { totalQty, balances: data };
}

export async function deleteSkuAction(skuId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("skus").delete().eq("id", skuId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/catalog");
  return { success: true };
}

export async function importCatalogCsvAction(
  clientId: string,
  organizationId: string,
  csvText: string
) {
  const parseResult = parseCatalogCsv(csvText);

  if (parseResult.errors.length > 0 && parseResult.validSkus.length === 0) {
    return {
      success: false,
      insertedCount: 0,
      errors: parseResult.errors,
      totalRows: parseResult.totalRows,
    };
  }

  const supabase = await createClient();
  let inserted = 0;
  const insertErrors: { row: number; code?: string; reason: string }[] = [...parseResult.errors];

  // Batch insert SKUs in chunks of 100
  const chunkSize = 100;
  for (let i = 0; i < parseResult.validSkus.length; i += chunkSize) {
    const chunk = parseResult.validSkus.slice(i, i + chunkSize);

    for (const item of chunk) {
      const { data: sku, error } = await supabase
        .from("skus")
        .insert({
          organization_id: organizationId,
          client_account_id: clientId,
          code: item.code,
          name: item.name,
          description: item.description || null,
          category: item.category || null,
          brand: item.brand || null,
          tracking_class: item.tracking_class,
          rotation_rule: item.rotation_rule,
          expiry_required: item.expiry_required,
          shelf_life_days: item.shelf_life_days || null,
          min_shelf_life_receipt_days: item.min_shelf_life_receipt_days || null,
          temperature_class: item.temperature_class,
        })
        .select()
        .single();

      if (error) {
        insertErrors.push({ row: i + 1, code: item.code, reason: error.message });
        continue;
      }

      // Update dimensions on auto-created each UoM
      if (item.weight_kg || item.length_cm || item.width_cm || item.height_cm) {
        await supabase
          .from("sku_uoms")
          .update({
            weight_kg: item.weight_kg || null,
            length_cm: item.length_cm || null,
            width_cm: item.width_cm || null,
            height_cm: item.height_cm || null,
          })
          .eq("sku_id", sku.id)
          .eq("uom_level", "each");
      }

      // Insert primary barcode
      if (item.barcode) {
        await supabase.from("sku_barcodes").insert({
          organization_id: organizationId,
          client_account_id: clientId,
          sku_id: sku.id,
          barcode: item.barcode,
          barcode_type: item.barcode_type || "upc",
          is_primary: true,
        });
      }

      // Insert Master Case if provided
      if (item.case_barcode && item.units_per_case) {
        const { data: caseUom } = await supabase
          .from("sku_uoms")
          .insert({
            organization_id: organizationId,
            sku_id: sku.id,
            uom_level: "case",
            uom_name: `Master Case (${item.units_per_case}ct)`,
            conversion_factor: item.units_per_case,
          })
          .select()
          .single();

        if (caseUom) {
          await supabase.from("sku_barcodes").insert({
            organization_id: organizationId,
            client_account_id: clientId,
            sku_id: sku.id,
            uom_id: caseUom.id,
            barcode: item.case_barcode,
            barcode_type: "gtin14",
            is_primary: true,
          });
        }
      }

      inserted++;
    }
  }

  revalidatePath("/dashboard/catalog");
  return {
    success: true,
    insertedCount: inserted,
    errors: insertErrors,
    totalRows: parseResult.totalRows,
  };
}
