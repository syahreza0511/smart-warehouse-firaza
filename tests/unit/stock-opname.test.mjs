// Unit and static tests for Stock Opname (B4-S1): request schemas, the
// command layer behind the Route Handlers (mocked Supabase client), read
// mappers and UI hints, client outcome handling, post-login paths, and a
// static review of migration 20261110120000.
//
// No network, no database, no Supabase Auth. These tests do NOT prove that
// the SQL runs, that row locks serialize concurrent posts and cancels, or
// that RLS and grants hold in PostgreSQL; the static checks only prove what
// the migration text says. Database integration tests are still required.
//
// Run: node --test 'tests/unit/*.test.mjs'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schemas = await import(new URL("../../lib/validation/stock-opname.js", import.meta.url));
const commands = await import(new URL("../../lib/server/stock-opname-commands.js", import.meta.url));
const reads = await import(new URL("../../lib/server/stock-opnames.js", import.meta.url));
const outcome = await import(new URL("../../lib/stock-opname-outcome.js", import.meta.url));
const { safeNextPath, DEFAULT_AFTER_LOGIN } = await import(new URL("../../lib/navigation.js", import.meta.url));

const OPNAME = "0b000000-0000-4000-8000-0000000000a1";
const OTHER_OPNAME = "0b000000-0000-4000-8000-0000000000a2";
const ITEM_1 = "17e00000-0000-4000-8000-000000000001";
const ITEM_2 = "17e00000-0000-4000-8000-000000000002";
const MAT_1 = "5a200000-0000-4000-8000-0000000000a1";
const MAT_2 = "5a200000-0000-4000-8000-0000000000a2";
const CREATOR = "116d642c-0000-4000-8000-000000000001";
const OTHER_STAFF = "116d642c-0000-4000-8000-000000000002";
const OWNER = "116d642c-0000-4000-8000-000000000003";
const KEY = "d9e00000-0000-4000-8000-000000000001";

function mockSupabase(...results) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return results.length > 1 ? results.shift() : results[0];
    },
  };
}

const pgError = (code, message) => ({ code, message });
const json = (response) => response.json();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
test("create schema: one or more unique material UUIDs", () => {
  assert.equal(schemas.createOpnameRequestSchema.safeParse({ materialIds: [MAT_1, MAT_2] }).success, true);
  for (const materialIds of [[], undefined, ["kain"], [MAT_1, MAT_1], [MAT_1, MAT_1.toUpperCase()], "x"]) {
    assert.equal(schemas.createOpnameRequestSchema.safeParse({ materialIds }).success, false, JSON.stringify(materialIds));
  }
  const tooMany = Array.from({ length: 201 }, (_, i) => `5a200000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  assert.equal(schemas.createOpnameRequestSchema.safeParse({ materialIds: tooMany }).success, false);
});

test("create schema drops actor and stock fields", () => {
  const parsed = schemas.createOpnameRequestSchema.parse({ materialIds: [MAT_1], createdBy: OWNER, currentStock: 9 });
  assert.deepEqual(Object.keys(parsed), ["materialIds"]);
});

test("count schema: integers >= 0, one entry per item", () => {
  const ok = schemas.recordCountsRequestSchema.safeParse({ counts: [{ itemId: ITEM_1, countedStock: 0 }, { itemId: ITEM_2, countedStock: 12 }] });
  assert.equal(ok.success, true);
  for (const countedStock of [-1, 1.5, "5", null, Number.NaN, 2147483648]) {
    const r = schemas.recordCountsRequestSchema.safeParse({ counts: [{ itemId: ITEM_1, countedStock }] });
    assert.equal(r.success, false, String(countedStock));
  }
  assert.equal(schemas.recordCountsRequestSchema.safeParse({ counts: [] }).success, false);
  assert.equal(
    schemas.recordCountsRequestSchema.safeParse({ counts: [{ itemId: ITEM_1, countedStock: 1 }, { itemId: ITEM_1, countedStock: 2 }] }).success,
    false
  );
  const stripped = schemas.recordCountsRequestSchema.parse({ counts: [{ itemId: ITEM_1, countedStock: 3, countedBy: OWNER }] });
  assert.deepEqual(stripped.counts[0], { itemId: ITEM_1, countedStock: 3 });
});

test("cancel schema: reason required, trimmed, max 500", () => {
  assert.equal(schemas.cancelOpnameRequestSchema.parse({ reason: "  salah pilih material  " }).reason, "salah pilih material");
  for (const reason of ["", "   ", undefined, "r".repeat(501)]) {
    assert.equal(schemas.cancelOpnameRequestSchema.safeParse({ reason }).success, false);
  }
});

test("post schema accepts nothing from the body", () => {
  assert.deepEqual(schemas.postOpnameRequestSchema.parse({ currentStock: 100, postedBy: OWNER }), {});
});

// ---------------------------------------------------------------------------
// Command layer
// ---------------------------------------------------------------------------
test("create: key and body are checked before the RPC", async () => {
  const supabase = mockSupabase({ data: null, error: null });
  let r = await commands.createOpname(supabase, { materialIds: [MAT_1] }, null);
  assert.equal(r.status, 400);
  assert.equal((await json(r)).error.code, "IDEMPOTENCY_KEY_REQUIRED");
  r = await commands.createOpname(supabase, { materialIds: [MAT_1] }, "not-a-uuid");
  assert.equal(r.status, 400);
  r = await commands.createOpname(supabase, { materialIds: [] }, KEY);
  assert.equal(r.status, 400);
  assert.equal((await json(r)).error.code, "VALIDATION_ERROR");
  r = await commands.createOpname(supabase, { materialIds: [MAT_1, MAT_1] }, KEY);
  assert.equal(r.status, 400);
  assert.equal(supabase.calls.length, 0);
});

test("create: sends only the material list and key; 201 with the session id", async () => {
  const supabase = mockSupabase({
    data: { opname_id: OPNAME, status: "ACTIVE", item_count: 2, created_at: "2026-11-10T05:00:00Z" },
    error: null,
  });
  const r = await commands.createOpname(supabase, { materialIds: [MAT_1, MAT_2], createdBy: OWNER }, KEY);
  assert.equal(r.status, 201);
  assert.deepEqual(supabase.calls, [
    { name: "create_stock_opname", args: { p_material_ids: [MAT_1, MAT_2], p_idempotency_key: KEY } },
  ]);
  assert.deepEqual((await json(r)).opname, { id: OPNAME, status: "ACTIVE", itemCount: 2, createdAt: "2026-11-10T05:00:00Z" });
});

test("create: invalid, duplicate, archived, frozen, missing materials map to 400/409", async () => {
  const cases = [
    ["DUPLICATE_MATERIAL", 400],
    ["OPNAME_MATERIALS_REQUIRED", 400],
    ["MATERIAL_NOT_FOUND", 409],
    ["MATERIAL_ARCHIVED", 409],
    ["MATERIAL_ALREADY_IN_OPNAME", 409],
    ["IDEMPOTENCY_KEY_REUSED", 422],
  ];
  for (const [code, status] of cases) {
    const r = await commands.createOpname(mockSupabase({ data: null, error: pgError("P0001", code) }), { materialIds: [MAT_1] }, KEY);
    assert.equal(r.status, status, code);
    assert.equal((await json(r)).error.code, code);
  }
});

test("create by OWNER: database FORBIDDEN maps to 403", async () => {
  const r = await commands.createOpname(mockSupabase({ data: null, error: pgError("42501", "FORBIDDEN") }), { materialIds: [MAT_1] }, KEY);
  assert.equal(r.status, 403);
  assert.equal((await json(r)).error.code, "FORBIDDEN");
  const r2 = await commands.createOpname(mockSupabase({ data: null, error: pgError("42501", "UNAUTHORIZED") }), { materialIds: [MAT_1] }, KEY);
  assert.equal((await json(r2)).error.code, "SESSION_NOT_AUTHORIZED");
});

test("counts: mapped to item_id/counted_stock; creator-only and state errors", async () => {
  const supabase = mockSupabase({ data: { opname_id: OPNAME, updated: 2 }, error: null });
  const r = await commands.recordCounts(supabase, OPNAME, {
    counts: [{ itemId: ITEM_1, countedStock: 0 }, { itemId: ITEM_2, countedStock: 7 }],
  });
  assert.equal(r.status, 200);
  assert.deepEqual(supabase.calls[0], {
    name: "record_stock_opname_counts",
    args: { p_opname_id: OPNAME, p_counts: [{ item_id: ITEM_1, counted_stock: 0 }, { item_id: ITEM_2, counted_stock: 7 }] },
  });
  assert.deepEqual((await json(r)).result, { id: OPNAME, updated: 2 });

  for (const [code, status] of [["OPNAME_CREATOR_ONLY", 403], ["OPNAME_NOT_ACTIVE", 409], ["OPNAME_ITEM_NOT_FOUND", 409], ["INVALID_COUNTED_STOCK", 400], ["OPNAME_NOT_FOUND", 404]]) {
    const res = await commands.recordCounts(mockSupabase({ data: null, error: pgError("P0001", code) }), OPNAME, { counts: [{ itemId: ITEM_1, countedStock: 1 }] });
    assert.equal(res.status, status, code);
  }
  const bad = mockSupabase({ data: null, error: null });
  assert.equal((await commands.recordCounts(bad, "abc", { counts: [{ itemId: ITEM_1, countedStock: 1 }] })).status, 400);
  assert.equal((await commands.recordCounts(bad, OPNAME, { counts: [{ itemId: ITEM_1, countedStock: -1 }] })).status, 400);
  assert.equal(bad.calls.length, 0);
});

test("post: sends only the session id; maps adjustments; ignores body", async () => {
  const supabase = mockSupabase({
    data: {
      opname_id: OPNAME,
      status: "POSTED",
      posted_at: "2026-11-10T06:00:00Z",
      item_count: 2,
      adjustments: [{ item_id: ITEM_1, material_id: MAT_1, quantity_delta: -4, transaction_id: "7a000000-0000-4000-8000-000000000001" }],
    },
    error: null,
  });
  const r = await commands.postOpname(supabase, OPNAME, { currentStock: 1, postedBy: OWNER });
  assert.equal(r.status, 200);
  assert.deepEqual(supabase.calls, [{ name: "post_stock_opname", args: { p_opname_id: OPNAME } }]);
  const result = (await json(r)).result;
  assert.equal(result.status, "POSTED");
  assert.deepEqual(result.adjustments, [{ itemId: ITEM_1, materialId: MAT_1, quantityDelta: -4, transactionId: "7a000000-0000-4000-8000-000000000001" }]);
});

test("post by another Staff, incomplete, empty, inconsistent", async () => {
  for (const [code, status] of [["OPNAME_CREATOR_ONLY", 403], ["OPNAME_UNCOUNTED", 409], ["OPNAME_EMPTY", 409], ["OPNAME_INVARIANT_VIOLATION", 409]]) {
    const r = await commands.postOpname(mockSupabase({ data: null, error: pgError("P0001", code) }), OPNAME, {});
    assert.equal(r.status, status, code);
    assert.equal((await json(r)).error.code, code);
  }
});

test("repeat post and repeat cancel are rejections, never a 200", async () => {
  const supabase = mockSupabase(
    { data: { opname_id: OPNAME, status: "POSTED", posted_at: "2026-11-10T06:00:00Z", item_count: 1, adjustments: [] }, error: null },
    { data: null, error: pgError("P0001", "OPNAME_NOT_ACTIVE") }
  );
  const first = await commands.postOpname(supabase, OPNAME, {});
  const second = await commands.postOpname(supabase, OPNAME, {});
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
  assert.equal((await json(second)).error.code, "OPNAME_NOT_ACTIVE");

  const cancelAgain = await commands.cancelOpname(mockSupabase({ data: null, error: pgError("P0001", "OPNAME_NOT_ACTIVE") }), OPNAME, { reason: "ulang" });
  assert.equal(cancelAgain.status, 409);
});

test("concurrent post and cancel: the loser gets OPNAME_NOT_ACTIVE (mocked order)", async () => {
  // The database serializes both on the session row lock (static test below);
  // here the second answer is what the API returns to the loser.
  const supabase = mockSupabase(
    { data: { opname_id: OPNAME, status: "CANCELLED", cancelled_at: "2026-11-10T06:00:00Z", released: 2 }, error: null },
    { data: null, error: pgError("P0001", "OPNAME_NOT_ACTIVE") }
  );
  const [cancel, post] = await Promise.all([
    commands.cancelOpname(supabase, OPNAME, { reason: "dibatalkan" }),
    commands.postOpname(supabase, OPNAME, {}),
  ]);
  assert.equal(cancel.status, 200);
  assert.equal(post.status, 409);
  const failure = outcome.describeOpnameFailure({ status: 409, code: "OPNAME_NOT_ACTIVE", message: "x" });
  assert.equal(failure.outcome, outcome.REJECTED);
  assert.equal(failure.reload, true);
  assert.doesNotMatch(failure.message, /berhasil/i);
});

test("cancel: reason required before the RPC; actor fields ignored", async () => {
  const supabase = mockSupabase({ data: { opname_id: OPNAME, status: "CANCELLED", cancelled_at: "2026-11-10T06:00:00Z", released: 2 }, error: null });
  let r = await commands.cancelOpname(supabase, OPNAME, { reason: "   " });
  assert.equal(r.status, 400);
  assert.equal(supabase.calls.length, 0);
  r = await commands.cancelOpname(supabase, OPNAME, { reason: "  salah hitung  ", cancelledBy: OWNER });
  assert.equal(r.status, 200);
  assert.deepEqual(supabase.calls[0], { name: "cancel_stock_opname", args: { p_opname_id: OPNAME, p_reason: "salah hitung" } });
  assert.equal((await json(r)).result.released, 2);
  const missing = await commands.cancelOpname(mockSupabase({ data: null, error: pgError("P0001", "REASON_REQUIRED") }), OPNAME, { reason: "x" });
  assert.equal(missing.status, 400);
});

test("transient and unknown database outcomes", async () => {
  const notApplied = commands.opnameRpcErrorResponse(pgError("55P03", "lock timeout"));
  assert.equal(notApplied.status, 503);
  assert.equal(notApplied.headers.get("Retry-After"), "2");
  assert.equal((await json(notApplied)).error.code, "OPERATION_NOT_APPLIED");
  for (const error of [pgError("08006", "x"), { message: "fetch failed" }]) {
    const r = commands.opnameRpcErrorResponse(error);
    assert.equal(r.status, 503);
    assert.equal((await json(r)).error.code, "OUTCOME_UNKNOWN");
  }
  const internal = commands.opnameRpcErrorResponse(pgError("P0001", "IDEMPOTENCY_STATE_INVALID"));
  assert.equal(internal.status, 500);
  assert.equal(commands.opnameRpcErrorResponse(pgError("P0001", "toString")).status, 500);
});

test("malformed or mismatched RPC results are unknown outcomes, not success", async () => {
  for (const data of [null, {}, { opname_id: "x" }, { opname_id: OTHER_OPNAME }]) {
    const r = await commands.postOpname(mockSupabase({ data, error: null }), OPNAME, {});
    assert.equal(r.status, 500, JSON.stringify(data));
    assert.equal((await json(r)).error.code, "OUTCOME_UNKNOWN");
  }
});

test("every mapped business code has a valid HTTP status", () => {
  for (const [code, [status, text]] of Object.entries(commands.OPNAME_ERRORS)) {
    assert.ok(status >= 400 && status < 500, code);
    assert.ok(text.length > 0, code);
  }
});

// ---------------------------------------------------------------------------
// Read mappers and UI hints
// ---------------------------------------------------------------------------
const SESSION = {
  id: OPNAME,
  status: "ACTIVE",
  created_by: CREATOR,
  created_at: "2026-11-10T05:00:00Z",
  posted_by: null,
  posted_at: null,
  cancelled_by: null,
  cancelled_at: null,
  cancel_reason: null,
};

const ITEMS = [
  { id: ITEM_1, material_id: MAT_1, system_stock: 100, counted_stock: 96, counted_by: CREATOR, counted_at: "2026-11-10T05:10:00Z", materials: { name: "Kardus Medium", unit: "pcs", current_stock: 100 } },
  { id: ITEM_2, material_id: MAT_2, system_stock: 40, counted_stock: 40, counted_by: CREATOR, counted_at: "2026-11-10T05:11:00Z", materials: { name: "Benang", unit: "gulung", current_stock: 40 } },
  { id: "17e00000-0000-4000-8000-000000000003", material_id: "5a200000-0000-4000-8000-0000000000a3", system_stock: 5, counted_stock: 8, counted_by: CREATOR, counted_at: "2026-11-10T05:12:00Z", materials: { name: "Ribbon", unit: "roll", current_stock: 5 } },
  { id: "17e00000-0000-4000-8000-000000000004", material_id: "5a200000-0000-4000-8000-0000000000a4", system_stock: 9, counted_stock: null, counted_by: null, counted_at: null, materials: { name: "Zipper", unit: "pcs", current_stock: 9 } },
];

test("difference = counted - system; zero, positive, negative, uncounted", () => {
  const opname = reads.toOpname(SESSION, ITEMS, { id: CREATOR, role: "STAFF_WAREHOUSE" });
  const byName = Object.fromEntries(opname.items.map((i) => [i.materialName, i]));
  assert.equal(byName["Kardus Medium"].difference, -4);
  assert.equal(byName.Benang.difference, 0);
  assert.equal(byName.Ribbon.difference, 3);
  assert.equal(byName.Zipper.difference, null);
  assert.deepEqual(opname.summary, {
    itemCount: 4, countedCount: 3, uncountedCount: 1, unchangedCount: 1, increaseCount: 1, decreaseCount: 1, mismatchCount: 0,
  });
  assert.deepEqual(opname.items.map((i) => i.materialName), ["Benang", "Kardus Medium", "Ribbon", "Zipper"]);
});

test("stock snapshot mismatch is flagged on an active session only", () => {
  const drifted = [{ ...ITEMS[0], materials: { ...ITEMS[0].materials, current_stock: 99 } }];
  assert.equal(reads.toOpname(SESSION, drifted, { id: CREATOR, role: "STAFF_WAREHOUSE" }).summary.mismatchCount, 1);
  const posted = { ...SESSION, status: "POSTED", posted_by: CREATOR, posted_at: "2026-11-10T06:00:00Z" };
  assert.equal(reads.toOpname(posted, drifted, { id: CREATOR, role: "STAFF_WAREHOUSE" }).summary.mismatchCount, 0);
});

test("permissions: creator counts and posts, other Staff cancels only, Owner reads only", () => {
  const perms = (viewer, session = SESSION) => reads.toOpname(session, ITEMS, viewer).permissions;
  assert.deepEqual(perms({ id: CREATOR, role: "STAFF_WAREHOUSE" }), { canCount: true, canPost: true, canCancel: true });
  assert.deepEqual(perms({ id: OTHER_STAFF, role: "STAFF_WAREHOUSE" }), { canCount: false, canPost: false, canCancel: true });
  assert.deepEqual(perms({ id: OWNER, role: "OWNER" }), { canCount: false, canPost: false, canCancel: false });
  const cancelled = { ...SESSION, status: "CANCELLED", cancelled_by: OTHER_STAFF, cancelled_at: "2026-11-10T06:00:00Z", cancel_reason: "x" };
  assert.deepEqual(perms({ id: CREATOR, role: "STAFF_WAREHOUSE" }, cancelled), { canCount: false, canPost: false, canCancel: false });
});

test("actors are only Anda / Pengguna lain; no user ids leave the API", () => {
  const cancelled = { ...SESSION, status: "CANCELLED", cancelled_by: OTHER_STAFF, cancelled_at: "2026-11-10T06:00:00Z", cancel_reason: "x" };
  const forCreator = reads.toOpname(cancelled, ITEMS, { id: CREATOR, role: "STAFF_WAREHOUSE" });
  assert.equal(forCreator.createdByMe, true);
  assert.equal(forCreator.cancelledByMe, false);
  assert.equal(forCreator.postedByMe, null);
  const forOwner = reads.toOpname(cancelled, ITEMS, { id: OWNER, role: "OWNER" });
  assert.equal(forOwner.createdByMe, false);
  assert.equal(forOwner.items[0].countedByMe, false);
  const text = JSON.stringify([forCreator, forOwner, reads.toOpnameSummary({ ...SESSION, stock_opname_items: [] }, OWNER)]);
  for (const id of [CREATOR, OTHER_STAFF, OWNER]) assert.equal(text.includes(id), false);
});

test("list summary counts items and counted items", () => {
  const s = reads.toOpnameSummary({ ...SESSION, stock_opname_items: [{ counted_stock: 1 }, { counted_stock: null }, { counted_stock: 0 }] }, CREATOR);
  assert.equal(s.itemCount, 3);
  assert.equal(s.countedCount, 2);
  assert.equal(s.createdByMe, true);
});

test("list query: newest first, limited, optional status filter", () => {
  const log = [];
  const builder = new Proxy({}, {
    get: (_, prop) => (...args) => {
      log.push([prop, ...args]);
      return builder;
    },
  });
  reads.listOpnames({ from: (t) => { log.push(["from", t]); return builder; } }, { status: "ACTIVE" });
  assert.deepEqual(log[0], ["from", "stock_opname"]);
  assert.deepEqual(log.find((c) => c[0] === "order"), ["order", "created_at", { ascending: false }]);
  assert.deepEqual(log.find((c) => c[0] === "limit"), ["limit", reads.LIST_LIMIT]);
  assert.deepEqual(log.find((c) => c[0] === "eq"), ["eq", "status", "ACTIVE"]);
});

// ---------------------------------------------------------------------------
// Client outcome handling
// ---------------------------------------------------------------------------
test("failure classes: rejected vs unknown", () => {
  assert.equal(outcome.describeOpnameFailure({ status: 0, code: "NETWORK_ERROR" }).outcome, outcome.UNKNOWN);
  assert.equal(outcome.describeOpnameFailure({ status: 503, code: "OUTCOME_UNKNOWN" }).outcome, outcome.UNKNOWN);
  assert.equal(outcome.describeOpnameFailure({ status: 500, code: "INTERNAL_ERROR" }).outcome, outcome.UNKNOWN);
  const notApplied = outcome.describeOpnameFailure({ status: 503, code: "OPERATION_NOT_APPLIED", message: "m" });
  assert.equal(notApplied.outcome, outcome.REJECTED);
  assert.equal(notApplied.reload, true);
  const creatorOnly = outcome.describeOpnameFailure({ status: 403, code: "OPNAME_CREATOR_ONLY", message: "m" });
  assert.equal(creatorOnly.outcome, outcome.REJECTED);
  assert.equal(creatorOnly.reload, false);
});

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map };
}

test("create attempt: sorted payload, one unresolved attempt per user", () => {
  const storage = memoryStorage();
  const attempt = outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_2, MAT_1], newKey: () => KEY });
  assert.deepEqual(attempt.payload.materialIds, [MAT_1, MAT_2]);
  assert.throws(() => outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_1], newKey: () => "k2" }), outcome.UnresolvedCreateError);
  assert.equal(outcome.loadPendingCreate(storage, CREATOR).key, KEY);
  assert.equal(outcome.loadPendingCreate(storage, OTHER_STAFF), null);
});

test("create attempt: unknown outcome keeps the key; resend proves or replays", async () => {
  const storage = memoryStorage();
  const toApiError = (e) => e;
  let attempt = outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_1], newKey: () => KEY });
  const keys = [];

  let sent = await outcome.sendCreate({ attempt, storage, toApiError, post: async (_, key) => { keys.push(key); throw { status: 0, code: "NETWORK_ERROR" }; } });
  assert.equal(sent.outcome, "uncertain");
  attempt = sent.attempt;

  sent = await outcome.sendCreate({ attempt, storage, toApiError, post: async (_, key) => { keys.push(key); throw { status: 403, code: "FORBIDDEN" }; } });
  assert.equal(sent.outcome, "uncertain", "a 403 on resend says nothing about the original");

  sent = await outcome.sendCreate({ attempt, storage, toApiError, post: async (_, key) => { keys.push(key); return { id: OPNAME }; } });
  assert.equal(sent.outcome, "success");
  assert.deepEqual(keys, [KEY, KEY, KEY]);
  assert.equal(outcome.loadPendingCreate(storage, CREATOR), null);
});

// L-4: a business conflict on a resend proves only that the resend did not
// commit; a delayed first request may still arrive. The attempt stays.
test("create attempt: 409 on a resend keeps the attempt, same key, conflict noted", async () => {
  const storage = memoryStorage();
  const keys = [];
  const attempt = { ...outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_1], newKey: () => KEY }), uncertain: true };
  const sent = await outcome.sendCreate({
    attempt,
    storage,
    toApiError: (e) => e,
    post: async (_, key) => { keys.push(key); throw { status: 409, code: "MATERIAL_ALREADY_IN_OPNAME" }; },
  });
  assert.equal(sent.outcome, "uncertain");
  assert.equal(sent.attempt.key, KEY);
  assert.equal(sent.attempt.lastConflict, "MATERIAL_ALREADY_IN_OPNAME");
  assert.equal(outcome.loadPendingCreate(storage, CREATOR).key, KEY);
  assert.throws(() => outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_2], newKey: () => "new" }), outcome.UnresolvedCreateError);
  assert.deepEqual(keys, [KEY]);
});

test("create attempt: a 4xx on the FIRST send is that request's own answer and ends it", async () => {
  const storage = memoryStorage();
  for (const error of [{ status: 400, code: "VALIDATION_ERROR" }, { status: 409, code: "MATERIAL_ALREADY_IN_OPNAME" }, { status: 403, code: "FORBIDDEN" }]) {
    const first = outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_1], newKey: () => KEY });
    const sent = await outcome.sendCreate({ attempt: first, storage, toApiError: (e) => e, post: async () => { throw error; } });
    assert.equal(sent.outcome, "rejected", error.code);
    assert.equal(outcome.loadPendingCreate(storage, CREATOR), null);
  }
});

test("create attempt: role change to OWNER keeps the unknown attempt visible and unresolved", async () => {
  const storage = memoryStorage();
  const toApiError = (e) => e;
  let attempt = outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_1], newKey: () => KEY });
  attempt = (await outcome.sendCreate({ attempt, storage, toApiError, post: async () => { throw { status: 504, code: "HTTP_ERROR" }; } })).attempt;
  for (const error of [{ status: 403, code: "FORBIDDEN" }, { status: 401, code: "UNAUTHENTICATED" }, { status: 403, code: "SESSION_NOT_AUTHORIZED" }]) {
    const sent = await outcome.sendCreate({ attempt, storage, toApiError, post: async () => { throw error; } });
    assert.equal(sent.outcome, "uncertain", error.code);
    attempt = sent.attempt;
  }
  // Still restorable after a reload or re-login with the same user id.
  assert.equal(outcome.loadPendingCreate(storage, CREATOR).key, KEY);
});

test("create attempt: reload restores the exact key and sorted payload", () => {
  const storage = memoryStorage();
  outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_2, MAT_1], newKey: () => KEY });
  const restored = outcome.loadPendingCreate(storage, CREATOR);
  assert.deepEqual(restored.payload, { materialIds: [MAT_1, MAT_2] });
  storage.setItem(`firaza.opnameCreate.pending.${CREATOR}`, "{broken");
  assert.equal(outcome.loadPendingCreate(storage, CREATOR), null);
  storage.setItem(`firaza.opnameCreate.pending.${CREATOR}`, JSON.stringify({ key: KEY, userId: OTHER_STAFF, payload: { materialIds: [] } }));
  assert.equal(outcome.loadPendingCreate(storage, CREATOR), null);
});

test("create attempt: only an explicit abandon ends tracking; a late failure does not revive it", async () => {
  const storage = memoryStorage();
  const attempt = { ...outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_1], newKey: () => KEY }), uncertain: true };
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const pending = outcome.sendCreate({ attempt, storage, toApiError: (e) => e, post: async () => { await slow; throw { status: 0, code: "NETWORK_ERROR" }; } });
  outcome.abandonCreate(storage, attempt);
  release();
  const sent = await pending;
  assert.equal(sent.outcome, "stale");
  assert.equal(outcome.loadPendingCreate(storage, CREATOR), null, "an ended attempt is not written back");
});

test("create attempt: a late success is still a success and never clears a newer attempt", async () => {
  const storage = memoryStorage();
  const old = outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_1], newKey: () => KEY });
  outcome.abandonCreate(storage, old);
  const newer = outcome.beginCreate({ storage, userId: CREATOR, materialIds: [MAT_2], newKey: () => "newer-key" });
  const sent = await outcome.sendCreate({ attempt: old, storage, toApiError: (e) => e, post: async () => ({ id: OPNAME }) });
  assert.equal(sent.outcome, "success");
  assert.equal(outcome.loadPendingCreate(storage, CREATOR).key, newer.key);
});

test("create attempt: without storage the attempt is still tracked conservatively", async () => {
  const attempt = outcome.beginCreate({ storage: null, userId: CREATOR, materialIds: [MAT_1], newKey: () => KEY });
  const sent = await outcome.sendCreate({ attempt, storage: null, toApiError: (e) => e, post: async () => { throw { status: 503, code: "OUTCOME_UNKNOWN" }; } });
  assert.equal(sent.outcome, "uncertain");
  assert.equal(sent.attempt.key, KEY);
});

// ---------------------------------------------------------------------------
// Unsaved physical counts (M-1, L-5, L-9)
// ---------------------------------------------------------------------------
const COUNT_ITEMS = [
  { id: ITEM_1, countedStock: null },
  { id: ITEM_2, countedStock: 5 },
];

test("drafts: only values that differ from the stored count are unsaved", () => {
  let drafts = {};
  assert.deepEqual(outcome.pendingCountChanges(COUNT_ITEMS, drafts), []);
  drafts = outcome.editDraft(drafts, COUNT_ITEMS[1], "5");
  assert.deepEqual(outcome.pendingCountChanges(COUNT_ITEMS, drafts), [], "same as stored is not dirty");
  drafts = outcome.editDraft(drafts, COUNT_ITEMS[1], "7");
  drafts = outcome.editDraft(drafts, COUNT_ITEMS[0], "0");
  const pending = outcome.pendingCountChanges(COUNT_ITEMS, drafts);
  assert.deepEqual(pending.map((p) => [p.itemId, p.kind, p.value]), [[ITEM_1, "changed", 0], [ITEM_2, "changed", 7]]);
  assert.deepEqual(outcome.countsToSave(pending), [{ itemId: ITEM_1, countedStock: 0 }, { itemId: ITEM_2, countedStock: 7 }]);
});

test("drafts: clearing a saved count is unsaved, not a delete, and is never sent (L-5)", () => {
  const drafts = outcome.editDraft({}, COUNT_ITEMS[1], "  ");
  const pending = outcome.pendingCountChanges(COUNT_ITEMS, drafts);
  assert.deepEqual(pending.map((p) => [p.kind, p.stored]), [["cleared", 5]]);
  assert.deepEqual(outcome.countsToSave(pending), []);
  assert.deepEqual(outcome.pendingCountChanges(COUNT_ITEMS, outcome.editDraft({}, COUNT_ITEMS[0], "")), [], "empty over nothing is clean");
});

test("drafts: invalid inputs are unsaved and never sent", () => {
  for (const text of ["-1", "1.5", "abc", "1e3", "2147483648", "99999999999999999999"]) {
    const pending = outcome.pendingCountChanges(COUNT_ITEMS, outcome.editDraft({}, COUNT_ITEMS[0], text));
    assert.equal(pending[0]?.kind, "invalid", text);
    assert.deepEqual(outcome.countsToSave(pending), [], text);
  }
});

test("drafts: a reload never overwrites them; a server change under a draft is flagged (L-9)", () => {
  const drafts = outcome.editDraft({}, COUNT_ITEMS[1], "9");
  const reloaded = [{ id: ITEM_1, countedStock: null }, { id: ITEM_2, countedStock: 6 }];
  const pending = outcome.pendingCountChanges(reloaded, drafts);
  assert.equal(drafts[ITEM_2].text, "9");
  assert.deepEqual(pending.map((p) => [p.kind, p.value, p.stored, p.serverChanged]), [["changed", 9, 6, true]]);
  const again = outcome.editDraft(drafts, { id: ITEM_2, countedStock: 6 }, "10");
  assert.equal(again[ITEM_2].base, 5, "base stays the value editing started from");
});

test("drafts: cleared only when the reloaded server data shows exactly what was sent", () => {
  let drafts = outcome.editDraft({}, COUNT_ITEMS[0], "4");
  drafts = outcome.editDraft(drafts, COUNT_ITEMS[1], "8");
  const sent = outcome.countsToSave(outcome.pendingCountChanges(COUNT_ITEMS, drafts));
  // Reload shows ITEM_1 saved but ITEM_2 not (e.g. a different value stored).
  const fresh = [{ id: ITEM_1, countedStock: 4 }, { id: ITEM_2, countedStock: 5 }];
  const next = outcome.confirmSavedDrafts(fresh, drafts, sent);
  assert.deepEqual(Object.keys(next), [ITEM_2]);
  assert.deepEqual(outcome.pendingCountChanges(fresh, next).map((p) => p.itemId), [ITEM_2]);
  // A draft edited after sending is kept even if the server shows the sent value.
  const edited = outcome.editDraft(drafts, COUNT_ITEMS[0], "40");
  assert.ok(Object.hasOwn(outcome.confirmSavedDrafts(fresh, edited, sent), ITEM_1));
});

test("drafts: a failed or unknown save leaves every draft unsaved", () => {
  const drafts = outcome.editDraft({}, COUNT_ITEMS[1], "8");
  // No confirmSavedDrafts call happens without a successful save and reload;
  // the stored value is still 5, so the draft is still pending.
  assert.equal(outcome.pendingCountChanges(COUNT_ITEMS, drafts).length, 1);
  assert.ok(outcome.postingBlockedReason({ pendingCount: 1, saving: false }));
});

test("posting guard: blocked by unsaved drafts or a running save; free otherwise", () => {
  assert.match(outcome.postingBlockedReason({ pendingCount: 2, saving: false }), /2 perubahan hasil hitung yang belum disimpan/);
  assert.match(outcome.postingBlockedReason({ pendingCount: 0, saving: true }), /sedang disimpan/);
  assert.equal(outcome.postingBlockedReason({ pendingCount: 0, saving: false }), null);
});

test("posting guard is read at render, on open, and again on confirm (component source)", () => {
  const actions = readFileSync(new URL("../../components/opname-actions.jsx", import.meta.url), "utf8");
  const confirm = actions.slice(actions.indexOf("async function confirmPost"), actions.indexOf("return (", actions.indexOf("async function confirmPost")));
  assert.ok(confirm.indexOf("blockedNow()") >= 0 && confirm.indexOf("blockedNow()") < confirm.indexOf("api.post("), "confirm rechecks before sending");
  assert.match(actions, /onClick=\{\(\) => \{\s+onNotice\(null\);\s+if \(blockedNow\(\)\) return;\s+setConfirming\(true\);/);
  assert.match(actions, /disabled=\{!ready \|\| blocked\}/);
  assert.match(actions, /disabled=\{submitting \|\| blocked\}/);
  assert.match(actions, /const reason = getPostingBlock\(\);/);
  const page = readFileSync(new URL("../../app/stock-opnames/[id]/page.js", import.meta.url), "utf8");
  assert.match(page, /blockRef\.current = postingBlock;/);
  assert.match(page, /savingRef\.current \? postingBlockedReason/);
  const form = readFileSync(new URL("../../components/opname-count-form.jsx", import.meta.url), "utf8");
  const afterPut = form.slice(form.indexOf("api.put("));
  const reload = afterPut.indexOf("const fresh = await onReload");
  assert.ok(reload > 0 && reload < afterPut.indexOf("confirmSavedDrafts(fresh.items"), "drafts cleared only from the reloaded data");
  assert.match(afterPut, /if \(fresh\) \{\s+onDraftsChange\(\(current\) => confirmSavedDrafts\(fresh\.items, current, counts\)\)/);
});

test("post-login paths include Stock Opname pages only in exact forms", () => {
  for (const path of ["/stock-opnames", "/stock-opnames/new", `/stock-opnames/${OPNAME}`]) assert.equal(safeNextPath(path), path);
  for (const path of [`/stock-opnames/${OPNAME}/post`, "/stock-opnames/x", "//stock-opnames", "/stock-opnames?x=1"]) {
    assert.equal(safeNextPath(path), DEFAULT_AFTER_LOGIN);
  }
});

// ---------------------------------------------------------------------------
// Static review of migration 20261110120000 (text only; not a database test)
// ---------------------------------------------------------------------------
const SQL = readFileSync(new URL("../../supabase/migrations/20261110120000_stock_opname.sql", import.meta.url), "utf8");
const FOUNDATION = readFileSync(new URL("../../supabase/migrations/20261101064015_inventory_stock_movement_foundation.sql", import.meta.url), "utf8");
const MATERIALS = readFileSync(new URL("../../supabase/migrations/20261110090000_material_management.sql", import.meta.url), "utf8");

// SQL without "--" comments, so prose cannot satisfy or break a check.
const code = (text) => text.split("\n").map((line) => line.replace(/--.*$/, "")).join("\n");
const CODE = code(SQL);

function body(name) {
  const start = CODE.indexOf(`create function app_private.${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  const end = CODE.indexOf("$$;", start);
  return CODE.slice(start, end);
}

const IMPLS = ["create_stock_opname", "record_stock_opname_counts", "post_stock_opname", "cancel_stock_opname"];

test("static: additive only (no drop, replace, alter, or table grants)", () => {
  assert.doesNotMatch(CODE, /\bdrop\s/i);
  assert.doesNotMatch(CODE, /create\s+or\s+replace/i);
  assert.doesNotMatch(CODE, /\balter\s+(table|function|type|view)/i);
  assert.doesNotMatch(CODE, /grant\s+(insert|update|delete|truncate|select|all)\b/i);
  assert.doesNotMatch(CODE, /grant[^;]*\bto\s+(anon|service_role|public)\b/i);
  // No explicit transaction control (DATABASE-DESIGN §14.1). PL/pgSQL block
  // "begin" lines carry no semicolon, so a "begin;" would be one.
  assert.doesNotMatch(CODE, /^\s*(begin|commit|rollback|start transaction)\s*;/im);
});

test("static: implementations are SECURITY DEFINER with empty search_path and lock_timeout; wrappers are INVOKER", () => {
  for (const name of IMPLS) {
    const b = body(name);
    assert.match(b, /security definer/, name);
    assert.match(b, /set search_path = ''/, name);
    assert.match(b, /set lock_timeout = '5s'/, name);
    const wrapper = CODE.slice(CODE.indexOf(`create function public.${name}(`));
    assert.match(wrapper.slice(0, wrapper.indexOf("$$;")), /security invoker[\s\S]*set search_path = ''/, name);
  }
  assert.equal((CODE.match(/security definer/g) ?? []).length, 4);
});

test("static: role check is the first statement of every implementation", () => {
  for (const name of IMPLS) {
    const b = body(name);
    const firstStatement = b.slice(b.indexOf("begin") + 5).trim().split(";")[0];
    assert.match(firstStatement, /app_private\.require_staff_warehouse\(\)/, name);
  }
});

test("static: creator-only count and post; cancel open to any Staff with a reason", () => {
  for (const name of ["record_stock_opname_counts", "post_stock_opname"]) {
    assert.match(body(name), /created_by <> v_user_id then\s+raise exception using errcode = 'P0001', message = 'OPNAME_CREATOR_ONLY'/, name);
  }
  const cancel = body("cancel_stock_opname");
  assert.doesNotMatch(cancel, /created_by/);
  assert.match(cancel, /require_status_reason\(p_reason\)/);
});

test("static: every session operation locks the session, then materials ascending by id", () => {
  for (const name of ["post_stock_opname", "cancel_stock_opname"]) {
    const b = body(name);
    const session = b.search(/from public\.stock_opname as s\s+where s\.id = p_opname_id\s+for update/);
    const materials = b.search(/from public\.materials as m[\s\S]*?order by m\.id\s+for update/);
    assert.ok(session > 0 && materials > session, name);
    assert.match(b, /if v_opname\.status <> 'ACTIVE' then\s+raise exception using errcode = 'P0001', message = 'OPNAME_NOT_ACTIVE'/, name);
  }
  const counts = body("record_stock_opname_counts");
  assert.match(counts, /from public\.stock_opname as s\s+where s\.id = p_opname_id\s+for update/);
  assert.match(counts, /'OPNAME_NOT_ACTIVE'/);
  assert.match(body("create_stock_opname"), /order by m\.id\s+for update/);
});

test("static: no function in earlier migrations locks a session row (no lock-order inversion)", () => {
  for (const text of [FOUNDATION, MATERIALS]) assert.doesNotMatch(code(text), /from public\.stock_opname\b[^;]*for update/);
});

test("static: create checks archived, frozen, missing, duplicate; never writes stock", () => {
  const b = body("create_stock_opname");
  for (const c of ["MATERIAL_ARCHIVED", "MATERIAL_ALREADY_IN_OPNAME", "MATERIAL_NOT_FOUND", "DUPLICATE_MATERIAL", "OPNAME_MATERIALS_REQUIRED"]) {
    assert.match(b, new RegExp(`'${c}'`), c);
  }
  assert.doesNotMatch(b, /current_stock\s*=/);
  assert.doesNotMatch(b, /inventory_transactions/);
  assert.match(b, /set active_opname_id = v_opname\.id\s+where m\.id = any \(v_ids\)/);
  assert.match(b, /system_stock[\s\S]*m\.current_stock/);
  // Idempotency row before the material locks, so a replay never re-checks state.
  assert.ok(b.indexOf("insert into app_private.idempotency_requests") < b.indexOf("for update"));
  assert.match(b, /'operation', v_operation/);
});

test("static: counting writes only the item count columns", () => {
  const b = body("record_stock_opname_counts");
  assert.doesNotMatch(b, /inventory_transactions/);
  assert.doesNotMatch(b, /update public\.materials/);
  assert.match(b, /set counted_stock = c\.counted_stock,\s+counted_by = v_user_id,\s+counted_at = pg_catalog\.now\(\)/);
  assert.match(b, /'INVALID_COUNTED_STOCK'/);
  assert.match(b, /'OPNAME_ITEM_NOT_FOUND'/);
});

test("static: post requires complete counts, checks the snapshot, adjusts only non-zero deltas, releases the freeze", () => {
  const b = body("post_stock_opname");
  assert.ok(b.indexOf("'OPNAME_EMPTY'") > 0 && b.indexOf("'OPNAME_UNCOUNTED'") > 0);
  assert.ok(b.indexOf("'OPNAME_UNCOUNTED'") < b.indexOf("insert into public.inventory_transactions"));
  assert.match(b, /v_item\.current_stock <> v_item\.system_stock then\s+raise exception using errcode = 'P0001', message = 'OPNAME_INVARIANT_VIOLATION'/);
  assert.match(b, /v_item\.active_opname_id is distinct from p_opname_id/);
  assert.match(b, /v_delta := v_item\.counted_stock - v_item\.current_stock;/);
  assert.match(b, /if v_delta <> 0 then\s+insert into public\.inventory_transactions/);
  assert.match(b, /'ADJUSTMENT', v_delta, p_opname_id, v_item\.item_id, v_user_id/);
  assert.match(b, /set current_stock = v_item\.counted_stock,\s+active_opname_id = null/);
  assert.ok(b.lastIndexOf("set status = 'POSTED'") > b.indexOf("end loop"));
  assert.match(b, /posted_by = v_user_id,\s+posted_at = pg_catalog\.now\(\)/);
});

test("static: cancel releases the freeze without touching stock or transactions", () => {
  const b = body("cancel_stock_opname");
  assert.doesNotMatch(b, /inventory_transactions/);
  assert.doesNotMatch(b, /current_stock/);
  assert.match(b, /set active_opname_id = null\s+where m\.active_opname_id = p_opname_id/);
  assert.match(b, /'OPNAME_INVARIANT_VIOLATION'/);
  assert.match(b, /set status = 'CANCELLED',\s+cancelled_by = v_user_id,\s+cancelled_at = pg_catalog\.now\(\),\s+cancel_reason = p_reason/);
});

test("static: actors come from the session, never from parameters", () => {
  for (const name of IMPLS) {
    const signature = body(name).split(")")[0];
    assert.doesNotMatch(signature, /created_by|posted_by|cancelled_by|counted_by|current_stock|user_id/i, name);
  }
});

test("static: EXECUTE revoked from everyone and granted to authenticated only", () => {
  const revokes = CODE.match(/revoke all on function[\s\S]*?from public, anon, authenticated, service_role;/g) ?? [];
  const grants = CODE.match(/grant execute on function[\s\S]*?to authenticated;/g) ?? [];
  assert.equal(revokes.length, 2);
  assert.equal(grants.length, 2);
  for (const name of IMPLS) {
    for (const schema of ["app_private", "public"]) {
      assert.ok(revokes.some((r) => r.includes(`${schema}.${name}(`)), `${schema}.${name} revoke`);
      assert.ok(grants.some((g) => g.includes(`${schema}.${name}(`)), `${schema}.${name} grant`);
    }
  }
  assert.match(CODE, /\) <> 10 then\s+raise exception 'stock_opname check failed: unexpected public functions'/);
});

test("static L-1: multidimensional material arrays are rejected before array_position", () => {
  const b = body("create_stock_opname");
  const ndims = b.indexOf("pg_catalog.array_ndims(p_material_ids) is distinct from 1 then\n    raise exception using errcode = 'P0001', message = 'INVALID_MATERIAL_LIST'");
  assert.ok(ndims > 0 && ndims < b.indexOf("array_position"));
  assert.ok(b.indexOf("'OPNAME_MATERIALS_REQUIRED'") < ndims, "empty array (ndims NULL) gets its own code first");
  assert.equal(commands.OPNAME_ERRORS.INVALID_MATERIAL_LIST[0], 400);
});

test("static L-1: JSON type is confirmed in its own IF before length, elements, and casts", () => {
  const b = body("record_stock_opname_counts");
  const typeCheck = b.indexOf("if pg_catalog.jsonb_typeof(p_counts) is distinct from 'array' then");
  const firstLength = b.indexOf("jsonb_array_length");
  assert.ok(typeCheck > 0 && typeCheck < firstLength);
  assert.ok(b.slice(typeCheck, firstLength).includes("end if;"), "length is evaluated in a later statement, not the same OR");
  assert.ok(typeCheck < b.indexOf("jsonb_array_elements"));
  const loop = b.slice(b.indexOf("for v_element in"));
  const objectCheck = loop.indexOf("if pg_catalog.jsonb_typeof(v_element) is distinct from 'object' then");
  const fieldCheck = loop.indexOf("jsonb_typeof(v_element -> 'item_id')");
  const uuidCheck = loop.indexOf("!~*");
  const numericCast = loop.indexOf("::numeric");
  assert.ok(objectCheck >= 0 && objectCheck < fieldCheck && fieldCheck < uuidCheck && uuidCheck < numericCast);
  assert.ok(loop.slice(objectCheck, fieldCheck).includes("end if;"));
  assert.ok(b.indexOf("end loop;") < b.indexOf("::uuid"), "UUID casts run only after every element passed the loop");
  assert.doesNotMatch(b, /<> 'array'\s+or/, "no type and length check in one OR");
});

test("governance: OD-20 is described as provisional, not Owner-approved", () => {
  const header = SQL.slice(0, SQL.indexOf("create function"));
  const approved = header.slice(header.indexOf("Owner decisions applied"), header.indexOf("PROVISIONAL"));
  assert.doesNotMatch(approved, /OD-20/);
  assert.match(header, /PROVISIONAL, pending explicit Owner approval:\n--\s+\* OD-20/);
  for (const file of ["../../lib/stock-opname-outcome.js", "../../lib/server/stock-opname-commands.js", "../../app/stock-opnames/new/page.js"]) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(text, /provisional/i, file);
  }
});

test("static: OD-05 and frozen Stock In/Out stay enforced in earlier migrations", () => {
  const archive = code(MATERIALS).slice(code(MATERIALS).indexOf("create function app_private.archive_material("));
  assert.match(archive.slice(0, archive.indexOf("$$;")), /active_opname_id is not null then\s+raise exception using errcode = 'P0001', message = 'MATERIAL_FROZEN'/);
  const movement = code(FOUNDATION).slice(code(FOUNDATION).indexOf("create function app_private.post_stock_movement("));
  assert.match(movement.slice(0, movement.indexOf("$$;")), /active_opname_id is not null then\s+raise exception using errcode = 'P0001', message = 'MATERIAL_FROZEN'/);
});

// ---------------------------------------------------------------------------
// B4-S6: leaving the count form with unsaved drafts (D12) and OBS-1
// ---------------------------------------------------------------------------
const { isLeavingNavigation, LEAVE_SELECTOR } = await import(new URL("../../lib/leave-guard.js", import.meta.url));
const HERE = { href: "http://127.0.0.1:3001/stock-opnames/abc", origin: "http://127.0.0.1:3001", pathname: "/stock-opnames/abc", search: "" };
const click = (extra = {}) => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...extra });
function el(attrs) {
  return { hasAttribute: (n) => Object.hasOwn(attrs, n), getAttribute: (n) => (Object.hasOwn(attrs, n) ? attrs[n] : null) };
}

test("leave guard: in-app, header, external links and marked elements leave the page", () => {
  assert.equal(isLeavingNavigation(el({ href: "/stock-opnames" }), click(), HERE), true, "back link");
  assert.equal(isLeavingNavigation(el({ href: "/materials" }), click(), HERE), true, "header link");
  assert.equal(isLeavingNavigation(el({ href: "/stock-opnames/abc?x=1" }), click(), HERE), true, "different query");
  assert.equal(isLeavingNavigation(el({ href: "https://example.org/" }), click(), HERE), true, "external");
  assert.equal(isLeavingNavigation(el({ "data-leave-page": "" }), click(), HERE), true, "logout button");
  assert.equal(isLeavingNavigation(el({ href: "/materials", target: "_self" }), click(), HERE), true);
});

test("leave guard: new tab, download, same page, cancelled or non-left clicks are not guarded", () => {
  assert.equal(isLeavingNavigation(null, click(), HERE), false);
  assert.equal(isLeavingNavigation(el({ href: "/stock-opnames/abc#items" }), click(), HERE), false, "same page");
  assert.equal(isLeavingNavigation(el({ href: "/materials", target: "_blank" }), click(), HERE), false);
  assert.equal(isLeavingNavigation(el({ href: "/materials", download: "" }), click(), HERE), false);
  assert.equal(isLeavingNavigation(el({ href: "mailto:x@example.org" }), click(), HERE), false);
  for (const extra of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    assert.equal(isLeavingNavigation(el({ href: "/materials" }), click(extra), HERE), false, JSON.stringify(extra));
  }
  assert.equal(LEAVE_SELECTOR, "a[href], [data-leave-page]");
});

test("leave guard wiring: detail page, capture listener, logout marked, no history patching", () => {
  const hook = readFileSync(new URL("../../components/use-leave-guard.js", import.meta.url), "utf8");
  assert.match(hook, /window\.addEventListener\("click", onClick, true\)/);
  assert.match(hook, /if \(window\.confirm\(message\)\) \{\s+confirmedRef\.current = true;\s+onConfirmRef\.current\?\.\(\);\s+return;\s+\}\s+event\.preventDefault\(\);\s+event\.stopImmediatePropagation\(\);/);
  assert.match(hook, /if \(confirmedRef\.current\) return;/, "no second (beforeunload) prompt after confirming");
  assert.doesNotMatch(hook, /history\.(pushState|replaceState)\s*=|popstate|router\.(push|replace)\s*=/);
  const page = readFileSync(new URL("../../app/stock-opnames/[id]/page.js", import.meta.url), "utf8");
  assert.match(page, /const guardLeave = pending\.length > 0 && Boolean\(opname\?\.permissions\.canCount\);/);
  assert.match(page, /useLeaveGuard\(guardLeave, LEAVE_MESSAGE, discardDrafts\);/);
  assert.doesNotMatch(page, /addEventListener\("beforeunload"/, "beforeunload lives in the hook only (no duplicate prompt)");
  const header = readFileSync(new URL("../../components/app-header.jsx", import.meta.url), "utf8");
  assert.match(header, /onClick=\{logout\} disabled=\{pending\} data-leave-page/);
});

test("OBS-1: a new edit clears only informational notices", () => {
  const form = readFileSync(new URL("../../components/opname-count-form.jsx", import.meta.url), "utf8");
  assert.match(form, /setNotice\(\(current\) => \(current\?\.tone === "info" \? null : current\)\);/);
  assert.match(form, /tone: "info", message: "Perubahan yang belum disimpan dibuang\."/);
  const reducer = (current) => (current?.tone === "info" ? null : current);
  assert.equal(reducer({ tone: "info", message: "Perubahan yang belum disimpan dibuang." }), null);
  for (const tone of ["unknown", "error", "success"]) assert.deepEqual(reducer({ tone, message: "m" }), { tone, message: "m" });
});

// ---------------------------------------------------------------------------
// B4-S7: tab-local draft recovery (sessionStorage) with server reconciliation
// ---------------------------------------------------------------------------
const store = await import(new URL("../../lib/opname-draft-store.js", import.meta.url));
const NOW = 1_800_000_000_000;
const DITEM_1 = "17e00000-0000-4000-8000-0000000000d1";
const DITEM_2 = "17e00000-0000-4000-8000-0000000000d2";
function storageMock() {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };

test("draft store: versioned per-user per-session record round-trips; empty set removes it", () => {
  const s = storageMock();
  const drafts = { [DITEM_1]: { text: "7", base: null } };
  assert.equal(store.writeDraft(s, CREATOR, OPNAME, drafts, NOW), true);
  const key = store.draftKey(CREATOR, OPNAME);
  assert.equal(key, `firaza.opnameCountDraft.v1.${CREATOR}.${OPNAME}`);
  assert.deepEqual(Object.keys(JSON.parse(s.getItem(key))).sort(), ["drafts", "opnameId", "updatedAt", "userId", "v"]);
  assert.deepEqual(store.readDraft(s, CREATOR, OPNAME, NOW + 1000), { status: "ok", drafts });
  store.writeDraft(s, CREATOR, OPNAME, {}, NOW);
  assert.equal(s.getItem(key), null);
  assert.deepEqual(store.readDraft(s, CREATOR, OPNAME, NOW), { status: "none" });
});

test("draft store: isolated by user and session", () => {
  const s = storageMock();
  store.writeDraft(s, CREATOR, OPNAME, { [DITEM_1]: { text: "1", base: null } }, NOW);
  assert.equal(store.readDraft(s, OTHER_STAFF, OPNAME, NOW).status, "none");
  assert.equal(store.readDraft(s, CREATOR, OTHER_OPNAME, NOW).status, "none");
  // A record copied under another user's key is refused and removed.
  s.setItem(store.draftKey(OTHER_STAFF, OPNAME), s.getItem(store.draftKey(CREATOR, OPNAME)));
  assert.equal(store.readDraft(s, OTHER_STAFF, OPNAME, NOW).status, "incompatible");
  assert.equal(s.getItem(store.draftKey(OTHER_STAFF, OPNAME)), null);
});

test("draft store: expired, future-dated, corrupt, invalid, and old-version records are removed, never applied", () => {
  const s = storageMock();
  const key = store.draftKey(CREATOR, OPNAME);
  const good = { v: 1, userId: CREATOR, opnameId: OPNAME, updatedAt: NOW, drafts: { [DITEM_1]: { text: "1", base: null } } };
  const cases = [
    [{ ...good, updatedAt: NOW - store.DRAFT_TTL_MS - 1 }, "expired"],
    [{ ...good, updatedAt: NOW + 120_000 }, "expired"],
    ["{broken", "corrupt"],
    [{ ...good, drafts: { "not-a-uuid": { text: "1", base: null } } }, "corrupt"],
    [{ ...good, drafts: { [DITEM_1]: { text: "1", base: -1 } } }, "corrupt"],
    [{ ...good, drafts: { [DITEM_1]: { text: "x".repeat(33), base: null } } }, "corrupt"],
    [{ ...good, drafts: { [DITEM_1]: { text: "1", base: null, conflict: false } } }, "corrupt"],
    [{ ...good, drafts: { [DITEM_1]: { text: "1", base: null, token: "x" } } }, "ok"],
    [{ ...good, v: 2 }, "incompatible"],
    [{ ...good, updatedAt: "now" }, "corrupt"],
  ];
  for (const [value, status] of cases) {
    s.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    const r = store.readDraft(s, CREATOR, OPNAME, NOW);
    assert.equal(r.status, status, JSON.stringify(value).slice(0, 80));
    if (status !== "ok") assert.equal(s.getItem(key), null, "removed");
    else assert.deepEqual(r.drafts[DITEM_1], { text: "1", base: null }, "only known fields are kept");
  }
  assert.equal(store.DRAFT_TTL_MS, 8 * 60 * 60 * 1000);
});

test("draft store: unavailable or full storage never throws", () => {
  assert.deepEqual(store.readDraft(null, CREATOR, OPNAME, NOW), { status: "unavailable" });
  assert.deepEqual(store.readDraft(throwing, CREATOR, OPNAME, NOW), { status: "unavailable" });
  assert.equal(store.writeDraft(throwing, CREATOR, OPNAME, { [DITEM_1]: { text: "1", base: null } }, NOW), false);
  assert.equal(store.writeDraft(null, CREATOR, OPNAME, {}, NOW), false);
  assert.equal(store.removeDraft(throwing, CREATOR, OPNAME), false);
  assert.equal(store.removeAllDrafts(throwing), 0);
});

test("draft store: logout cleanup removes only count drafts, not the create-attempt record", () => {
  const s = storageMock();
  store.writeDraft(s, CREATOR, OPNAME, { [DITEM_1]: { text: "1", base: null } }, NOW);
  store.writeDraft(s, OTHER_STAFF, OTHER_OPNAME, { [DITEM_2]: { text: "2", base: null } }, NOW);
  s.setItem(`firaza.opnameCreate.pending.${CREATOR}`, "{}");
  assert.equal(store.removeAllDrafts(s), 2);
  assert.deepEqual([...s.map.keys()], [`firaza.opnameCreate.pending.${CREATOR}`]);
});

test("reconcile: restore when the baseline matches; drop what the server already holds; conflict when it changed", () => {
  const items = [{ id: DITEM_1, countedStock: null }, { id: DITEM_2, countedStock: 5 }];
  let r = store.reconcileDrafts(items, { [DITEM_1]: { text: "3", base: null }, [DITEM_2]: { text: "9", base: 5 } }, outcome.parseCountText);
  assert.deepEqual(r, { kind: "ok", drafts: { [DITEM_1]: { text: "3", base: null }, [DITEM_2]: { text: "9", base: 5 } }, restored: 2, conflicts: 0, alreadySaved: 0 });
  // Ambiguous save that did commit: the server already shows the draft value.
  r = store.reconcileDrafts(items, { [DITEM_2]: { text: "5", base: 4 } }, outcome.parseCountText);
  assert.deepEqual([r.alreadySaved, Object.keys(r.drafts).length], [1, 0]);
  // Server value changed under the draft: conflict, not a silent overwrite.
  r = store.reconcileDrafts(items, { [DITEM_2]: { text: "9", base: 4 } }, outcome.parseCountText);
  assert.deepEqual(r.drafts[DITEM_2], { text: "9", base: 4, conflict: true });
  assert.equal(r.conflicts, 1);
  // Empty draft over an empty server value is nothing to restore.
  assert.deepEqual(store.reconcileDrafts(items, { [DITEM_1]: { text: "", base: null } }, outcome.parseCountText).drafts, {});
  // A stored conflict stays a conflict until reviewed.
  assert.equal(store.reconcileDrafts(items, { [DITEM_2]: { text: "9", base: 5, conflict: true } }, outcome.parseCountText).conflicts, 1);
});

test("reconcile: an item the session does not have fails closed", () => {
  const r = store.reconcileDrafts([{ id: DITEM_1, countedStock: null }], { [DITEM_1]: { text: "1", base: null }, [DITEM_2]: { text: "2", base: null } }, outcome.parseCountText);
  assert.deepEqual(r, { kind: "mismatch" });
});

test("conflicting drafts: block saving and posting until kept or reverted", () => {
  const items = [{ id: DITEM_2, countedStock: 6 }];
  let drafts = { [DITEM_2]: { text: "9", base: 5, conflict: true } };
  let pending = outcome.pendingCountChanges(items, drafts);
  assert.deepEqual(pending.map((p) => [p.kind, p.conflict, p.serverChanged]), [["changed", true, true]]);
  assert.deepEqual(outcome.countsToSave(pending), [], "never sent while in conflict");
  assert.ok(outcome.postingBlockedReason({ pendingCount: pending.length, saving: false }));
  drafts = outcome.editDraft(drafts, items[0], "10");
  assert.equal(drafts[DITEM_2].conflict, true, "editing keeps the conflict");
  drafts = outcome.acknowledgeConflict(drafts, items[0]);
  assert.deepEqual(drafts[DITEM_2], { text: "10", base: 6 });
  pending = outcome.pendingCountChanges(items, drafts);
  assert.deepEqual(outcome.countsToSave(pending), [{ itemId: DITEM_2, countedStock: 10 }]);
  assert.ok(outcome.postingBlockedReason({ pendingCount: pending.length, saving: false }), "still unsaved");
});

test("draft recovery wiring: sessionStorage only, no unmount cleanup, synchronous discard, logout cleanup, save blocked on conflict", () => {
  const hook = readFileSync(new URL("../../components/use-count-draft-persistence.js", import.meta.url), "utf8");
  const storeSrc = readFileSync(new URL("../../lib/opname-draft-store.js", import.meta.url), "utf8");
  for (const src of [hook, storeSrc]) {
    assert.doesNotMatch(src, /localStorage\.|indexedDB\.|api\.(put|post)|fetch\(/);
  }
  assert.doesNotMatch(hook, /return \(\) =>/, "no cleanup function: unmount never removes drafts");
  assert.match(hook, /const editable = Boolean\(opname && opname\.status === "ACTIVE" && opname\.permissions\.canCount\);/);
  assert.match(hook, /if \(!editable\) \{\s+if \(removeDraft\(storage, userId, opname\.id\)/);
  assert.match(hook, /if \(!key \|\| readyKey !== key \|\| !editable\) return;/, "persist only after restoration");
  const page = readFileSync(new URL("../../app/stock-opnames/[id]/page.js", import.meta.url), "utf8");
  assert.match(page, /const discardDrafts = useCallback\(\(\) => \{\s+discardStored\(\);\s+setDrafts\(\{\}\);/);
  const header = readFileSync(new URL("../../components/app-header.jsx", import.meta.url), "utf8");
  assert.equal((header.match(/clearTabCountDrafts\(\);/g) ?? []).length, 2, "both logout outcomes clear drafts");
  const form = readFileSync(new URL("../../components/opname-count-form.jsx", import.meta.url), "utf8");
  const submit = form.slice(form.indexOf("async function handleSubmit"));
  assert.ok(submit.indexOf("p.conflict") < submit.indexOf("api.put("), "conflict check before any request");
  const createStore = readFileSync(new URL("../../lib/stock-opname-outcome.js", import.meta.url), "utf8");
  assert.match(createStore, /const STORAGE_PREFIX = "firaza\.opnameCreate\.pending\.";/, "create-attempt storage unchanged and separate");
});
