"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { getActiveWorkspaceContext } from "@/lib/org-context";
import {
  InventoryBalance,
  InventoryTransaction,
  Container,
  Lot,
  Serial,
  InventoryAdjustment,
  AdjustmentReason,
  WhereIsResult,
  ItemTimelineEntry,
  InventoryStatus,
  ContainerType,
  ContainerStatus,
} from "@/lib/types/inventory";

// 1. Fetch Balances
export async function getInventoryBalances(params: {
  organizationId?: string;
  facilityId?: string;
  clientId?: string;
  query?: string;
  status?: string;
  stockFilter?: "all" | "in_stock" | "out_of_stock";
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();
  const orgId = params.organizationId || (await getActiveWorkspaceContext())?.activeOrg?.id;
  if (!orgId) {
    return { balances: [], total: 0, error: null };
  }

  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("inventory_balances")
    .select(`
      *,
      location:locations(id, full_code, barcode, human_path, location_type),
      container:containers(id, lpn, container_type),
      sku:skus(id, code, name, tracking_class, rotation_rule, client_account_id),
      lot:lots(id, lot_number, expiry_date, expiry_status),
      serial:serials(id, serial_number, status)
    `, { count: "exact" })
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });

  if (params.stockFilter === "out_of_stock") {
    query = query.eq("on_hand_qty", 0);
  } else if (params.stockFilter === "in_stock") {
    query = query.gt("on_hand_qty", 0);
  } else {
    // Show all balances including 0 on-hand balances (never silently hide out-of-stock items)
    query = query.gte("on_hand_qty", 0);
  }

  if (params.facilityId && params.facilityId !== "all") {
    query = query.eq("facility_id", params.facilityId);
  }

  if (params.clientId && params.clientId !== "all") {
    const { data: clientSkus } = await supabase
      .from("skus")
      .select("id")
      .eq("client_account_id", params.clientId);
    const skuIds = (clientSkus || []).map((s) => s.id);
    if (skuIds.length === 0) {
      return { balances: [], total: 0, error: null };
    }
    query = query.in("sku_id", skuIds);
  }

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params.query?.trim()) {
    const q = params.query.trim();
    query = query.or(`sku.code.ilike.%${q}%,sku.name.ilike.%${q}%,location.full_code.ilike.%${q}%`);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error("Error fetching inventory balances:", error);
    return { balances: [], total: 0, error: error.message };
  }

  return { balances: (data || []) as InventoryBalance[], total: count || 0, error: null };
}

// Quick Inbound Stock Receipt
export async function receiveInventoryAction(payload: {
  facilityId: string;
  skuId: string;
  locationId: string;
  quantity: number;
  containerLpn?: string;
  lotNumber?: string;
  expiryDate?: string;
  serialNumbers?: string[];
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: sku, error: skuErr } = await supabase
    .from("skus")
    .select("id, organization_id, client_account_id, code, tracking_class")
    .eq("id", payload.skuId)
    .single();

  if (skuErr || !sku) {
    return { success: false, error: "SKU not found" };
  }

  // Resolve locationId to UUID if user entered code/barcode
  let locationId = payload.locationId.trim();
  const isLocUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId);
  if (!isLocUuid) {
    const { data: loc } = await supabase
      .from("locations")
      .select("id")
      .eq("facility_id", payload.facilityId)
      .or(`full_code.eq.${locationId},barcode.eq.${locationId}`)
      .maybeSingle();
    if (loc?.id) {
      locationId = loc.id;
    } else {
      return { success: false, error: `Location "${locationId}" was not found in this facility.` };
    }
  }

  // Container / LPN resolution
  let containerId: string | null = null;
  if (payload.containerLpn?.trim()) {
    const lpn = payload.containerLpn.trim();
    const { data: existingCont } = await supabase
      .from("containers")
      .select("id")
      .eq("facility_id", payload.facilityId)
      .eq("lpn", lpn)
      .maybeSingle();

    if (existingCont?.id) {
      containerId = existingCont.id;
    } else {
      const { data: newCont, error: contErr } = await supabase
        .from("containers")
        .insert({
          organization_id: sku.organization_id,
          facility_id: payload.facilityId,
          lpn,
          container_type: "pallet",
          current_location_id: locationId,
        })
        .select("id")
        .single();
      if (contErr) {
        console.error("Error provisioning container:", contErr);
      }
      containerId = newCont?.id || null;
    }
  }

  // Generate serial numbers if SKU is serialized and none were provided
  let serialsToPass: string[] | null = payload.serialNumbers || null;
  if (
    (sku.tracking_class === "serial" || sku.tracking_class === "lot_serial") &&
    (!serialsToPass || serialsToPass.length === 0)
  ) {
    const count = Math.max(1, Math.min(Math.floor(payload.quantity), 100));
    serialsToPass = Array.from(
      { length: count },
      (_, i) => `${sku.code}-SN-${String(Date.now()).slice(-4)}-${String(i + 1).padStart(3, "0")}`
    );
  }

  // Call canonical receive_into RPC (handles RLS bypass, lot resolution, UPSERT, and event ledger)
  const { data, error } = await supabase.rpc("receive_into", {
    p_facility_id: payload.facilityId,
    p_location_id: locationId,
    p_container_id: containerId || null,
    p_sku_id: sku.id,
    p_lot_number: payload.lotNumber?.trim() || null,
    p_mfg_date: null,
    p_expiry_date: payload.expiryDate || null,
    p_serial_numbers: serialsToPass,
    p_quantity: payload.quantity,
    p_notes: payload.notes || "Inbound stock intake recorded via Client Hub",
    p_actor_id: user?.id || null,
  });

  if (error) {
    console.error("Error in receive_into RPC:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/catalog");
  if (sku.client_account_id) {
    revalidatePath(`/dashboard/clients/${sku.client_account_id}`);
  }
  return { success: true, data };
}

// Multi-Line Batch Inbound Receipt
export interface InboundReceiptLineItem {
  skuId: string;
  quantity: number;
  locationId?: string;
  containerLpn?: string;
  lotNumber?: string;
  expiryDate?: string;
  serialNumbers?: string[];
  notes?: string;
}

export interface ReceiveBatchPayload {
  facilityId: string;
  defaultLocationId?: string;
  referenceNumber?: string;
  notes?: string;
  lines: InboundReceiptLineItem[];
}

export async function receiveBatchInventoryAction(payload: ReceiveBatchPayload) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!payload.facilityId) {
    return { success: false, error: "Please select a warehouse facility for the inbound receipt." };
  }

  if (!payload.lines || payload.lines.length === 0) {
    return { success: false, error: "Please add at least one line item to receive." };
  }

  const validLines = payload.lines.filter((l) => l.skuId && l.quantity > 0);
  if (validLines.length === 0) {
    return { success: false, error: "All line items must have a selected SKU and quantity greater than 0." };
  }

  // Pre-fetch all SKUs involved in the batch for quick lookups
  const skuIds = Array.from(new Set(validLines.map((l) => l.skuId)));
  const { data: skus, error: skuFetchError } = await supabase
    .from("skus")
    .select("id, organization_id, client_account_id, code, name, tracking_class, rotation_rule, expiry_required")
    .in("id", skuIds);

  if (skuFetchError || !skus) {
    return { success: false, error: "Failed to load SKU details: " + (skuFetchError?.message || "Unknown error") };
  }

  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const affectedClientIds = new Set<string>();

  let processedCount = 0;
  let totalUnits = 0;
  const errors: string[] = [];

  for (let idx = 0; idx < validLines.length; idx++) {
    const line = validLines[idx];
    const lineNum = idx + 1;
    const sku = skuMap.get(line.skuId);

    if (!sku) {
      errors.push(`Line #${lineNum}: SKU not found.`);
      continue;
    }

    if (sku.client_account_id) {
      affectedClientIds.add(sku.client_account_id);
    }

    // Determine target location: line-specific or header default
    const targetLoc = (line.locationId?.trim() || payload.defaultLocationId?.trim() || "");
    if (!targetLoc) {
      errors.push(`Line #${lineNum} (${sku.name}): Destination rack/bin location is required.`);
      continue;
    }

    // Resolve location to UUID
    let locationId = targetLoc;
    const isLocUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId);
    if (!isLocUuid) {
      const { data: loc } = await supabase
        .from("locations")
        .select("id")
        .eq("facility_id", payload.facilityId)
        .or(`full_code.eq.${locationId},barcode.eq.${locationId}`)
        .maybeSingle();
      if (loc?.id) {
        locationId = loc.id;
      } else {
        errors.push(`Line #${lineNum} (${sku.name}): Location "${targetLoc}" was not found in facility.`);
        continue;
      }
    }

    // Pallet / Container LPN
    let containerId: string | null = null;
    if (line.containerLpn?.trim()) {
      const lpn = line.containerLpn.trim();
      const { data: existingCont } = await supabase
        .from("containers")
        .select("id")
        .eq("facility_id", payload.facilityId)
        .eq("lpn", lpn)
        .maybeSingle();

      if (existingCont?.id) {
        containerId = existingCont.id;
      } else {
        const { data: newCont, error: contErr } = await supabase
          .from("containers")
          .insert({
            organization_id: sku.organization_id,
            facility_id: payload.facilityId,
            lpn,
            container_type: "pallet",
            current_location_id: locationId,
          })
          .select("id")
          .single();
        if (contErr) {
          console.error(`Line #${lineNum}: Error creating container:`, contErr);
        }
        containerId = newCont?.id || null;
      }
    }

    // Serials for serialized SKUs
    let serialsToPass: string[] | null = line.serialNumbers || null;
    if (
      (sku.tracking_class === "serial" || sku.tracking_class === "lot_serial") &&
      (!serialsToPass || serialsToPass.length === 0)
    ) {
      const count = Math.max(1, Math.min(Math.floor(line.quantity), 100));
      serialsToPass = Array.from(
        { length: count },
        (_, i) => `${sku.code}-SN-${String(Date.now()).slice(-4)}-${String(idx + 1).padStart(2, "0")}-${String(i + 1).padStart(3, "0")}`
      );
    }

    // Notes assembly
    const noteParts: string[] = [];
    if (payload.referenceNumber?.trim()) noteParts.push(`Ref: ${payload.referenceNumber.trim()}`);
    if (line.notes?.trim()) noteParts.push(line.notes.trim());
    if (payload.notes?.trim() && !line.notes?.trim()) noteParts.push(payload.notes.trim());
    const finalNotes = noteParts.length > 0 ? noteParts.join(" | ") : "Batch inbound stock receipt";

    // Call canonical receive_into RPC
    const { error: rpcError } = await supabase.rpc("receive_into", {
      p_facility_id: payload.facilityId,
      p_location_id: locationId,
      p_container_id: containerId || null,
      p_sku_id: sku.id,
      p_lot_number: line.lotNumber?.trim() || null,
      p_mfg_date: null,
      p_expiry_date: line.expiryDate || null,
      p_serial_numbers: serialsToPass,
      p_quantity: line.quantity,
      p_notes: finalNotes,
      p_actor_id: user?.id || null,
    });

    if (rpcError) {
      console.error(`Line #${lineNum} error:`, rpcError);
      errors.push(`Line #${lineNum} (${sku.name}): ${rpcError.message}`);
    } else {
      processedCount++;
      totalUnits += Number(line.quantity);
    }
  }

  // Revalidate paths
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/catalog");
  affectedClientIds.forEach((cid) => {
    revalidatePath(`/dashboard/clients/${cid}`);
  });

  if (errors.length > 0) {
    if (processedCount === 0) {
      return { success: false, error: errors.join(" • ") };
    }
    return {
      success: true,
      partialWarning: `Received ${processedCount} of ${validLines.length} line items (${totalUnits} units). Some lines had errors: ${errors.join("; ")}`,
      processedCount,
      totalUnits,
    };
  }

  return {
    success: true,
    processedCount,
    totalUnits,
  };
}

// 2. Fetch Containers (LPNs)
export async function getContainers(params: {
  organizationId?: string;
  facilityId?: string;
  query?: string;
  containerType?: string;
} = {}) {
  const supabase = await createClient();
  const orgId = params.organizationId || (await getActiveWorkspaceContext())?.activeOrg?.id;
  if (!orgId) {
    return { containers: [], error: null };
  }

  let query = supabase
    .from("containers")
    .select(`
      *,
      location:locations(full_code, human_path),
      parent_container:containers!parent_container_id(lpn, container_type)
    `)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (params.facilityId && params.facilityId !== "all") {
    query = query.eq("facility_id", params.facilityId);
  }

  if (params.containerType && params.containerType !== "all") {
    query = query.eq("container_type", params.containerType);
  }

  if (params.query?.trim()) {
    query = query.ilike("lpn", `%${params.query.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching containers:", error);
    return { containers: [], error: error.message };
  }

  return { containers: (data || []) as Container[], error: null };
}

// 3. Fetch Lots (Expiry / Rotation View)
export async function getLots(params: {
  organizationId?: string;
  clientId?: string;
  expiryStatus?: string;
  query?: string;
} = {}) {
  const supabase = await createClient();
  const orgId = params.organizationId || (await getActiveWorkspaceContext())?.activeOrg?.id;
  if (!orgId) {
    return { lots: [], error: null };
  }

  let query = supabase
    .from("lots")
    .select(`
      *,
      sku:skus(code, name, rotation_rule),
      client:client_accounts(name, short_code)
    `)
    .eq("organization_id", orgId)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (params.clientId && params.clientId !== "all") {
    query = query.eq("client_account_id", params.clientId);
  }

  if (params.expiryStatus && params.expiryStatus !== "all") {
    query = query.eq("expiry_status", params.expiryStatus);
  }

  if (params.query?.trim()) {
    query = query.ilike("lot_number", `%${params.query.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching lots:", error);
    return { lots: [], error: error.message };
  }

  return { lots: (data || []) as Lot[], error: null };
}

// 4. Fetch Serials
export async function getSerials(params: {
  organizationId?: string;
  facilityId?: string;
  skuId?: string;
  status?: string;
  query?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();
  const orgId = params.organizationId || (await getActiveWorkspaceContext())?.activeOrg?.id;
  if (!orgId) {
    return { serials: [], total: 0, error: null };
  }

  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("serials")
    .select(`
      *,
      sku:skus(code, name),
      lot:lots(lot_number, expiry_date),
      location:locations(full_code, human_path),
      container:containers(lpn)
    `, { count: "exact" })
    .eq("organization_id", orgId)
    .order("last_moved_at", { ascending: false });

  if (params.facilityId && params.facilityId !== "all") {
    query = query.eq("current_facility_id", params.facilityId);
  }

  if (params.skuId && params.skuId !== "all") {
    query = query.eq("sku_id", params.skuId);
  }

  if (params.status && params.status !== "all") {
    query = query.eq("status", params.status);
  }

  if (params.query?.trim()) {
    query = query.ilike("serial_number", `%${params.query.trim()}%`);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error("Error fetching serials:", error);
    return { serials: [], total: 0, error: error.message };
  }

  return { serials: (data || []) as Serial[], total: count || 0, error: null };
}

// 5. Fetch Pending Adjustments (Approval Queue)
export async function getAdjustments(facilityId?: string, organizationId?: string) {
  const supabase = await createClient();
  const orgId = organizationId || (await getActiveWorkspaceContext())?.activeOrg?.id;
  if (!orgId) {
    return { adjustments: [], error: null };
  }

  let query = supabase
    .from("inventory_adjustments")
    .select(`
      *,
      sku:skus(code, name),
      location:locations(full_code, human_path),
      container:containers(lpn),
      lot:lots(lot_number)
    `)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (facilityId && facilityId !== "all") {
    query = query.eq("facility_id", facilityId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching adjustments:", error);
    return { adjustments: [], error: error.message };
  }

  return { adjustments: (data || []) as InventoryAdjustment[], error: null };
}

// 6. Fetch Transactions (Append-Only Physical History)
export async function getTransactions(params: {
  organizationId?: string;
  facilityId?: string;
  skuId?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();
  const orgId = params.organizationId || (await getActiveWorkspaceContext())?.activeOrg?.id;
  if (!orgId) {
    return { transactions: [], total: 0, error: null };
  }

  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("inventory_transactions")
    .select(`
      *,
      sku:skus(code, name),
      lot:lots(lot_number),
      serial:serials(serial_number),
      from_location:locations!from_location_id(full_code, human_path),
      to_location:locations!to_location_id(full_code, human_path),
      from_container:containers!from_container_id(lpn),
      to_container:containers!to_container_id(lpn)
    `, { count: "exact" })
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (params.facilityId && params.facilityId !== "all") {
    query = query.eq("facility_id", params.facilityId);
  }

  if (params.skuId && params.skuId !== "all") {
    query = query.eq("sku_id", params.skuId);
  }

  const { data, count, error } = await query.range(from, to);

  if (error) {
    console.error("Error fetching transactions:", error);
    return { transactions: [], total: 0, error: error.message };
  }

  return { transactions: (data || []) as InventoryTransaction[], total: count || 0, error: null };
}

// 7. Fetch Adjustment Reasons
export async function getAdjustmentReasons(): Promise<AdjustmentReason[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("adjustment_reasons")
    .select("*")
    .eq("is_active", true)
    .order("code");

  if (error) {
    console.error("Error fetching adjustment reasons:", error);
    return [];
  }

  return data as AdjustmentReason[];
}

// 8. Atomic Move Inventory Action
export async function moveInventoryAction(payload: {
  facilityId: string;
  fromLocationId: string;
  fromContainerId?: string | null;
  toLocationId: string;
  toContainerId?: string | null;
  skuId: string;
  lotId?: string | null;
  serialId?: string | null;
  quantity: number;
  status?: InventoryStatus;
  reason?: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("move_inventory", {
    p_facility_id: payload.facilityId,
    p_from_location_id: payload.fromLocationId,
    p_from_container_id: payload.fromContainerId || null,
    p_to_location_id: payload.toLocationId,
    p_to_container_id: payload.toContainerId || null,
    p_sku_id: payload.skuId,
    p_lot_id: payload.lotId || null,
    p_serial_id: payload.serialId || null,
    p_quantity: payload.quantity,
    p_status: payload.status || "available",
    p_reason: payload.reason || "relocation",
    p_notes: payload.notes || null,
    p_actor_id: user?.id || null,
  });

  if (error) {
    console.error("Error in move_inventory:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, data };
}

// 9. Move Container (LPN) Action
export async function moveContainerAction(payload: {
  lpn: string;
  toLocationId: string;
  toParentContainerId?: string | null;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Find container to get facility
  const { data: container } = await supabase
    .from("containers")
    .select("facility_id")
    .eq("lpn", payload.lpn)
    .maybeSingle();

  const facilityId = container?.facility_id;

  // Resolve toLocationId to UUID
  let locationId = payload.toLocationId.trim();
  const isLocUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locationId);
  if (!isLocUuid) {
    let query = supabase
      .from("locations")
      .select("id, full_code");

    if (facilityId) {
      query = query.eq("facility_id", facilityId);
    }

    const { data: loc } = await query
      .or(`full_code.eq.${locationId},barcode.eq.${locationId}`)
      .maybeSingle();

    if (!loc?.id) {
      return {
        success: false,
        error: `Location "${locationId}" was not found in this facility. Please enter a valid location code (e.g. PDC5-A01-01-A or MYA-W1-CAGE-03).`,
      };
    }
    locationId = loc.id;
  }

  // Resolve toParentContainerId to UUID
  let parentContainerId = payload.toParentContainerId?.trim() || null;
  if (parentContainerId) {
    const isParentUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentContainerId);
    if (!isParentUuid) {
      let contQuery = supabase
        .from("containers")
        .select("id, lpn");

      if (facilityId) {
        contQuery = contQuery.eq("facility_id", facilityId);
      }

      const { data: parentCont } = await contQuery
        .eq("lpn", parentContainerId)
        .maybeSingle();

      if (!parentCont?.id) {
        return {
          success: false,
          error: `Parent container "${parentContainerId}" was not found. Please verify the LPN.`,
        };
      }
      parentContainerId = parentCont.id;
    }
  }

  const { data, error } = await supabase.rpc("move_container", {
    p_lpn: payload.lpn,
    p_to_location_id: locationId,
    p_to_parent_container_id: parentContainerId,
    p_notes: payload.notes || null,
    p_actor_id: user?.id || null,
  });

  if (error) {
    console.error("Error in move_container:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, data };
}

// 10. Adjust Inventory Action (Threshold Enforced)
export async function adjustInventoryAction(payload: {
  facilityId: string;
  locationId: string;
  containerId?: string | null;
  skuId: string;
  lotId?: string | null;
  serialId?: string | null;
  quantityDelta: number;
  reasonCode: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("adjust_inventory", {
    p_facility_id: payload.facilityId,
    p_location_id: payload.locationId,
    p_container_id: payload.containerId || null,
    p_sku_id: payload.skuId,
    p_lot_id: payload.lotId || null,
    p_serial_id: payload.serialId || null,
    p_quantity_delta: payload.quantityDelta,
    p_reason_code: payload.reasonCode,
    p_notes: payload.notes || null,
    p_actor_id: user?.id || null,
  });

  if (error) {
    console.error("Error in adjust_inventory:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, data };
}

// 11. Approve Inventory Adjustment Action
export async function approveAdjustmentAction(adjustmentId: string, notes?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("approve_inventory_adjustment", {
    p_adjustment_id: adjustmentId,
    p_reviewer_id: user?.id,
    p_reviewer_role: "supervisor",
    p_notes: notes || null,
  });

  if (error) {
    console.error("Error approving adjustment:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, data };
}

// 12. Reject Inventory Adjustment Action
export async function rejectAdjustmentAction(adjustmentId: string, reason: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("reject_inventory_adjustment", {
    p_adjustment_id: adjustmentId,
    p_reviewer_id: user?.id,
    p_reviewer_role: "supervisor",
    p_rejection_reason: reason,
  });

  if (error) {
    console.error("Error rejecting adjustment:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, data };
}

// 13. Change Inventory Status Action
export async function changeInventoryStatusAction(payload: {
  facilityId: string;
  locationId: string;
  containerId?: string | null;
  skuId: string;
  lotId?: string | null;
  serialId?: string | null;
  quantity: number;
  fromStatus: InventoryStatus;
  toStatus: InventoryStatus;
  reason: string;
  notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc("change_inventory_status", {
    p_facility_id: payload.facilityId,
    p_location_id: payload.locationId,
    p_container_id: payload.containerId || null,
    p_sku_id: payload.skuId,
    p_lot_id: payload.lotId || null,
    p_serial_id: payload.serialId || null,
    p_quantity: payload.quantity,
    p_from_status: payload.fromStatus,
    p_to_status: payload.toStatus,
    p_reason: payload.reason,
    p_notes: payload.notes || null,
    p_actor_id: user?.id || null,
  });

  if (error) {
    console.error("Error changing status:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, data };
}

// 14. Unified "Where Is It?" Search
export async function whereIsItAction(query: string, facilityId?: string): Promise<WhereIsResult[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("where_is_it", {
    p_query: query,
    p_facility_id: facilityId && facilityId !== "all" ? facilityId : null,
  });

  if (error) {
    console.error("Error in where_is_it RPC:", error);
    return [];
  }

  return (data || []) as WhereIsResult[];
}

// 15. Item Timeline Action
export async function getItemTimelineAction(itemType: string, itemId: string): Promise<ItemTimelineEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_item_timeline", {
    p_item_type: itemType,
    p_item_id: itemId,
    p_limit: 50,
  });

  if (error) {
    console.error("Error in get_item_timeline:", error);
    return [];
  }

  return (data || []) as ItemTimelineEntry[];
}

// 16. Evaluate Expiry Statuses Action
export async function evaluateExpiryAction() {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("evaluate_expiry_statuses");

  if (error) {
    console.error("Error evaluating expiry:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, data };
}

// 17. Run Reconciliation Action
export async function runReconciliationAction(facilityId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("reconcile_inventory_balances", {
    p_facility_id: facilityId,
  });

  if (error) {
    console.error("Error reconciling inventory:", error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

// 18. Create Container (LPN) Action
export async function createContainerAction(payload: {
  facilityId: string;
  lpn: string;
  containerType: ContainerType;
  currentLocationId?: string | null;
  parentContainerId?: string | null;
  tareWeightKg?: number;
  maxWeightKg?: number;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!payload.facilityId || payload.facilityId === "all") {
    return { success: false, error: "Please select a specific facility to provision an LPN." };
  }

  // Get user org
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user?.id)
    .single();

  const orgId = member?.organization_id;

  // Resolve location code or barcode to UUID if provided
  let locationId: string | null = null;
  if (payload.currentLocationId?.trim()) {
    const locInput = payload.currentLocationId.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(locInput);
    if (isUuid) {
      locationId = locInput;
    } else {
      const { data: loc } = await supabase
        .from("locations")
        .select("id")
        .eq("facility_id", payload.facilityId)
        .or(`full_code.eq.${locInput},barcode.eq.${locInput}`)
        .maybeSingle();
      locationId = loc?.id || null;
    }
  }

  // Resolve parent container LPN to UUID if provided
  let parentId: string | null = null;
  if (payload.parentContainerId?.trim()) {
    const parentInput = payload.parentContainerId.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentInput);
    if (isUuid) {
      parentId = parentInput;
    } else {
      const { data: parentCont } = await supabase
        .from("containers")
        .select("id")
        .eq("facility_id", payload.facilityId)
        .eq("lpn", parentInput)
        .maybeSingle();
      parentId = parentCont?.id || null;
    }
  }

  const { data, error } = await supabase
    .from("containers")
    .insert({
      organization_id: orgId,
      facility_id: payload.facilityId,
      lpn: payload.lpn.trim(),
      container_type: payload.containerType,
      current_location_id: locationId,
      parent_container_id: parentId,
      tare_weight_kg: payload.tareWeightKg || 0,
      max_weight_kg: payload.maxWeightKg || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating container:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, container: data as Container };
}

// 19. Update Container (LPN) Action
export async function updateContainerAction(payload: {
  id: string;
  containerType?: ContainerType;
  tareWeightKg?: number;
  maxWeightKg?: number | null;
  status?: ContainerStatus;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.containerType !== undefined) updateData.container_type = payload.containerType;
  if (payload.tareWeightKg !== undefined) updateData.tare_weight_kg = payload.tareWeightKg;
  if (payload.maxWeightKg !== undefined) updateData.max_weight_kg = payload.maxWeightKg;
  if (payload.status !== undefined) updateData.status = payload.status;
  if (payload.metadata !== undefined) updateData.metadata = payload.metadata;

  const { data, error } = await supabase
    .from("containers")
    .update(updateData)
    .eq("id", payload.id)
    .select()
    .single();

  if (error) {
    console.error("Error updating container:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true, container: data as Container };
}

// 20. Delete Container (LPN) Action (Guarded against active stock)
export async function deleteContainerAction(containerId: string) {
  const supabase = await createClient();

  // 1. Check for active balances in container
  const { data: balances, error: balError } = await supabase
    .from("inventory_balances")
    .select("id, on_hand_qty")
    .eq("container_id", containerId)
    .gt("on_hand_qty", 0);

  if (balError) {
    return { success: false, error: balError.message };
  }

  if (balances && balances.length > 0) {
    return {
      success: false,
      error: `Cannot delete container: it currently holds ${balances.length} active inventory item(s). Relocate or unload the stock first.`,
    };
  }

  // 2. Check for child nested containers
  const { data: children, error: childError } = await supabase
    .from("containers")
    .select("id, lpn")
    .eq("parent_container_id", containerId);

  if (childError) {
    return { success: false, error: childError.message };
  }

  if (children && children.length > 0) {
    return {
      success: false,
      error: `Cannot delete container: it is the parent for ${children.length} nested child container(s) (${children.map((c) => c.lpn).join(", ")}). Unlink them first.`,
    };
  }

  // 3. Delete container record
  const { error: delError } = await supabase
    .from("containers")
    .delete()
    .eq("id", containerId);

  if (delError) {
    console.error("Error deleting container:", delError);
    return { success: false, error: delError.message };
  }

  revalidatePath("/dashboard/inventory");
  return { success: true };
}

// 21. Get Facility Locations Action
export interface FacilityLocationOption {
  id: string;
  full_code: string;
  barcode: string | null;
  human_path: string | null;
  location_type: string;
}

export async function getFacilityLocationsAction(facilityId: string): Promise<FacilityLocationOption[]> {
  const supabase = await createClient();
  let query = supabase
    .from("locations")
    .select("id, full_code, barcode, human_path, location_type")
    .order("full_code", { ascending: true });

  if (facilityId && facilityId !== "all") {
    query = query.eq("facility_id", facilityId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching facility locations:", error);
    return [];
  }
  return (data || []) as FacilityLocationOption[];
}
