// Unit tests for the inventory dashboard (B5-S2): the read model behind
// GET /api/v1/dashboard with a mocked Supabase query builder, plus source
// checks of the route, page, navigation, and home page. No network, no
// database: these prove the queries and the mapping, not RLS or real counts.
//
// Run: node --test 'tests/unit/*.test.mjs'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { loadDashboard, ATTENTION_LIMIT } = await import(new URL("../../lib/server/dashboard.js", import.meta.url));
const { safeNextPath } = await import(new URL("../../lib/navigation.js", import.meta.url));

const row = (id, name, status, stock, min, unit = "pcs") => ({
  id: `5a200000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  category_id: "c4700000-0000-4000-8000-0000000000c1",
  name,
  category_name: "Packaging",
  unit,
  current_stock: stock,
  minimum_stock: min,
  stock_status: status,
  is_frozen: false,
  archived_at: null,
});

// Answers each query from `table[status ?? "ALL"]` and records the calls.
function mockSupabase(table) {
  const queries = [];
  return {
    queries,
    from(name) {
      const q = { name, filters: [], select: null, opts: null, order: null, limit: null };
      queries.push(q);
      const builder = {
        select(cols, opts) { q.select = cols; q.opts = opts ?? null; return builder; },
        is(col, val) { q.filters.push(["is", col, val]); return builder; },
        eq(col, val) { q.filters.push(["eq", col, val]); return builder; },
        order(col) { q.order = col; return builder; },
        limit(n) { q.limit = n; return builder; },
        then(resolve, reject) {
          const status = q.filters.find(([op, col]) => op === "eq" && col === "stock_status")?.[2] ?? "ALL";
          const entry = table[status];
          const head = q.opts?.head === true;
          const result = entry.error
            ? { data: null, count: null, error: entry.error }
            : { data: head ? null : (entry.rows ?? []).slice(0, q.limit ?? undefined), count: entry.count, error: null };
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

const OUT = [row(1, "Box Kraft", "OUT_OF_STOCK", 0, 10), row(2, "Ribbon", "OUT_OF_STOCK", 0, 5, "roll")];
const LOW = [row(3, "Kardus", "LOW_STOCK", 3, 10), row(4, "Sticker", "LOW_STOCK", 5, 5, "lembar")];
const TABLE = {
  ALL: { count: 9 },
  NORMAL: { count: 5 },
  LOW_STOCK: { count: 2, rows: LOW },
  OUT_OF_STOCK: { count: 2, rows: OUT },
};

test("dashboard: four exact counts of active materials", async () => {
  const supabase = mockSupabase(TABLE);
  const { data } = await loadDashboard(supabase);
  assert.deepEqual(data.summary, { totalActive: 9, normal: 5, lowStock: 2, outOfStock: 2 });
  assert.equal(data.consistent, true);
  const counts = supabase.queries.filter((q) => q.opts?.head === true);
  assert.equal(counts.length, 4);
  for (const q of counts) assert.deepEqual(q.opts, { count: "exact", head: true });
});

test("dashboard: every query reads the database status view and excludes archived materials", async () => {
  const supabase = mockSupabase(TABLE);
  await loadDashboard(supabase);
  assert.equal(supabase.queries.length, 6);
  for (const q of supabase.queries) {
    assert.equal(q.name, "material_stock_status");
    assert.ok(q.filters.some(([op, col, val]) => op === "is" && col === "archived_at" && val === null), "archived excluded");
  }
  const statuses = supabase.queries.map((q) => q.filters.find(([, col]) => col === "stock_status")?.[2] ?? "ALL").sort();
  assert.deepEqual(statuses, ["ALL", "LOW_STOCK", "LOW_STOCK", "NORMAL", "OUT_OF_STOCK", "OUT_OF_STOCK"]);
});

test("dashboard: attention list is OUT_OF_STOCK first, then LOW_STOCK, each by name", async () => {
  const { data } = await loadDashboard(mockSupabase(TABLE));
  assert.deepEqual(data.attention.materials.map((m) => [m.stockStatus, m.name]), [
    ["OUT_OF_STOCK", "Box Kraft"],
    ["OUT_OF_STOCK", "Ribbon"],
    ["LOW_STOCK", "Kardus"],
    ["LOW_STOCK", "Sticker"],
  ]);
  assert.deepEqual([data.attention.total, data.attention.shown], [4, 4]);
  const lists = mockSupabase(TABLE);
  await loadDashboard(lists);
  for (const q of lists.queries.filter((x) => !x.opts?.head)) {
    assert.equal(q.order, "name");
    assert.equal(q.limit, ATTENTION_LIMIT);
    assert.deepEqual(q.opts, { count: "exact" });
  }
});

test("dashboard: the list is bounded but the total is exact; quantities keep their own unit", async () => {
  const { data } = await loadDashboard(mockSupabase(TABLE), { limit: 3 });
  assert.equal(data.attention.shown, 3);
  assert.equal(data.attention.total, 4);
  assert.deepEqual(data.attention.materials.map((m) => m.name), ["Box Kraft", "Ribbon", "Kardus"]);
  assert.deepEqual(data.attention.materials.map((m) => m.unit), ["pcs", "roll", "pcs"]);
  assert.deepEqual(Object.keys(data.summary), ["totalActive", "normal", "lowStock", "outOfStock"], "no summed quantities");
});

test("dashboard: empty inventory and nothing needing attention", async () => {
  const empty = { ALL: { count: 0 }, NORMAL: { count: 0 }, LOW_STOCK: { count: 0, rows: [] }, OUT_OF_STOCK: { count: 0, rows: [] } };
  let { data } = await loadDashboard(mockSupabase(empty));
  assert.deepEqual(data.summary, { totalActive: 0, normal: 0, lowStock: 0, outOfStock: 0 });
  assert.deepEqual(data.attention, { total: 0, shown: 0, materials: [] });
  ({ data } = await loadDashboard(mockSupabase({ ...empty, ALL: { count: 3 }, NORMAL: { count: 3 } })));
  assert.equal(data.attention.total, 0);
  assert.equal(data.consistent, true);
});

test("dashboard: counts that disagree are flagged, not hidden", async () => {
  const { data } = await loadDashboard(mockSupabase({ ...TABLE, ALL: { count: 10 } }));
  assert.equal(data.consistent, false);
});

test("dashboard: a failed or incomplete query is an error, never partial numbers", async () => {
  let r = await loadDashboard(mockSupabase({ ...TABLE, NORMAL: { error: { code: "42501", message: "permission denied" } } }));
  assert.deepEqual(r, { error: { code: "42501", message: "permission denied" } });
  r = await loadDashboard(mockSupabase({ ...TABLE, ALL: { count: null } }));
  assert.equal(r.error.code, "DASHBOARD_UNEXPECTED_RESULT");
  assert.equal(r.data, undefined);
});

test("dashboard route: session and role read access first, read-only, no service role", () => {
  const route = readFileSync(new URL("../../app/api/v1/dashboard/route.js", import.meta.url), "utf8");
  assert.match(route, /export async function GET\(\) \{\s+const ctx = await getAuthContext\(\);\s+if \(ctx\.response\) return ctx\.response;/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  const model = readFileSync(new URL("../../lib/server/dashboard.js", import.meta.url), "utf8");
  for (const src of [route, model]) assert.doesNotMatch(src, /service_role|SERVICE_ROLE|\.rpc\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("dashboard page: data only from the API, exact card labels, archived note, states", () => {
  const page = readFileSync(new URL("../../app/dashboard/page.js", import.meta.url), "utf8");
  assert.match(page, /api\.get\("\/dashboard"\)/);
  for (const label of ["Total Material Aktif", "Stok Normal", "Stok Rendah", "Stok Habis"]) assert.ok(page.includes(`"${label}"`), label);
  for (const text of ["Material arsip tidak dihitung", "Belum ada material aktif", "Tidak ada material yang perlu perhatian", "redirectToLogin", "ErrorState", "LoadingState", "overflow-x-auto", "href={`/materials/${material.id}`}"]) {
    assert.ok(page.includes(text), text);
  }
});

test("navigation: Dashboard link added; leave guard and logout draft cleanup intact; /dashboard allowed after login", () => {
  const header = readFileSync(new URL("../../components/app-header.jsx", import.meta.url), "utf8");
  assert.match(header, /<Link href="\/dashboard"[^>]*>\s+Dashboard\s+<\/Link>/);
  assert.match(header, /onClick=\{logout\} disabled=\{pending\} data-leave-page/);
  assert.equal((header.match(/clearTabCountDrafts\(\);/g) ?? []).length, 2);
  assert.equal(safeNextPath("/dashboard"), "/dashboard");
  assert.equal(safeNextPath("/dashboard/x"), "/materials");
});

test("home page: accurate features, no obsolete or deployment claims", () => {
  const home = readFileSync(new URL("../../app/page.js", import.meta.url), "utf8");
  assert.doesNotMatch(home, /masih dalam pengembangan|Tahap pengembangan|pencatatan Stock In\./);
  assert.doesNotMatch(home, /production|produksi|sudah di-deploy|live/i);
  for (const text of ["Dashboard", "Stock Opname", "Stock In dan Stock Out", "Owner memantau", '/login?next=%2Fdashboard']) assert.ok(home.includes(text), text);
});
