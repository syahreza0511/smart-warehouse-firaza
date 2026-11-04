// Unit tests for the stock movement attempt model and request schemas.
// No network, no database, no Supabase Auth: the API is a mock and storage
// is in memory. These tests check client-side decisions only; they do not
// prove database commits or idempotency (see tests/integration/).
//
// Run: node --test 'tests/unit/*.test.mjs'
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const { beginAttempt, loadPendingAttempt, sendAttempt, UnresolvedAttemptError } = await import(
  new URL("../../components/stock-in-attempt.js", import.meta.url)
);
const { stockMovementRequestSchema, stockMovementFormSchema, stockInFormSchema } = await import(
  new URL("../../lib/validation/schemas.js", import.meta.url)
);

const USER = "116d642c-0000-4000-8000-000000000001";
const MAT = "5a200000-0000-4000-8000-0000000000a1";

class MemoryStorage {
  constructor() {
    this.m = new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
}

const toApiError = (e) => e.apiError;
const httpError = (status, code) =>
  Object.assign(new Error(code), { apiError: { status, code, message: code, fields: null, retryable: status >= 500 } });
const networkError = () =>
  Object.assign(new Error("timeout"), {
    apiError: { status: 0, code: "NETWORK_ERROR", message: "timeout", fields: null, retryable: true },
  });

// Mock of POST /api/v1/stock-movements following the installed contract:
//   proxy / route checks (429, CSRF, auth, Zod)  -> before the RPC
//   RPC step 1-2 (auth, input)                    -> before the lookup
//   RPC step 3 (idempotency)                      -> replay or 422
//   RPC step 4 (material state, balance)          -> 409 codes
//   RPC step 5 (commit)
// `before` queues one-shot rejections raised before the RPC lookup; `after`
// queues what happens to the HTTP response after a commit.
function fakeApi({ stock = 166 } = {}) {
  const store = new Map();
  const state = { stock, archived: false };
  const calls = [];
  const before = [];
  const after = [];
  const post = async (payload, key) => {
    calls.push({ key, payload: structuredClone(payload) });
    const pre = before.shift();
    if (pre === "down") throw networkError();
    if (pre) throw httpError(...pre);
    const prior = store.get(key);
    if (prior) {
      if (JSON.stringify(prior.payload) !== JSON.stringify(payload)) throw httpError(422, "IDEMPOTENCY_KEY_REUSED");
      return prior.movement;
    }
    if (state.archived) throw httpError(409, "MATERIAL_ARCHIVED");
    const delta = payload.type === "STOCK_OUT" ? -payload.quantity : payload.quantity;
    if (state.stock + delta < 0) throw httpError(409, "INSUFFICIENT_STOCK");
    state.stock += delta;
    const movement = { transactionId: randomUUID(), type: payload.type, quantity: payload.quantity, currentStock: state.stock };
    store.set(key, { payload: structuredClone(payload), movement });
    const lost = after.shift();
    if (lost === "timeout") throw networkError();
    if (lost === "503") throw httpError(503, "RETRYABLE");
    return movement;
  };
  return {
    post,
    calls,
    state,
    before,
    after,
    get commits() {
      return store.size;
    },
  };
}

const payload = (quantity = 1, type = "STOCK_IN") => ({ materialId: MAT, type, quantity, notes: null });
let n = 0;
const newKey = () => `key-${++n}`;
const start = (storage, api, quantity = 1, type = "STOCK_IN") => {
  const attempt = beginAttempt({ storage, userId: USER, payload: payload(quantity, type), pending: null, newKey });
  return sendAttempt({ attempt, post: api.post, toApiError, storage }).then((r) => ({ attempt, r }));
};
const resend = (storage, api, attempt) => sendAttempt({ attempt, post: api.post, toApiError, storage });
const sameKeyAndPayload = (api) =>
  api.calls.every(
    (c) => c.key === api.calls[0].key && JSON.stringify(c.payload) === JSON.stringify(api.calls[0].payload)
  );

// ---------------------------------------------------------------------------
// Stock In regression (carried over unchanged from 7SUP.5A-3R2).
// ---------------------------------------------------------------------------

test("commit, timeout, then HTTP 429 on retry: attempt kept with its key; later replay resolves; one commit", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.after.push("timeout");
  const { attempt, r } = await start(storage, api, 2);
  assert.equal(r.outcome, "uncertain");
  api.before.push([429, "HTTP_ERROR"]);
  const r2 = await resend(storage, api, r.attempt);
  assert.equal(r2.outcome, "uncertain");
  assert.equal(loadPendingAttempt(storage, USER, MAT).key, attempt.key);
  const r3 = await resend(storage, api, r2.attempt);
  assert.equal(r3.outcome, "success");
  assert.equal(api.commits, 1);
  assert.equal(api.state.stock, 168);
  assert.ok(sameKeyAndPayload(api));
  assert.equal(loadPendingAttempt(storage, USER, MAT), null);
});

test("commit, timeout, then HTTP 409 on retry from outside the RPC (no RPC code): attempt kept; replay resolves; one commit", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.after.push("timeout");
  const { r } = await start(storage, api);
  for (const code of ["HTTP_ERROR", "CONFLICT"]) {
    api.before.push([409, code]);
    const r2 = await resend(storage, api, r.attempt);
    assert.equal(r2.outcome, "uncertain", code);
  }
  assert.ok(loadPendingAttempt(storage, USER, MAT));
  const r3 = await resend(storage, api, r.attempt);
  assert.equal(r3.outcome, "success");
  assert.equal(api.commits, 1);
  assert.ok(sameKeyAndPayload(api));
});

test("commit, timeout, material archived afterwards: the retry is replayed (no 409), one commit", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.after.push("timeout");
  const { r } = await start(storage, api);
  api.state.archived = true;
  const r2 = await resend(storage, api, r.attempt);
  assert.equal(r2.outcome, "success");
  assert.equal(api.commits, 1);
});

test("other 4xx on a resend (400, 404, 415, 422, 429, 401, 403) never clear an uncertain attempt", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.after.push("timeout");
  const { attempt, r } = await start(storage, api);
  for (const e of [
    [400, "VALIDATION_ERROR"],
    [400, "INVALID_QUANTITY"],
    [404, "MATERIAL_NOT_FOUND"],
    [415, "UNSUPPORTED_MEDIA_TYPE"],
    [422, "IDEMPOTENCY_KEY_REUSED"],
    [429, "HTTP_ERROR"],
    [401, "UNAUTHENTICATED"],
    [403, "CSRF_REJECTED"],
    [403, "SESSION_NOT_AUTHORIZED"],
  ]) {
    api.before.push(e);
    const r2 = await resend(storage, api, r.attempt);
    assert.equal(r2.outcome, "uncertain", `${e[0]} ${e[1]}`);
    assert.equal(loadPendingAttempt(storage, USER, MAT).key, attempt.key);
  }
  assert.equal(api.commits, 1);
});

test("authoritative 409 after the RPC lookup resolves an attempt that never committed", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.before.push("down");
  const { r } = await start(storage, api);
  assert.equal(r.outcome, "uncertain");
  api.state.archived = true;
  const r2 = await resend(storage, api, r.attempt);
  assert.equal(r2.outcome, "rejected");
  assert.equal(r2.error.code, "MATERIAL_ARCHIVED");
  assert.equal(api.commits, 0);
  assert.equal(loadPendingAttempt(storage, USER, MAT), null);
});

test("a new key is refused while the original result is unknown (in memory and after reload)", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.after.push("timeout");
  const { r } = await start(storage, api);
  api.before.push([429, "HTTP_ERROR"]);
  const r2 = await resend(storage, api, r.attempt);
  assert.throws(
    () => beginAttempt({ storage, userId: USER, payload: payload(1), pending: r2.attempt, newKey }),
    UnresolvedAttemptError
  );
  assert.throws(
    () => beginAttempt({ storage, userId: USER, payload: payload(5), pending: null, newKey }),
    UnresolvedAttemptError
  );
  assert.equal(api.commits, 1);
});

test("definitive first-request validation rejection: cleared, nothing committed, new key allowed", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.before.push([400, "VALIDATION_ERROR"]);
  const { attempt, r } = await start(storage, api);
  assert.equal(r.outcome, "rejected");
  assert.equal(api.commits, 0);
  assert.equal(loadPendingAttempt(storage, USER, MAT), null);
  const next = beginAttempt({ storage, userId: USER, payload: payload(1), pending: null, newKey });
  assert.notEqual(next.key, attempt.key);
});

test("session interruption (401, then 403 SESSION_NOT_AUTHORIZED) followed by retry with the original key", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.after.push("503");
  const { attempt, r } = await start(storage, api, 3);
  api.before.push([401, "UNAUTHENTICATED"], [403, "SESSION_NOT_AUTHORIZED"]);
  const r2 = await resend(storage, api, r.attempt);
  const r3 = await resend(storage, api, r2.attempt);
  assert.equal(r2.outcome, "uncertain");
  assert.equal(r3.outcome, "uncertain");
  // After re-login the page reloads and restores the attempt from storage.
  const restored = loadPendingAttempt(storage, USER, MAT);
  assert.equal(restored.key, attempt.key);
  const r4 = await resend(storage, api, restored);
  assert.equal(r4.outcome, "success");
  assert.equal(api.commits, 1);
  assert.equal(api.state.stock, 169);
  assert.ok(sameKeyAndPayload(api));
});

test("exactly one committed mutation across a long mixed sequence", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.after.push("timeout");
  let { r } = await start(storage, api, 4);
  for (const step of ["down", [429, "HTTP_ERROR"], [409, "HTTP_ERROR"], [401, "UNAUTHENTICATED"], [503, "RETRYABLE"]]) {
    api.before.push(step);
    r = { ...r, ...(await resend(storage, api, r.attempt)) };
    assert.equal(r.outcome, "uncertain");
  }
  const done = await resend(storage, api, r.attempt);
  assert.equal(done.outcome, "success");
  assert.equal(api.commits, 1);
  assert.equal(api.state.stock, 170);
  assert.equal(api.calls.length, 7);
  assert.ok(sameKeyAndPayload(api));
});

// ---------------------------------------------------------------------------
// Type isolation (7SUP.5B-1A decision B3).
// ---------------------------------------------------------------------------

test("STOCK_IN attempts keep the original storage key prefix", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.before.push("down");
  await start(storage, api, 1, "STOCK_IN");
  assert.deepEqual([...storage.m.keys()], [`firaza.stockIn.pending.${USER}.${MAT}`]);
});

test("an attempt stored by the earlier Stock In build is still restored", () => {
  const storage = new MemoryStorage();
  const legacy = { key: "legacy-key", userId: USER, payload: payload(7, "STOCK_IN"), uncertain: true };
  storage.setItem(`firaza.stockIn.pending.${USER}.${MAT}`, JSON.stringify(legacy));
  assert.deepEqual(loadPendingAttempt(storage, USER, MAT), legacy);
  assert.deepEqual(loadPendingAttempt(storage, USER, MAT, "STOCK_IN"), legacy);
  assert.equal(loadPendingAttempt(storage, USER, MAT, "STOCK_OUT"), null);
});

test("an unresolved Stock In neither blocks nor restores as a Stock Out, and the reverse", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi();
  api.before.push("down");
  const { r: rin } = await start(storage, api, 2, "STOCK_IN");
  assert.equal(rin.outcome, "uncertain");

  assert.equal(loadPendingAttempt(storage, USER, MAT, "STOCK_OUT"), null);
  api.before.push("down");
  const { r: rout } = await start(storage, api, 1, "STOCK_OUT");
  assert.equal(rout.outcome, "uncertain");

  assert.equal(loadPendingAttempt(storage, USER, MAT, "STOCK_IN").payload.type, "STOCK_IN");
  assert.equal(loadPendingAttempt(storage, USER, MAT, "STOCK_OUT").payload.type, "STOCK_OUT");
  assert.equal(storage.m.size, 2);

  // Each type still refuses a second key of its own.
  for (const type of ["STOCK_IN", "STOCK_OUT"]) {
    assert.throws(
      () => beginAttempt({ storage, userId: USER, payload: payload(1, type), pending: null, newKey }),
      UnresolvedAttemptError,
      type
    );
  }
});

test("a stored record whose payload type does not match its slot is ignored", () => {
  const storage = new MemoryStorage();
  const wrong = { key: "k", userId: USER, payload: payload(1, "STOCK_IN"), uncertain: true };
  storage.setItem(`firaza.stockOut.pending.${USER}.${MAT}`, JSON.stringify(wrong));
  assert.equal(loadPendingAttempt(storage, USER, MAT, "STOCK_OUT"), null);
});

test("an unsupported movement type is refused before anything is stored", () => {
  const storage = new MemoryStorage();
  assert.throws(
    () => beginAttempt({ storage, userId: USER, payload: payload(1, "ADJUSTMENT"), pending: null, newKey }),
    TypeError
  );
  assert.equal(storage.m.size, 0);
});

// ---------------------------------------------------------------------------
// Stock Out attempt behaviour (mock only).
// ---------------------------------------------------------------------------

test("Stock Out: commit, lost response, resend replays the stored result; one commit", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi({ stock: 10 });
  api.after.push("timeout");
  const { r } = await start(storage, api, 3, "STOCK_OUT");
  assert.equal(r.outcome, "uncertain");
  const r2 = await resend(storage, api, r.attempt);
  assert.equal(r2.outcome, "success");
  assert.equal(r2.movement.currentStock, 7);
  assert.equal(api.commits, 1);
  assert.equal(api.state.stock, 7);
  assert.ok(sameKeyAndPayload(api));
  assert.equal(loadPendingAttempt(storage, USER, MAT, "STOCK_OUT"), null);
});

test("Stock Out: INSUFFICIENT_STOCK on the first send is a definitive rejection", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi({ stock: 0 });
  const { r } = await start(storage, api, 1, "STOCK_OUT");
  assert.equal(r.outcome, "rejected");
  assert.equal(r.error.code, "INSUFFICIENT_STOCK");
  assert.equal(api.commits, 0);
  assert.equal(loadPendingAttempt(storage, USER, MAT, "STOCK_OUT"), null);
});

test("Stock Out: INSUFFICIENT_STOCK on a resend proves the original never committed", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi({ stock: 5 });
  api.before.push("down");
  const { r } = await start(storage, api, 4, "STOCK_OUT");
  assert.equal(r.outcome, "uncertain");
  api.state.stock = 2; // another user took stock meanwhile
  const r2 = await resend(storage, api, r.attempt);
  assert.equal(r2.outcome, "rejected");
  assert.equal(r2.error.code, "INSUFFICIENT_STOCK");
  assert.equal(api.commits, 0);
  assert.equal(api.state.stock, 2);
  assert.equal(loadPendingAttempt(storage, USER, MAT, "STOCK_OUT"), null);
});

test("Stock Out: a committed attempt is replayed even if the balance later drops to zero", async () => {
  const storage = new MemoryStorage();
  const api = fakeApi({ stock: 1 });
  api.after.push("timeout");
  const { r } = await start(storage, api, 1, "STOCK_OUT");
  assert.equal(api.state.stock, 0);
  const r2 = await resend(storage, api, r.attempt);
  assert.equal(r2.outcome, "success");
  assert.equal(api.commits, 1);
  assert.equal(api.state.stock, 0);
});

// ---------------------------------------------------------------------------
// Request and form schemas.
// ---------------------------------------------------------------------------

const body = (over = {}) => ({ materialId: MAT, type: "STOCK_OUT", quantity: 1, notes: null, ...over });

test("schema: STOCK_IN and STOCK_OUT are accepted", () => {
  for (const type of ["STOCK_IN", "STOCK_OUT"]) {
    const parsed = stockMovementRequestSchema.safeParse(body({ type }));
    assert.equal(parsed.success, true, type);
    assert.equal(parsed.data.type, type);
  }
});

test("schema: other or malformed types are rejected", () => {
  for (const type of ["ADJUSTMENT", "REVERSAL", "OPENING_BALANCE", "stock_out", "", null, undefined, 1]) {
    assert.equal(stockMovementRequestSchema.safeParse(body({ type })).success, false, String(type));
  }
});

test("schema: invalid quantities are rejected", () => {
  for (const quantity of [undefined, null, "", "1", 0, -1, 1.5, 2147483648, Number.NaN, Infinity]) {
    assert.equal(stockMovementRequestSchema.safeParse(body({ quantity })).success, false, String(quantity));
  }
  assert.equal(stockMovementRequestSchema.safeParse(body({ quantity: 2147483647 })).success, true);
});

test("schema: a malformed material id is rejected", () => {
  for (const materialId of ["x", "", null, undefined, "5a200000-0000-4000-8000"]) {
    assert.equal(stockMovementRequestSchema.safeParse(body({ materialId })).success, false, String(materialId));
  }
});

test("schema: unknown fields are dropped and notes are normalized", () => {
  const parsed = stockMovementRequestSchema.safeParse(body({ role: "OWNER", createdBy: USER, notes: "  " }));
  assert.equal(parsed.success, true);
  assert.equal("role" in parsed.data, false);
  assert.equal("createdBy" in parsed.data, false);
  assert.equal(parsed.data.notes, null);
  assert.equal(stockMovementRequestSchema.safeParse(body({ notes: "x".repeat(501) })).success, false);
});

test("schema: the Stock In form schema is the shared form schema", () => {
  assert.equal(stockInFormSchema, stockMovementFormSchema);
  assert.equal(stockMovementFormSchema.safeParse({ quantity: 0, notes: "" }).success, false);
  assert.equal(stockMovementFormSchema.safeParse({ quantity: 3, notes: "" }).success, true);
});
