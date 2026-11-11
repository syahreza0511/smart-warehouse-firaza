// Server-only read model for the inventory dashboard (PRD FR-DASH-01,
// FR-DASH-02; Project Plan scope #5 and #6). Read-only: every query runs with
// the caller's Supabase client, so RLS on materials and categories applies
// (material_stock_status is security_invoker). No writes, no service role.
//
// Why not GET /api/v1/materials: it returns the full list without a total,
// and PostgREST caps every response at max_rows (1000 in supabase/config.toml)
// without saying so. Totals computed from that list could silently be wrong.
// Here every total is an exact COUNT computed by PostgreSQL, and the attention
// list is bounded and reports how many rows exist in total.
//
// Status comes from the view (stock_status: OUT_OF_STOCK, LOW_STOCK, NORMAL;
// FR-STS-01), never from thresholds in this code. Archived materials are
// excluded everywhere. Quantities are never summed (OD-14: units differ).
//
// Relative imports keep this module loadable by node --test.
import { MATERIAL_COLUMNS, toMaterial } from "./materials.js";

export const ATTENTION_LIMIT = 50;
const STATUSES = ["NORMAL", "LOW_STOCK", "OUT_OF_STOCK"];

const activeCount = (supabase, status) => {
  let query = supabase.from("material_stock_status").select("id", { count: "exact", head: true }).is("archived_at", null);
  if (status) query = query.eq("stock_status", status);
  return query;
};

const attentionRows = (supabase, status, limit) =>
  supabase
    .from("material_stock_status")
    .select(MATERIAL_COLUMNS, { count: "exact" })
    .is("archived_at", null)
    .eq("stock_status", status)
    .order("name")
    .limit(limit);

const isCount = (value) => Number.isInteger(value) && value >= 0;

// Returns { data } or { error } (a PostgREST / transport error, or an
// "unexpected result" error when a count is missing).
export async function loadDashboard(supabase, { limit = ATTENTION_LIMIT } = {}) {
  const [total, normal, low, out, outList, lowList] = await Promise.all([
    activeCount(supabase),
    ...STATUSES.map((status) => activeCount(supabase, status)),
    attentionRows(supabase, "OUT_OF_STOCK", limit),
    attentionRows(supabase, "LOW_STOCK", limit),
  ]);

  const failed = [total, normal, low, out, outList, lowList].find((r) => r.error);
  if (failed) return { error: failed.error };

  const counts = [total.count, normal.count, low.count, out.count, outList.count, lowList.count];
  if (!counts.every(isCount) || !Array.isArray(outList.data) || !Array.isArray(lowList.data)) {
    return { error: { code: "DASHBOARD_UNEXPECTED_RESULT", message: "dashboard counts missing" } };
  }

  // OUT_OF_STOCK first, then LOW_STOCK, each by name; at most `limit` rows.
  const materials = [...outList.data, ...lowList.data].slice(0, limit).map(toMaterial);
  const attentionTotal = outList.count + lowList.count;

  return {
    data: {
      summary: {
        totalActive: total.count,
        normal: normal.count,
        lowStock: low.count,
        outOfStock: out.count,
      },
      // The counts are separate statements; a change committed between them
      // can make them disagree for one load. The page says so instead of
      // showing inconsistent numbers as fact.
      consistent:
        normal.count + low.count + out.count === total.count && low.count === lowList.count && out.count === outList.count,
      attention: {
        total: attentionTotal,
        shown: materials.length,
        materials,
      },
    },
  };
}
