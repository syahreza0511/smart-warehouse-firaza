// Server-only: Stock Opname reads and response mapping. Reads run as the
// signed-in user through RLS (SELECT only); writes go through the RPCs in
// stock-opname-commands.js.
//
// Actors are never returned as ids. Each one is reduced to "is it the
// viewer" (OD-28: "Anda" or "Pengguna lain"); the database keeps the real
// identity in created_by, counted_by, posted_by, and cancelled_by.
//
// Relative imports keep this module loadable by node --test.
import { OPNAME_LIST_LIMIT } from "../validation/stock-opname.js";

const SESSION_COLUMNS =
  "id, status, created_by, created_at, posted_by, posted_at, cancelled_by, cancelled_at, cancel_reason";

const ITEM_COLUMNS =
  "id, material_id, system_stock, counted_stock, counted_by, counted_at, materials(name, unit, current_stock)";

// Known MVP limitation: no pagination; older sessions beyond this are not listed.
export const LIST_LIMIT = OPNAME_LIST_LIMIT;

// Most recent sessions first, optionally one status. Item counts come from
// the embedded counted_stock values.
export function listOpnames(supabase, { status } = {}) {
  let query = supabase
    .from("stock_opname")
    .select("id, status, created_by, created_at, posted_at, cancelled_at, stock_opname_items(counted_stock)")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (status) query = query.eq("status", status);
  return query;
}

export function getOpname(supabase, id) {
  return supabase.from("stock_opname").select(SESSION_COLUMNS).eq("id", id).maybeSingle();
}

export function listOpnameItems(supabase, id) {
  return supabase.from("stock_opname_items").select(ITEM_COLUMNS).eq("stock_opname_id", id);
}

export function toOpnameSummary(row, viewerId) {
  const items = Array.isArray(row.stock_opname_items) ? row.stock_opname_items : [];
  const counted = items.filter((item) => item.counted_stock !== null && item.counted_stock !== undefined).length;
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    createdByMe: row.created_by === viewerId,
    postedAt: row.posted_at ?? null,
    cancelledAt: row.cancelled_at ?? null,
    itemCount: items.length,
    countedCount: counted,
  };
}

// difference = counted - system snapshot (FEATURE-SPECIFICATION §10). It is
// what posting writes as the ADJUSTMENT delta as long as current stock still
// equals the snapshot; stockMismatch flags an active item where it does not,
// which the database would refuse to post (OPNAME_INVARIANT_VIOLATION).
export function toOpnameItem(row, viewerId, status) {
  const material = row.materials ?? {};
  const counted = row.counted_stock ?? null;
  return {
    id: row.id,
    materialId: row.material_id,
    materialName: material.name ?? null,
    unit: material.unit ?? null,
    systemStock: row.system_stock,
    countedStock: counted,
    difference: counted === null ? null : counted - row.system_stock,
    countedAt: row.counted_at ?? null,
    countedByMe: counted === null ? null : row.counted_by === viewerId,
    currentStock: material.current_stock ?? null,
    stockMismatch:
      status === "ACTIVE" && Number.isInteger(material.current_stock) && material.current_stock !== row.system_stock,
  };
}

function compareItems(a, b) {
  return (a.materialName ?? "").localeCompare(b.materialName ?? "", "id") || a.id.localeCompare(b.id);
}

// Totals for the difference summary. Only counted items contribute.
export function summarizeItems(items) {
  const summary = {
    itemCount: items.length,
    countedCount: 0,
    uncountedCount: 0,
    unchangedCount: 0,
    increaseCount: 0,
    decreaseCount: 0,
    mismatchCount: 0,
  };
  for (const item of items) {
    if (item.stockMismatch) summary.mismatchCount += 1;
    if (item.countedStock === null) {
      summary.uncountedCount += 1;
      continue;
    }
    summary.countedCount += 1;
    if (item.difference > 0) summary.increaseCount += 1;
    else if (item.difference < 0) summary.decreaseCount += 1;
    else summary.unchangedCount += 1;
  }
  return summary;
}

// Session detail plus what this viewer may do. The flags are hints for the
// UI only; the database functions decide (creator-only count and post,
// OD-02/OD-16; any Staff may cancel, FR-OPN-14; Owner reads only).
export function toOpname(session, itemRows, viewer) {
  const items = itemRows.map((row) => toOpnameItem(row, viewer.id, session.status)).sort(compareItems);
  const active = session.status === "ACTIVE";
  const isStaff = viewer.role === "STAFF_WAREHOUSE";
  const createdByMe = session.created_by === viewer.id;
  return {
    id: session.id,
    status: session.status,
    createdAt: session.created_at,
    createdByMe,
    postedAt: session.posted_at ?? null,
    postedByMe: session.posted_by ? session.posted_by === viewer.id : null,
    cancelledAt: session.cancelled_at ?? null,
    cancelledByMe: session.cancelled_by ? session.cancelled_by === viewer.id : null,
    cancelReason: session.cancel_reason ?? null,
    items,
    summary: summarizeItems(items),
    permissions: {
      canCount: active && isStaff && createdByMe,
      canPost: active && isStaff && createdByMe,
      canCancel: active && isStaff,
    },
  };
}
