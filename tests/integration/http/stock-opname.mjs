// Integration harness for Stock Opname (B4-S4). Runs ONLY against an isolated
// local Supabase stack named by the FIRAZA_TEST_* variables below, with
// migration 20261110120000 applied, and a Next.js production server this
// script starts on 127.0.0.1:3001. Not a unit test and not run by CI.
// One-shot: it refuses to run once its B4S4 fixtures or any Stock Opname row
// exist, and it expects the DEMO accounts provisioned by the B3-R7 harness.
//
//   node_modules/.bin/next build          # once, beforehand
//   FIRAZA_TEST_API_URL=... FIRAZA_TEST_DB_CONTAINER=... \
//   FIRAZA_TEST_SYSTEM_IDENTIFIER=... FIRAZA_TEST_SUPABASE_WORKDIR=... \
//   FIRAZA_ALLOW_B4S4=B4-S4 node tests/integration/http/stock-opname.mjs
//
// Order (fail-closed; no request is ever retried automatically):
//   0. Target verification (local-target.mjs, read only): config.toml,
//      `supabase status`, Docker labels and port bindings, and the PostgreSQL
//      system_identifier must all describe the same isolated stack. Nothing
//      below runs unless it passes; database access uses only the verified
//      container id, and keys are read only for the verified target.
//   1. Guards: seven migrations, port 3001
//      free, and a database without any B4-S4 fixture or Stock Opname row
//      (so a second run refuses to start).
//   2. Fixtures (Owner-approved, B4-S4): new random passwords for the two
//      existing DEMO accounts and one new DEMO STAFF_WAREHOUSE account via
//      the local Auth Admin API; the new profile via
//      app_private.admin_provision_profile; synthetic "[DEMO] B4S4" materials
//      and their "Saldo awal" Stock In through the app API. The three
//      pre-existing DEMO materials are never used.
//   3. Tests through the app's /api/v1 routes (HTTP) and through PostgREST
//      RPC/table calls with real access tokens (database authorization).
//   4. Real concurrency: a separate psql session holds a row lock on a
//      synthetic row (SELECT ... FOR UPDATE, then ROLLBACK; no data change)
//      while overlapping requests queue behind it; the number of waiting
//      backends is recorded as evidence of overlap.
//   5. Global invariants, cleanup (cancel any session of this run that is
//      still ACTIVE), logout of every session.
//
// Secrets: passwords are random per run and live only in this process; local
// keys come from `supabase status` for the B workdir and are passed only to
// the child Next.js process. Nothing secret is printed or written.
//
// Exit codes: 0 all PASS; 1 FAIL or abort. Do not rerun after an abort:
// reconcile read-only first.
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TargetVerificationError,
  assertVerified,
  createRealDeps,
  readLocalKeys,
  runSupabaseStatus,
  verifyLocalTarget,
} from "./local-target.mjs";

const OPT_IN = "B4-S4";
const BASE_URL = "http://127.0.0.1:3001";
// Local-only target, configured per machine (never committed values). These
// are expectations only; verifyLocalTarget() proves them before anything else.
//   FIRAZA_TEST_API_URL                 http://127.0.0.1:<port> of the isolated stack
//   FIRAZA_TEST_DB_CONTAINER            its supabase_db_<project_id> container
//   FIRAZA_TEST_SYSTEM_IDENTIFIER       expected PostgreSQL system_identifier
//   FIRAZA_TEST_SUPABASE_WORKDIR        absolute path of its Supabase workdir
const API_URL = process.env.FIRAZA_TEST_API_URL ?? "";
// Set only by verifyLocalTarget(); psql, the lock holder, and the keys refuse
// to work without it.
let TARGET = null;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SUPABASE_BIN = path.join(REPO_ROOT, "node_modules/.bin/supabase");
const NEXT_BIN = path.join(REPO_ROOT, "node_modules/.bin/next");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HOLDER_APP = "b4s4-lock-holder";

const EMAILS = {
  owner: "demo-owner-b3r7@firaza.test",
  staff: "demo-staff-b3r7@firaza.test",
  staff2: "demo-staff2-b4s4@firaza.test",
};
const PREFIX = "[DEMO] B4S4";

function fail(message) {
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Results. check() stops the run; expect() records and continues (each is
// paired with a hard database check wherever state could change).
// ---------------------------------------------------------------------------
const results = [];
function record(id, ok, description, observed) {
  results.push({ id, ok, description, observed });
  console.log(`${id} | ${ok ? "PASS" : "FAIL"} | ${description} | ${observed}`);
  return ok;
}
function check(id, ok, description, observed) {
  if (!record(id, ok, description, observed)) fail(`${id} failed; stopping (fail-closed, no retry).`);
}
const expect = record;
function note(id, description, observed) {
  results.push({ id, ok: true, note: true, description, observed });
  console.log(`${id} | NOTE | ${description} | ${observed}`);
}
const status = (r) => `${r.status}/${r.json?.error?.code ?? r.json?.code ?? "-"}${r.json?.code === "P0001" || r.json?.code === "42501" ? `:${r.json.message}` : ""}`;
const httpErr = (r, s, code) => r.status === s && r.json?.error?.code === code;
const rpcErr = (r, s, sqlstate, message) => r.status === s && r.json?.code === sqlstate && (message === undefined || r.json?.message === message);
const denied = (r) => (r.status === 401 || r.status === 403) && r.json?.code === "42501";

// ---------------------------------------------------------------------------
// Database access (verified container id only)
// ---------------------------------------------------------------------------
function psql(sql, { readOnly }) {
  const { dbContainerId } = assertVerified(TARGET);
  const input = readOnly ? `begin transaction read only;\n${sql}\nrollback;\n` : `${sql}\n`;
  try {
    return execFileSync(
      "docker",
      ["exec", "-i", dbContainerId, "psql", "-U", "postgres", "-d", "postgres", "-qAtX", "-F", "|", "-v", "ON_ERROR_STOP=1"],
      { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch {
    fail(`Database ${readOnly ? "read" : "fixture write"} failed (details not shown); aborting.`);
  }
}
const dbRead = (sql) => psql(sql, { readOnly: true });
const lit = (id) => {
  if (!UUID.test(id)) fail("Invalid UUID literal.");
  return `'${id}'`;
};
function count(sql) {
  const v = dbRead(sql);
  if (!/^\d+$/.test(v)) fail("Unexpected count format; aborting.");
  return Number(v);
}

const SNAPSHOT_SQL = `
select concat_ws('|',
  (select md5(coalesce(string_agg(m::text, ',' order by m.id), '')) from public.materials m),
  (select md5(coalesce(string_agg(s::text, ',' order by s.id), '')) from public.stock_opname s),
  (select md5(coalesce(string_agg(i::text, ',' order by i.id), '')) from public.stock_opname_items i),
  (select md5(coalesce(string_agg(t::text, ',' order by t.id), '')) from public.inventory_transactions t),
  (select md5(coalesce(string_agg(e::text, ',' order by e.id), '')) from public.material_status_events e),
  (select md5(coalesce(string_agg(r.user_id::text || r.key || r.operation || r.request_hash, ',' order by r.user_id, r.key), '')) from app_private.idempotency_requests r)
);`;
const snapshot = () => dbRead(SNAPSHOT_SQL);

async function unchanged(id, description, action) {
  const before = snapshot();
  const r = await action();
  const same = snapshot() === before;
  check(`${id}-DB`, same, `${description}: database unchanged`, same ? "unchanged" : "CHANGED");
  return r;
}

const INVARIANT_SQL = `
select concat_ws('|',
  (select count(*) from public.materials m where m.active_opname_id is not null and not exists (
     select 1 from public.stock_opname s join public.stock_opname_items i on i.stock_opname_id = s.id
      where s.id = m.active_opname_id and s.status = 'ACTIVE' and i.material_id = m.id)),
  (select count(*) from public.stock_opname s join public.stock_opname_items i on i.stock_opname_id = s.id
     join public.materials m on m.id = i.material_id where s.status = 'ACTIVE' and m.active_opname_id is distinct from s.id),
  (select count(*) from (select stock_opname_item_id from public.inventory_transactions where stock_opname_item_id is not null group by 1 having count(*) > 1) d),
  (select count(*) from public.materials m where m.current_stock <> coalesce((select sum(t.quantity_delta) from public.inventory_transactions t where t.material_id = m.id), 0)),
  (select count(*) from public.inventory_transactions t join public.stock_opname_items i on i.id = t.stock_opname_item_id
     where t.stock_opname_id <> i.stock_opname_id or t.material_id <> i.material_id or t.type <> 'ADJUSTMENT'),
  (select count(*) from public.stock_opname s join public.stock_opname_items i on i.stock_opname_id = s.id
     where s.status = 'POSTED' and (i.counted_stock is null or ((i.counted_stock <> i.system_stock) <> exists (select 1 from public.inventory_transactions t where t.stock_opname_item_id = i.id)))),
  (select count(*) from public.inventory_transactions t join public.stock_opname_items i on i.id = t.stock_opname_item_id where t.quantity_delta <> i.counted_stock - i.system_stock),
  (select count(*) from public.inventory_transactions t join public.stock_opname s on s.id = t.stock_opname_id where s.status <> 'POSTED'),
  (select count(*) from public.stock_opname s where not exists (select 1 from public.stock_opname_items i where i.stock_opname_id = s.id)),
  (select count(*) from public.inventory_transactions where type = 'ADJUSTMENT' and stock_opname_item_id is null)
);`;
const INVARIANT_NAMES = [
  "freeze_without_active_item", "active_item_not_frozen", "duplicate_adjustment", "balance_mismatch",
  "bad_adjustment_refs", "posted_adjustment_mismatch", "wrong_delta", "adjustment_on_non_posted",
  "empty_session", "adjustment_without_item",
];
function invariants() {
  const values = dbRead(INVARIANT_SQL).split("|").map(Number);
  if (values.length !== INVARIANT_NAMES.length || values.some((v) => !Number.isInteger(v))) fail("Unexpected invariant format.");
  const bad = INVARIANT_NAMES.filter((_, i) => values[i] !== 0).map((n, i) => `${n}=${values[INVARIANT_NAMES.indexOf(n)]}`);
  return { ok: bad.length === 0, text: bad.length ? bad.join(",") : "all 0" };
}

// ---------------------------------------------------------------------------
// Lock holder (real overlap) — locks one synthetic row, never changes data.
// ---------------------------------------------------------------------------
const LOCKABLE = new Set(["public.materials", "public.stock_opname"]);
function holdLock(table, id, seconds) {
  if (!LOCKABLE.has(table)) fail("Lock target not allowed.");
  const { dbContainerId } = assertVerified(TARGET);
  const child = spawn(
    "docker",
    ["exec", "-i", "-e", `PGAPPNAME=${HOLDER_APP}`, dbContainerId, "psql", "-U", "postgres", "-d", "postgres", "-qAtX", "-v", "ON_ERROR_STOP=1"],
    { stdio: ["pipe", "ignore", "ignore"] }
  );
  child.stdin.end(`begin;\nselect 1 from ${table} where id = ${lit(id)} for update;\nselect pg_sleep(${seconds});\nrollback;\n`);
  const done = new Promise((resolve) => child.on("close", (code) => resolve(code)));
  return { done };
}
async function holderReady() {
  for (let i = 0; i < 50; i += 1) {
    const n = count(`select count(*) from pg_stat_activity where application_name = '${HOLDER_APP}' and state = 'active' and query like '%pg_sleep%';`);
    if (n === 1) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  fail("Lock holder did not start; aborting.");
}
// Fires the requests while the lock is held and records the most backends
// seen waiting for a lock.
async function overlapped(table, id, seconds, makeRequests) {
  const holder = holdLock(table, id, seconds);
  await holderReady();
  const requests = makeRequests();
  let maxWaiting = 0;
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline - 150) {
    maxWaiting = Math.max(maxWaiting, count("select count(*) from pg_locks where not granted;"));
    await new Promise((r) => setTimeout(r, 120));
  }
  const responses = await Promise.all(requests);
  const holderExit = await holder.done;
  if (holderExit !== 0) fail("Lock holder exited abnormally; aborting.");
  return { responses, maxWaiting };
}

// ---------------------------------------------------------------------------
// Keys, server, clients
// ---------------------------------------------------------------------------
// Only for the verified target, and only if `supabase status` still reports
// the verified endpoints.
function localKeys() {
  try {
    return readLocalKeys(TARGET, runSupabaseStatus(SUPABASE_BIN));
  } catch (error) {
    fail(`Local keys refused: ${error instanceof TargetVerificationError ? error.message : "unexpected error (details not shown)"}`);
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
  });
}

const serverLog = [];
const redact = (line) =>
  line.replace(/eyJ[A-Za-z0-9._-]+/g, "<redacted>").replace(/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, "<redacted>").replace(/postgres(ql)?:\/\/\S+/g, "<redacted>");

function startServer(keys) {
  const child = spawn(NEXT_BIN, ["start", "-H", "127.0.0.1", "-p", "3001"], {
    cwd: REPO_ROOT,
    env: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      SUPABASE_URL: API_URL,
      SUPABASE_PUBLISHABLE_KEY: keys.publishable,
      AUTH_COOKIE_SECURE: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => { for (const line of chunk.split("\n")) if (line.trim()) serverLog.push(redact(line)); });
  }
  return child;
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${BASE_URL}/login`, { redirect: "manual", signal: AbortSignal.timeout(2000) });
      if (r.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  fail("Next.js server did not become ready; aborting.");
}

async function send(url, init) {
  let res;
  try {
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000), ...init });
  } catch {
    fail(`Transport error on ${init.method ?? "GET"} ${url.replace(API_URL, "<api>")}: outcome unknown, not retried; aborting.`);
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json, res };
}

class AppClient {
  constructor(label) { this.label = label; this.jar = new Map(); }
  store(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = value === "" || attrs.some((a) => /^\s*max-age=(0|-\d+)\s*$/i.test(a));
      if (expired) this.jar.delete(name); else this.jar.set(name, value);
    }
  }
  async request(method, url, { body, origin = BASE_URL, headers = {} } = {}) {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (this.jar.size) h.Cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const r = await send(BASE_URL + url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
    this.store(r.res);
    return r;
  }
}

class DataApi {
  constructor(label, anonKey, token) { this.label = label; this.anonKey = anonKey; this.token = token; }
  request(method, pathname, { body, headers = {} } = {}) {
    const h = { apikey: this.anonKey, "Content-Type": "application/json", ...headers };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return send(`${API_URL}${pathname}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  }
  rpc(name, args) { return this.request("POST", `/rest/v1/rpc/${name}`, { body: args }); }
}

async function directLogin(keys, email, password) {
  const r = await send(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: keys.anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (r.status !== 200 || typeof r.json?.access_token !== "string") fail(`Direct Auth login failed (${r.status}); aborting.`);
  return r.json.access_token;
}
const directLogout = async (keys, token) =>
  (await send(`${API_URL}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: keys.anon, Authorization: `Bearer ${token}` } })).status;

async function admin(keys, method, pathname, body) {
  return send(`${API_URL}/auth/v1/admin${pathname}`, {
    method,
    headers: { apikey: keys.service, Authorization: `Bearer ${keys.service}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const password = () => `B4s4-${randomBytes(24).toString("base64url")}`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const runSessions = new Set();
// Refuses to run unless config.toml, `supabase status`, Docker metadata, and
// the PostgreSQL system_identifier all prove one isolated local stack (see
// local-target.mjs). No fallback and no retry.
function verifyTarget() {
  try {
    TARGET = verifyLocalTarget(process.env, createRealDeps({ supabaseBin: SUPABASE_BIN }));
  } catch (error) {
    fail(`Target verification failed: ${error instanceof TargetVerificationError ? error.message : "unexpected error (details not shown)"} Nothing was written.`);
  }
}

async function main() {
  if (process.env.FIRAZA_ALLOW_B4S4 !== OPT_IN) fail(`Set FIRAZA_ALLOW_B4S4=${OPT_IN} to run.`);
  verifyTarget();

  // ---- Preflight ------------------------------------------------------------
  check("P1", TARGET?.apiUrl === API_URL, "target verified: config.toml, supabase status, Docker bindings, system_identifier", `project=${TARGET?.projectId}`);
  const migs = dbRead("select count(*) || '/' || max(version) from supabase_migrations.schema_migrations;");
  check("P2", migs === "7/20261110120000", "seven migrations, last is 20261110120000", migs);
  const clean = dbRead(`select (select count(*) from public.stock_opname) || '/' || (select count(*) from public.materials where name like '${PREFIX}%') || '/' ||
    (select count(*) from auth.users where email = '${EMAILS.staff2}') || '/' || (select count(*) from auth.sessions);`);
  check("P3", clean === "0/0/0/0", "no Stock Opname row, no B4S4 fixture, no live session (refuses a second run)", clean);
  const users = dbRead(`select string_agg(u.email || ':' || p.role, ',' order by u.email) from auth.users u join public.profiles p on p.id = u.id where p.deactivated_at is null;`);
  check("P4", users === `${EMAILS.owner}:OWNER,${EMAILS.staff}:STAFF_WAREHOUSE`, "the two DEMO accounts exist with their roles", users);
  const legacy = dbRead(`select md5(string_agg(m::text, ',' order by m.id)) from public.materials m where m.name like '[DEMO] B3R7%';`);
  check("P5", await portFree(3001), "port 3001 free", "free");
  const keys = localKeys();
  note("P6", "local keys from supabase status for the B workdir (values not shown)", API_URL);
  const ids = Object.fromEntries(
    dbRead(`select string_agg(email || '=' || id, ',') from auth.users;`).split(",").map((p) => p.split("=")).map(([e, i]) => [e, i])
  );
  const U = { owner: ids[EMAILS.owner], staff: ids[EMAILS.staff] };
  const cats = dbRead("select string_agg(id::text, ',' order by name) from public.categories;").split(",");

  const server = startServer(keys);
  const live = { app: [], direct: [] };
  let S2api;
  try {
    await waitForServer();
    note("P7", "Next.js production server started by the harness", `${BASE_URL} (127.0.0.1 only)`);

    // ---- Fixtures: accounts ------------------------------------------------
    const pw = { owner: password(), staff: password(), staff2: password() };
    for (const who of ["owner", "staff"]) {
      const r = await admin(keys, "PUT", `/users/${U[who]}`, { password: pw[who] });
      check(`F1-${who}`, r.status === 200 && r.json?.id === U[who], `password rotated for existing DEMO ${who} (Auth Admin API, Owner-approved)`, String(r.status));
    }
    let r = await admin(keys, "POST", "/users", { email: EMAILS.staff2, password: pw.staff2, email_confirm: true });
    check("F2", (r.status === 200 || r.status === 201) && UUID.test(r.json?.id ?? ""), "second DEMO STAFF_WAREHOUSE account created (email confirmed)", `${r.status} id=${r.json?.id ?? "-"}`);
    U.staff2 = r.json.id;
    const provisioned = psql(
      `select app_private.admin_provision_profile(${lit(U.staff2)}, '${EMAILS.staff2}', '[DEMO] STAFF_WAREHOUSE B4S4', 'STAFF_WAREHOUSE',
        'claude-code-b', 'B4-S4 local integration fixture', ${lit(randomUUID())}) ->> 'outcome';`,
      { readOnly: false }
    );
    check("F3", provisioned === "APPLIED", "second staff profile provisioned via admin_provision_profile", provisioned);

    // ---- Auth -----------------------------------------------------------------
    const anon = new AppClient("anonymous");
    r = await anon.request("GET", "/api/v1/stock-opnames");
    expect("A1", httpErr(r, 401, "UNAUTHENTICATED"), "HTTP: anonymous list rejected", status(r));
    const S1 = new AppClient("staff-creator");
    const S2 = new AppClient("staff-other");
    const OWN = new AppClient("owner");
    for (const [c, email, pass, role] of [[S1, EMAILS.staff, pw.staff, "STAFF_WAREHOUSE"], [S2, EMAILS.staff2, pw.staff2, "STAFF_WAREHOUSE"], [OWN, EMAILS.owner, pw.owner, "OWNER"]]) {
      r = await c.request("POST", "/api/v1/auth/login", { body: { email, password: pass } });
      check(`A2-${c.label}`, r.status === 200 && r.json?.user?.role === role, `HTTP login ${c.label} with a real Supabase Auth session`, `${r.status} role=${r.json?.user?.role ?? "-"}`);
      live.app.push(c);
    }
    const t1 = await directLogin(keys, EMAILS.staff, pw.staff); live.direct.push(t1);
    const t2 = await directLogin(keys, EMAILS.staff2, pw.staff2); live.direct.push(t2);
    const tO = await directLogin(keys, EMAILS.owner, pw.owner); live.direct.push(tO);
    const S1api = new DataApi("staff-creator", keys.anon, t1);
    S2api = new DataApi("staff-other", keys.anon, t2);
    const OWNapi = new DataApi("owner", keys.anon, tO);
    const ANONapi = new DataApi("anon", keys.anon, null);
    note("A3", "direct Auth sessions for RPC-level tests", "3 real sessions (tokens not shown)");

    // ---- Fixtures: materials ----------------------------------------------------
    const M = {};
    const plan = {
      A: 10, B: 5, C: 7, D: 3, E: 4, DEL: 0, ARCH: 0, F: 6, G: 8, P1: 4, P2: 6, H: 2, I: 2, Q1: 3, Q2: 4, K: 5, L: 5, MM: 5, N: 9, O1: 3, O2: 3,
    };
    for (const [key, stock] of Object.entries(plan)) {
      r = await S1.request("POST", "/api/v1/materials", { body: { categoryId: cats[0], name: `${PREFIX} ${key}`, unit: "pcs", minimumStock: 1 } });
      check(`F4-${key}`, r.status === 201 && r.json?.material?.currentStock === 0, `material ${PREFIX} ${key} created via HTTP`, status(r));
      M[key] = r.json.material.id;
      if (stock > 0) {
        r = await S1.request("POST", "/api/v1/stock-movements", {
          headers: { "Idempotency-Key": randomUUID() },
          body: { materialId: M[key], type: "STOCK_IN", quantity: stock, notes: "Saldo awal" },
        });
        check(`F5-${key}`, r.status === 201 && r.json?.movement?.currentStock === stock, `opening stock ${stock} via Stock In "Saldo awal"`, status(r));
      }
    }
    r = await S1.request("POST", `/api/v1/materials/${M.ARCH}/archive`, { body: { reason: "B4-S4 fixture: archived material" } });
    check("F6", r.status === 200 && r.json?.material?.isArchived === true, "archived fixture material", status(r));
    const stockOf = (id) => count(`select current_stock from public.materials where id = ${lit(id)};`);
    const frozenBy = (id) => dbRead(`select coalesce(active_opname_id::text, '') from public.materials where id = ${lit(id)};`);
    const sessionRow = (id) => dbRead(`select status || '/' || (created_by::text) || '/' || coalesce(posted_by::text, '-') || '/' || coalesce(cancelled_by::text, '-') || '/' ||
      (posted_at is not null) || '/' || (cancelled_at is not null) || '/' || coalesce(cancel_reason, '-') from public.stock_opname where id = ${lit(id)};`);

    // ---- More auth / authorization ---------------------------------------------
    r = await unchanged("A4", "HTTP anonymous create", () => anon.request("POST", "/api/v1/stock-opnames", { headers: { "Idempotency-Key": randomUUID() }, body: { materialIds: [M.D] } }));
    expect("A4", httpErr(r, 401, "UNAUTHENTICATED"), "HTTP: anonymous create rejected", status(r));
    r = await unchanged("A5", "RPC anon create", () => ANONapi.rpc("create_stock_opname", { p_material_ids: [M.D], p_idempotency_key: randomUUID() }));
    expect("A5", denied(r), "RPC: anon has no EXECUTE on create_stock_opname", status(r));
    r = await unchanged("A6", "HTTP owner create", () => OWN.request("POST", "/api/v1/stock-opnames", { headers: { "Idempotency-Key": randomUUID() }, body: { materialIds: [M.D] } }));
    expect("A6", httpErr(r, 403, "FORBIDDEN"), "HTTP: OWNER create rejected", status(r));
    r = await unchanged("A7", "RPC owner create", () => OWNapi.rpc("create_stock_opname", { p_material_ids: [M.D], p_idempotency_key: randomUUID() }));
    expect("A7", rpcErr(r, 403, "42501", "FORBIDDEN"), "RPC: OWNER create raises FORBIDDEN in the database", status(r));
    r = await unchanged("A8", "RPC invalid token", () => new DataApi("bad", keys.anon, "not.a.jwt").rpc("create_stock_opname", { p_material_ids: [M.D], p_idempotency_key: randomUUID() }));
    expect("A8", r.status === 401, "RPC: invalid bearer token rejected", status(r));
    const tRevoked = await directLogin(keys, EMAILS.staff, pw.staff);
    const revokeStatus = await directLogout(keys, tRevoked);
    check("A9-setup", revokeStatus === 204, "extra staff session created and logged out (revoked)", String(revokeStatus));
    r = await unchanged("A9", "RPC with a revoked session", () => new DataApi("revoked", keys.anon, tRevoked).rpc("create_stock_opname", { p_material_ids: [M.D], p_idempotency_key: randomUUID() }));
    expect("A9", denied(r) && r.json?.message === "UNAUTHORIZED", "RPC: token of a revoked session is refused by the database role check", status(r));
    r = await unchanged("A10", "HTTP cross-origin create", () => S1.request("POST", "/api/v1/stock-opnames", { origin: "http://evil.example", headers: { "Idempotency-Key": randomUUID() }, body: { materialIds: [M.D] } }));
    expect("A10", httpErr(r, 403, "CSRF_REJECTED"), "HTTP: cross-origin create rejected (CSRF)", status(r));

    // ---- CREATE (session SA via HTTP) -----------------------------------------
    const K1 = randomUUID();
    r = await S1.request("POST", "/api/v1/stock-opnames", { headers: { "Idempotency-Key": K1 }, body: { materialIds: [M.C, M.A, M.B] } });
    check("C1", r.status === 201 && UUID.test(r.json?.opname?.id ?? "") && r.json.opname.status === "ACTIVE" && r.json.opname.itemCount === 3,
      "HTTP: creator creates one ACTIVE session with three materials", `${status(r)} items=${r.json?.opname?.itemCount ?? "-"}`);
    const SA = r.json.opname.id; runSessions.add(SA);
    const items = dbRead(`select string_agg(material_id::text || '=' || system_stock || '/' || coalesce(counted_stock::text, 'null'), ',' order by material_id) from public.stock_opname_items where stock_opname_id = ${lit(SA)};`);
    const expectedItems = [[M.A, 10], [M.B, 5], [M.C, 7]].sort((a, b) => a[0].localeCompare(b[0])).map(([id, s]) => `${id}=${s}/null`).join(",");
    check("C2", items === expectedItems, "DB: exactly one item per material; system_stock = current stock at creation; uncounted", "match");
    check("C3", [M.A, M.B, M.C].every((id) => frozenBy(id) === SA) && [M.D, M.E, M.F].every((id) => frozenBy(id) === "") &&
      count("select count(*) from public.materials where name like '[DEMO] B3R7%' and active_opname_id is not null;") === 0,
      "DB: selected materials frozen by the session; unselected (incl. pre-existing DEMO) not frozen", "match");
    check("C4", stockOf(M.A) === 10 && stockOf(M.B) === 5 && stockOf(M.C) === 7 && count(`select count(*) from public.inventory_transactions where type = 'ADJUSTMENT';`) === 0,
      "DB: create changed no stock and wrote no ADJUSTMENT", "stocks 10/5/7, adjustments 0");
    check("C5", sessionRow(SA).startsWith(`ACTIVE/${U.staff}/-/-/false/false`), "DB: created_by is the creator (from the session)", "match");
    r = await S1.request("GET", `/api/v1/stock-opnames/${SA}`);
    expect("C6-staff", r.status === 200 && r.json?.opname?.items?.length === 3 && r.json.opname.items.every((i) => i.materialName?.startsWith(PREFIX) && i.unit === "pcs" && i.currentStock === i.systemStock)
      && r.json.opname.createdByMe === true && r.json.opname.permissions.canCount && r.json.opname.permissions.canPost && r.json.opname.permissions.canCancel,
      "HTTP detail (creator): PostgREST material embedding, actor flag, creator permissions", `${r.status} items=${r.json?.opname?.items?.length ?? "-"}`);
    r = await S2.request("GET", `/api/v1/stock-opnames/${SA}`);
    expect("C6-other", r.status === 200 && r.json?.opname?.createdByMe === false && !r.json.opname.permissions.canCount && !r.json.opname.permissions.canPost && r.json.opname.permissions.canCancel,
      "HTTP detail (other staff): Pengguna lain; cancel only", JSON.stringify(r.json?.opname?.permissions ?? null));
    r = await OWN.request("GET", `/api/v1/stock-opnames/${SA}`);
    expect("C6-owner", r.status === 200 && Object.values(r.json?.opname?.permissions ?? { x: true }).every((v) => v === false), "HTTP detail (owner): read-only", JSON.stringify(r.json?.opname?.permissions ?? null));
    r = await OWN.request("GET", "/api/v1/stock-opnames");
    expect("C7", r.status === 200 && r.json?.opnames?.find((o) => o.id === SA)?.itemCount === 3 && r.json.opnames.find((o) => o.id === SA).countedCount === 0,
      "HTTP list (owner): PostgREST item embedding gives itemCount 3, countedCount 0", `${r.status} n=${r.json?.opnames?.length ?? "-"}`);
    r = await S1.request("GET", "/api/v1/stock-opnames?status=ACTIVE");
    expect("C7b", r.status === 200 && r.json?.opnames?.every((o) => o.status === "ACTIVE"), "HTTP list with status filter", status(r));
    r = await S1.request("GET", "/api/v1/stock-opnames?status=BOGUS");
    expect("C7c", httpErr(r, 400, "VALIDATION_ERROR"), "HTTP list rejects an unknown status filter", status(r));

    // Create rejections — HTTP (Zod) and RPC (database), all without changes.
    const createCases = [
      ["C8", "empty list", [], 400, "VALIDATION_ERROR", "OPNAME_MATERIALS_REQUIRED"],
      ["C9", "duplicate material", [M.D, M.D], 400, "VALIDATION_ERROR", "DUPLICATE_MATERIAL"],
      ["C10", "missing material", [randomUUID()], 409, "MATERIAL_NOT_FOUND", "MATERIAL_NOT_FOUND"],
      ["C11", "archived material", [M.ARCH], 409, "MATERIAL_ARCHIVED", "MATERIAL_ARCHIVED"],
      ["C12", "already frozen material (joins another active session)", [M.D, M.A], 409, "MATERIAL_ALREADY_IN_OPNAME", "MATERIAL_ALREADY_IN_OPNAME"],
      ["C13", "201 materials", Array.from({ length: 201 }, () => randomUUID()), 400, "VALIDATION_ERROR", "OPNAME_TOO_MANY_MATERIALS"],
    ];
    for (const [id, label, list, httpStatus, httpCode, dbCode] of createCases) {
      r = await unchanged(`${id}-http`, `HTTP create with ${label}`, () => S1.request("POST", "/api/v1/stock-opnames", { headers: { "Idempotency-Key": randomUUID() }, body: { materialIds: list } }));
      expect(`${id}-http`, httpErr(r, httpStatus, httpCode), `HTTP: create with ${label} rejected`, status(r));
      r = await unchanged(`${id}-rpc`, `RPC create with ${label}`, () => S1api.rpc("create_stock_opname", { p_material_ids: list, p_idempotency_key: randomUUID() }));
      expect(`${id}-rpc`, rpcErr(r, 400, "P0001", dbCode), `RPC: create with ${label} -> ${dbCode}`, status(r));
    }
    r = await unchanged("C14", "RPC invalid UUID", () => S1api.rpc("create_stock_opname", { p_material_ids: ["abc"], p_idempotency_key: randomUUID() }));
    expect("C14", r.status === 400 && r.json?.code === "22P02", "RPC: non-UUID element rejected by type conversion (22P02)", status(r));
    r = await unchanged("C15", "RPC null list", () => S1api.rpc("create_stock_opname", { p_material_ids: null, p_idempotency_key: randomUUID() }));
    expect("C15", rpcErr(r, 400, "P0001", "OPNAME_MATERIALS_REQUIRED"), "RPC: null list rejected", status(r));
    r = await unchanged("C16", "RPC null element", () => S1api.rpc("create_stock_opname", { p_material_ids: [M.D, null], p_idempotency_key: randomUUID() }));
    expect("C16", rpcErr(r, 400, "P0001", "MATERIAL_NOT_FOUND"), "RPC: null element rejected", status(r));
    r = await unchanged("C17", "RPC multidimensional array", () => S1api.rpc("create_stock_opname", { p_material_ids: [[M.D, M.E], [M.F, M.G]], p_idempotency_key: randomUUID() }));
    expect("C17", r.status === 400 && (r.json?.message === "INVALID_MATERIAL_LIST" || r.json?.code === "22P02"), "RPC: multidimensional array rejected safely", status(r));
    r = await unchanged("C18", "RPC missing key", () => S1api.rpc("create_stock_opname", { p_material_ids: [M.D], p_idempotency_key: null }));
    expect("C18", rpcErr(r, 400, "P0001", "IDEMPOTENCY_KEY_REQUIRED"), "RPC: missing idempotency key rejected", status(r));
    r = await unchanged("C19", "HTTP missing key", () => S1.request("POST", "/api/v1/stock-opnames", { body: { materialIds: [M.D] } }));
    expect("C19", httpErr(r, 400, "IDEMPOTENCY_KEY_REQUIRED"), "HTTP: missing Idempotency-Key rejected", status(r));

    // ---- OD-20 idempotency (session SF) ----------------------------------------
    const K2 = randomUUID();
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.F, M.G], p_idempotency_key: K2 });
    check("I1", r.status === 200 && UUID.test(r.json?.opname_id ?? ""), "RPC: first create with key K2", status(r));
    const SF = r.json.opname_id; runSessions.add(SF);
    const firstResponse = JSON.stringify(r.json);
    const sessionsBefore = count("select count(*) from public.stock_opname;");
    r = await unchanged("I2", "RPC replay with reversed order", () => S1api.rpc("create_stock_opname", { p_material_ids: [M.G, M.F], p_idempotency_key: K2 }));
    expect("I2", r.status === 200 && JSON.stringify(r.json) === firstResponse, "RPC: same key, same set in another order -> stored response, no new session", `${status(r)} same=${JSON.stringify(r.json) === firstResponse}`);
    r = await unchanged("I3", "HTTP replay", () => S1.request("POST", "/api/v1/stock-opnames", { headers: { "Idempotency-Key": K2 }, body: { materialIds: [M.G, M.F] } }));
    expect("I3", r.status === 201 && r.json?.opname?.id === SF, "HTTP: replay returns 201 with the same session id", status(r));
    r = await unchanged("I4", "RPC same key, different payload", () => S1api.rpc("create_stock_opname", { p_material_ids: [M.F], p_idempotency_key: K2 }));
    expect("I4", rpcErr(r, 400, "P0001", "IDEMPOTENCY_KEY_REUSED"), "RPC: same key with a different material set rejected", status(r));
    r = await unchanged("I4-http", "HTTP same key, different payload", () => S1.request("POST", "/api/v1/stock-opnames", { headers: { "Idempotency-Key": K2 }, body: { materialIds: [M.F] } }));
    expect("I4-http", httpErr(r, 422, "IDEMPOTENCY_KEY_REUSED"), "HTTP: same key with a different payload -> 422", status(r));
    r = await unchanged("I5", "same key for Stock In", () => S1api.rpc("post_stock_movement", { p_material_id: M.E, p_type: "STOCK_IN", p_quantity: 1, p_notes: "B4-S4 probe", p_idempotency_key: K2 }));
    expect("I5", rpcErr(r, 400, "P0001", "IDEMPOTENCY_KEY_REUSED"), "RPC: create key reused for another operation rejected", status(r));
    const KM = randomUUID();
    r = await S1api.rpc("post_stock_movement", { p_material_id: M.E, p_type: "STOCK_IN", p_quantity: 1, p_notes: "B4-S4 key-scope probe", p_idempotency_key: KM });
    check("I6-setup", r.status === 200, "RPC: Stock In with key KM (M.E 4 -> 5)", status(r));
    r = await unchanged("I6", "stock-movement key reused for create", () => S1api.rpc("create_stock_opname", { p_material_ids: [M.E], p_idempotency_key: KM }));
    expect("I6", rpcErr(r, 400, "P0001", "IDEMPOTENCY_KEY_REUSED"), "RPC: stock-movement key reused for create rejected", status(r));
    r = await unchanged("I7", "other user, same key", () => S2api.rpc("create_stock_opname", { p_material_ids: [M.F, M.G], p_idempotency_key: K2 }));
    expect("I7", rpcErr(r, 400, "P0001", "MATERIAL_ALREADY_IN_OPNAME"), "RPC: keys are per user; another staff's same key is not a replay", status(r));
    const K3 = randomUUID();
    const idemBefore = count("select count(*) from app_private.idempotency_requests;");
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.ARCH, M.D], p_idempotency_key: K3 });
    expect("I8", rpcErr(r, 400, "P0001", "MATERIAL_ARCHIVED"), "RPC: create failing a business rule", status(r));
    check("I8-DB", count("select count(*) from app_private.idempotency_requests;") === idemBefore && count(`select count(*) from app_private.idempotency_requests where key = '${K3}';`) === 0,
      "DB: the failed create left no idempotency record", "none");
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.D, M.E, M.DEL], p_idempotency_key: K3 });
    check("I9", r.status === 200 && UUID.test(r.json?.opname_id ?? ""), "RPC: the same key then works for a valid create (session SD)", status(r));
    const SD = r.json.opname_id; runSessions.add(SD);
    check("I9-DB", count("select count(*) from public.stock_opname;") === sessionsBefore + 1, "DB: exactly one more session", "match");

    // ---- COUNT (SA) --------------------------------------------------------------
    const itemOf = (session, material) => dbRead(`select id from public.stock_opname_items where stock_opname_id = ${lit(session)} and material_id = ${lit(material)};`);
    const iA = itemOf(SA, M.A); const iB = itemOf(SA, M.B); const iC = itemOf(SA, M.C);
    const txCount = () => count("select count(*) from public.inventory_transactions;");
    const tx0 = txCount();
    r = await S1.request("PUT", `/api/v1/stock-opnames/${SA}/counts`, { body: { counts: [{ itemId: iA, countedStock: 0 }, { itemId: iB, countedStock: 9 }] } });
    expect("N1", r.status === 200 && r.json?.result?.updated === 2, "HTTP: creator saves two counts (0 and 9)", status(r));
    const countedOf = (item) => dbRead(`select coalesce(counted_stock::text, 'null') || '/' || coalesce(counted_by::text, '-') || '/' || (counted_at is not null) from public.stock_opname_items where id = ${lit(item)};`);
    check("N2", countedOf(iA) === `0/${U.staff}/true` && countedOf(iB) === `9/${U.staff}/true` && countedOf(iC) === "null/-/false",
      "DB: zero stored as 0, uncounted stays NULL; counted_by is the creator", "match");
    r = await S1.request("PUT", `/api/v1/stock-opnames/${SA}/counts`, { body: { counts: [{ itemId: iA, countedStock: 6 }] } });
    check("N3", r.status === 200 && countedOf(iA).startsWith("6/"), "HTTP: saving again replaces the value (6, not 6+0)", status(r));
    check("N4", txCount() === tx0 && stockOf(M.A) === 10 && frozenBy(M.A) === SA, "DB: counting wrote no transaction, changed no stock, kept the freeze", "match");
    r = await S1.request("GET", "/api/v1/stock-opnames");
    expect("N5", r.json?.opnames?.find((o) => o.id === SA)?.countedCount === 2, "HTTP list: countedCount reflects stored counts", String(r.json?.opnames?.find((o) => o.id === SA)?.countedCount));
    r = await unchanged("N6", "HTTP count by other staff", () => S2.request("PUT", `/api/v1/stock-opnames/${SA}/counts`, { body: { counts: [{ itemId: iC, countedStock: 1 }] } }));
    expect("N6", httpErr(r, 403, "OPNAME_CREATOR_ONLY"), "HTTP: another staff cannot count", status(r));
    r = await unchanged("N7", "RPC count by other staff", () => S2api.rpc("record_stock_opname_counts", { p_opname_id: SA, p_counts: [{ item_id: iC, counted_stock: 1 }] }));
    expect("N7", rpcErr(r, 400, "P0001", "OPNAME_CREATOR_ONLY"), "RPC: another staff cannot count (database)", status(r));
    r = await unchanged("N8", "HTTP count by owner", () => OWN.request("PUT", `/api/v1/stock-opnames/${SA}/counts`, { body: { counts: [{ itemId: iC, countedStock: 1 }] } }));
    expect("N8", httpErr(r, 403, "FORBIDDEN"), "HTTP: OWNER cannot count", status(r));
    r = await unchanged("N9", "RPC count by owner", () => OWNapi.rpc("record_stock_opname_counts", { p_opname_id: SA, p_counts: [{ item_id: iC, counted_stock: 1 }] }));
    expect("N9", rpcErr(r, 403, "42501", "FORBIDDEN"), "RPC: OWNER cannot count (database)", status(r));
    const foreign = itemOf(SF, M.F);
    const countCases = [
      ["N10", "item of another session", [{ item_id: foreign, counted_stock: 1 }], "OPNAME_ITEM_NOT_FOUND"],
      ["N11", "unknown item", [{ item_id: randomUUID(), counted_stock: 1 }], "OPNAME_ITEM_NOT_FOUND"],
      ["N12", "non-UUID item id", [{ item_id: "abc", counted_stock: 1 }], "INVALID_COUNTS"],
      ["N13", "negative count", [{ item_id: iC, counted_stock: -1 }], "INVALID_COUNTED_STOCK"],
      ["N14", "fractional count", [{ item_id: iC, counted_stock: 1.5 }], "INVALID_COUNTED_STOCK"],
      ["N15", "oversized count", [{ item_id: iC, counted_stock: 2147483648 }], "INVALID_COUNTED_STOCK"],
      ["N16", "count as string", [{ item_id: iC, counted_stock: "5" }], "INVALID_COUNTS"],
      ["N17", "object instead of array", { item_id: iC, counted_stock: 1 }, "INVALID_COUNTS"],
      ["N18", "scalar instead of array", 5, "INVALID_COUNTS"],
      ["N19", "empty array", [], "INVALID_COUNTS"],
      ["N20", "null", null, "INVALID_COUNTS"],
      ["N21", "element not an object", [1], "INVALID_COUNTS"],
      ["N22", "same item twice", [{ item_id: iC, counted_stock: 1 }, { item_id: iC, counted_stock: 2 }], "INVALID_COUNTS"],
      ["N23", "501 elements", Array.from({ length: 501 }, () => ({ item_id: randomUUID(), counted_stock: 1 })), "INVALID_COUNTS"],
    ];
    for (const [id, label, counts, code] of countCases) {
      r = await unchanged(id, `RPC count with ${label}`, () => S1api.rpc("record_stock_opname_counts", { p_opname_id: SA, p_counts: counts }));
      expect(id, rpcErr(r, 400, "P0001", code), `RPC: count with ${label} -> ${code}`, status(r));
    }
    r = await unchanged("N24", "HTTP negative count", () => S1.request("PUT", `/api/v1/stock-opnames/${SA}/counts`, { body: { counts: [{ itemId: iC, countedStock: -1 }] } }));
    expect("N24", httpErr(r, 400, "VALIDATION_ERROR"), "HTTP: negative count rejected by validation", status(r));

    // ---- POST (SA) -----------------------------------------------------------------
    r = await unchanged("S1", "HTTP post with an uncounted item", () => S1.request("POST", `/api/v1/stock-opnames/${SA}/post`, { body: {} }));
    expect("S1", httpErr(r, 409, "OPNAME_UNCOUNTED"), "HTTP: posting with an uncounted item rejected", status(r));
    r = await S1.request("PUT", `/api/v1/stock-opnames/${SA}/counts`, { body: { counts: [{ itemId: iC, countedStock: 7 }] } });
    check("S2-setup", r.status === 200, "HTTP: last item counted (7 = system stock)", status(r));
    r = await unchanged("S2", "HTTP post by other staff", () => S2.request("POST", `/api/v1/stock-opnames/${SA}/post`, { body: {} }));
    expect("S2", httpErr(r, 403, "OPNAME_CREATOR_ONLY"), "HTTP: another staff cannot post", status(r));
    r = await unchanged("S3", "RPC post by other staff", () => S2api.rpc("post_stock_opname", { p_opname_id: SA }));
    expect("S3", rpcErr(r, 400, "P0001", "OPNAME_CREATOR_ONLY"), "RPC: another staff cannot post (database)", status(r));
    r = await unchanged("S4", "HTTP post by owner", () => OWN.request("POST", `/api/v1/stock-opnames/${SA}/post`, { body: {} }));
    expect("S4", httpErr(r, 403, "FORBIDDEN"), "HTTP: OWNER cannot post", status(r));
    r = await unchanged("S5", "RPC post by owner", () => OWNapi.rpc("post_stock_opname", { p_opname_id: SA }));
    expect("S5", rpcErr(r, 403, "42501", "FORBIDDEN"), "RPC: OWNER cannot post (database)", status(r));
    r = await S1.request("POST", `/api/v1/stock-opnames/${SA}/post`, { body: { postedBy: U.owner, currentStock: 999 } });
    const adj = r.json?.result?.adjustments ?? [];
    check("S6", r.status === 200 && r.json.result.status === "POSTED" && adj.length === 2 &&
      adj.some((a) => a.materialId === M.A && a.quantityDelta === -4) && adj.some((a) => a.materialId === M.B && a.quantityDelta === 4) && !adj.some((a) => a.materialId === M.C),
      "HTTP: creator posts; ADJUSTMENT -4 (A), +4 (B), none for the zero difference (C)", `${status(r)} adjustments=${adj.length}`);
    check("S7", stockOf(M.A) === 6 && stockOf(M.B) === 9 && stockOf(M.C) === 7, "DB: stock set to the counts (6, 9, 7)", `${stockOf(M.A)}/${stockOf(M.B)}/${stockOf(M.C)}`);
    const adjRows = dbRead(`select string_agg(material_id::text || ':' || quantity_delta || ':' || (stock_opname_item_id::text) || ':' || created_by, ',' order by quantity_delta)
      from public.inventory_transactions where stock_opname_id = ${lit(SA)} and type = 'ADJUSTMENT';`);
    check("S8", adjRows === `${M.A}:-4:${iA}:${U.staff},${M.B}:4:${iB}:${U.staff}`, "DB: ADJUSTMENT rows reference the session and the right item; created_by = creator", "match");
    check("S9", sessionRow(SA).startsWith(`POSTED/${U.staff}/${U.staff}/-/true/false`) && [M.A, M.B, M.C].every((id) => frozenBy(id) === ""),
      "DB: POSTED with posted_by = creator (body ignored) and posted_at; all three freezes released", "match");
    const adjBefore = count("select count(*) from public.inventory_transactions where type = 'ADJUSTMENT';");
    r = await unchanged("S10", "HTTP repeat post", () => S1.request("POST", `/api/v1/stock-opnames/${SA}/post`, { body: {} }));
    expect("S10", httpErr(r, 409, "OPNAME_NOT_ACTIVE"), "HTTP: repeated post rejected (no replay)", status(r));
    check("S10b", count("select count(*) from public.inventory_transactions where type = 'ADJUSTMENT';") === adjBefore, "DB: no duplicate ADJUSTMENT", String(adjBefore));
    r = await unchanged("S11", "HTTP count after POSTED", () => S1.request("PUT", `/api/v1/stock-opnames/${SA}/counts`, { body: { counts: [{ itemId: iA, countedStock: 1 }] } }));
    expect("S11", httpErr(r, 409, "OPNAME_NOT_ACTIVE"), "HTTP: counting after POSTED rejected", status(r));
    r = await unchanged("S12", "HTTP cancel after POSTED", () => S2.request("POST", `/api/v1/stock-opnames/${SA}/cancel`, { body: { reason: "B4-S4 cancel posted" } }));
    expect("S12", httpErr(r, 409, "OPNAME_NOT_ACTIVE"), "HTTP: cancelling a POSTED session rejected", status(r));
    r = await OWN.request("GET", `/api/v1/stock-opnames/${SA}`);
    expect("S13", r.json?.opname?.status === "POSTED" && r.json.opname.postedByMe === false && r.json.opname.summary.decreaseCount === 1 && r.json.opname.summary.increaseCount === 1 && r.json.opname.summary.unchangedCount === 1,
      "HTTP detail after POSTED: status, actor flag, difference summary", status(r));
    r = await S1.request("POST", "/api/v1/stock-movements", { headers: { "Idempotency-Key": randomUUID() }, body: { materialId: M.A, type: "STOCK_OUT", quantity: 1, notes: "B4-S4 after post" } });
    expect("S14", r.status === 201 && r.json?.movement?.currentStock === 5, "HTTP: Stock Out allowed again after POST (6 -> 5)", status(r));

    // ---- Atomic failure: lock timeout on one item (session SP) -----------------
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.P1, M.P2], p_idempotency_key: randomUUID() });
    check("S15-setup", r.status === 200, "RPC: session SP with two materials", status(r));
    const SP = r.json.opname_id; runSessions.add(SP);
    r = await S1api.rpc("record_stock_opname_counts", { p_opname_id: SP, p_counts: [{ item_id: itemOf(SP, M.P1), counted_stock: 1 }, { item_id: itemOf(SP, M.P2), counted_stock: 9 }] });
    check("S15-count", r.status === 200, "RPC: both counted (4 -> 1, 6 -> 9)", status(r));
    const beforeTimeout = snapshot();
    const timed = await overlapped("public.materials", M.P2, 7, () => [S1.request("POST", `/api/v1/stock-opnames/${SP}/post`, { body: {} })]);
    const tr = timed.responses[0];
    expect("S15", httpErr(tr, 503, "OPERATION_NOT_APPLIED"), "lock held on one item past lock_timeout: post fails as OPERATION_NOT_APPLIED (lock timeout, classified separately)", `${status(tr)} waiting=${timed.maxWaiting}`);
    check("S15-DB", snapshot() === beforeTimeout && sessionRow(SP).startsWith("ACTIVE/") && frozenBy(M.P1) === SP && frozenBy(M.P2) === SP,
      "DB: no partial posting — no ADJUSTMENT, stock unchanged, session ACTIVE, freezes intact", "unchanged");
    r = await S1.request("POST", `/api/v1/stock-opnames/${SP}/post`, { body: {} });
    check("S16", r.status === 200 && stockOf(M.P1) === 1 && stockOf(M.P2) === 9, "deliberate second post after the verified rollback succeeds", status(r));

    // ---- Freeze invariants while SD is ACTIVE (D, E, DEL frozen) ---------------
    r = await S1api.rpc("record_stock_opname_counts", { p_opname_id: SD, p_counts: [{ item_id: itemOf(SD, M.D), counted_stock: 2 }] });
    check("Z1", r.status === 200 && frozenBy(M.D) === SD, "count on SD keeps the freeze", status(r));
    r = await unchanged("Z2", "Stock In on frozen", () => S1.request("POST", "/api/v1/stock-movements", { headers: { "Idempotency-Key": randomUUID() }, body: { materialId: M.D, type: "STOCK_IN", quantity: 1 } }));
    expect("Z2", httpErr(r, 409, "MATERIAL_FROZEN"), "HTTP: Stock In on a frozen material rejected", status(r));
    r = await unchanged("Z3", "Stock Out on frozen", () => S1.request("POST", "/api/v1/stock-movements", { headers: { "Idempotency-Key": randomUUID() }, body: { materialId: M.D, type: "STOCK_OUT", quantity: 1 } }));
    expect("Z3", httpErr(r, 409, "MATERIAL_FROZEN"), "HTTP: Stock Out on a frozen material rejected", status(r));
    r = await unchanged("Z4", "archive frozen", () => S1.request("POST", `/api/v1/materials/${M.D}/archive`, { body: { reason: "B4-S4 OD-05 probe" } }));
    expect("Z4", httpErr(r, 409, "MATERIAL_FROZEN"), "HTTP: archiving a frozen material rejected (OD-05)", status(r));
    r = await unchanged("Z5", "delete frozen", () => S1.request("DELETE", `/api/v1/materials/${M.DEL}`));
    expect("Z5", httpErr(r, 409, "MATERIAL_FROZEN"), "HTTP: deleting a frozen material rejected", status(r));
    r = await unchanged("Z6", "join another session", () => S2.request("POST", "/api/v1/stock-opnames", { headers: { "Idempotency-Key": randomUUID() }, body: { materialIds: [M.E] } }));
    expect("Z6", httpErr(r, 409, "MATERIAL_ALREADY_IN_OPNAME"), "HTTP: a frozen material cannot join another session", status(r));

    // ---- CANCEL (SD by the other staff) -----------------------------------------
    r = await unchanged("X1", "HTTP cancel without reason", () => S2.request("POST", `/api/v1/stock-opnames/${SD}/cancel`, { body: { reason: "   " } }));
    expect("X1", httpErr(r, 400, "VALIDATION_ERROR"), "HTTP: whitespace-only reason rejected", status(r));
    r = await unchanged("X2", "RPC cancel whitespace reason", () => S2api.rpc("cancel_stock_opname", { p_opname_id: SD, p_reason: " \t " }));
    expect("X2", rpcErr(r, 400, "P0001", "REASON_REQUIRED"), "RPC: whitespace-only reason rejected (database)", status(r));
    r = await unchanged("X3", "RPC cancel 501-char reason", () => S2api.rpc("cancel_stock_opname", { p_opname_id: SD, p_reason: "r".repeat(501) }));
    expect("X3", rpcErr(r, 400, "P0001", "INVALID_REASON"), "RPC: reason over 500 characters rejected", status(r));
    r = await unchanged("X4", "HTTP cancel by owner", () => OWN.request("POST", `/api/v1/stock-opnames/${SD}/cancel`, { body: { reason: "owner probe" } }));
    expect("X4", httpErr(r, 403, "FORBIDDEN"), "HTTP: OWNER cannot cancel", status(r));
    r = await unchanged("X5", "RPC cancel by owner", () => OWNapi.rpc("cancel_stock_opname", { p_opname_id: SD, p_reason: "owner probe" }));
    expect("X5", rpcErr(r, 403, "42501", "FORBIDDEN"), "RPC: OWNER cannot cancel (database)", status(r));
    r = await unchanged("X6", "HTTP cancel without Origin", () => S2.request("POST", `/api/v1/stock-opnames/${SD}/cancel`, { origin: null, body: { reason: "csrf probe" } }));
    expect("X6", httpErr(r, 403, "CSRF_REJECTED"), "HTTP: cancel without Origin rejected (CSRF)", status(r));
    const stocksSD = [M.D, M.E, M.DEL].map(stockOf).join("/");
    const txBeforeCancel = txCount();
    r = await S2.request("POST", `/api/v1/stock-opnames/${SD}/cancel`, { body: { reason: "  B4-S4 dibatalkan oleh staff lain  ", cancelledBy: U.owner } });
    check("X7", r.status === 200 && r.json?.result?.status === "CANCELLED" && r.json.result.released === 3, "HTTP: another staff cancels with a reason; 3 freezes released", status(r));
    check("X8", sessionRow(SD) === `CANCELLED/${U.staff}/-/${U.staff2}/false/true/B4-S4 dibatalkan oleh staff lain`,
      "DB: cancelled_by = canceller (body ignored), timestamp, reason (trimmed by the API)", "match");
    check("X9", [M.D, M.E, M.DEL].every((id) => frozenBy(id) === "") && [M.D, M.E, M.DEL].map(stockOf).join("/") === stocksSD && txCount() === txBeforeCancel,
      "DB: freezes released, stock unchanged, no transaction", stocksSD);
    r = await unchanged("X10", "HTTP repeat cancel", () => S2.request("POST", `/api/v1/stock-opnames/${SD}/cancel`, { body: { reason: "again" } }));
    expect("X10", httpErr(r, 409, "OPNAME_NOT_ACTIVE"), "HTTP: repeated cancel rejected", status(r));
    r = await unchanged("X11", "HTTP post after cancel", () => S1.request("POST", `/api/v1/stock-opnames/${SD}/post`, { body: {} }));
    expect("X11", httpErr(r, 409, "OPNAME_NOT_ACTIVE"), "HTTP: posting a CANCELLED session rejected", status(r));
    r = await unchanged("X12", "RPC count after cancel", () => S1api.rpc("record_stock_opname_counts", { p_opname_id: SD, p_counts: [{ item_id: itemOf(SD, M.E), counted_stock: 1 }] }));
    expect("X12", rpcErr(r, 400, "P0001", "OPNAME_NOT_ACTIVE"), "RPC: counting a CANCELLED session rejected", status(r));
    r = await S1.request("GET", `/api/v1/stock-opnames/${SD}`);
    expect("X13", r.json?.opname?.cancelledByMe === false && r.json.opname.cancelReason === "B4-S4 dibatalkan oleh staff lain", "HTTP detail (creator): cancelled by Pengguna lain, reason shown", status(r));
    r = await S2.request("GET", `/api/v1/stock-opnames/${SD}`);
    expect("X14", r.json?.opname?.cancelledByMe === true, "HTTP detail (canceller): cancelled by Anda", status(r));
    // After cancel: business rules apply again.
    r = await S1.request("POST", "/api/v1/stock-movements", { headers: { "Idempotency-Key": randomUUID() }, body: { materialId: M.D, type: "STOCK_IN", quantity: 1, notes: "B4-S4 after cancel" } });
    expect("Z7", r.status === 201 && r.json?.movement?.currentStock === 4, "HTTP: Stock In allowed again after CANCEL (3 -> 4)", status(r));
    r = await unchanged("Z8", "delete after cancel", () => S1.request("DELETE", `/api/v1/materials/${M.DEL}`));
    expect("Z8", httpErr(r, 409, "MATERIAL_HAS_HISTORY"), "HTTP: delete now hits the normal history rule (opname item), not the freeze", status(r));
    r = await unchanged("Z9", "archive after cancel", () => S1.request("POST", `/api/v1/materials/${M.E}/archive`, { body: { reason: "B4-S4 probe" } }));
    expect("Z9", httpErr(r, 409, "STOCK_NOT_ZERO"), "HTTP: archive now hits the normal stock rule, not the freeze", status(r));

    // ---- L-7: cancel reason via RPC is not trimmed in SQL (documented) ----------
    r = await S2api.rpc("cancel_stock_opname", { p_opname_id: SF, p_reason: "  B4-S4 L-7 padded reason  " });
    check("L7", r.status === 200, "RPC: cancel SF with a padded reason", status(r));
    const storedReason = dbRead(`select '[' || cancel_reason || ']' from public.stock_opname where id = ${lit(SF)};`);
    note("L7-obs", "L-7 observed: reason stored exactly as sent through RPC (the API trims; SQL does not)", storedReason);

    // ---- L-2: replay after a terminal state returns the original response -----
    r = await unchanged("I10", "replay after CANCELLED", () => S1api.rpc("create_stock_opname", { p_material_ids: [M.F, M.G], p_idempotency_key: K2 }));
    expect("I10", r.status === 200 && JSON.stringify(r.json) === firstResponse && r.json.status === "ACTIVE", "RPC: replay after the session ended returns the original create response (status ACTIVE)", status(r));
    r = await S1.request("GET", `/api/v1/stock-opnames/${SF}`);
    expect("I10b", r.json?.opname?.status === "CANCELLED", "HTTP: a fresh read shows the current terminal status", String(r.json?.opname?.status));
    r = await unchanged("I11", "HTTP replay of SA's key after POSTED", () => S1.request("POST", "/api/v1/stock-opnames", { headers: { "Idempotency-Key": K1 }, body: { materialIds: [M.A, M.B, M.C] } }));
    expect("I11", r.status === 201 && r.json?.opname?.id === SA && r.json.opname.status === "ACTIVE", "HTTP: replay of a POSTED session's create returns its original ACTIVE response", status(r));

    // ---- Real concurrency ---------------------------------------------------------
    const inv0 = invariants();
    check("K0", inv0.ok, "invariants before concurrency tests", inv0.text);

    // K1 CREATE vs CREATE, overlapping materials, different users.
    let k = await overlapped("public.materials", M.H, 2, () => [
      S1api.rpc("create_stock_opname", { p_material_ids: [M.H, M.I], p_idempotency_key: randomUUID() }),
      S2api.rpc("create_stock_opname", { p_material_ids: [M.H], p_idempotency_key: randomUUID() }),
    ]);
    let wins = k.responses.filter((x) => x.status === 200);
    let losers = k.responses.filter((x) => rpcErr(x, 400, "P0001", "MATERIAL_ALREADY_IN_OPNAME"));
    wins.forEach((w) => runSessions.add(w.json.opname_id));
    check("K1", wins.length === 1 && losers.length === 1 && count(`select count(*) from public.stock_opname s join public.stock_opname_items i on i.stock_opname_id = s.id where s.status = 'ACTIVE' and i.material_id = ${lit(M.H)};`) === 1,
      "CREATE vs CREATE (overlapping material): one winner, one MATERIAL_ALREADY_IN_OPNAME", `${k.responses.map(status).join(",")} waiting=${k.maxWaiting}`);
    const K1win = wins[0].json.opname_id;
    check("K1-inv", invariants().ok, "invariants after K1", invariants().text);
    r = await S2api.rpc("cancel_stock_opname", { p_opname_id: K1win, p_reason: "B4-S4 K1 cleanup" });
    check("K1-cleanup", r.status === 200, "K1 winner cancelled (cleanup, any staff)", status(r));

    // K2 CREATE x3 with the same key, same user, concurrently.
    const Kc = randomUUID();
    const sessionsK2 = count("select count(*) from public.stock_opname;");
    k = await overlapped("public.materials", M.Q1, 2, () => [
      S1api.rpc("create_stock_opname", { p_material_ids: [M.Q1, M.Q2], p_idempotency_key: Kc }),
      S1api.rpc("create_stock_opname", { p_material_ids: [M.Q2, M.Q1], p_idempotency_key: Kc }),
      S1api.rpc("create_stock_opname", { p_material_ids: [M.Q1, M.Q2], p_idempotency_key: Kc }),
    ]);
    const ids2 = new Set(k.responses.map((x) => x.json?.opname_id));
    check("K2", k.responses.every((x) => x.status === 200) && ids2.size === 1 && count("select count(*) from public.stock_opname;") === sessionsK2 + 1 &&
      count(`select count(*) from app_private.idempotency_requests where key = '${Kc}';`) === 1,
      "same key x3 concurrently: one session, three identical answers, one idempotency row", `${k.responses.map(status).join(",")} waiting=${k.maxWaiting}`);
    const SQ = [...ids2][0]; runSessions.add(SQ);

    // K3 POST vs POST on SQ.
    r = await S1api.rpc("record_stock_opname_counts", { p_opname_id: SQ, p_counts: [{ item_id: itemOf(SQ, M.Q1), counted_stock: 5 }, { item_id: itemOf(SQ, M.Q2), counted_stock: 4 }] });
    check("K3-setup", r.status === 200, "SQ counted (Q1 3 -> 5, Q2 4 -> 4)", status(r));
    k = await overlapped("public.stock_opname", SQ, 2, () => [S1api.rpc("post_stock_opname", { p_opname_id: SQ }), S1api.rpc("post_stock_opname", { p_opname_id: SQ })]);
    wins = k.responses.filter((x) => x.status === 200);
    losers = k.responses.filter((x) => rpcErr(x, 400, "P0001", "OPNAME_NOT_ACTIVE"));
    check("K3", wins.length === 1 && losers.length === 1 && count(`select count(*) from public.inventory_transactions where stock_opname_id = ${lit(SQ)};`) === 1 && stockOf(M.Q1) === 5,
      "POST vs POST: one winner, one OPNAME_NOT_ACTIVE, exactly one ADJUSTMENT", `${k.responses.map(status).join(",")} waiting=${k.maxWaiting}`);

    // K4 POST vs CANCEL.
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.K], p_idempotency_key: randomUUID() });
    const SK = r.json?.opname_id; runSessions.add(SK);
    r = await S1api.rpc("record_stock_opname_counts", { p_opname_id: SK, p_counts: [{ item_id: itemOf(SK, M.K), counted_stock: 2 }] });
    check("K4-setup", r.status === 200, "SK created and counted (5 -> 2)", status(r));
    k = await overlapped("public.stock_opname", SK, 2, () => [
      S1api.rpc("post_stock_opname", { p_opname_id: SK }),
      S2api.rpc("cancel_stock_opname", { p_opname_id: SK, p_reason: "B4-S4 K4 race" }),
    ]);
    const [postK, cancelK] = k.responses;
    const final4 = sessionRow(SK).split("/")[0];
    const okK4 = (postK.status === 200 && rpcErr(cancelK, 400, "P0001", "OPNAME_NOT_ACTIVE") && final4 === "POSTED" && stockOf(M.K) === 2)
      || (cancelK.status === 200 && rpcErr(postK, 400, "P0001", "OPNAME_NOT_ACTIVE") && final4 === "CANCELLED" && stockOf(M.K) === 5);
    check("K4", okK4 && frozenBy(M.K) === "", "POST vs CANCEL: exactly one wins; final state matches the winner; freeze released", `post=${status(postK)} cancel=${status(cancelK)} final=${final4} waiting=${k.maxWaiting}`);

    // K5 CREATE vs POST on a shared material.
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.L], p_idempotency_key: randomUUID() });
    const SL = r.json?.opname_id; runSessions.add(SL);
    r = await S1api.rpc("record_stock_opname_counts", { p_opname_id: SL, p_counts: [{ item_id: itemOf(SL, M.L), counted_stock: 8 }] });
    check("K5-setup", r.status === 200, "SL created and counted (5 -> 8)", status(r));
    k = await overlapped("public.materials", M.L, 2, () => [
      S1api.rpc("post_stock_opname", { p_opname_id: SL }),
      S2api.rpc("create_stock_opname", { p_material_ids: [M.L], p_idempotency_key: randomUUID() }),
    ]);
    const [postL, createL] = k.responses;
    let okK5 = postL.status === 200 && stockOf(M.L) === 8;
    if (createL.status === 200) {
      runSessions.add(createL.json.opname_id);
      const snap = count(`select system_stock from public.stock_opname_items where stock_opname_id = ${lit(createL.json.opname_id)};`);
      okK5 = okK5 && snap === 8 && frozenBy(M.L) === createL.json.opname_id;
    } else {
      okK5 = okK5 && rpcErr(createL, 400, "P0001", "MATERIAL_ALREADY_IN_OPNAME") && frozenBy(M.L) === "";
    }
    check("K5", okK5 && invariants().ok, "CREATE vs POST (shared material): post applies; create either waits and snapshots the posted stock or is refused while frozen", `post=${status(postL)} create=${status(createL)} waiting=${k.maxWaiting}`);

    // K6 CREATE vs CANCEL on a shared material.
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.MM], p_idempotency_key: randomUUID() });
    const SM = r.json?.opname_id; runSessions.add(SM);
    check("K6-setup", r.status === 200, "SM created", status(r));
    k = await overlapped("public.materials", M.MM, 2, () => [
      S2api.rpc("cancel_stock_opname", { p_opname_id: SM, p_reason: "B4-S4 K6 race" }),
      S2api.rpc("create_stock_opname", { p_material_ids: [M.MM], p_idempotency_key: randomUUID() }),
    ]);
    const [cancelM, createM] = k.responses;
    let okK6 = cancelM.status === 200 && sessionRow(SM).startsWith("CANCELLED/") && stockOf(M.MM) === 5;
    if (createM.status === 200) {
      runSessions.add(createM.json.opname_id);
      okK6 = okK6 && frozenBy(M.MM) === createM.json.opname_id;
    } else {
      okK6 = okK6 && rpcErr(createM, 400, "P0001", "MATERIAL_ALREADY_IN_OPNAME") && frozenBy(M.MM) === "";
    }
    check("K6", okK6 && invariants().ok, "CREATE vs CANCEL (shared material): consistent freeze whichever order", `cancel=${status(cancelM)} create=${status(createM)} waiting=${k.maxWaiting}`);

    // K7 POST vs Stock In / Stock Out on the frozen material.
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.N], p_idempotency_key: randomUUID() });
    const SN = r.json?.opname_id; runSessions.add(SN);
    r = await S1api.rpc("record_stock_opname_counts", { p_opname_id: SN, p_counts: [{ item_id: itemOf(SN, M.N), counted_stock: 12 }] });
    check("K7-setup", r.status === 200, "SN created and counted (9 -> 12)", status(r));
    k = await overlapped("public.materials", M.N, 2, () => [
      S1api.rpc("post_stock_opname", { p_opname_id: SN }),
      S1api.rpc("post_stock_movement", { p_material_id: M.N, p_type: "STOCK_IN", p_quantity: 1, p_notes: "B4-S4 K7", p_idempotency_key: randomUUID() }),
      S1api.rpc("post_stock_movement", { p_material_id: M.N, p_type: "STOCK_OUT", p_quantity: 1, p_notes: "B4-S4 K7", p_idempotency_key: randomUUID() }),
    ]);
    const [postN, inN, outN] = k.responses;
    const adjN = count(`select quantity_delta from public.inventory_transactions where stock_opname_id = ${lit(SN)};`);
    const movesOk = [inN, outN].every((x) => x.status === 200 || rpcErr(x, 400, "P0001", "MATERIAL_FROZEN"));
    const expectedN = 12 + (inN.status === 200 ? 1 : 0) - (outN.status === 200 ? 1 : 0);
    check("K7", postN.status === 200 && adjN === 3 && movesOk && stockOf(M.N) === expectedN && invariants().ok,
      "POST vs Stock In/Out: adjustment uses the frozen snapshot (+3); movements are refused while frozen or apply after the post; ledger reconciles",
      `post=${status(postN)} in=${status(inN)} out=${status(outN)} stock=${stockOf(M.N)} waiting=${k.maxWaiting}`);

    // K8 COUNT vs POST.
    r = await S1api.rpc("create_stock_opname", { p_material_ids: [M.O1, M.O2], p_idempotency_key: randomUUID() });
    const SO = r.json?.opname_id; runSessions.add(SO);
    const iO1 = itemOf(SO, M.O1);
    r = await S1api.rpc("record_stock_opname_counts", { p_opname_id: SO, p_counts: [{ item_id: iO1, counted_stock: 4 }, { item_id: itemOf(SO, M.O2), counted_stock: 3 }] });
    check("K8-setup", r.status === 200, "SO created and counted (O1 3 -> 4, O2 unchanged)", status(r));
    k = await overlapped("public.stock_opname", SO, 2, () => [
      S1api.rpc("record_stock_opname_counts", { p_opname_id: SO, p_counts: [{ item_id: iO1, counted_stock: 6 }] }),
      S1api.rpc("post_stock_opname", { p_opname_id: SO }),
    ]);
    const [countO, postO] = k.responses;
    const storedO1 = count(`select counted_stock from public.stock_opname_items where id = ${lit(iO1)};`);
    const okK8 = postO.status === 200 && stockOf(M.O1) === storedO1 &&
      ((countO.status === 200 && storedO1 === 6) || (rpcErr(countO, 400, "P0001", "OPNAME_NOT_ACTIVE") && storedO1 === 4));
    check("K8", okK8 && invariants().ok, "COUNT vs POST: serialized; the post uses exactly the count stored when it ran", `count=${status(countO)} post=${status(postO)} stored=${storedO1} stock=${stockOf(M.O1)} waiting=${k.maxWaiting}`);

    // ---- Direct table writes -------------------------------------------------------
    const writes = [
      ["W1", "PATCH stock_opname status", () => S1api.request("PATCH", `/rest/v1/stock_opname?id=eq.${SO}`, { body: { status: "CANCELLED" } })],
      ["W2", "INSERT stock_opname", () => S1api.request("POST", "/rest/v1/stock_opname", { body: { created_by: U.staff } })],
      ["W3", "INSERT stock_opname_items", () => S1api.request("POST", "/rest/v1/stock_opname_items", { body: { stock_opname_id: SO, material_id: M.C, system_stock: 1, added_by: U.staff } })],
      ["W4", "PATCH stock_opname_items counted_stock", () => S1api.request("PATCH", `/rest/v1/stock_opname_items?stock_opname_id=eq.${SO}`, { body: { counted_stock: 99 } })],
      ["W5", "PATCH materials active_opname_id", () => S1api.request("PATCH", `/rest/v1/materials?id=eq.${M.C}`, { body: { active_opname_id: SO } })],
      ["W6", "DELETE stock_opname", () => S1api.request("DELETE", `/rest/v1/stock_opname?id=eq.${SO}`)],
      ["W7", "INSERT ADJUSTMENT", () => S1api.request("POST", "/rest/v1/inventory_transactions", { body: { material_id: M.C, type: "ADJUSTMENT", quantity_delta: 5, stock_opname_id: SO, stock_opname_item_id: iO1, created_by: U.staff } })],
      ["W8", "owner PATCH stock_opname", () => OWNapi.request("PATCH", `/rest/v1/stock_opname?id=eq.${SO}`, { body: { status: "ACTIVE" } })],
      ["W9", "call into app_private", () => S1api.request("POST", "/rest/v1/rpc/post_stock_opname", { body: { p_opname_id: SO }, headers: { "Content-Profile": "app_private" } })],
    ];
    for (const [id, label, action] of writes) {
      r = await unchanged(id, label, action);
      expect(id, id === "W9" ? r.status === 406 : denied(r), `direct ${label} refused`, status(r));
    }
  } finally {
    // ---- Cleanup: cancel any session of this run still ACTIVE ----------------
    try {
      if (S2api) {
        for (const id of runSessions) {
          if (typeof id !== "string" || !UUID.test(id)) continue;
          if (dbRead(`select status from public.stock_opname where id = ${lit(id)};`) === "ACTIVE") {
            const c = await S2api.rpc("cancel_stock_opname", { p_opname_id: id, p_reason: "B4-S4 cleanup" }).catch(() => ({ status: "transport-error" }));
            record(`CL-${id.slice(0, 8)}`, c.status === 200, "cleanup: cancel a session of this run left ACTIVE", String(c.status));
          }
        }
      }
    } catch (error) {
      record("CL-error", false, "cleanup could not complete (reconcile read-only)", error.message);
    }
    for (const c of live.app) {
      const r = await c.request("POST", "/api/v1/auth/logout").catch(() => ({ status: "transport-error" }));
      record(`L-app-${c.label}`, r.status === 200, `logout ${c.label} (app)`, String(r.status));
      if (r.status === 200) {
        const after = await c.request("GET", "/api/v1/auth/session").catch(() => ({ status: "transport-error" }));
        record(`L-app-${c.label}-after`, after.status === 401, `old cookies of ${c.label} rejected after logout`, String(after.status));
      }
    }
    for (const [i, token] of live.direct.entries()) {
      const s = await directLogout(keys, token).catch(() => "transport-error");
      record(`L-direct-${i + 1}`, s === 204, "logout direct Auth session", String(s));
    }
    try {
      record("L-end", count("select count(*) from auth.sessions;") === 0, "no live Auth session left", `sessions=${count("select count(*) from auth.sessions;")}`);
      const inv = invariants();
      record("G1", inv.ok, "global invariants after the run (freeze, ledger, adjustments, sessions)", inv.text);
      const active = count("select count(*) from public.stock_opname where status = 'ACTIVE';");
      record("G2", active === 0, "no ACTIVE session left by this run", String(active));
      record("G3", dbRead(`select md5(string_agg(m::text, ',' order by m.id)) from public.materials m where m.name like '[DEMO] B3R7%';`) === legacy, "pre-existing DEMO materials untouched", "compared");
      record("G4", count("select count(*) from information_schema.role_table_grants where grantee in ('anon','authenticated','service_role') and table_schema in ('public','app_private') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');") === 0,
        "no direct write privilege for API roles", "checked");
    } catch (error) {
      record("G-error", false, "final checks could not complete", error.message);
    }
    server.kill("SIGTERM");
    const apiLines = serverLog.filter((l) => l.includes("[api]") || /error/i.test(l));
    console.log(`SERVER-LOG | ${apiLines.length} [api]/error line(s)`);
    for (const line of apiLines.slice(0, 40)) console.log(`SERVER-LOG | ${line}`);
  }
}

let aborted = false;
main()
  .catch((error) => {
    aborted = true;
    console.log(`ABORT | ${error.message}`);
  })
  .finally(() => {
    const tests = results.filter((x) => !x.note);
    const failed = tests.filter((x) => !x.ok).length;
    console.log(`SUMMARY | ${tests.length - failed} PASS | ${failed} FAIL | ${results.length - tests.length} NOTE${aborted ? " | ABORTED" : ""}`);
    process.exitCode = aborted || failed > 0 || !tests.length ? 1 : 0;
  });
