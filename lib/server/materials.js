// Server-only read helpers for the material Route Handlers. Queries run with
// the caller's Supabase client, so RLS on materials, categories, and
// inventory_transactions applies.

const MATERIAL_COLUMNS =
  "id, name, category_name, unit, current_stock, minimum_stock, stock_status, is_frozen, archived_at";

export function toMaterial(row) {
  return {
    id: row.id,
    name: row.name,
    categoryName: row.category_name,
    unit: row.unit,
    currentStock: row.current_stock,
    minimumStock: row.minimum_stock,
    stockStatus: row.stock_status,
    isFrozen: row.is_frozen,
    isArchived: row.archived_at !== null,
  };
}

// Active materials only; archived ones are outside this slice.
export function listMaterials(supabase) {
  return supabase
    .from("material_stock_status")
    .select(MATERIAL_COLUMNS)
    .is("archived_at", null)
    .order("name");
}

export function getMaterial(supabase, id) {
  return supabase.from("material_stock_status").select(MATERIAL_COLUMNS).eq("id", id).maybeSingle();
}

export function listTransactions(supabase, materialId, limit) {
  return supabase
    .from("inventory_transactions")
    .select("id, type, quantity_delta, notes, created_by, created_at")
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
}

// Other users' names are not readable yet (OD-28), so the actor is reported
// only as "you" or "someone else".
export function toTransaction(row, viewerId) {
  return {
    id: row.id,
    type: row.type,
    quantity: Math.abs(row.quantity_delta),
    quantityDelta: row.quantity_delta,
    notes: row.notes,
    createdAt: row.created_at,
    createdByMe: row.created_by === viewerId,
  };
}
