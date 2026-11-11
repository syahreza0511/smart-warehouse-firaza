// Unit tests for material management: request schemas, the command layer
// behind the Route Handlers (with a mocked Supabase client), read mappers,
// UI hints, and post-login paths. No network, no database, no Supabase Auth.
// They prove the server sends the right RPC arguments and maps every answer
// correctly; they do not prove the database functions, RLS, grants, or row
// locking (migration 20261110090000 needs database tests for that).
//
// Run: node --test 'tests/unit/*.test.mjs'
import test from "node:test";
import assert from "node:assert/strict";

const { materialRequestSchema, materialStatusRequestSchema, parseIntegerInput, MAX_MINIMUM_STOCK } = await import(
  new URL("../../lib/validation/schemas.js", import.meta.url)
);
const {
  createMaterial,
  updateMaterial,
  deleteMaterial,
  archiveMaterial,
  reactivateMaterial,
  materialRpcErrorResponse,
  MATERIAL_ERRORS,
} = await import(new URL("../../lib/server/material-commands.js", import.meta.url));
const { toMaterial, toStatusEvent, getMaterialUsage, listMaterials } = await import(
  new URL("../../lib/server/materials.js", import.meta.url)
);
const { safeNextPath, DEFAULT_AFTER_LOGIN } = await import(new URL("../../lib/navigation.js", import.meta.url));
const { classifyMutationFailure, describeMutationFailure, REJECTED, UNKNOWN } = await import(
  new URL("../../lib/mutation-outcome.js", import.meta.url)
);
const { toApiError } = await import(new URL("../../lib/api-client.js", import.meta.url));

const MAT = "5a200000-0000-4000-8000-0000000000a1";
const CAT = "c4700000-0000-4000-8000-0000000000c1";
const USER = "116d642c-0000-4000-8000-000000000001";

const VALID = { categoryId: CAT, name: "Kardus Medium", unit: "pcs", minimumStock: 50 };

// A material_stock_status row as the RPCs return it.
const ROW = {
  id: MAT,
  category_id: CAT,
  category_name: "Packaging Material",
  name: "Kardus Medium",
  unit: "pcs",
  current_stock: 0,
  minimum_stock: 50,
  stock_status: "OUT_OF_STOCK",
  is_frozen: false,
  archived_at: null,
  created_at: "2026-11-10T01:00:00Z",
  updated_at: "2026-11-10T01:00:00Z",
};

// Records RPC calls and answers with a fixed { data, error }.
function mockSupabase(result) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      return result;
    },
  };
}

const pgError = (code, message) => ({ code, message });

async function body(response) {
  return response.json();
}

// Keeps expected console.error output of the server-error paths out of the
// test report.
async function quietly(fn) {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

// --- schemas -----------------------------------------------------------------

test("schema: a valid material body is accepted and name/unit are trimmed", () => {
  const parsed = materialRequestSchema.parse({ ...VALID, name: "  Kardus Medium  ", unit: " pcs " });
  assert.deepEqual(parsed, VALID);
});

test("schema: currentStock, role, and other unknown fields are dropped", () => {
  const parsed = materialRequestSchema.parse({ ...VALID, currentStock: 999, role: "OWNER", archivedAt: "x" });
  assert.deepEqual(parsed, VALID);
});

test("schema: name and unit are required and blank text counts as missing", () => {
  for (const field of ["name", "unit"]) {
    for (const value of [undefined, "", "   ", "\t\n"]) {
      const result = materialRequestSchema.safeParse({ ...VALID, [field]: value });
      assert.equal(result.success, false, `${field}=${JSON.stringify(value)}`);
    }
  }
});

test("schema: name over 120 and unit over 30 characters are rejected", () => {
  assert.equal(materialRequestSchema.safeParse({ ...VALID, name: "a".repeat(120) }).success, true);
  assert.equal(materialRequestSchema.safeParse({ ...VALID, name: "a".repeat(121) }).success, false);
  assert.equal(materialRequestSchema.safeParse({ ...VALID, unit: "a".repeat(30) }).success, true);
  assert.equal(materialRequestSchema.safeParse({ ...VALID, unit: "a".repeat(31) }).success, false);
});

test("schema: control characters inside name or unit are rejected", () => {
  assert.equal(materialRequestSchema.safeParse({ ...VALID, name: "Kardus\nMedium" }).success, false);
  assert.equal(materialRequestSchema.safeParse({ ...VALID, unit: "p\u0000cs" }).success, false);
});

test("schema: minimum stock must be an integer from 0 to the database limit", () => {
  for (const ok of [0, 1, 50, MAX_MINIMUM_STOCK]) {
    assert.equal(materialRequestSchema.safeParse({ ...VALID, minimumStock: ok }).success, true, String(ok));
  }
  for (const bad of [-1, 1.5, MAX_MINIMUM_STOCK + 1, Number.NaN, "5", null, undefined]) {
    assert.equal(materialRequestSchema.safeParse({ ...VALID, minimumStock: bad }).success, false, String(bad));
  }
});

test("schema: category must be a UUID", () => {
  for (const bad of [undefined, "", "packaging", "123"]) {
    assert.equal(materialRequestSchema.safeParse({ ...VALID, categoryId: bad }).success, false, String(bad));
  }
});

test("schema: reason is required, trimmed, and at most 500 characters", () => {
  assert.deepEqual(materialStatusRequestSchema.parse({ reason: "  Tidak dipakai lagi  " }), {
    reason: "Tidak dipakai lagi",
  });
  for (const bad of [undefined, "", "   ", "a".repeat(501)]) {
    assert.equal(materialStatusRequestSchema.safeParse({ reason: bad }).success, false, String(bad));
  }
  assert.equal(materialStatusRequestSchema.safeParse({ reason: "a".repeat(500) }).success, true);
});

test("form: an empty number input is 'not filled', not 0", () => {
  assert.equal(parseIntegerInput(""), undefined);
  assert.equal(parseIntegerInput("  "), undefined);
  assert.equal(parseIntegerInput("0"), 0);
  assert.equal(parseIntegerInput(" 12 "), 12);
  assert.ok(Number.isNaN(parseIntegerInput("abc")));
});

// --- create ------------------------------------------------------------------

test("create: invalid input answers 400 VALIDATION_ERROR without calling the database", async () => {
  const supabase = mockSupabase({ data: ROW, error: null });
  const response = await createMaterial(supabase, { ...VALID, name: " ", minimumStock: -1 });
  assert.equal(response.status, 400);
  const json = await body(response);
  assert.equal(json.error.code, "VALIDATION_ERROR");
  assert.ok(json.error.fields.name);
  assert.ok(json.error.fields.minimumStock);
  assert.equal(supabase.calls.length, 0);
});

test("create: calls create_material with trimmed values and never sends a stock value", async () => {
  const supabase = mockSupabase({ data: ROW, error: null });
  const response = await createMaterial(supabase, { ...VALID, name: " Kardus Medium ", currentStock: 10 });
  assert.equal(response.status, 201);
  assert.deepEqual(supabase.calls, [
    {
      name: "create_material",
      args: { p_category_id: CAT, p_name: "Kardus Medium", p_unit: "pcs", p_minimum_stock: 50 },
    },
  ]);
  const json = await body(response);
  assert.equal(json.material.id, MAT);
  assert.equal(json.material.currentStock, 0);
  assert.equal(json.material.categoryId, CAT);
  assert.equal(json.material.isArchived, false);
});

test("create: NAME_TAKEN answers 409 and points at the name field", async () => {
  const response = await createMaterial(mockSupabase({ data: null, error: pgError("P0001", "NAME_TAKEN") }), VALID);
  assert.equal(response.status, 409);
  const json = await body(response);
  assert.equal(json.error.code, "NAME_TAKEN");
  assert.deepEqual(Object.keys(json.error.fields), ["name"]);
});

test("create: CATEGORY_NOT_FOUND answers 400 on the category field", async () => {
  const response = await createMaterial(
    mockSupabase({ data: null, error: pgError("P0001", "CATEGORY_NOT_FOUND") }),
    VALID
  );
  assert.equal(response.status, 400);
  assert.deepEqual(Object.keys((await body(response)).error.fields), ["categoryId"]);
});

test("create: an empty or malformed RPC result is OUTCOME_UNKNOWN, never success or 'not saved'", async () => {
  for (const data of [null, {}, { id: 42 }, "ok"]) {
    const response = await quietly(() => createMaterial(mockSupabase({ data, error: null }), VALID));
    assert.equal(response.status, 500, JSON.stringify(data));
    assert.equal((await body(response)).error.code, "OUTCOME_UNKNOWN", JSON.stringify(data));
  }
});

// --- update ------------------------------------------------------------------

test("update: a malformed id answers 400 INVALID_ID without calling the database", async () => {
  const supabase = mockSupabase({ data: ROW, error: null });
  const response = await updateMaterial(supabase, "not-a-uuid", VALID);
  assert.equal(response.status, 400);
  assert.equal((await body(response)).error.code, "INVALID_ID");
  assert.equal(supabase.calls.length, 0);
});

test("update: calls update_material with the id and every editable field", async () => {
  const supabase = mockSupabase({ data: { ...ROW, minimum_stock: 10 }, error: null });
  const response = await updateMaterial(supabase, MAT, { ...VALID, minimumStock: 10 });
  assert.equal(response.status, 200);
  assert.deepEqual(supabase.calls, [
    {
      name: "update_material",
      args: { p_material_id: MAT, p_category_id: CAT, p_name: "Kardus Medium", p_unit: "pcs", p_minimum_stock: 10 },
    },
  ]);
  assert.equal((await body(response)).material.minimumStock, 10);
});

test("update: UNIT_LOCKED and MATERIAL_ARCHIVED answer 409", async () => {
  for (const code of ["UNIT_LOCKED", "MATERIAL_ARCHIVED", "NAME_TAKEN"]) {
    const response = await updateMaterial(mockSupabase({ data: null, error: pgError("P0001", code) }), MAT, VALID);
    assert.equal(response.status, 409, code);
    assert.equal((await body(response)).error.code, code);
  }
});

// --- delete ------------------------------------------------------------------

test("delete: calls delete_material and answers with the deleted id", async () => {
  const supabase = mockSupabase({ data: { id: MAT }, error: null });
  const response = await deleteMaterial(supabase, MAT);
  assert.equal(response.status, 200);
  assert.deepEqual(supabase.calls, [{ name: "delete_material", args: { p_material_id: MAT } }]);
  assert.deepEqual(await body(response), { deleted: { id: MAT } });
});

test("delete: MATERIAL_HAS_HISTORY and MATERIAL_FROZEN answer 409, MATERIAL_NOT_FOUND 404", async () => {
  const cases = { MATERIAL_HAS_HISTORY: 409, MATERIAL_FROZEN: 409, MATERIAL_NOT_FOUND: 404 };
  for (const [code, status] of Object.entries(cases)) {
    const response = await deleteMaterial(mockSupabase({ data: null, error: pgError("P0001", code) }), MAT);
    assert.equal(response.status, status, code);
  }
});

test("delete: a result for another id is OUTCOME_UNKNOWN, never a success", async () => {
  const response = await quietly(() =>
    deleteMaterial(mockSupabase({ data: { id: "00000000-0000-4000-8000-000000000000" }, error: null }), MAT)
  );
  assert.equal(response.status, 500);
  assert.equal((await body(response)).error.code, "OUTCOME_UNKNOWN");
});

test("delete: a malformed id answers 400 without calling the database", async () => {
  const supabase = mockSupabase({ data: { id: MAT }, error: null });
  assert.equal((await deleteMaterial(supabase, "../x")).status, 400);
  assert.equal(supabase.calls.length, 0);
});

// --- archive / reactivate ----------------------------------------------------

test("archive: blank reason answers 400 without calling the database", async () => {
  const supabase = mockSupabase({ data: ROW, error: null });
  const response = await archiveMaterial(supabase, MAT, { reason: "   " });
  assert.equal(response.status, 400);
  assert.ok((await body(response)).error.fields.reason);
  assert.equal(supabase.calls.length, 0);
});

test("archive: calls archive_material with the trimmed reason", async () => {
  const archivedRow = { ...ROW, archived_at: "2026-11-10T02:00:00Z" };
  const supabase = mockSupabase({ data: archivedRow, error: null });
  const response = await archiveMaterial(supabase, MAT, { reason: "  Tidak dipakai lagi " });
  assert.equal(response.status, 200);
  assert.deepEqual(supabase.calls, [
    { name: "archive_material", args: { p_material_id: MAT, p_reason: "Tidak dipakai lagi" } },
  ]);
  const json = await body(response);
  assert.equal(json.material.isArchived, true);
  assert.equal(json.material.archivedAt, "2026-11-10T02:00:00Z");
});

test("archive: STOCK_NOT_ZERO, MATERIAL_FROZEN (OD-05), ALREADY_ARCHIVED answer 409", async () => {
  for (const code of ["STOCK_NOT_ZERO", "MATERIAL_FROZEN", "ALREADY_ARCHIVED"]) {
    const response = await archiveMaterial(
      mockSupabase({ data: null, error: pgError("P0001", code) }),
      MAT,
      { reason: "x" }
    );
    assert.equal(response.status, 409, code);
    assert.equal((await body(response)).error.code, code);
  }
});

test("reactivate: calls reactivate_material; NOT_ARCHIVED answers 409", async () => {
  const supabase = mockSupabase({ data: ROW, error: null });
  const ok = await reactivateMaterial(supabase, MAT, { reason: "Dipakai lagi" });
  assert.equal(ok.status, 200);
  assert.deepEqual(supabase.calls, [
    { name: "reactivate_material", args: { p_material_id: MAT, p_reason: "Dipakai lagi" } },
  ]);

  const rejected = await reactivateMaterial(
    mockSupabase({ data: null, error: pgError("P0001", "NOT_ARCHIVED") }),
    MAT,
    { reason: "Dipakai lagi" }
  );
  assert.equal(rejected.status, 409);
});

// --- error mapping -----------------------------------------------------------

test("errors: every business code maps to its status, and field codes carry fields", async () => {
  for (const [code, [status, , field]] of Object.entries(MATERIAL_ERRORS)) {
    const response = materialRpcErrorResponse(pgError("P0001", code));
    assert.equal(response.status, status, code);
    const json = await body(response);
    assert.equal(json.error.code, code);
    if (field) assert.deepEqual(Object.keys(json.error.fields), [field], code);
    else assert.equal(json.error.fields, undefined, code);
  }
});

test("errors: FORBIDDEN is 403 FORBIDDEN; UNAUTHORIZED is 403 SESSION_NOT_AUTHORIZED", async () => {
  const forbidden = materialRpcErrorResponse(pgError("42501", "FORBIDDEN"));
  assert.equal(forbidden.status, 403);
  assert.equal((await body(forbidden)).error.code, "FORBIDDEN");

  const unauthorized = materialRpcErrorResponse(pgError("42501", "UNAUTHORIZED"));
  assert.equal(unauthorized.status, 403);
  assert.equal((await body(unauthorized)).error.code, "SESSION_NOT_AUTHORIZED");
});

test("errors: lock timeout, serialization, deadlock, cancel are OPERATION_NOT_APPLIED (rolled back)", async () => {
  for (const code of ["55P03", "40001", "40P01", "57014"]) {
    const response = materialRpcErrorResponse(pgError(code, "x"));
    assert.equal(response.status, 503, code);
    assert.equal((await body(response)).error.code, "OPERATION_NOT_APPLIED", code);
    assert.equal(response.headers.get("retry-after"), "2", code);
  }
});

test("errors: transport failure and broken connection are OUTCOME_UNKNOWN, without a retry hint", async () => {
  for (const error of [
    { message: "TypeError: fetch failed" },
    { code: "", message: "fetch failed" },
    pgError("08000", "x"),
    pgError("08003", "x"),
    pgError("08006", "x"),
    null,
  ]) {
    const response = materialRpcErrorResponse(error);
    assert.equal(response.status, 503, JSON.stringify(error));
    const json = await body(response);
    assert.equal(json.error.code, "OUTCOME_UNKNOWN", JSON.stringify(error));
    assert.equal(response.headers.get("retry-after"), null, "no invitation to resend");
    assert.match(json.error.message, /belum diketahui/);
  }
});

test("errors: the old RETRYABLE code is never produced for material operations", async () => {
  for (const error of [
    pgError("55P03", "x"),
    pgError("08006", "x"),
    { message: "fetch failed" },
    pgError("P0001", "NAME_TAKEN"),
    pgError("XX000", "x"),
  ]) {
    const response = await quietly(() => materialRpcErrorResponse(error));
    assert.notEqual((await body(response)).error.code, "RETRYABLE");
  }
});

test("no automatic retry: every command calls its RPC exactly once, whatever the failure", async () => {
  const commands = [
    ["create_material", (s) => createMaterial(s, VALID)],
    ["update_material", (s) => updateMaterial(s, MAT, VALID)],
    ["delete_material", (s) => deleteMaterial(s, MAT)],
    ["archive_material", (s) => archiveMaterial(s, MAT, { reason: "x" })],
    ["reactivate_material", (s) => reactivateMaterial(s, MAT, { reason: "x" })],
  ];
  const failures = [
    { message: "TypeError: fetch failed" },
    pgError("08006", "x"),
    pgError("55P03", "x"),
    pgError("P0001", "NAME_TAKEN"),
    pgError("XX000", "x"),
  ];
  for (const [rpcName, run] of commands) {
    for (const error of failures) {
      const supabase = mockSupabase({ data: null, error });
      await quietly(() => run(supabase));
      assert.equal(supabase.calls.length, 1, `${rpcName} ${JSON.stringify(error)}`);
      assert.equal(supabase.calls[0].name, rpcName);
    }
  }
});

test("errors: unknown codes and prototype names are a generic 500 without SQL details", async () => {
  for (const error of [
    pgError("P0001", "SOMETHING_NEW"),
    pgError("P0001", "constructor"),
    pgError("P0001", "__proto__"),
    pgError("23505", "duplicate key value violates unique constraint"),
    pgError("PGRST202", "Could not find the function public.create_material"),
  ]) {
    const response = await quietly(() => materialRpcErrorResponse(error));
    assert.equal(response.status, 500, error.message);
    const json = await body(response);
    assert.equal(json.error.code, "INTERNAL_ERROR");
    assert.ok(!JSON.stringify(json).includes(error.message), "no database message leaks");
  }
});

test("errors: responses are never cached", () => {
  const response = materialRpcErrorResponse(pgError("P0001", "NAME_TAKEN"));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

// --- read mappers and hints --------------------------------------------------

test("toMaterial: maps category id and archive state", () => {
  assert.deepEqual(toMaterial(ROW), {
    id: MAT,
    categoryId: CAT,
    name: "Kardus Medium",
    categoryName: "Packaging Material",
    unit: "pcs",
    currentStock: 0,
    minimumStock: 50,
    stockStatus: "OUT_OF_STOCK",
    isFrozen: false,
    isArchived: false,
    archivedAt: null,
  });
  assert.equal(toMaterial({ ...ROW, archived_at: "2026-11-10T02:00:00Z" }).isArchived, true);
});

test("toStatusEvent: actor is only 'me' or not (OD-28); no user id is exposed", () => {
  const row = { id: "e1", event_type: "ARCHIVED", reason: "x", created_by: USER, created_at: "t" };
  assert.deepEqual(toStatusEvent(row, USER), { id: "e1", type: "ARCHIVED", reason: "x", createdAt: "t", createdByMe: true });
  assert.equal(toStatusEvent(row, "someone-else").createdByMe, false);
  assert.ok(!("createdBy" in toStatusEvent(row, USER)));
});

// Minimal query-builder mock: from(table).select().eq().limit() resolves to
// the configured { data, error } for that table.
function usageSupabase(results) {
  return {
    from(table) {
      const result = results[table] ?? { data: [], error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => Promise.resolve(result),
      };
      return chain;
    },
  };
}

test("usage: a material without any history has an editable unit and is deletable", async () => {
  const { data } = await getMaterialUsage(usageSupabase({}), MAT);
  assert.deepEqual(data, { unitLocked: false, deletable: true });
});

test("usage: transactions or opname items lock the unit and block delete", async () => {
  for (const table of ["inventory_transactions", "stock_opname_items"]) {
    const { data } = await getMaterialUsage(usageSupabase({ [table]: { data: [{ id: "x" }], error: null } }), MAT);
    assert.deepEqual(data, { unitLocked: true, deletable: false }, table);
  }
});

test("usage: a status event blocks delete but does not lock the unit", async () => {
  const { data } = await getMaterialUsage(
    usageSupabase({ material_status_events: { data: [{ id: "x" }], error: null } }),
    MAT
  );
  assert.deepEqual(data, { unitLocked: false, deletable: false });
});

test("usage: a read error is returned, not hidden as 'no history'", async () => {
  const error = { code: "42501", message: "denied" };
  const result = await getMaterialUsage(usageSupabase({ stock_opname_items: { data: null, error } }), MAT);
  assert.deepEqual(result, { error });
});

test("listMaterials: active by default, archived only on request", () => {
  const calls = [];
  const builder = {
    select: () => builder,
    is: (...args) => (calls.push(["is", ...args]), builder),
    not: (...args) => (calls.push(["not", ...args]), builder),
    order: () => builder,
  };
  const supabase = { from: () => builder };

  listMaterials(supabase);
  listMaterials(supabase, { archived: true });
  assert.deepEqual(calls, [
    ["is", "archived_at", null],
    ["not", "archived_at", "is", null],
  ]);
});

// --- browser-side outcome ----------------------------------------------------

// What the browser sees for a server Response: the Axios error shape that
// toApiError() normalizes.
async function asApiError(response) {
  return toApiError({ response: { status: response.status, data: await response.json() } });
}

test("outcome: a network error or timeout (no response) is UNKNOWN", () => {
  const apiError = toApiError({ code: "ECONNABORTED", message: "timeout of 15000ms exceeded" });
  assert.equal(apiError.status, 0);
  assert.equal(classifyMutationFailure(apiError), UNKNOWN);
});

test("outcome: OUTCOME_UNKNOWN and any other 5xx are UNKNOWN; OPERATION_NOT_APPLIED is REJECTED", () => {
  assert.equal(classifyMutationFailure({ status: 503, code: "OUTCOME_UNKNOWN" }), UNKNOWN);
  assert.equal(classifyMutationFailure({ status: 500, code: "INTERNAL_ERROR" }), UNKNOWN);
  assert.equal(classifyMutationFailure({ status: 502, code: "HTTP_ERROR" }), UNKNOWN);
  assert.equal(classifyMutationFailure({ status: 503, code: "OPERATION_NOT_APPLIED" }), REJECTED);
  assert.equal(classifyMutationFailure(undefined), UNKNOWN);
});

test("outcome: 4xx answers, including repeat rejections, are REJECTED", () => {
  for (const [status, code] of [
    [400, "VALIDATION_ERROR"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "MATERIAL_NOT_FOUND"],
    [409, "NAME_TAKEN"],
    [409, "ALREADY_ARCHIVED"],
    [409, "NOT_ARCHIVED"],
  ]) {
    assert.equal(classifyMutationFailure({ status, code }), REJECTED, code);
  }
});

test("outcome: server mapping and browser reading agree end to end", async () => {
  const transport = await asApiError(materialRpcErrorResponse({ message: "TypeError: fetch failed" }));
  assert.equal(classifyMutationFailure(transport), UNKNOWN);

  const lockTimeout = await asApiError(materialRpcErrorResponse(pgError("55P03", "x")));
  assert.equal(classifyMutationFailure(lockTimeout), REJECTED);

  const malformed = await asApiError(
    await quietly(() => createMaterial(mockSupabase({ data: null, error: null }), VALID))
  );
  assert.equal(classifyMutationFailure(malformed), UNKNOWN);

  const unexpected = await asApiError(await quietly(() => materialRpcErrorResponse(pgError("XX000", "x"))));
  assert.equal(classifyMutationFailure(unexpected), UNKNOWN, "unlisted errors are read conservatively");
});

test("outcome: ALREADY_ARCHIVED, NOT_ARCHIVED, MATERIAL_NOT_FOUND are never read as success", () => {
  for (const [status, code] of [
    [409, "ALREADY_ARCHIVED"],
    [409, "NOT_ARCHIVED"],
    [404, "MATERIAL_NOT_FOUND"],
  ]) {
    const result = describeMutationFailure({ status, code, message: "server text" });
    assert.equal(result.outcome, REJECTED, code);
    assert.equal(result.reload, true, code);
    assert.doesNotMatch(result.message, /berhasil/i, code);
    assert.match(result.message, /pengguna lain/, code);
  }
});

test("outcome: an unknown outcome reloads and says the result is not known", () => {
  const result = describeMutationFailure({ status: 0, code: "NETWORK_ERROR", message: "x" });
  assert.equal(result.outcome, UNKNOWN);
  assert.equal(result.reload, true);
  assert.match(result.message, /belum diketahui/);
  assert.doesNotMatch(result.message, /aman|tidak akan/i, "no promise that resending is safe");
});

test("outcome: validation and authorization rejections keep the server message and do not reload", () => {
  for (const [status, code] of [
    [400, "VALIDATION_ERROR"],
    [403, "FORBIDDEN"],
  ]) {
    assert.deepEqual(describeMutationFailure({ status, code, message: "server text" }), {
      outcome: REJECTED,
      message: "server text",
      reload: false,
    });
  }
  const conflict = describeMutationFailure({ status: 409, code: "STOCK_NOT_ZERO", message: "server text" });
  assert.equal(conflict.reload, true, "a 409 means the page data may be stale");
  const notApplied = describeMutationFailure({ status: 503, code: "OPERATION_NOT_APPLIED", message: "server text" });
  assert.deepEqual(notApplied, { outcome: REJECTED, message: "server text", reload: true });
});

test("outcome: prototype names as codes fall back to the server message", () => {
  const result = describeMutationFailure({ status: 409, code: "constructor", message: "server text" });
  assert.equal(result.message, "server text");
});

// --- navigation --------------------------------------------------------------

test("navigation: new and edit material pages are allowed after login", () => {
  assert.equal(safeNextPath("/materials/new"), "/materials/new");
  assert.equal(safeNextPath(`/materials/${MAT}`), `/materials/${MAT}`);
  assert.equal(safeNextPath(`/materials/${MAT}/edit`), `/materials/${MAT}/edit`);
});

test("navigation: lookalike and external paths still fall back to the default", () => {
  for (const bad of [
    "/materials/new/",
    "/materials/new?x=1",
    `/materials/${MAT}/edit/`,
    `/materials/${MAT}/delete`,
    "/materials/not-a-uuid/edit",
    "//evil.example/materials",
    "/\\evil.example",
    "https://evil.example/materials/new",
    `/materials/${MAT}%2Fedit`,
    undefined,
  ]) {
    assert.equal(safeNextPath(bad), DEFAULT_AFTER_LOGIN, String(bad));
  }
});
