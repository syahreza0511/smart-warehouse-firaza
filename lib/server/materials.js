// Server-only read helpers for the material Route Handlers. Queries run with
// the caller's Supabase client, so RLS on materials, categories,
// material_status_events, stock_opname_items, and inventory_transactions
// applies. No imports, so node --test can load this module directly.

export const MATERIAL_COLUMNS =
  "id, category_id, name, category_name, unit, current_stock, minimum_stock, stock_status, is_frozen, archived_at";

// Also maps the jsonb returned by the material RPCs (migration
// 20261110090000), which is a row of material_stock_status.
export function toMaterial(row) {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    categoryName: row.category_name,
    unit: row.unit,
    currentStock: row.current_stock,
    minimumStock: row.minimum_stock,
    stockStatus: row.stock_status,
    isFrozen: row.is_frozen,
    isArchived: row.archived_at != null,
    archivedAt: row.archived_at ?? null,
  };
}

// Active materials by default; archived ones when { archived: true }.
export function listMaterials(supabase, { archived = false } = {}) {
  const query = supabase.from("material_stock_status").select(MATERIAL_COLUMNS);
  return (archived ? query.not("archived_at", "is", null) : query.is("archived_at", null)).order("name");
}

export function getMaterial(supabase, id) {
  return supabase.from("material_stock_status").select(MATERIAL_COLUMNS).eq("id", id).maybeSingle();
}

// Categories are read-only in the MVP (OD-19): seeded, never written by the app.
export function listCategories(supabase) {
  return supabase.from("categories").select("id, name").order("name");
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

export function listStatusEvents(supabase, materialId, limit) {
  return supabase
    .from("material_status_events")
    .select("id, event_type, reason, created_by, created_at")
    .eq("material_id", materialId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
}

// Same actor rule as transactions (OD-28).
export function toStatusEvent(row, viewerId) {
  return {
    id: row.id,
    type: row.event_type,
    reason: row.reason,
    createdAt: row.created_at,
    createdByMe: row.created_by === viewerId,
  };
}

// Hints for the UI only: whether the unit field can still change (FR-MAT-03)
// and whether a permanent delete can succeed (FR-MAT-05). The database
// functions make the real decision under a row lock, so a stale hint only
// changes what the form offers, never what is stored.
// Returns { data: { unitLocked, deletable } } or { error }.
export async function getMaterialUsage(supabase, materialId) {
  const firstRow = (table) => supabase.from(table).select("id").eq("material_id", materialId).limit(1);

  const [transactions, opnameItems, statusEvents] = await Promise.all([
    firstRow("inventory_transactions"),
    firstRow("stock_opname_items"),
    firstRow("material_status_events"),
  ]);

  const error = transactions.error ?? opnameItems.error ?? statusEvents.error;
  if (error) return { error };

  const hasTransactions = transactions.data.length > 0;
  const inOpname = opnameItems.data.length > 0;
  const hasStatusEvents = statusEvents.data.length > 0;

  return {
    data: {
      unitLocked: hasTransactions || inOpname,
      deletable: !hasTransactions && !inOpname && !hasStatusEvents,
    },
  };
}
