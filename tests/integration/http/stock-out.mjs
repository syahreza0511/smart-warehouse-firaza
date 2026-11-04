// HTTP integration harness for Stock Out (7SUP.5B-2B). Talks to a running
// local Next.js server and reads (never writes) the local Supabase database
// through `docker exec … psql` in READ ONLY transactions. Not a unit test and
// not run by CI.
//
// Run only with owner approval for the phases you select:
//
//   FIRAZA_DEMO_CREDENTIALS_FILE=/path/outside/repo/credentials.json \
//   node tests/integration/http/stock-out.mjs --phase=pre-rpc,rpc-reject
//
// Phases (comma-separated, none by default; they always run in this order):
//   pre-rpc     Requests the route must reject before the database is reached.
//   rpc-reject  Requests that reach post_stock_movement and are rolled back.
//   commit      Commits exactly ONE Stock Out of quantity 1 on
//               "[DEMO] Kardus Medium", then checks replay and key reuse.
//               Requires, in the same invocation, pre-rpc and rpc-reject with
//               zero failures, plus:
//                 FIRAZA_ALLOW_STOCK_OUT_COMMIT=7SUP.5B-2B
//                 FIRAZA_EXPECT_BASELINE=tx=<n>,idem=<n>,kardus_stock=<n>,kardus_tx=<n>
//               The expected baseline must match the database exactly, and no
//               transaction may already carry the test note. After one commit
//               neither holds, so a second run refuses to commit.
//
// Fail-closed rules:
//   - Base URL fixed to http://127.0.0.1:3000; DB container must be local
//     (`supabase_db_*`). Any DB read error aborts the run.
//   - Every request that expects a rejection is built so that, if the guard
//     under test were broken, the database would still reject it: unknown
//     material, impossible quantity, or a payload that differs from the
//     stored idempotency hash. A broken guard shows up as a FAIL, never as a
//     mutation.
//   - Any FAIL stops the run immediately (fail-fast). The commit phase never
//     starts after a failure.
//   - Inventory state (transaction count and checksum, idempotency rows,
//     balances, integrity invariants) is compared in the database before and
//     after every phase.
//   - Once the commit requests have been sent, ANY later problem (uncertain
//     responses, a failed check, a transport error, a failed database read,
//     a failed logout or session check) ends the run with status
//     POST-COMMIT NO-RETRY and exit code 2: do not rerun the harness;
//     reconcile read-only in the database first.
//   - Each account is logged out independently; a failed logout is a FAIL.
//   - Sessions are compared by identity, not only by count: a fingerprint of
//     every session that existed before the run (id, user, timestamps,
//     refresh counter) must be identical at every check, so pre-existing
//     sessions, including the accepted residual one, are neither used,
//     refreshed, nor revoked; and the number of sessions created during the
//     run must match the live logins, ending at 0.
//   - Cookie values, tokens, passwords, and session ids are never printed.
//
// Exit codes: 0 all PASS, 1 FAIL or abort before any commit request,
// 2 POST-COMMIT NO-RETRY (commit requests were sent and the run did not end
// cleanly).
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "http://127.0.0.1:3000";
const COMMIT_OPT_IN = "7SUP.5B-2B";
const KARDUS = "[DEMO] Kardus Medium";
const RIBBON = "[DEMO] Ribbon Merah";
// Literal is also embedded in SQL below; keep it free of quotes.
const TEST_NOTE = "TEST 7SUP.5B-2B HTTP E2E Stock Out";
const PARALLEL = 5;
const IMPOSSIBLE_QUANTITY = 2147483647;
const DB_CONTAINER = process.env.FIRAZA_DB_CONTAINER ?? "supabase_db_Smart-Warehouse-Firaza-GitHub-Ready";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

class UncertainCommitError extends Error {}

// Set immediately before the committing requests are sent; from then on every
// failure is reported as POST-COMMIT NO-RETRY.
let commitSent = false;

function fail(message) {
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Results (fail-fast)
// ---------------------------------------------------------------------------

const results = [];

function record(id, ok, description, observed) {
  results.push({ id, ok, description, observed });
  console.log(`${id} | ${ok ? "PASS" : "FAIL"} | ${description} | ${observed}`);
  return ok;
}

// Records and stops the run on failure.
function check(id, ok, description, observed) {
  if (!record(id, ok, description, observed)) fail(`${id} failed; stopping (fail-fast).`);
}

function expectError(id, description, r, status, code) {
  check(id, r.status === status && r.json?.error?.code === code, description, `${r.status}/${r.json?.error?.code ?? "-"}`);
}

const failures = () => results.filter((r) => !r.ok).length;

// ---------------------------------------------------------------------------
// Guards and configuration
// ---------------------------------------------------------------------------

function parsePhases(argv) {
  const arg = argv.find((a) => a.startsWith("--phase="));
  const phases = arg ? arg.slice("--phase=".length).split(",").filter(Boolean) : [];
  const known = new Set(["pre-rpc", "rpc-reject", "commit"]);
  for (const p of phases) if (!known.has(p)) fail(`Unknown phase: ${p}`);
  if (phases.length === 0) fail("No phase selected. Use --phase=pre-rpc,rpc-reject[,commit] (see header).");
  if (phases.includes("commit")) {
    if (!phases.includes("pre-rpc") || !phases.includes("rpc-reject")) {
      fail('Phase "commit" must run together with "pre-rpc" and "rpc-reject" in the same invocation.');
    }
    if (process.env.FIRAZA_ALLOW_STOCK_OUT_COMMIT !== COMMIT_OPT_IN) {
      fail(`Phase "commit" needs FIRAZA_ALLOW_STOCK_OUT_COMMIT=${COMMIT_OPT_IN}.`);
    }
  }
  return phases;
}

function parseExpectedBaseline() {
  const raw = process.env.FIRAZA_EXPECT_BASELINE;
  if (!raw) fail("Phase \"commit\" needs FIRAZA_EXPECT_BASELINE=tx=<n>,idem=<n>,kardus_stock=<n>,kardus_tx=<n>.");
  const out = {};
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=");
    if (!/^\d+$/.test(v ?? "")) fail(`FIRAZA_EXPECT_BASELINE: invalid value for ${k}.`);
    out[k] = Number(v);
  }
  for (const k of ["tx", "idem", "kardus_stock", "kardus_tx"]) {
    if (!(k in out)) fail(`FIRAZA_EXPECT_BASELINE: missing ${k}.`);
  }
  return out;
}

function checkBaseUrl() {
  const configured = process.env.FIRAZA_BASE_URL ?? BASE_URL;
  if (configured !== BASE_URL) fail(`Refusing to run against ${configured}; only ${BASE_URL} is allowed.`);
}

function loadAccounts() {
  const file = process.env.FIRAZA_DEMO_CREDENTIALS_FILE;
  if (!file) fail("Set FIRAZA_DEMO_CREDENTIALS_FILE to the private credential file.");
  const resolved = path.resolve(file);
  if (resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep)) {
    fail("The credential file must be outside the repository.");
  }
  if ((statSync(resolved).mode & 0o077) !== 0) fail("The credential file must not be readable by group or others.");

  let accounts;
  try {
    accounts = JSON.parse(readFileSync(resolved, "utf8")).accounts;
  } catch {
    fail("The credential file could not be parsed (contents not shown).");
  }
  const byRole = (role) => {
    const account = Array.isArray(accounts) ? accounts.find((a) => a?.role === role) : null;
    if (!account?.email || !account?.password) fail(`No ${role} account in the credential file.`);
    return { email: account.email, password: account.password };
  };
  return { staff: byRole("STAFF_WAREHOUSE"), owner: byRole("OWNER") };
}

// ---------------------------------------------------------------------------
// Database reads (READ ONLY transaction; output is counts and checksums only)
// ---------------------------------------------------------------------------

function dbRead(sql) {
  if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(DB_CONTAINER)) fail("FIRAZA_DB_CONTAINER must be a local supabase_db_* container.");
  try {
    return execFileSync(
      "docker",
      ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-qAtX", "-F", "|", "-v", "ON_ERROR_STOP=1"],
      { input: `begin transaction read only;\n${sql}\nrollback;\n`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch {
    fail("Database read failed (details not shown); aborting.");
  }
}

const STATE_SQL = `
select
  (select count(*) from public.inventory_transactions),
  (select count(*) from app_private.idempotency_requests),
  (select coalesce(string_agg(m.name || '=' || m.current_stock, ';' order by m.name), '') from public.materials m),
  (select md5(coalesce(string_agg(t::text, ',' order by t.id), '')) from public.inventory_transactions t),
  (select count(*) from public.inventory_transactions t join public.materials m on m.id = t.material_id where m.name = '${KARDUS}'),
  (select count(*) from public.inventory_transactions where notes = '${TEST_NOTE}'),
  (select count(*) from public.materials m
     where m.current_stock <> coalesce((select sum(x.quantity_delta) from public.inventory_transactions x where x.material_id = m.id), 0)),
  (select count(*) from app_private.idempotency_requests r
     where r.response is null
        or not exists (select 1 from public.inventory_transactions t where t.id = (r.response ->> 'transaction_id')::uuid)),
  (select count(*) from public.inventory_transactions t
     where not exists (select 1 from app_private.idempotency_requests r where (r.response ->> 'transaction_id')::uuid = t.id)),
  (select count(*) from auth.sessions),
  (select count(*) from auth.audit_log_entries);`;

function dbState() {
  const f = dbRead(STATE_SQL).split("|");
  if (f.length !== 11) fail("Unexpected database state format; aborting.");
  const balances = Object.fromEntries(
    f[2].split(";").filter(Boolean).map((p) => {
      const i = p.lastIndexOf("=");
      return [p.slice(0, i), Number(p.slice(i + 1))];
    })
  );
  return {
    inventory: {
      tx: Number(f[0]),
      idem: Number(f[1]),
      balances,
      txChecksum: f[3],
      kardusTx: Number(f[4]),
      markerTx: Number(f[5]),
    },
    integrity: { balanceMismatch: Number(f[6]), idemOrphans: Number(f[7]), txWithoutIdem: Number(f[8]) },
    sessions: Number(f[9]),
    audit: Number(f[10]),
  };
}

function checkIntegrity(id, state) {
  const i = state.integrity;
  check(
    id,
    i.balanceMismatch === 0 && i.idemOrphans === 0 && i.txWithoutIdem === 0,
    "DB integrity: balance = sum(delta), idempotency 1:1 with transactions",
    `mismatch=${i.balanceMismatch} orphans=${i.idemOrphans} untracked=${i.txWithoutIdem}`
  );
}

function checkInventoryUnchanged(id, before, after) {
  const same = JSON.stringify(before.inventory) === JSON.stringify(after.inventory);
  check(id, same, "DB inventory unchanged (transactions, checksum, idempotency, balances)", same ? "unchanged" : "CHANGED");
  checkIntegrity(`${id}-INT`, after);
}

// Session identity, without printing ids. `since` is the database clock at
// the start of the run (validated format, embedded as a literal).
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/;

function dbClock() {
  const ts = dbRead("select clock_timestamp();");
  if (!TIMESTAMP_PATTERN.test(ts)) fail("Unexpected database clock format; aborting.");
  return ts;
}

function sessionState(since) {
  if (!TIMESTAMP_PATTERN.test(since)) fail("Invalid session reference time.");
  const f = dbRead(`
select
  (select md5(coalesce(string_agg(
      s.id::text || '/' || s.user_id::text || '/' || s.created_at::text || '/' || coalesce(s.updated_at::text, '') || '/' ||
      coalesce(s.refreshed_at::text, '') || '/' || coalesce(s.not_after::text, '') || '/' || coalesce(s.refresh_token_counter::text, ''),
      ',' order by s.id), ''))
     from auth.sessions s where s.created_at <= '${since}'::timestamptz),
  (select count(*) from auth.sessions s where s.created_at <= '${since}'::timestamptz),
  (select count(*) from auth.sessions s where s.created_at > '${since}'::timestamptz);`).split("|");
  if (f.length !== 3) fail("Unexpected session state format; aborting.");
  return { preExisting: f[0], preExistingCount: Number(f[1]), createdDuringRun: Number(f[2]) };
}

// Pre-existing sessions unchanged, and exactly `expectedNew` sessions created
// by this run still alive.
function checkSessions(id, ctx, expectedNew) {
  const s = sessionState(ctx.since);
  check(
    id,
    s.preExisting === ctx.sessions.preExisting && s.preExistingCount === ctx.sessions.preExistingCount && s.createdDuringRun === expectedNew,
    `pre-existing sessions untouched; ${expectedNew} session(s) from this run alive`,
    `pre_existing=${s.preExisting === ctx.sessions.preExisting ? "identical" : "CHANGED"}(${s.preExistingCount}) run=${s.createdDuringRun}`
  );
}

function printReconciliation(label, state) {
  const inv = state.inventory;
  console.log(
    `RECON ${label} | tx=${inv.tx} idem=${inv.idem} kardus_tx=${inv.kardusTx} marker_tx=${inv.markerTx} ` +
      `balances=${JSON.stringify(inv.balances)} integrity=${JSON.stringify(state.integrity)} sessions=${state.sessions} audit=${state.audit}`
  );
}

// ---------------------------------------------------------------------------
// HTTP with a per-account cookie jar
// ---------------------------------------------------------------------------

// Every client with a live login, so the final cleanup can log out each one,
// including temporary clients created inside a phase.
const liveClients = new Set();

class Client {
  constructor(label) {
    this.label = label;
    this.jar = new Map();
  }

  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  store(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired =
        value === "" ||
        attrs.some((a) => /^\s*max-age=(0|-\d+)\s*$/i.test(a)) ||
        attrs.some((a) => {
          const m = /^\s*expires=(.+)$/i.exec(a);
          return m && Date.parse(m[1]) <= Date.now();
        });
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  async request(method, url, { body, rawBody, headers = {}, origin = BASE_URL, contentType = "application/json" } = {}) {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    if (contentType && (body !== undefined || rawBody !== undefined)) h["Content-Type"] = contentType;
    if (this.jar.size) h.Cookie = this.cookieHeader();
    const res = await fetch(BASE_URL + url, {
      method,
      headers: h,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: "manual",
    });
    this.store(res);
    let json = null;
    try {
      json = await res.json();
    } catch {
      // Not JSON.
    }
    return { status: res.status, json };
  }

  async login({ email, password }) {
    const r = await this.request("POST", "/api/v1/auth/login", { body: { email, password } });
    if (r.status !== 200) fail(`${this.label} login failed with HTTP ${r.status}`);
    // The session exists once the server answered 200, so register it before
    // validating the body.
    this.loggedIn = true;
    liveClients.add(this);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r.json?.user?.id ?? "")) {
      fail(`${this.label} login returned no valid user id.`);
    }
    return r.json.user;
  }

  // Returns true when the server confirmed the logout (or nothing to do).
  async logout() {
    if (!this.loggedIn) return true;
    const r = await this.request("POST", "/api/v1/auth/logout", { body: {} });
    if (r.status !== 200) return false;
    this.loggedIn = false;
    liveClients.delete(this);
    this.jar.clear();
    return true;
  }
}

const postMovement = (client, body, key = randomUUID(), opts = {}) =>
  client.request("POST", "/api/v1/stock-movements", {
    body,
    headers: key === null ? {} : { "Idempotency-Key": key },
    ...opts,
  });

// A copy of the Supabase auth cookie whose access token keeps its header and
// payload but carries an altered signature. Works on single or chunked
// cookies; aborts (FAIL) if the format is not recognised.
function forgedSignatureJar(jar) {
  const names = [...jar.keys()];
  const base =
    names.find((k) => /^sb-.+-auth-token$/.test(k)) ??
    names.map((k) => k.replace(/\.\d+$/, "")).find((k) => /^sb-.+-auth-token$/.test(k));
  if (!base) fail("P-10b: Supabase auth cookie not found.");

  let raw = jar.get(base);
  if (raw === undefined) {
    const parts = [];
    for (let i = 0; jar.has(`${base}.${i}`); i++) parts.push(jar.get(`${base}.${i}`));
    raw = parts.join("");
  }
  raw = decodeURIComponent(raw);
  if (!raw.startsWith("base64-")) fail("P-10b: unexpected auth cookie encoding.");

  let session;
  try {
    session = JSON.parse(Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8"));
  } catch {
    fail("P-10b: auth cookie could not be decoded.");
  }
  const segments = typeof session?.access_token === "string" ? session.access_token.split(".") : [];
  if (segments.length !== 3 || segments[2].length < 2) fail("P-10b: access token not found in the cookie.");
  const sig = segments[2];
  segments[2] = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  session.access_token = segments.join(".");

  return new Map([[base, "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url")]]);
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

// Every body below names a material that does not exist, so a request that
// slipped past a broken guard is still rejected by the RPC (404) instead of
// changing stock.
function safeBody(over = {}) {
  return { materialId: randomUUID(), type: "STOCK_OUT", quantity: 1, notes: null, ...over };
}

async function phasePreRpc({ staff, owner, accounts, ctx }) {
  const anon = new Client("anon");

  expectError("P-01", "anonymous Stock Out -> 401", await postMovement(anon, safeBody()), 401, "UNAUTHENTICATED");
  expectError(
    "P-02",
    "foreign Origin -> 403 CSRF",
    await postMovement(staff, safeBody(), undefined, { origin: "http://evil.example" }),
    403,
    "CSRF_REJECTED"
  );
  expectError(
    "P-03a",
    "no Origin, no Sec-Fetch-Site -> 403 CSRF",
    await postMovement(staff, safeBody(), undefined, { origin: null }),
    403,
    "CSRF_REJECTED"
  );
  expectError(
    "P-03b",
    "no Origin, Sec-Fetch-Site cross-site -> 403 CSRF",
    await postMovement(staff, safeBody(), undefined, { origin: null, headers: { "Idempotency-Key": randomUUID(), "Sec-Fetch-Site": "cross-site" } }),
    403,
    "CSRF_REJECTED"
  );
  expectError(
    "P-04",
    "text/plain body -> 415",
    await postMovement(staff, safeBody(), undefined, { contentType: "text/plain" }),
    415,
    "UNSUPPORTED_MEDIA_TYPE"
  );
  expectError(
    "P-05",
    "malformed JSON -> 400",
    await staff.request("POST", "/api/v1/stock-movements", { rawBody: "{not json", headers: { "Idempotency-Key": randomUUID() } }),
    400,
    "INVALID_JSON"
  );
  expectError("P-06", "OWNER Stock Out -> 403 FORBIDDEN", await postMovement(owner, safeBody()), 403, "FORBIDDEN");
  expectError("P-07a", "missing Idempotency-Key -> 400", await postMovement(staff, safeBody(), null), 400, "IDEMPOTENCY_KEY_REQUIRED");
  expectError("P-07b", "non-UUID Idempotency-Key -> 400", await postMovement(staff, safeBody(), "not-a-uuid"), 400, "IDEMPOTENCY_KEY_REQUIRED");

  const invalid = [
    ["quantity missing", { quantity: undefined }],
    ["quantity 0", { quantity: 0 }],
    ["quantity -1", { quantity: -1 }],
    ["quantity 1.5", { quantity: 1.5 }],
    ["quantity 2147483648", { quantity: 2147483648 }],
    ['quantity "1"', { quantity: "1" }],
    ["materialId x", { materialId: "x" }],
    ["notes 501 chars", { notes: "x".repeat(501) }],
  ];
  // The same validation runs for Stock In (regression, nothing reaches the RPC).
  for (const type of ["STOCK_OUT", "STOCK_IN"]) {
    for (const [label, over] of invalid) {
      expectError(`P-08 ${type}`, `${label} -> 400`, await postMovement(staff, safeBody({ ...over, type })), 400, "VALIDATION_ERROR");
    }
  }
  for (const type of ["TRANSFER", "ADJUSTMENT", "OPENING_BALANCE"]) {
    expectError("P-08 type", `type ${type} -> 400`, await postMovement(staff, safeBody({ type })), 400, "VALIDATION_ERROR");
  }

  // Cookies kept from a logged-out session must not work (separate login).
  const temp = new Client("staff-temp");
  await temp.login(accounts.staff);
  checkSessions("P-09-SESSIONS", ctx, 3);
  const saved = new Map(temp.jar);
  check("P-09-LOGOUT", await temp.logout(), "temporary session logged out", "");
  checkSessions("P-09-REVOKED", ctx, 2);
  const replayed = new Client("staff-temp-replayed");
  replayed.jar = saved;
  expectError("P-09", "logged-out cookies -> 401", await postMovement(replayed, safeBody()), 401, "UNAUTHENTICATED");

  const corrupt = new Client("corrupt");
  for (const [k, v] of staff.jar) corrupt.jar.set(k, v.slice(0, -4) + "AAAA");
  expectError("P-10a", "corrupted auth cookie -> 401", await postMovement(corrupt, safeBody()), 401, "UNAUTHENTICATED");

  const forged = new Client("forged");
  forged.jar = forgedSignatureJar(staff.jar);
  expectError("P-10b", "access token with altered signature -> 401", await postMovement(forged, safeBody()), 401, "UNAUTHENTICATED");
}

async function phaseRpcReject({ staff, api }) {
  const kardus = api[KARDUS];
  const ribbon = api[RIBBON];
  if (!kardus || !ribbon) fail("rpc-reject: demo materials not found.");

  expectError(
    "R-01",
    "unknown material -> 404 (rolled back in the RPC)",
    await postMovement(staff, safeBody()),
    404,
    "MATERIAL_NOT_FOUND"
  );
  // Quantities no balance can satisfy: even a broken balance check would hit
  // the current_stock >= 0 constraint instead of committing.
  expectError(
    "R-02",
    `${RIBBON} quantity ${IMPOSSIBLE_QUANTITY} -> 409`,
    await postMovement(staff, { materialId: ribbon.id, type: "STOCK_OUT", quantity: IMPOSSIBLE_QUANTITY, notes: null }),
    409,
    "INSUFFICIENT_STOCK"
  );
  expectError(
    "R-03",
    `${KARDUS} quantity ${IMPOSSIBLE_QUANTITY} -> 409`,
    await postMovement(staff, { materialId: kardus.id, type: "STOCK_OUT", quantity: IMPOSSIBLE_QUANTITY, notes: null }),
    409,
    "INSUFFICIENT_STOCK"
  );
}

async function phaseCommit({ staff, staffUser, api, start, expected }) {
  // Preconditions, all fail-closed.
  if (failures() !== 0) fail("commit: earlier failures; not committing.");
  const now = dbState();
  checkInventoryUnchanged("C-PRE-SAME", start, now);
  const inv = now.inventory;
  const kardusStock = inv.balances[KARDUS];
  check(
    "C-PRE-BASELINE",
    inv.tx === expected.tx && inv.idem === expected.idem && kardusStock === expected.kardus_stock && inv.kardusTx === expected.kardus_tx,
    "database matches FIRAZA_EXPECT_BASELINE",
    `tx=${inv.tx} idem=${inv.idem} kardus_stock=${kardusStock} kardus_tx=${inv.kardusTx}`
  );
  check("C-PRE-MARKER", inv.markerTx === 0, "no earlier test-marked transaction (no re-run)", `marker_tx=${inv.markerTx}`);
  check("C-PRE-API", api[KARDUS]?.stock === kardusStock && kardusStock >= 1, "API and DB agree on Kardus stock (>= 1)", `${api[KARDUS]?.stock}/${kardusStock}`);

  // The single committing request group: one key, sent in parallel, no retry.
  const key = randomUUID();
  const body = { materialId: api[KARDUS].id, type: "STOCK_OUT", quantity: 1, notes: TEST_NOTE };
  commitSent = true;
  const settled = await Promise.allSettled(Array.from({ length: PARALLEL }, () => postMovement(staff, body, key)));
  const responses = settled.map((s) => (s.status === "fulfilled" ? s.value : null));
  const statuses = responses.map((r) => (r ? r.status : "ERR"));
  const ids = new Set(responses.map((r) => r?.json?.movement?.transactionId));
  const identical = responses.every((r) => r && JSON.stringify(r.json) === JSON.stringify(responses[0]?.json));
  const certain = statuses.every((s) => s === 201) && ids.size === 1 && identical;

  if (!certain) {
    record("C-01", false, `${PARALLEL} parallel requests, one key`, `UNCERTAIN statuses=${statuses.join(",")} ids=${ids.size}`);
    try {
      printReconciliation("after-uncertain-commit", dbState());
    } catch {
      console.error("RECON after-uncertain-commit | database read failed");
    }
    throw new UncertainCommitError("Commit outcome uncertain.");
  }
  const movement = responses[0].json.movement;
  check(
    "C-01",
    movement.type === "STOCK_OUT" && movement.quantityDelta === -1 && movement.currentStock === kardusStock - 1,
    `${PARALLEL} parallel requests, one key -> one Stock Out -1`,
    `statuses=${statuses.join(",")} stock=${movement.currentStock}`
  );

  // Exact postcondition in the database.
  const post = dbState();
  const expectedBalances = { ...inv.balances, [KARDUS]: kardusStock - 1 };
  check(
    "C-02",
    post.inventory.tx === inv.tx + 1 &&
      post.inventory.idem === inv.idem + 1 &&
      post.inventory.kardusTx === inv.kardusTx + 1 &&
      post.inventory.markerTx === 1 &&
      JSON.stringify(post.inventory.balances) === JSON.stringify(expectedBalances),
    "DB: exactly one new transaction and idempotency row; only Kardus -1",
    `tx=${post.inventory.tx} idem=${post.inventory.idem} kardus=${post.inventory.balances[KARDUS]}`
  );
  checkIntegrity("C-02-INT", post);
  const row = dbRead(
    `select t.type, t.quantity_delta, t.created_by = '${staffUser.id}'::uuid,
            exists (select 1 from app_private.idempotency_requests r where (r.response ->> 'transaction_id')::uuid = t.id)
       from public.inventory_transactions t where t.notes = '${TEST_NOTE}';`
  );
  check(
    "C-02-ROW",
    row === "STOCK_OUT|-1|t|t" && typeof movement.transactionId === "string",
    "DB row: STOCK_OUT -1 by the staff user, with idempotency record",
    row
  );

  // Replay and key reuse. A body that differs from the stored hash must be
  // one the database could never apply, so a broken idempotency check still
  // cannot change stock: C-04a asks for an impossible Stock Out; C-04b is a
  // Stock In for a material that does not exist (the RPC would stop at
  // MATERIAL_NOT_FOUND). C-04b therefore changes type and material together;
  // a type-only change with the same key is covered at database level
  // (7SUP.5A-2 IDM-02).
  try {
    const replay = await postMovement(staff, body, key);
    check(
      "C-03",
      replay.status === 201 && JSON.stringify(replay.json) === JSON.stringify(responses[0].json),
      "sequential replay -> identical 201",
      `${replay.status}`
    );
    expectError(
      "C-04a",
      "same key, STOCK_OUT different quantity -> 422",
      await postMovement(staff, { ...body, quantity: IMPOSSIBLE_QUANTITY }, key),
      422,
      "IDEMPOTENCY_KEY_REUSED"
    );
    expectError(
      "C-04b",
      "same key, STOCK_IN for an unknown material -> 422",
      await postMovement(staff, { ...body, type: "STOCK_IN", materialId: randomUUID(), quantity: 1 }, key),
      422,
      "IDEMPOTENCY_KEY_REUSED"
    );
    const history = await staff.request("GET", `/api/v1/materials/${api[KARDUS].id}/transactions?limit=1`);
    const top = history.json?.transactions?.[0];
    check(
      "C-05",
      top?.id === movement.transactionId && top?.type === "STOCK_OUT" && top?.quantityDelta === -1 && top?.createdByMe === true,
      "history shows the Stock Out first",
      `${top?.type}/${top?.quantityDelta}/${top?.createdByMe}`
    );
  } finally {
    // Final reconciliation runs even if a check above failed.
    const final = dbState();
    printReconciliation("final", final);
    checkInventoryUnchanged("C-FINAL", post, final);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Balances and ids as the API reports them (cross-check of the DB view).
async function apiMaterials(client) {
  const list = await client.request("GET", "/api/v1/materials");
  if (list.status !== 200) fail(`GET /materials returned ${list.status}`);
  return Object.fromEntries(list.json.materials.map((m) => [m.name, { id: m.id, stock: m.currentStock }]));
}

async function main() {
  const phases = parsePhases(process.argv.slice(2));
  checkBaseUrl();
  const expected = phases.includes("commit") ? parseExpectedBaseline() : null;
  const accounts = loadAccounts();

  const start = dbState();
  printReconciliation("start", start);
  checkIntegrity("START-INT", start);
  const since = dbClock();
  const ctx = { since, sessions: sessionState(since) };

  const staff = new Client("staff");
  const owner = new Client("owner");
  let mainError = null;
  try {
    const staffUser = await staff.login(accounts.staff);
    const ownerUser = await owner.login(accounts.owner);
    check("LOGIN", staffUser.role === "STAFF_WAREHOUSE" && ownerUser.role === "OWNER", "demo account roles", `${staffUser.role}/${ownerUser.role}`);
    checkSessions("LOGIN-SESSIONS", ctx, 2);

    const api = await apiMaterials(staff);
    const sorted = (o) => JSON.stringify(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    check(
      "API-DB",
      sorted(Object.fromEntries(Object.entries(api).map(([n, m]) => [n, m.stock]))) === sorted(start.inventory.balances),
      "API balances match the database",
      ""
    );

    let state = start;
    if (phases.includes("pre-rpc")) {
      await phasePreRpc({ staff, owner, accounts, ctx });
      const after = dbState();
      checkInventoryUnchanged("P-STATE", state, after);
      state = after;
    }
    if (phases.includes("rpc-reject")) {
      await phaseRpcReject({ staff, api });
      const after = dbState();
      checkInventoryUnchanged("R-STATE", state, after);
      state = after;
    }
    if (phases.includes("commit")) {
      await phaseCommit({ staff, staffUser, api, start: state, expected });
    }
  } catch (error) {
    mainError = error;
  } finally {
    // Independent logouts of every client that logged in; each failure is a
    // FAIL and does not stop the others.
    for (const client of [...liveClients]) {
      let ok = false;
      try {
        ok = await client.logout();
      } catch {
        ok = false;
      }
      record(`LOGOUT-${client.label}`, ok, `${client.label} logged out`, ok ? "200" : "not confirmed");
    }
    try {
      const end = dbState();
      printReconciliation("end", end);
      const s = sessionState(ctx.since);
      record(
        "SESSIONS",
        s.preExisting === ctx.sessions.preExisting && s.preExistingCount === ctx.sessions.preExistingCount && s.createdDuringRun === 0,
        "pre-existing sessions untouched; no session from this run left",
        `pre_existing=${s.preExisting === ctx.sessions.preExisting ? "identical" : "CHANGED"}(${s.preExistingCount}) run=${s.createdDuringRun}`
      );
      console.log(`AUDIT | Auth audit entries ${start.audit} -> ${end.audit} (+${end.audit - start.audit}, append-only)`);
    } catch (error) {
      record("SESSIONS", false, "final database read", error.message);
    }
  }

  console.log(`\n${results.length - failures()}/${results.length} PASS`);
  finish(mainError);
}

const NO_RETRY =
  "POST-COMMIT NO-RETRY: the commit requests were sent and the run did not end cleanly. " +
  "Do NOT rerun this harness or resend any request. Reconcile read-only in the database " +
  "(transactions, idempotency rows, balances, sessions) and report before any further action.";

function finish(error) {
  if (commitSent && (error || failures() > 0)) {
    console.error(NO_RETRY);
    if (error) console.error(`Cause: ${error instanceof UncertainCommitError ? "UNCERTAIN " : ""}${error.message}`);
    process.exitCode = 2;
  } else if (error) {
    console.error(`ABORT (no commit request sent): ${error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = failures() === 0 ? 0 : 1;
    if (commitSent && process.exitCode === 0) {
      console.log("Commit completed and verified. A second commit is refused by the baseline and marker guards; do not change them.");
    }
  }
}

main().catch((error) => finish(error));
