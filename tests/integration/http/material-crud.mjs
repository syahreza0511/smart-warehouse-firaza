// HTTP integration harness for Material CRUD (B3-R7). Runs ONLY against an
// isolated, disposable local Supabase stack named by the FIRAZA_TEST_*
// variables below, and a Next.js production server that this script starts
// itself on http://127.0.0.1:3001. Not a unit test and not run by CI.
// One-shot: it requires a clean database with exactly the six migrations up
// to 20261110090000, so it refuses to run on a database that already has
// migration seven or any fixture.
//
//   node_modules/.bin/next build          # once, beforehand
//   FIRAZA_TEST_API_URL=... FIRAZA_TEST_DB_CONTAINER=... \
//   FIRAZA_TEST_SYSTEM_IDENTIFIER=... FIRAZA_TEST_SUPABASE_WORKDIR=... \
//   FIRAZA_ALLOW_B3R7=B3-R7 node tests/integration/http/material-crud.mjs
//
// What it does, in order (fail-closed; no step is ever retried):
//   1. Guards: configured DB container, PostgreSQL system_identifier, six
//      migrations, loopback API URL, port 3001 free, and a CLEAN
//      database (no users, sessions, profiles, categories, materials,
//      transactions, or status events). A second run therefore refuses to
//      start; never clean up the database to force one.
//   2. Fixtures: one OWNER and one STAFF_WAREHOUSE account through the local
//      Auth Admin API (email confirmed), profiles through
//      app_private.admin_provision_profile (trusted context: psql as
//      postgres), and two synthetic [DEMO] categories (OD-19: no app path).
//   3. Tests through the app's /api/v1 routes with real Supabase sessions,
//      plus direct Data API calls with real access tokens to prove that the
//      database enforces the same rules without the Next.js layer.
//   4. Every session created by the run is logged out; the run ends with 0
//      live sessions.
//
// Secrets: passwords are random per run and live only in this process. The
// local keys come from `supabase status` for the B workdir and are passed
// only to the child Next.js process environment. Nothing secret is printed or
// written to disk. UUIDs of synthetic fixtures are not secrets.
//
// Exit codes: 0 all PASS; 1 FAIL or abort. After an abort, do NOT rerun:
// reconcile read-only in the database and report.
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPT_IN = "B3-R7";
const BASE_URL = "http://127.0.0.1:3001";
// Local-only target, configured per machine (never committed values). Each
// one is validated in checkConfig() before the harness touches anything.
//   FIRAZA_TEST_API_URL                 http://127.0.0.1:<port> of the isolated stack
//   FIRAZA_TEST_DB_CONTAINER            its supabase_db_* container
//   FIRAZA_TEST_SYSTEM_IDENTIFIER       expected PostgreSQL system_identifier
//   FIRAZA_TEST_SUPABASE_WORKDIR        absolute path of its Supabase workdir
const API_URL = process.env.FIRAZA_TEST_API_URL ?? "";
const DB_CONTAINER = process.env.FIRAZA_TEST_DB_CONTAINER ?? "";
const SYSTEM_IDENTIFIER = process.env.FIRAZA_TEST_SYSTEM_IDENTIFIER ?? "";
const WORKDIR = process.env.FIRAZA_TEST_SUPABASE_WORKDIR ?? "";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SUPABASE_BIN = path.join(REPO_ROOT, "node_modules/.bin/supabase");
const NEXT_BIN = path.join(REPO_ROOT, "node_modules/.bin/next");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const EMAILS = { owner: "demo-owner-b3r7@firaza.test", staff: "demo-staff-b3r7@firaza.test" };
const CATEGORY_A = "[DEMO] Kategori Kain B3R7";
const CATEGORY_B = "[DEMO] Kategori Aksesoris B3R7";
const NAMES = {
  m1: "[DEMO] B3R7 Kain Katun",
  m1Renamed: "[DEMO] B3R7 Kain Katun Premium",
  m1Final: "[DEMO] B3R7 Kain Katun Premium A",
  m2: "[DEMO] B3R7 Kancing Kayu",
  m3: "[DEMO] B3R7 Benang Hapus",
  race: "[DEMO] B3R7 Resleting",
  ownerAttempt: "[DEMO] B3R7 Owner Attempt",
};

function fail(message) {
  throw new Error(message);
}

// ---------------------------------------------------------------------------
// Results. check() stops the run (safety-critical); expect() records and goes
// on (response details), because every expect() is paired with a hard
// database check where state could change.
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
const status = (r) => `${r.status}/${r.json?.error?.code ?? r.json?.code ?? "-"}`;
function expectError(id, description, r, httpStatus, code) {
  return expect(id, r.status === httpStatus && r.json?.error?.code === code, description, status(r));
}

// ---------------------------------------------------------------------------
// Database access: docker exec psql on the fixed B container only.
// ---------------------------------------------------------------------------
function psql(sql, { readOnly }) {
  const input = readOnly ? `begin transaction read only;\n${sql}\nrollback;\n` : `${sql}\n`;
  try {
    return execFileSync(
      "docker",
      ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-qAtX", "-F", "|", "-v", "ON_ERROR_STOP=1"],
      { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
  } catch {
    fail(`Database ${readOnly ? "read" : "fixture write"} failed (details not shown); aborting.`);
  }
}
const dbRead = (sql) => psql(sql, { readOnly: true });

const SNAPSHOT_SQL = `
select
  (select count(*) from public.materials),
  (select md5(coalesce(string_agg(m::text, ',' order by m.id), '')) from public.materials m),
  (select count(*) from public.material_status_events),
  (select md5(coalesce(string_agg(e::text, ',' order by e.id), '')) from public.material_status_events e),
  (select count(*) from public.inventory_transactions),
  (select md5(coalesce(string_agg(t::text, ',' order by t.id), '')) from public.inventory_transactions t),
  (select count(*) from app_private.idempotency_requests),
  (select md5(coalesce(string_agg(c::text, ',' order by c.id), '')) from public.categories c),
  (select md5(coalesce(string_agg(p::text, ',' order by p.id), '')) from public.profiles p),
  (select count(*) from public.materials m
     where m.current_stock <> coalesce((select sum(x.quantity_delta) from public.inventory_transactions x where x.material_id = m.id), 0));`;

function snapshot() {
  const f = dbRead(SNAPSHOT_SQL).split("|");
  if (f.length !== 10) fail("Unexpected snapshot format; aborting.");
  return { state: f.slice(0, 9).join("|"), materials: Number(f[0]), events: Number(f[2]), tx: Number(f[4]), balanceMismatch: Number(f[9]) };
}

// Hard check: the database is byte-for-byte unchanged across a rejected
// request (materials, status events, transactions, idempotency, categories,
// profiles).
async function unchanged(id, description, action) {
  const before = snapshot();
  const r = await action();
  const after = snapshot();
  check(`${id}-DB`, before.state === after.state, `${description}: database unchanged`, before.state === after.state ? "unchanged" : "CHANGED");
  return r;
}

function materialRow(id) {
  if (!UUID.test(id)) fail("Invalid material id.");
  const row = dbRead(`select name, category_id, unit, current_stock, minimum_stock, archived_at is not null, coalesce(archived_by::text, '')
    from public.materials where id = '${id}';`);
  if (!row) return null;
  const [name, categoryId, unit, stock, min, archived, archivedBy] = row.split("|");
  return { name, categoryId, unit, stock: Number(stock), min: Number(min), archived: archived === "t", archivedBy };
}

function sqlCount(sql) {
  const v = dbRead(sql);
  if (!/^\d+$/.test(v)) fail("Unexpected count format; aborting.");
  return Number(v);
}

// ---------------------------------------------------------------------------
// Local keys (never printed) and the Next.js child process.
// ---------------------------------------------------------------------------
function localKeys() {
  let out;
  try {
    out = execFileSync(SUPABASE_BIN, ["status", "-o", "json", "--workdir", WORKDIR], {
      cwd: "/",
      env: { HOME: process.env.HOME, PATH: process.env.PATH, DO_NOT_TRACK: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    fail("supabase status failed (details not shown); aborting.");
  }
  const j = JSON.parse(out.slice(out.indexOf("{")));
  if (j.API_URL !== API_URL) fail(`Unexpected API URL ${j.API_URL}; only ${API_URL} is allowed.`);
  for (const k of ["ANON_KEY", "SERVICE_ROLE_KEY", "PUBLISHABLE_KEY"]) if (!j[k]) fail(`Missing ${k} in local status.`);
  return { anon: j.ANON_KEY, service: j.SERVICE_ROLE_KEY, publishable: j.PUBLISHABLE_KEY };
}

function portFree(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
  });
}

const serverLog = [];
function redact(line) {
  return line
    .replace(/eyJ[A-Za-z0-9._-]+/g, "<redacted>")
    .replace(/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, "<redacted>")
    .replace(/postgres(ql)?:\/\/\S+/g, "<redacted>");
}

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
    stream.on("data", (chunk) => {
      for (const line of chunk.split("\n")) if (line.trim()) serverLog.push(redact(line));
    });
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

// ---------------------------------------------------------------------------
// HTTP clients
// ---------------------------------------------------------------------------
async function send(url, init) {
  let res;
  try {
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000), ...init });
  } catch {
    // Transport failure: the outcome of a mutation is unknown. Never resend.
    fail(`Transport error on ${init.method ?? "GET"} ${url.replace(API_URL, "<api>")}: outcome unknown, not retried; aborting.`);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, headers: res.headers, res };
}

// App client with its own cookie jar (cookie values are never printed).
class AppClient {
  constructor(label) {
    this.label = label;
    this.jar = new Map();
    this.cookieAttributes = [];
  }

  store(res) {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      this.cookieAttributes.push(attrs.map((a) => a.trim().split("=")[0].toLowerCase()));
      const expired = value === "" || attrs.some((a) => /^\s*max-age=(0|-\d+)\s*$/i.test(a));
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  async request(method, url, { body, rawBody, origin = BASE_URL, contentType = "application/json", headers = {} } = {}) {
    const h = { ...headers };
    if (origin) h.Origin = origin;
    if (contentType && (body !== undefined || rawBody !== undefined)) h["Content-Type"] = contentType;
    if (this.jar.size) h.Cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const r = await send(BASE_URL + url, {
      method,
      headers: h,
      body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.store(r.res);
    return r;
  }
}

// Direct Data API client with a real access token (never printed).
class DataApiClient {
  constructor(label, anonKey, accessToken) {
    this.label = label;
    this.anonKey = anonKey;
    this.accessToken = accessToken;
  }

  request(method, pathname, { body, headers = {} } = {}) {
    const h = { apikey: this.anonKey, "Content-Type": "application/json", Prefer: "return=minimal", ...headers };
    if (this.accessToken) h.Authorization = `Bearer ${this.accessToken}`;
    return send(`${API_URL}${pathname}`, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
  }
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

async function directLogout(keys, token) {
  const r = await send(`${API_URL}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: { apikey: keys.anon, Authorization: `Bearer ${token}` },
  });
  return r.status;
}

const denied = (r) => (r.status === 401 || r.status === 403) && r.json?.code === "42501";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// Refuses to run unless the target is explicitly configured, local, and an
// isolated stack: loopback API only, a supabase_db_* container, a numeric
// system_identifier (compared with the database before any write), and an
// existing Supabase workdir.
function checkConfig() {
  if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(API_URL)) fail("Set FIRAZA_TEST_API_URL to http://127.0.0.1:<port> of the isolated stack.");
  if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(DB_CONTAINER)) fail("Set FIRAZA_TEST_DB_CONTAINER to the isolated stack's supabase_db_* container.");
  if (!/^\d{10,20}$/.test(SYSTEM_IDENTIFIER)) fail("Set FIRAZA_TEST_SYSTEM_IDENTIFIER to the expected PostgreSQL system_identifier.");
  if (!path.isAbsolute(WORKDIR) || !existsSync(path.join(WORKDIR, "supabase", "config.toml"))) {
    fail("Set FIRAZA_TEST_SUPABASE_WORKDIR to the absolute path of the isolated stack's Supabase workdir.");
  }
}

async function main() {
  if (process.env.FIRAZA_ALLOW_B3R7 !== OPT_IN) fail(`Set FIRAZA_ALLOW_B3R7=${OPT_IN} to run (see header).`);
  checkConfig();

  // ---- Preflight -----------------------------------------------------------
  const sysid = dbRead("select system_identifier from pg_control_system();");
  check("P1", sysid === SYSTEM_IDENTIFIER, "PostgreSQL system_identifier is the B database", sysid === SYSTEM_IDENTIFIER ? "match" : "MISMATCH");
  const migs = dbRead("select count(*) || '/' || max(version) from supabase_migrations.schema_migrations;");
  check("P2", migs === "6/20261110090000", "six migrations, last is 20261110090000", migs);
  const clean = dbRead(`select (select count(*) from auth.users) + (select count(*) from auth.sessions) + (select count(*) from public.profiles)
    + (select count(*) from public.categories) + (select count(*) from public.materials) + (select count(*) from public.inventory_transactions)
    + (select count(*) from public.material_status_events);`);
  check("P3", clean === "0", "database is clean before fixtures (refuses a second run)", `rows=${clean}`);
  check("P4", await portFree(3001), "port 3001 free on 127.0.0.1", "free");
  const keys = localKeys();
  record("P5", true, "local keys read from supabase status for the B workdir (values not shown)", `api=${API_URL}`);

  const server = startServer(keys);
  const sessionsAtStart = sqlCount("select count(*) from auth.sessions;");
  const live = { app: [], direct: [] };

  try {
    await waitForServer();
    record("P6", true, "Next.js production server started by the harness", `${BASE_URL} (127.0.0.1 only)`);

    // ---- Fixtures ------------------------------------------------------------
    const passwords = {
      owner: `B3r7-${randomBytes(24).toString("base64url")}`,
      staff: `B3r7-${randomBytes(24).toString("base64url")}`,
    };
    const ids = {};
    for (const who of ["owner", "staff"]) {
      const r = await send(`${API_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: keys.service, Authorization: `Bearer ${keys.service}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: EMAILS[who], password: passwords[who], email_confirm: true }),
      });
      check(`F1-${who}`, (r.status === 200 || r.status === 201) && UUID.test(r.json?.id ?? ""), `Auth Admin API creates ${who} account (email confirmed)`, `${r.status} id=${r.json?.id ?? "-"}`);
      ids[who] = r.json.id;
    }
    const roles = { owner: "OWNER", staff: "STAFF_WAREHOUSE" };
    for (const who of ["owner", "staff"]) {
      const out = psql(
        `select app_private.admin_provision_profile('${ids[who]}', '${EMAILS[who]}', '[DEMO] ${roles[who]} B3R7', '${roles[who]}',
          'claude-code-b', 'B3-R7 local integration fixture', '${randomUUID()}') ->> 'outcome';`,
        { readOnly: false }
      );
      check(`F2-${who}`, out === "APPLIED", `profile provisioned as ${roles[who]} via admin_provision_profile`, out);
    }
    const cats = psql(
      `insert into public.categories (name) values ('${CATEGORY_A}'), ('${CATEGORY_B}') returning id;`,
      { readOnly: false }
    ).split("\n").map((l) => l.trim()).filter(Boolean);
    check("F3", cats.length === 2 && cats.every((c) => UUID.test(c)), "two synthetic [DEMO] categories inserted", `ids=${cats.join(",")}`);
    const [catA, catB] = cats;

    // ---- Authentication ------------------------------------------------------
    const anonymous = new AppClient("anonymous");
    let r = await anonymous.request("GET", "/api/v1/materials");
    expectError("A1", "GET /materials without a session is rejected", r, 401, "UNAUTHENTICATED");
    r = await unchanged("A2", "POST /materials without a session", () =>
      anonymous.request("POST", "/api/v1/materials", { body: { categoryId: catA, name: NAMES.ownerAttempt, unit: "pcs", minimumStock: 1 } })
    );
    expectError("A2", "POST /materials without a session is rejected", r, 401, "UNAUTHENTICATED");

    const wrong = new AppClient("wrong-password");
    r = await wrong.request("POST", "/api/v1/auth/login", { body: { email: EMAILS.staff, password: `${passwords.staff}x` } });
    expectError("A3", "login with a wrong password is rejected", r, 401, "INVALID_CREDENTIALS");
    expect("A3b", wrong.jar.size === 0, "no auth cookie after a failed login", `cookies=${wrong.jar.size}`);

    const staff = new AppClient("staff");
    r = await staff.request("POST", "/api/v1/auth/login", { body: { email: EMAILS.staff, password: passwords.staff } });
    check("A4", r.status === 200 && r.json?.user?.role === "STAFF_WAREHOUSE" && r.json?.user?.id === ids.staff, "STAFF_WAREHOUSE login succeeds", `${r.status} role=${r.json?.user?.role ?? "-"}`);
    live.app.push(staff);
    const attrsOk = staff.cookieAttributes.length > 0 && staff.cookieAttributes.every((a) => a.includes("httponly") && a.includes("samesite") && a.includes("path"));
    expect("A4b", attrsOk, "auth cookies are HttpOnly, SameSite, Path (Secure off: AUTH_COOKIE_SECURE=false, local HTTP)", `cookies=${staff.jar.size}`);

    const owner = new AppClient("owner");
    r = await owner.request("POST", "/api/v1/auth/login", { body: { email: EMAILS.owner, password: passwords.owner } });
    check("A5", r.status === 200 && r.json?.user?.role === "OWNER" && r.json?.user?.id === ids.owner, "OWNER login succeeds", `${r.status} role=${r.json?.user?.role ?? "-"}`);
    live.app.push(owner);

    r = await staff.request("GET", "/api/v1/auth/session");
    expect("A6-staff", r.status === 200 && r.json?.user?.role === "STAFF_WAREHOUSE", "session endpoint returns the database role (staff)", `${r.status} role=${r.json?.user?.role ?? "-"}`);
    r = await owner.request("GET", "/api/v1/auth/session");
    expect("A6-owner", r.status === 200 && r.json?.user?.role === "OWNER", "session endpoint returns the database role (owner)", `${r.status} role=${r.json?.user?.role ?? "-"}`);
    expect("A7", sqlCount("select count(*) from auth.sessions;") === sessionsAtStart + 2, "exactly two live sessions after two logins", `sessions=${sqlCount("select count(*) from auth.sessions;")}`);

    for (const [label, c] of [["staff", staff], ["owner", owner]]) {
      r = await c.request("GET", "/api/v1/categories");
      expect(`A8-${label}`, r.status === 200 && r.json?.categories?.length === 2, `categories readable (${label})`, `${r.status} n=${r.json?.categories?.length ?? "-"}`);
    }

    // ---- Create and read -----------------------------------------------------
    r = await staff.request("POST", "/api/v1/materials", { body: { categoryId: catA, name: NAMES.m1, unit: "meter", minimumStock: 5 } });
    check("C1", r.status === 201 && UUID.test(r.json?.material?.id ?? "") && r.json.material.currentStock === 0 && r.json.material.isArchived === false,
      "staff creates a material; stock starts at 0", `${r.status} stock=${r.json?.material?.currentStock ?? "-"} status=${r.json?.material?.stockStatus ?? "-"}`);
    const m1 = r.json.material.id;
    let row = materialRow(m1);
    check("C1-DB", row?.stock === 0 && row.min === 5 && row.unit === "meter" && row.categoryId === catA && sqlCount("select count(*) from public.inventory_transactions;") === 0,
      "DB row: stock 0, min 5, no transaction", `stock=${row?.stock} min=${row?.min} tx=0`);

    r = await staff.request("GET", `/api/v1/materials/${m1}`);
    expect("C2", r.status === 200 && r.json?.material?.name === NAMES.m1 && r.json?.management?.unitLocked === false && r.json?.management?.deletable === true,
      "detail shows the new material with unitLocked=false, deletable=true", `${r.status} ${JSON.stringify(r.json?.management ?? null)}`);
    r = await staff.request("GET", "/api/v1/materials");
    expect("C3-staff", r.status === 200 && r.json?.materials?.some((m) => m.id === m1), "active list contains the material (staff)", `${r.status} n=${r.json?.materials?.length ?? "-"}`);
    r = await owner.request("GET", "/api/v1/materials");
    expect("C3-owner", r.status === 200 && r.json?.materials?.some((m) => m.id === m1), "OWNER can read the material list", `${r.status} n=${r.json?.materials?.length ?? "-"}`);
    r = await owner.request("GET", `/api/v1/materials/${m1}`);
    expect("C3-owner-detail", r.status === 200 && r.json?.material?.id === m1, "OWNER can read the material detail", status(r));

    // ---- Update metadata and minimum stock -----------------------------------
    r = await staff.request("PUT", `/api/v1/materials/${m1}`, {
      body: { categoryId: catB, name: NAMES.m1Renamed, unit: "m", minimumStock: 7, currentStock: 999 },
    });
    row = materialRow(m1);
    expect("C4", r.status === 200 && r.json?.material?.name === NAMES.m1Renamed, "staff updates name, category, unit, minimum stock", `${r.status}`);
    check("C4-DB", row.name === NAMES.m1Renamed && row.categoryId === catB && row.unit === "m" && row.min === 7 && row.stock === 0,
      "DB metadata updated; extra field currentStock=999 ignored, stock stays 0", `stock=${row.stock} min=${row.min} unit=${row.unit}`);

    r = await staff.request("PUT", `/api/v1/materials/${m1}`, { body: { categoryId: catB, name: NAMES.m1Renamed, unit: "m", minimumStock: 12 } });
    row = materialRow(m1);
    expect("C5", r.status === 200 && r.json?.material?.minimumStock === 12, "staff updates minimum stock only", status(r));
    check("C5-DB", row.min === 12 && row.stock === 0, "DB minimum stock 12, stock unchanged", `min=${row.min} stock=${row.stock}`);

    r = await staff.request("POST", "/api/v1/materials", { body: { categoryId: catB, name: NAMES.m2, unit: "pcs", minimumStock: 10 } });
    check("C6", r.status === 201, "staff creates a second material (archive test)", status(r));
    const m2 = r.json.material.id;
    r = await staff.request("POST", "/api/v1/materials", { body: { categoryId: catB, name: NAMES.m3, unit: "gulung", minimumStock: 0 } });
    check("C7", r.status === 201, "staff creates a third material (delete test)", status(r));
    const m3 = r.json.material.id;

    // ---- Invalid input (each must leave the database unchanged) -------------
    const valid = { categoryId: catA, name: "[DEMO] B3R7 Invalid Probe", unit: "pcs", minimumStock: 1 };
    const invalidCases = [
      ["V1", "empty name", { ...valid, name: "   " }, 400, "VALIDATION_ERROR"],
      ["V2", "negative minimum stock", { ...valid, minimumStock: -1 }, 400, "VALIDATION_ERROR"],
      ["V3", "fractional minimum stock", { ...valid, minimumStock: 1.5 }, 400, "VALIDATION_ERROR"],
      ["V4", "control character in name", { ...valid, name: "[DEMO] B3R7 Bell\u0007" }, 400, "VALIDATION_ERROR"],
      ["V5", "name longer than 120 characters", { ...valid, name: `[DEMO] ${"x".repeat(120)}` }, 400, "VALIDATION_ERROR"],
      ["V6", "categoryId not a UUID", { ...valid, categoryId: "kain" }, 400, "VALIDATION_ERROR"],
      ["V7", "unknown category (database check)", { ...valid, categoryId: randomUUID() }, 400, "CATEGORY_NOT_FOUND"],
      ["V8", "unit longer than 30 characters", { ...valid, unit: "u".repeat(31) }, 400, "VALIDATION_ERROR"],
    ];
    for (const [id, label, body, s, code] of invalidCases) {
      r = await unchanged(id, `create with ${label}`, () => staff.request("POST", "/api/v1/materials", { body }));
      expectError(id, `create with ${label} is rejected`, r, s, code);
    }
    r = await unchanged("V9", "malformed JSON", () => staff.request("POST", "/api/v1/materials", { rawBody: "{not json" }));
    expectError("V9", "malformed JSON is rejected", r, 400, "INVALID_JSON");
    r = await unchanged("V10", "non-JSON content type", () => staff.request("POST", "/api/v1/materials", { rawBody: "a=b", contentType: "text/plain" }));
    expectError("V10", "non-JSON content type is rejected", r, 415, "UNSUPPORTED_MEDIA_TYPE");
    // Cross-origin probe with a duplicate name: the database would still reject it.
    r = await unchanged("V11", "cross-origin create", () =>
      staff.request("POST", "/api/v1/materials", { body: { ...valid, name: NAMES.m1Renamed }, origin: "http://evil.example" })
    );
    expectError("V11", "cross-origin create is rejected (CSRF)", r, 403, "CSRF_REJECTED");
    r = await unchanged("V12", "update with invalid id", () => staff.request("PUT", "/api/v1/materials/abc", { body: valid }));
    expectError("V12", "update with an invalid id is rejected", r, 400, "INVALID_ID");
    r = await staff.request("GET", `/api/v1/materials/${randomUUID()}`);
    expectError("V13", "unknown material id returns 404", r, 404, "MATERIAL_NOT_FOUND");
    r = await unchanged("V14", "archive with empty reason", () => staff.request("POST", `/api/v1/materials/${m2}/archive`, { body: { reason: "  " } }));
    expectError("V14", "archive with an empty reason is rejected", r, 400, "VALIDATION_ERROR");
    r = await unchanged("V15", "archive with 501-character reason", () => staff.request("POST", `/api/v1/materials/${m2}/archive`, { body: { reason: "r".repeat(501) } }));
    expectError("V15", "archive with a reason over 500 characters is rejected", r, 400, "VALIDATION_ERROR");

    // ---- Duplicates ------------------------------------------------------------
    r = await unchanged("D1", "create duplicate name (other case)", () =>
      staff.request("POST", "/api/v1/materials", { body: { categoryId: catA, name: NAMES.m1Renamed.toLowerCase(), unit: "pcs", minimumStock: 0 } })
    );
    expectError("D1", "duplicate name (case-insensitive) is rejected", r, 409, "NAME_TAKEN");
    r = await unchanged("D2", "rename to an existing name", () =>
      staff.request("PUT", `/api/v1/materials/${m2}`, { body: { categoryId: catB, name: NAMES.m1Renamed, unit: "pcs", minimumStock: 10 } })
    );
    expectError("D2", "renaming to an existing name is rejected", r, 409, "NAME_TAKEN");
    // Two simultaneous creates with the same new name: the unique index must
    // let exactly one through. This tests the constraint, not an update policy.
    const race = await Promise.all([1, 2].map(() =>
      staff.request("POST", "/api/v1/materials", { body: { categoryId: catA, name: NAMES.race, unit: "pcs", minimumStock: 0 } })
    ));
    const raceStatuses = race.map(status).sort();
    const raceRows = sqlCount(`select count(*) from public.materials where lower(name) = lower('${NAMES.race}');`);
    check("D3", raceStatuses.join(",") === "201/-,409/NAME_TAKEN" && raceRows === 1, "two simultaneous creates with one name: one 201, one NAME_TAKEN, one row", `${raceStatuses.join(",")} rows=${raceRows}`);
    const m4 = race.find((x) => x.status === 201).json.material.id;

    // ---- Opening stock via Stock In "Saldo awal" (OD-17) --------------------
    r = await staff.request("POST", "/api/v1/stock-movements", {
      headers: { "Idempotency-Key": randomUUID() },
      body: { materialId: m1, type: "STOCK_IN", quantity: 25, notes: "Saldo awal" },
    });
    check("S1", r.status === 201 && r.json?.movement?.currentStock === 25 && r.json?.movement?.createdBy === ids.staff,
      "opening stock recorded as Stock In with note \"Saldo awal\"", `${r.status} stock=${r.json?.movement?.currentStock ?? "-"}`);
    const s1 = dbRead(`select count(*) || '/' || coalesce(max(notes), '') || '/' || coalesce(max(created_by::text), '') from public.inventory_transactions where material_id = '${m1}';`);
    check("S1-DB", s1 === `1/Saldo awal/${ids.staff}`, "DB: one transaction, note \"Saldo awal\", created_by = staff (from the session)", s1.replace(ids.staff, "<staff>"));

    r = await staff.request("GET", `/api/v1/materials/${m1}`);
    expect("S2", r.json?.management?.unitLocked === true && r.json?.management?.deletable === false, "after a transaction: unitLocked=true, deletable=false", JSON.stringify(r.json?.management ?? null));
    r = await unchanged("S3", "unit change after a transaction", () =>
      staff.request("PUT", `/api/v1/materials/${m1}`, { body: { categoryId: catB, name: NAMES.m1Renamed, unit: "roll", minimumStock: 12 } })
    );
    expectError("S3", "unit change after a transaction is rejected", r, 409, "UNIT_LOCKED");
    r = await staff.request("PUT", `/api/v1/materials/${m1}`, { body: { categoryId: catA, name: NAMES.m1Final, unit: "m", minimumStock: 30, currentStock: 0 } });
    row = materialRow(m1);
    expect("S4", r.status === 200 && r.json?.material?.currentStock === 25, "metadata update keeps the stock (extra currentStock=0 ignored)", `${status(r)} stock=${r.json?.material?.currentStock ?? "-"}`);
    check("S4-DB", row.stock === 25 && row.min === 30 && row.name === NAMES.m1Final, "DB: stock still 25 after metadata update", `stock=${row.stock} min=${row.min}`);
    r = await unchanged("S5", "archive with stock 25", () => staff.request("POST", `/api/v1/materials/${m1}/archive`, { body: { reason: "B3-R7 uji arsip stok tidak nol" } }));
    expectError("S5", "archive with stock not zero is rejected", r, 409, "STOCK_NOT_ZERO");
    r = await unchanged("S6", "delete material with history", () => staff.request("DELETE", `/api/v1/materials/${m1}`));
    expectError("S6", "delete of a material with transactions is rejected", r, 409, "MATERIAL_HAS_HISTORY");

    // ---- Archive and reactivate ------------------------------------------------
    r = await staff.request("POST", `/api/v1/materials/${m2}/archive`, {
      body: { reason: "B3-R7 uji arsip", createdBy: ids.owner, archivedBy: ids.owner },
    });
    row = materialRow(m2);
    check("R1", r.status === 200 && r.json?.material?.isArchived === true && row.archived && row.archivedBy === ids.staff,
      "staff archives a stock-0 material; archived_by = staff even when the body names the owner", `${status(r)} archived_by=${row.archivedBy === ids.staff ? "<staff>" : "OTHER"}`);
    r = await staff.request("GET", "/api/v1/materials");
    const activeHasM2 = r.json?.materials?.some((m) => m.id === m2);
    r = await staff.request("GET", "/api/v1/materials?archived=true");
    expect("R2", activeHasM2 === false && r.json?.materials?.some((m) => m.id === m2), "archived material leaves the active list and appears with ?archived=true", `active=${activeHasM2} archivedList=${r.json?.materials?.length ?? "-"}`);
    r = await unchanged("R3", "archive again", () => staff.request("POST", `/api/v1/materials/${m2}/archive`, { body: { reason: "B3-R7 ulang" } }));
    expectError("R3", "archiving an archived material is rejected", r, 409, "ALREADY_ARCHIVED");
    r = await unchanged("R4", "edit archived material", () =>
      staff.request("PUT", `/api/v1/materials/${m2}`, { body: { categoryId: catB, name: NAMES.m2, unit: "pcs", minimumStock: 11 } })
    );
    expectError("R4", "editing an archived material is rejected", r, 409, "MATERIAL_ARCHIVED");
    r = await unchanged("R5", "Stock In on archived material", () =>
      staff.request("POST", "/api/v1/stock-movements", { headers: { "Idempotency-Key": randomUUID() }, body: { materialId: m2, type: "STOCK_IN", quantity: 1, notes: "B3-R7 probe" } })
    );
    expect("R5", r.status === 409 && r.json?.error?.code === "MATERIAL_ARCHIVED", "Stock In on an archived material is rejected", status(r));
    r = await staff.request("POST", `/api/v1/materials/${m2}/reactivate`, { body: { reason: "B3-R7 uji aktif kembali" } });
    row = materialRow(m2);
    check("R6", r.status === 200 && r.json?.material?.isArchived === false && !row.archived && row.archivedBy === "", "staff reactivates the material", status(r));
    r = await unchanged("R7", "reactivate again", () => staff.request("POST", `/api/v1/materials/${m2}/reactivate`, { body: { reason: "B3-R7 ulang" } }));
    expectError("R7", "reactivating an active material is rejected", r, 409, "NOT_ARCHIVED");
    const ev = dbRead(`select string_agg(event_type::text || ':' || (created_by = '${ids.staff}')::text, ',' order by created_at) from public.material_status_events where material_id = '${m2}';`);
    check("R8-DB", ev === "ARCHIVED:true,REACTIVATED:true", "DB: ARCHIVED then REACTIVATED, both created_by = staff (session)", ev);
    r = await staff.request("GET", `/api/v1/materials/${m2}/status-events`);
    expect("R8-staff", r.status === 200 && r.json?.events?.length === 2 && r.json.events.every((e) => e.createdByMe === true), "status history for the actor shows \"Anda\" (createdByMe)", `${r.status} n=${r.json?.events?.length ?? "-"}`);
    r = await owner.request("GET", `/api/v1/materials/${m2}/status-events`);
    expect("R8-owner", r.status === 200 && r.json?.events?.length === 2 && r.json.events.every((e) => e.createdByMe === false), "status history for the owner shows \"Pengguna lain\"", `${r.status} n=${r.json?.events?.length ?? "-"}`);
    r = await unchanged("R9", "delete material with status history", () => staff.request("DELETE", `/api/v1/materials/${m2}`));
    expectError("R9", "delete of a material with archive history is rejected", r, 409, "MATERIAL_HAS_HISTORY");

    // ---- Delete ------------------------------------------------------------------
    // CSRF probe on a material with history: the database would still refuse.
    r = await unchanged("X1", "DELETE without Origin", () => staff.request("DELETE", `/api/v1/materials/${m1}`, { origin: null }));
    expectError("X1", "DELETE without Origin is rejected (CSRF)", r, 403, "CSRF_REJECTED");
    r = await staff.request("GET", `/api/v1/materials/${m3}`);
    expect("X2-pre", r.json?.management?.deletable === true, "material without history is offered for delete", JSON.stringify(r.json?.management ?? null));
    r = await staff.request("DELETE", `/api/v1/materials/${m3}`);
    check("X2", r.status === 200 && r.json?.deleted?.id === m3 && materialRow(m3) === null, "staff deletes a [DEMO] material without history", `${status(r)} row=${materialRow(m3) === null ? "gone" : "PRESENT"}`);
    r = await staff.request("GET", `/api/v1/materials/${m3}`);
    expectError("X3", "deleted material returns 404", r, 404, "MATERIAL_NOT_FOUND");
    r = await unchanged("X4", "delete again", () => staff.request("DELETE", `/api/v1/materials/${m3}`));
    expectError("X4", "deleting a deleted material is rejected", r, 404, "MATERIAL_NOT_FOUND");

    // ---- OWNER is read-only ------------------------------------------------------
    const ownerCases = [
      ["O1", "create", () => owner.request("POST", "/api/v1/materials", { body: { categoryId: catA, name: NAMES.ownerAttempt, unit: "pcs", minimumStock: 1 } })],
      ["O2", "update", () => owner.request("PUT", `/api/v1/materials/${m4}`, { body: { categoryId: catA, name: NAMES.race, unit: "pcs", minimumStock: 99 } })],
      ["O3", "delete", () => owner.request("DELETE", `/api/v1/materials/${m4}`)],
      ["O4", "archive", () => owner.request("POST", `/api/v1/materials/${m4}/archive`, { body: { reason: "B3-R7 owner probe" } })],
      ["O5", "reactivate", () => owner.request("POST", `/api/v1/materials/${m2}/reactivate`, { body: { reason: "B3-R7 owner probe" } })],
      ["O6", "Stock In", () => owner.request("POST", "/api/v1/stock-movements", { headers: { "Idempotency-Key": randomUUID() }, body: { materialId: m4, type: "STOCK_IN", quantity: 1, notes: "B3-R7 owner probe" } })],
    ];
    for (const [id, label, action] of ownerCases) {
      r = await unchanged(id, `OWNER ${label}`, action);
      expectError(id, `OWNER ${label} is rejected`, r, 403, "FORBIDDEN");
    }

    // ---- Database enforcement without the Next.js layer -----------------------
    const anonApi = new DataApiClient("anon", keys.anon, null);
    const staffToken = await directLogin(keys, EMAILS.staff, passwords.staff);
    live.direct.push(staffToken);
    const ownerToken = await directLogin(keys, EMAILS.owner, passwords.owner);
    live.direct.push(ownerToken);
    const staffApi = new DataApiClient("staff", keys.anon, staffToken);
    const ownerApi = new DataApiClient("owner", keys.anon, ownerToken);
    const createArgs = { p_category_id: catA, p_name: NAMES.ownerAttempt, p_unit: "pcs", p_minimum_stock: 1 };

    r = await unchanged("Q1", "anon rpc create_material", () => anonApi.request("POST", "/rest/v1/rpc/create_material", { body: createArgs }));
    expect("Q1", denied(r), "anon cannot execute create_material", status(r));
    r = await unchanged("Q2", "owner rpc create_material", () => ownerApi.request("POST", "/rest/v1/rpc/create_material", { body: createArgs }));
    expect("Q2", denied(r) && r.json?.message === "FORBIDDEN", "OWNER session: create_material raises FORBIDDEN in the database", `${status(r)} ${r.json?.message ?? ""}`);
    r = await unchanged("Q3", "owner rpc archive_material", () => ownerApi.request("POST", "/rest/v1/rpc/archive_material", { body: { p_material_id: m4, p_reason: "B3-R7 probe" } }));
    expect("Q3", denied(r) && r.json?.message === "FORBIDDEN", "OWNER session: archive_material raises FORBIDDEN in the database", `${status(r)} ${r.json?.message ?? ""}`);
    r = await unchanged("Q4", "staff PATCH materials.current_stock", () => staffApi.request("PATCH", `/rest/v1/materials?id=eq.${m1}`, { body: { current_stock: 999 } }));
    expect("Q4", denied(r), "staff session cannot UPDATE materials directly (stock)", status(r));
    r = await unchanged("Q5", "staff INSERT materials", () => staffApi.request("POST", "/rest/v1/materials", { body: { category_id: catA, name: NAMES.ownerAttempt, unit: "pcs", minimum_stock: 0 } }));
    expect("Q5", denied(r), "staff session cannot INSERT materials directly", status(r));
    r = await unchanged("Q6", "staff DELETE materials", () => staffApi.request("DELETE", `/rest/v1/materials?id=eq.${m4}`));
    expect("Q6", denied(r), "staff session cannot DELETE materials directly", status(r));
    r = await unchanged("Q7", "staff INSERT material_status_events", () => staffApi.request("POST", "/rest/v1/material_status_events", { body: { material_id: m4, event_type: "ARCHIVED", reason: "x", created_by: ids.owner } }));
    expect("Q7", denied(r), "staff session cannot INSERT status events directly", status(r));
    r = await unchanged("Q8", "staff INSERT inventory_transactions", () => staffApi.request("POST", "/rest/v1/inventory_transactions", { body: { material_id: m4, type: "STOCK_IN", quantity_delta: 100, created_by: ids.staff } }));
    expect("Q8", denied(r), "staff session cannot INSERT inventory transactions directly", status(r));
    r = await unchanged("Q9", "staff call into app_private", () =>
      staffApi.request("POST", "/rest/v1/rpc/create_material", { body: createArgs, headers: { "Content-Profile": "app_private" } })
    );
    expect("Q9", r.status === 406 || r.status === 404, "app_private is not exposed by the Data API", status(r));
    r = await staffApi.request("GET", `/rest/v1/materials?select=id,current_stock&id=eq.${m1}`, { headers: { Prefer: "" } });
    expect("Q10", r.status === 200 && r.json?.[0]?.current_stock === 25, "staff session can read materials through RLS", `${r.status} stock=${r.json?.[0]?.current_stock ?? "-"}`);

    // ---- Final integrity -----------------------------------------------------------
    const snap = snapshot();
    check("I1", snap.balanceMismatch === 0, "every current_stock equals the sum of its transactions", `mismatch=${snap.balanceMismatch}`);
    const counts = dbRead(`select (select count(*) from public.materials) || '/' || (select count(*) from public.inventory_transactions) || '/' ||
      (select count(*) from public.material_status_events) || '/' || (select count(*) from app_private.idempotency_requests);`);
    check("I2", counts === "3/1/2/1", "final rows: 3 materials, 1 transaction, 2 status events, 1 idempotency row", counts);
  } finally {
    // ---- Logout every session created by this run (no retries) ---------------
    for (const c of live.app) {
      const r = await c.request("POST", "/api/v1/auth/logout").catch(() => ({ status: "transport-error" }));
      record(`L-app-${c.label}`, r.status === 200, `logout ${c.label} (app)`, String(r.status));
      if (r.status === 200) {
        const after = await c.request("GET", "/api/v1/auth/session").catch(() => ({ status: "transport-error" }));
        record(`L-app-${c.label}-after`, after.status === 401, `session of ${c.label} rejected after logout`, String(after.status));
      }
    }
    for (const [i, token] of live.direct.entries()) {
      const s = await directLogout(keys, token).catch(() => "transport-error");
      record(`L-direct-${i + 1}`, s === 204, "logout direct Auth session", String(s));
    }
    const sessionsEnd = sqlCount("select count(*) from auth.sessions;");
    record("L-end", sessionsEnd === sessionsAtStart, "no session from this run left alive", `sessions=${sessionsEnd}`);

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
    const failed = results.filter((x) => !x.ok).length;
    console.log(`SUMMARY | ${results.length - failed} PASS | ${failed} FAIL${aborted ? " | ABORTED" : ""}`);
    process.exitCode = aborted || failed > 0 || !results.length ? 1 : 0;
  });
