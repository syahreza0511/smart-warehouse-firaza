// Read-only verification that the local integration target is ONE coherent,
// isolated Supabase stack (F-1). Shared by material-crud.mjs and
// stock-opname.mjs. It must succeed before either harness reads credentials,
// calls the Auth Admin API, or writes anything.
//
// The four FIRAZA_TEST_* values are expectations, not proof. The target is
// accepted only when independent evidence agrees:
//   A. the workdir's real supabase/config.toml (project_id, [api] port,
//      [db] port), with the DB container name derived from project_id;
//   B. `supabase status -o json --workdir <workdir>`: API_URL and the host
//      and port of DB_URL (keys and the DB password are dropped at parse time
//      and never returned, printed, or stored);
//   C. Docker metadata of every running container: the API gateway
//      (supabase_kong_<project>) and the database (supabase_db_<project>) both
//      carry the Supabase CLI project and workdir labels, publish exactly the
//      configured ports on loopback only, are the only containers publishing
//      those host ports, and share a Docker network;
//   D. the PostgreSQL system_identifier, read in a READ ONLY transaction from
//      the verified container (by its immutable id), equals the expected one.
//
// No fallback, no retry, no default target. Any missing, malformed, or
// inconsistent evidence throws TargetVerificationError. Error messages never
// contain keys, passwords, or connection strings.
//
// Every external call goes through `deps`, so the unit tests can drive the
// same logic with fixtures (tests/unit/local-target.test.mjs).
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync, lstatSync } from "node:fs";
import path from "node:path";

export class TargetVerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "TargetVerificationError";
  }
}
const reject = (message) => {
  throw new TargetVerificationError(message);
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/;
const CONTAINER_ID = /^[0-9a-f]{64}$/;
const LABEL_PROJECT = "com.supabase.cli.project";
const LABEL_WORKDIR = "com.supabase.cli.workdir";
const POSTGRES_PORT = "5432/tcp";

// Only targets returned by verifyLocalTarget() are accepted by readLocalKeys()
// and assertVerified(); a hand-built object is refused.
const VERIFIED = new WeakSet();

// ---------------------------------------------------------------------------
// Configuration from the environment (expectations only)
// ---------------------------------------------------------------------------
export function readTargetEnv(env) {
  const apiUrl = env.FIRAZA_TEST_API_URL ?? "";
  const dbContainer = env.FIRAZA_TEST_DB_CONTAINER ?? "";
  const systemIdentifier = env.FIRAZA_TEST_SYSTEM_IDENTIFIER ?? "";
  const workdir = env.FIRAZA_TEST_SUPABASE_WORKDIR ?? "";
  const api = /^http:\/\/127\.0\.0\.1:(\d{4,5})$/.exec(apiUrl);
  const apiPort = api ? Number(api[1]) : 0;
  if (!api || apiPort < 1024 || apiPort > 65535) reject("Set FIRAZA_TEST_API_URL to http://127.0.0.1:<port> of the isolated stack.");
  if (!/^supabase_db_[A-Za-z0-9_.-]+$/.test(dbContainer)) reject("Set FIRAZA_TEST_DB_CONTAINER to the isolated stack's supabase_db_* container.");
  if (!/^\d{10,20}$/.test(systemIdentifier)) reject("Set FIRAZA_TEST_SYSTEM_IDENTIFIER to the expected PostgreSQL system_identifier.");
  if (!workdir || !path.isAbsolute(workdir)) reject("Set FIRAZA_TEST_SUPABASE_WORKDIR to the absolute path of the isolated stack's Supabase workdir.");
  return { apiUrl, apiPort, dbContainer, systemIdentifier, workdir };
}

// ---------------------------------------------------------------------------
// A. supabase/config.toml: only the keys needed for identity. A key that
// appears twice, or a value of the wrong type, is refused.
// ---------------------------------------------------------------------------
const WANTED = new Map([
  ["project_id", "string"],
  ["api.enabled", "boolean"],
  ["api.port", "integer"],
  ["db.port", "integer"],
]);

export function parseSupabaseConfig(text) {
  if (typeof text !== "string") reject("supabase/config.toml could not be read.");
  const found = new Map();
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("[")) {
      const header = /^\[([A-Za-z0-9_.-]+)\]\s*(#.*)?$/.exec(line);
      section = header ? header[1] : "\u0000"; // [[array tables]] never match a wanted key
      continue;
    }
    const kv = /^([A-Za-z0-9_-]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) continue; // continuation lines of multi-line arrays
    const key = section ? `${section}.${kv[1]}` : kv[1];
    if (!WANTED.has(key)) continue;
    if (found.has(key)) reject(`supabase/config.toml defines ${key} more than once.`);
    const value = kv[2];
    let parsed;
    switch (WANTED.get(key)) {
      case "string": {
        const m = /^"([^"\\]*)"\s*(#.*)?$/.exec(value);
        parsed = m ? m[1] : undefined;
        break;
      }
      case "boolean": {
        const m = /^(true|false)\s*(#.*)?$/.exec(value);
        parsed = m ? m[1] === "true" : undefined;
        break;
      }
      default: {
        const m = /^(\d{1,5})\s*(#.*)?$/.exec(value);
        parsed = m ? Number(m[1]) : undefined;
      }
    }
    if (parsed === undefined) reject(`supabase/config.toml has an unexpected value for ${key}.`);
    found.set(key, parsed);
  }
  return {
    projectId: found.get("project_id") ?? null,
    apiEnabled: found.get("api.enabled") ?? null,
    apiPort: found.get("api.port") ?? null,
    dbPort: found.get("db.port") ?? null,
  };
}

// ---------------------------------------------------------------------------
// B. supabase status: reduce the JSON to non-secret endpoint facts.
// ---------------------------------------------------------------------------
export function statusEndpoints(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) reject("supabase status returned an unexpected format (details not shown).");
  const apiUrl = typeof json.API_URL === "string" ? json.API_URL.replace(/\/$/, "") : null;
  let db = null;
  if (typeof json.DB_URL === "string") {
    try {
      const u = new URL(json.DB_URL);
      db = { protocol: u.protocol, host: u.hostname, port: u.port ? Number(u.port) : null };
    } catch {
      db = null;
    }
  }
  return { apiUrl, db };
}

function parseStatusJson(stdout) {
  try {
    return JSON.parse(String(stdout).trim());
  } catch {
    return reject("supabase status did not return valid JSON (details not shown).");
  }
}

// ---------------------------------------------------------------------------
// C. Docker metadata helpers
// ---------------------------------------------------------------------------
function bindingsOf(container) {
  const out = [];
  for (const [containerPort, list] of Object.entries(container.ports ?? {})) {
    for (const b of Array.isArray(list) ? list : []) out.push({ containerPort, hostIp: String(b?.HostIp ?? ""), hostPort: Number(b?.HostPort) });
  }
  return out;
}

function checkContainer(role, container, { projectId, workdir, realpath }) {
  if (!container) reject(`No running ${role} container for the configured project.`);
  if (!CONTAINER_ID.test(container.id ?? "")) reject(`The ${role} container has an unexpected id format.`);
  if (container.running !== true) reject(`The ${role} container is not running.`);
  const labels = container.labels ?? {};
  if (labels[LABEL_PROJECT] !== projectId) reject(`The ${role} container belongs to another Supabase project.`);
  let labelled;
  try {
    labelled = realpath(String(labels[LABEL_WORKDIR] ?? ""));
  } catch {
    reject(`The ${role} container has no resolvable Supabase workdir label.`);
  }
  if (labelled !== workdir) reject(`The ${role} container was started from another Supabase workdir.`);
  const bindings = bindingsOf(container);
  if (bindings.some((b) => !LOOPBACK_HOSTS.has(b.hostIp))) reject(`The ${role} container publishes a port beyond loopback.`);
}

function publishes(container, hostPort, containerPort) {
  const matching = bindingsOf(container).filter((b) => b.hostPort === hostPort);
  return (
    matching.length > 0 &&
    matching.every((b) => (containerPort ? b.containerPort === containerPort : true)) &&
    matching.some((b) => b.hostIp === "127.0.0.1")
  );
}

const exactlyOne = (list, role) => {
  if (list.length > 1) reject(`More than one ${role} container matches.`);
  return list[0];
};

// ---------------------------------------------------------------------------
// The verifier
// ---------------------------------------------------------------------------
export function verifyLocalTarget(env, deps) {
  const cfg = readTargetEnv(env);

  // A. Workdir and config.toml
  let workdir;
  try {
    workdir = deps.realpath(cfg.workdir);
  } catch {
    reject("FIRAZA_TEST_SUPABASE_WORKDIR does not exist.");
  }
  if (!deps.isDirectory(workdir)) reject("FIRAZA_TEST_SUPABASE_WORKDIR is not a directory.");
  const configPath = path.join(workdir, "supabase", "config.toml");
  if (!deps.isRegularFile(configPath)) reject("supabase/config.toml is missing or is not a regular file (symlinks are refused).");
  let configText;
  try {
    configText = deps.readText(configPath);
  } catch {
    reject("supabase/config.toml could not be read.");
  }
  const config = parseSupabaseConfig(configText);
  if (!config.projectId) reject("supabase/config.toml has no project_id.");
  if (!PROJECT_ID.test(config.projectId)) reject("supabase/config.toml has an invalid project_id.");
  if (config.apiEnabled === false) reject("The Supabase API is disabled in supabase/config.toml.");
  if (config.apiPort !== cfg.apiPort) reject("FIRAZA_TEST_API_URL does not use the [api] port of supabase/config.toml.");
  if (!config.dbPort) reject("supabase/config.toml has no [db] port.");
  const dbName = `supabase_db_${config.projectId}`;
  const gatewayName = `supabase_kong_${config.projectId}`;
  if (cfg.dbContainer !== dbName) reject("FIRAZA_TEST_DB_CONTAINER is not the database container of the configured project.");

  // B. supabase status for this workdir
  let status;
  try {
    status = deps.supabaseStatus(workdir);
  } catch (error) {
    if (error instanceof TargetVerificationError) throw error;
    reject("supabase status failed (details not shown).");
  }
  if (!status || typeof status.apiUrl !== "string") reject("supabase status reported no API URL.");
  if (status.apiUrl !== cfg.apiUrl) reject("supabase status reports another API URL than FIRAZA_TEST_API_URL.");
  if (!status.db || !["postgresql:", "postgres:"].includes(status.db.protocol)) reject("supabase status reported no PostgreSQL endpoint.");
  if (status.db.host !== "127.0.0.1") reject("supabase status reports a database host other than 127.0.0.1.");
  if (status.db.port !== config.dbPort) reject("supabase status reports another database port than supabase/config.toml.");

  // C. Docker: identity, bindings, uniqueness, shared network
  let containers;
  try {
    containers = deps.listContainers();
  } catch (error) {
    if (error instanceof TargetVerificationError) throw error;
    reject("Docker inspection failed (details not shown).");
  }
  if (!Array.isArray(containers) || containers.length === 0) reject("Docker reported no running containers.");
  const named = (n) => containers.filter((c) => c?.name === `/${n}` || c?.name === n);
  const db = exactlyOne(named(dbName), "database");
  const gateway = exactlyOne(named(gatewayName), "API gateway");
  const ctx = { projectId: config.projectId, workdir, realpath: deps.realpath };
  checkContainer("database", db, ctx);
  checkContainer("API gateway", gateway, ctx);
  if (!publishes(db, config.dbPort, POSTGRES_PORT)) reject("The database container does not publish PostgreSQL on the reported port at 127.0.0.1.");
  if (!publishes(gateway, cfg.apiPort, null)) reject("The API gateway does not publish the API port at 127.0.0.1.");
  for (const c of containers) {
    for (const b of bindingsOf(c)) {
      if (b.hostPort === cfg.apiPort && c !== gateway) reject("Another container also publishes the API port.");
      if (b.hostPort === config.dbPort && c !== db) reject("Another container also publishes the database port.");
    }
  }
  const dbNetworks = new Set(db.networks ?? []);
  if (!(gateway.networks ?? []).some((n) => dbNetworks.has(n))) reject("The API gateway and the database are not on a shared Docker network.");

  // D. PostgreSQL identity, read only, from the verified container id
  let sysid;
  try {
    sysid = deps.readSystemIdentifier(db.id);
  } catch {
    reject("Reading the PostgreSQL system_identifier failed (details not shown).");
  }
  if (sysid !== cfg.systemIdentifier) reject("PostgreSQL system_identifier does not match FIRAZA_TEST_SYSTEM_IDENTIFIER.");

  const target = Object.freeze({
    projectId: config.projectId,
    workdir,
    apiUrl: cfg.apiUrl,
    apiPort: cfg.apiPort,
    dbPort: config.dbPort,
    dbContainerName: dbName,
    dbContainerId: db.id,
    systemIdentifier: sysid,
  });
  VERIFIED.add(target);
  return target;
}

export function assertVerified(target) {
  if (!target || !VERIFIED.has(target)) reject("The local target has not been verified; refusing database or Auth access.");
  return target;
}

// Reads the local keys only for a verified target, from a fresh
// `supabase status`, and only if it still reports the verified endpoints.
export function readLocalKeys(target, runStatus) {
  assertVerified(target);
  let json;
  try {
    json = parseStatusJson(runStatus(target.workdir));
  } catch (error) {
    if (error instanceof TargetVerificationError) throw error;
    reject("supabase status failed (details not shown).");
  }
  const now = statusEndpoints(json);
  if (now.apiUrl !== target.apiUrl || now.db?.host !== "127.0.0.1" || now.db?.port !== target.dbPort) {
    reject("supabase status changed after verification; aborting.");
  }
  for (const k of ["ANON_KEY", "SERVICE_ROLE_KEY", "PUBLISHABLE_KEY"]) {
    if (typeof json[k] !== "string" || !json[k]) reject(`supabase status reported no ${k}.`);
  }
  return { anon: json.ANON_KEY, service: json.SERVICE_ROLE_KEY, publishable: json.PUBLISHABLE_KEY };
}

// ---------------------------------------------------------------------------
// Real dependencies (read-only commands only)
// ---------------------------------------------------------------------------
const INSPECT_FORMAT = [
  "{{json .Id}}",
  "{{json .Name}}",
  "{{json .State.Running}}",
  "{{json .Config.Labels}}",
  "{{json .NetworkSettings.Ports}}",
  "{{json .NetworkSettings.Networks}}",
].join("\n");

export function parseDockerInspect(stdout) {
  const lines = String(stdout).split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0 || lines.length % 6 !== 0) reject("Docker inspection returned an unexpected format.");
  const out = [];
  for (let i = 0; i < lines.length; i += 6) {
    let f;
    try {
      f = lines.slice(i, i + 6).map((l) => JSON.parse(l));
    } catch {
      reject("Docker inspection returned an unexpected format.");
    }
    out.push({
      id: f[0],
      name: f[1],
      running: f[2],
      labels: f[3] ?? {},
      ports: f[4] ?? {},
      networks: Object.keys(f[5] ?? {}),
    });
  }
  return out;
}

export function runSupabaseStatus(supabaseBin) {
  return (workdir) =>
    execFileSync(supabaseBin, ["status", "-o", "json", "--workdir", workdir], {
      cwd: "/",
      env: { HOME: process.env.HOME, PATH: process.env.PATH, DO_NOT_TRACK: "1" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
}

export function createRealDeps({ supabaseBin }) {
  const docker = (args, input) =>
    execFileSync("docker", args, { encoding: "utf8", input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"] });
  const status = runSupabaseStatus(supabaseBin);
  return {
    realpath: (p) => realpathSync(p),
    isDirectory: (p) => statSync(p).isDirectory(),
    isRegularFile: (p) => {
      try {
        return lstatSync(p).isFile();
      } catch {
        return false;
      }
    },
    readText: (p) => readFileSync(p, "utf8"),
    // The raw output (which contains keys) never leaves this function.
    supabaseStatus: (workdir) => statusEndpoints(parseStatusJson(status(workdir))),
    listContainers: () => {
      const ids = docker(["ps", "-q", "--no-trunc"]).split("\n").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return [];
      // --format limits the output to the fields above (never Config.Env).
      return parseDockerInspect(docker(["inspect", "--format", INSPECT_FORMAT, ...ids]));
    },
    readSystemIdentifier: (containerId) => {
      if (!CONTAINER_ID.test(containerId)) reject("Unexpected container id.");
      return docker(
        ["exec", "-i", containerId, "psql", "-U", "postgres", "-d", "postgres", "-qAtX", "-v", "ON_ERROR_STOP=1"],
        "begin transaction read only;\nselect system_identifier from pg_control_system();\nrollback;\n"
      ).trim();
    },
  };
}
