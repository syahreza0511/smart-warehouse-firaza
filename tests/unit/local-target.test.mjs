// Unit tests for the local integration target verifier (F-1,
// tests/integration/http/local-target.mjs). Every external input (config
// file, `supabase status`, Docker metadata, system_identifier) is a fixture
// passed through dependency injection: no Docker, no Supabase CLI, no
// database, no network. These prove the decision logic and the fail-closed
// ordering; they are NOT a run of the integration harnesses. Source checks at
// the end prove both harnesses verify the target before any database read,
// key read, Auth Admin call, or write.
//
// Run: node --test 'tests/unit/*.test.mjs'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lib = await import(new URL("../integration/http/local-target.mjs", import.meta.url));
const {
  TargetVerificationError,
  assertVerified,
  parseDockerInspect,
  parseSupabaseConfig,
  readLocalKeys,
  readTargetEnv,
  statusEndpoints,
  verifyLocalTarget,
} = lib;

const PROJECT = "firaza-test-local";
const OTHER = "other-local";
const WORKDIR = "/fake/isolated-stack";
const OTHER_WORKDIR = "/fake/other-stack";
const SYSID = "7000000000000000001";
const id = (c) => c.repeat(64);
const SECRET_SERVICE = "fixture-service-role-secret-value";
const SECRET_DB_PASSWORD = "fixture-db-password";

const CONFIG = `# Supabase local config (fixture)
project_id = "${PROJECT}"

[api]
enabled = true
# Port to use for the API URL.
port = 55321
schemas = [
  "public",
]

[api.tls]
enabled = false
port = 1

[db]
port = 55322
shadow_port = 55320

[[auth.third_party]]
port = 2

[studio]
enabled = false
port = 55323
`;

const container = (over) => ({
  id: id("a"),
  name: "/x",
  running: true,
  labels: {},
  ports: {},
  networks: ["net-test"],
  ...over,
});
const labelsFor = (project, workdir) => ({ "com.supabase.cli.project": project, "com.supabase.cli.workdir": workdir, "com.docker.compose.project": project });
const loop = (port) => [{ HostIp: "127.0.0.1", HostPort: String(port) }, { HostIp: "::1", HostPort: String(port) }];

function baseState() {
  return {
    paths: { [WORKDIR]: WORKDIR, [OTHER_WORKDIR]: OTHER_WORKDIR },
    isDirectory: true,
    configIsFile: true,
    config: CONFIG,
    status: { apiUrl: "http://127.0.0.1:55321", db: { protocol: "postgresql:", host: "127.0.0.1", port: 55322 } },
    containers: [
      container({ id: id("a"), name: `/supabase_kong_${PROJECT}`, labels: labelsFor(PROJECT, WORKDIR), ports: { "8000/tcp": loop(55321) } }),
      container({ id: id("b"), name: `/supabase_db_${PROJECT}`, labels: labelsFor(PROJECT, WORKDIR), ports: { "5432/tcp": loop(55322) } }),
      container({ id: id("c"), name: `/supabase_rest_${PROJECT}`, labels: labelsFor(PROJECT, WORKDIR), ports: {} }),
      container({ id: id("d"), name: `/supabase_kong_${OTHER}`, labels: labelsFor(OTHER, OTHER_WORKDIR), ports: { "8000/tcp": loop(54321) }, networks: ["net-other"] }),
      container({ id: id("e"), name: `/supabase_db_${OTHER}`, labels: labelsFor(OTHER, OTHER_WORKDIR), ports: { "5432/tcp": loop(54322) }, networks: ["net-other"] }),
    ],
    sysid: SYSID,
  };
}

const baseEnv = () => ({
  FIRAZA_TEST_API_URL: "http://127.0.0.1:55321",
  FIRAZA_TEST_DB_CONTAINER: `supabase_db_${PROJECT}`,
  FIRAZA_TEST_SYSTEM_IDENTIFIER: SYSID,
  FIRAZA_TEST_SUPABASE_WORKDIR: WORKDIR,
});

// Fixture-backed dependencies that record every call.
function makeDeps(state) {
  const calls = [];
  const deps = {
    realpath: (p) => {
      calls.push("realpath");
      if (!(p in state.paths)) throw new Error("ENOENT");
      return state.paths[p];
    },
    isDirectory: () => (calls.push("isDirectory"), state.isDirectory),
    isRegularFile: () => (calls.push("isRegularFile"), state.configIsFile),
    readText: () => {
      calls.push("readText");
      if (state.readThrows) throw new Error("EACCES");
      return state.config;
    },
    supabaseStatus: () => {
      calls.push("supabaseStatus");
      if (state.statusThrows) throw new Error(`status failed postgresql://postgres:${SECRET_DB_PASSWORD}@127.0.0.1:55322/postgres`);
      return state.status;
    },
    listContainers: () => {
      calls.push("listContainers");
      if (state.dockerThrows) throw new Error("Cannot connect to the Docker daemon");
      return state.containers;
    },
    readSystemIdentifier: (containerId) => {
      calls.push(`readSystemIdentifier:${containerId}`);
      if (state.sysidThrows) throw new Error("psql failed");
      return state.sysid;
    },
  };
  return { deps, calls };
}

const findC = (state, name) => state.containers.find((c) => c.name === `/${name}`);

// Runs the verifier and, whatever happens, tries the credential stage with a
// spy. A rejected target must never reach it.
function attempt(mutateState = () => {}, mutateEnv = () => {}) {
  const state = baseState();
  const env = baseEnv();
  mutateState(state);
  mutateEnv(env);
  const { deps, calls } = makeDeps(state);
  let target = null;
  let error = null;
  try {
    target = verifyLocalTarget(env, deps);
  } catch (e) {
    error = e;
  }
  let keyStatusCalls = 0;
  let keysError = null;
  try {
    readLocalKeys(target, () => {
      keyStatusCalls += 1;
      return JSON.stringify({ API_URL: "http://127.0.0.1:55321", DB_URL: "postgresql://u:p@127.0.0.1:55322/postgres", ANON_KEY: "a", SERVICE_ROLE_KEY: SECRET_SERVICE, PUBLISHABLE_KEY: "p" });
    });
  } catch (e) {
    keysError = e;
  }
  return { target, error, calls, keyStatusCalls, keysError };
}

function assertRejected(result, pattern) {
  assert.ok(result.error instanceof TargetVerificationError, `expected TargetVerificationError, got ${result.error}`);
  assert.match(result.error.message, pattern);
  assert.equal(result.target, null);
  // Credential stage unreachable: readLocalKeys refused and never ran status.
  assert.ok(result.keysError instanceof TargetVerificationError);
  assert.equal(result.keyStatusCalls, 0);
  assert.doesNotMatch(result.error.message, new RegExp(`${SECRET_SERVICE}|${SECRET_DB_PASSWORD}|postgres(ql)?://`));
}
const sysidRead = (r) => r.calls.some((c) => c.startsWith("readSystemIdentifier"));

// 1 ---------------------------------------------------------------------------
test("1. a coherent local target passes and binds the database by container id", () => {
  const r = attempt();
  assert.equal(r.error, null);
  assert.deepEqual(
    { ...r.target },
    {
      projectId: PROJECT,
      workdir: WORKDIR,
      apiUrl: "http://127.0.0.1:55321",
      apiPort: 55321,
      dbPort: 55322,
      dbContainerName: `supabase_db_${PROJECT}`,
      dbContainerId: id("b"),
      systemIdentifier: SYSID,
    }
  );
  assert.ok(Object.isFrozen(r.target));
  assert.equal(assertVerified(r.target), r.target);
  // Order: config, then status, then Docker, then system_identifier last.
  const order = ["readText", "supabaseStatus", "listContainers", `readSystemIdentifier:${id("b")}`].map((c) => r.calls.indexOf(c));
  assert.ok(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])), `call order ${r.calls.join(",")}`);
  // The credential stage works only now.
  assert.equal(r.keysError, null);
  assert.equal(r.keyStatusCalls, 1);
});

// 2 ---------------------------------------------------------------------------
test("2. a config.toml without project_id is refused before status, Docker, or the database", () => {
  const r = attempt((s) => (s.config = CONFIG.replace(/^project_id = .*$/m, "")));
  assertRejected(r, /no project_id/);
  assert.ok(!r.calls.includes("supabaseStatus") && !r.calls.includes("listContainers") && !sysidRead(r));
});

test("2b. an invalid, duplicated, or unreadable project_id is refused", () => {
  assertRejected(attempt((s) => (s.config = CONFIG.replace(`"${PROJECT}"`, '"../evil"'))), /invalid project_id/);
  assertRejected(attempt((s) => (s.config = `project_id = "x"\n${CONFIG}`)), /more than once/);
  assertRejected(attempt((s) => (s.config = CONFIG.replace(`"${PROJECT}"`, "42"))), /unexpected value for project_id/);
  assertRejected(attempt((s) => (s.readThrows = true)), /could not be read/);
});

test("2c. the workdir must exist, be a directory, and hold a regular config.toml", () => {
  assertRejected(attempt(() => {}, (e) => (e.FIRAZA_TEST_SUPABASE_WORKDIR = "/fake/missing")), /does not exist/);
  assertRejected(attempt((s) => (s.isDirectory = false)), /not a directory/);
  assertRejected(attempt((s) => (s.configIsFile = false)), /not a regular file/);
});

// 3 ---------------------------------------------------------------------------
test("3. an API URL on another port or of another project is refused", () => {
  const otherPort = attempt(() => {}, (e) => (e.FIRAZA_TEST_API_URL = "http://127.0.0.1:54321"));
  assertRejected(otherPort, /\[api\] port/);
  assert.ok(!otherPort.calls.includes("supabaseStatus"));
  const statusOther = attempt((s) => (s.status.apiUrl = "http://127.0.0.1:54321"));
  assertRejected(statusOther, /another API URL/);
  assert.ok(!statusOther.calls.includes("listContainers") && !sysidRead(statusOther));
  assertRejected(attempt((s) => (findC(s, `supabase_kong_${PROJECT}`).ports = { "8000/tcp": loop(54999) })), /does not publish the API port/);
});

// 4 ---------------------------------------------------------------------------
test("4. a database container of another project is refused", () => {
  const byName = attempt(() => {}, (e) => (e.FIRAZA_TEST_DB_CONTAINER = `supabase_db_${OTHER}`));
  assertRejected(byName, /not the database container of the configured project/);
  assert.ok(!byName.calls.includes("supabaseStatus"));
  // Right name, but Docker says it belongs to another project or workdir.
  assertRejected(attempt((s) => (findC(s, `supabase_db_${PROJECT}`).labels = labelsFor(OTHER, WORKDIR))), /database container belongs to another Supabase project/);
  assertRejected(attempt((s) => (findC(s, `supabase_db_${PROJECT}`).labels = labelsFor(PROJECT, OTHER_WORKDIR))), /database container was started from another Supabase workdir/);
  assertRejected(attempt((s) => (s.containers = s.containers.filter((c) => c.name !== `/supabase_db_${PROJECT}`))), /No running database container/);
  assertRejected(attempt((s) => (findC(s, `supabase_db_${PROJECT}`).running = false)), /database container is not running/);
});

// 5 ---------------------------------------------------------------------------
test("5. API gateway and PostgreSQL disagreeing on project identity is refused", () => {
  const r = attempt((s) => (findC(s, `supabase_kong_${PROJECT}`).labels = labelsFor(OTHER, OTHER_WORKDIR)));
  assertRejected(r, /API gateway container belongs to another Supabase project/);
  assert.ok(!sysidRead(r));
  assertRejected(attempt((s) => (findC(s, `supabase_kong_${PROJECT}`).labels = labelsFor(PROJECT, OTHER_WORKDIR))), /API gateway container was started from another Supabase workdir/);
  assertRejected(attempt((s) => (findC(s, `supabase_kong_${PROJECT}`).networks = ["net-other"])), /shared Docker network/);
  assertRejected(attempt((s) => (findC(s, `supabase_kong_${PROJECT}`).labels = { "com.supabase.cli.project": PROJECT })), /no resolvable Supabase workdir label/);
});

// 6 ---------------------------------------------------------------------------
test("6. Docker port bindings that disagree with supabase status are refused", () => {
  assertRejected(attempt((s) => (findC(s, `supabase_db_${PROJECT}`).ports = { "5432/tcp": loop(55399) })), /does not publish PostgreSQL on the reported port/);
  assertRejected(attempt((s) => (s.status.db.port = 54322)), /another database port/);
  assertRejected(attempt((s) => (findC(s, `supabase_db_${PROJECT}`).ports = { "6543/tcp": loop(55322) })), /does not publish PostgreSQL/);
  // Another container also publishing one of the ports (e.g. on ::1 only).
  assertRejected(attempt((s) => findC(s, `supabase_kong_${OTHER}`).ports["8000/tcp"].push({ HostIp: "::1", HostPort: "55321" })), /Another container also publishes the API port/);
  assertRejected(attempt((s) => findC(s, `supabase_db_${OTHER}`).ports["5432/tcp"].push({ HostIp: "::1", HostPort: "55322" })), /Another container also publishes the database port/);
  assertRejected(attempt((s) => (findC(s, `supabase_db_${PROJECT}`).ports = { "5432/tcp": [{ HostIp: "::1", HostPort: "55322" }] })), /at 127\.0\.0\.1/);
});

// 7 ---------------------------------------------------------------------------
test("7. a system_identifier mismatch is refused (read from the verified container only)", () => {
  const r = attempt((s) => (s.sysid = "7000000000000000002"));
  assertRejected(r, /system_identifier does not match/);
  assert.deepEqual(r.calls.filter((c) => c.startsWith("readSystemIdentifier")), [`readSystemIdentifier:${id("b")}`]);
  assertRejected(attempt((s) => (s.sysidThrows = true)), /system_identifier failed/);
});

// 8 ---------------------------------------------------------------------------
test("8. non-loopback endpoints and bindings are refused", () => {
  for (const url of ["http://0.0.0.0:55321", "http://192.168.1.10:55321", "http://localhost:55321", "https://127.0.0.1:55321", "http://127.0.0.1:55321/", "http://127.0.0.1:80"]) {
    const r = attempt(() => {}, (e) => (e.FIRAZA_TEST_API_URL = url));
    assertRejected(r, /FIRAZA_TEST_API_URL/);
    assert.deepEqual(r.calls, [], `${url}: no external call`);
  }
  assertRejected(attempt((s) => (findC(s, `supabase_kong_${PROJECT}`).ports = { "8000/tcp": [{ HostIp: "0.0.0.0", HostPort: "55321" }] })), /beyond loopback/);
  assertRejected(attempt((s) => findC(s, `supabase_db_${PROJECT}`).ports["5432/tcp"].push({ HostIp: "", HostPort: "55322" })), /beyond loopback/);
  assertRejected(attempt((s) => (s.status.db.host = "10.0.0.5")), /database host other than 127\.0\.0\.1/);
});

// 9 ---------------------------------------------------------------------------
test("9. missing or malformed supabase status output is refused", () => {
  assertRejected(attempt((s) => (s.status = null)), /no API URL/);
  assertRejected(attempt((s) => (s.status = { apiUrl: null, db: null })), /no API URL/);
  assertRejected(attempt((s) => (s.status.db = null)), /no PostgreSQL endpoint/);
  assertRejected(attempt((s) => (s.status.db.protocol = "http:")), /no PostgreSQL endpoint/);
  const failed = attempt((s) => (s.statusThrows = true));
  assertRejected(failed, /supabase status failed \(details not shown\)/);
  assert.ok(!failed.calls.includes("listContainers"));
  assert.throws(() => statusEndpoints("not an object"), TargetVerificationError);
  assert.throws(() => statusEndpoints([]), TargetVerificationError);
  assert.deepEqual(statusEndpoints({}), { apiUrl: null, db: null });
  assert.deepEqual(statusEndpoints({ API_URL: "http://127.0.0.1:55321", DB_URL: "::not a url::" }), { apiUrl: "http://127.0.0.1:55321", db: null });
});

test("9b. status parsing drops keys and the database password", () => {
  const raw = {
    API_URL: "http://127.0.0.1:55321",
    DB_URL: `postgresql://postgres:${SECRET_DB_PASSWORD}@127.0.0.1:55322/postgres`,
    SERVICE_ROLE_KEY: SECRET_SERVICE,
    ANON_KEY: "anon-fixture",
    JWT_SECRET: "jwt-fixture",
  };
  const out = statusEndpoints(raw);
  assert.deepEqual(out, { apiUrl: "http://127.0.0.1:55321", db: { protocol: "postgresql:", host: "127.0.0.1", port: 55322 } });
  const text = JSON.stringify(out);
  for (const secret of [SECRET_DB_PASSWORD, SECRET_SERVICE, "anon-fixture", "jwt-fixture", "postgres:"]) assert.ok(!text.includes(secret), secret);
});

// 10 --------------------------------------------------------------------------
test("10. a Docker inspection failure is refused", () => {
  const r = attempt((s) => (s.dockerThrows = true));
  assertRejected(r, /Docker inspection failed \(details not shown\)/);
  assert.ok(!sysidRead(r));
  assertRejected(attempt((s) => (s.containers = [])), /no running containers/);
  assertRejected(attempt((s) => (s.containers = null)), /no running containers/);
  assertRejected(attempt((s) => findC(s, `supabase_db_${PROJECT}`) && (findC(s, `supabase_db_${PROJECT}`).id = "short")), /unexpected id format/);
  assertRejected(attempt((s) => s.containers.push({ ...findC(s, `supabase_kong_${PROJECT}`), id: id("f") })), /More than one API gateway/);
  assert.throws(() => parseDockerInspect(""), TargetVerificationError);
  assert.throws(() => parseDockerInspect("1\n2\n3"), TargetVerificationError);
  assert.throws(() => parseDockerInspect("{\n\"x\"\ntrue\n{}\n{}\n{}"), TargetVerificationError);
  const parsed = parseDockerInspect(
    [JSON.stringify(id("b")), JSON.stringify("/supabase_db_p"), "true", JSON.stringify({ a: "b" }), JSON.stringify({ "5432/tcp": loop(1) }), JSON.stringify({ net1: { IPAddress: "x" } })].join("\n") + "\n"
  );
  assert.deepEqual(parsed, [{ id: id("b"), name: "/supabase_db_p", running: true, labels: { a: "b" }, ports: { "5432/tcp": loop(1) }, networks: ["net1"] }]);
});

// 11 --------------------------------------------------------------------------
test("11. absent or malformed environment variables are refused before any external call", () => {
  const keys = ["FIRAZA_TEST_API_URL", "FIRAZA_TEST_DB_CONTAINER", "FIRAZA_TEST_SYSTEM_IDENTIFIER", "FIRAZA_TEST_SUPABASE_WORKDIR"];
  for (const k of keys) {
    for (const value of [undefined, "", "x"]) {
      const r = attempt(() => {}, (e) => (value === undefined ? delete e[k] : (e[k] = value)));
      assertRejected(r, new RegExp(k));
      assert.deepEqual(r.calls, [], `${k}=${value}: no external call`);
    }
  }
  assert.throws(() => readTargetEnv({}), TargetVerificationError);
  assertRejected(attempt(() => {}, (e) => (e.FIRAZA_TEST_SUPABASE_WORKDIR = "relative/path")), /FIRAZA_TEST_SUPABASE_WORKDIR/);
  assertRejected(attempt(() => {}, (e) => (e.FIRAZA_TEST_DB_CONTAINER = "postgres")), /FIRAZA_TEST_DB_CONTAINER/);
});

// 12 --------------------------------------------------------------------------
test("12. without a verified target, keys and database access are unreachable", () => {
  let statusCalls = 0;
  const spy = () => {
    statusCalls += 1;
    return "{}";
  };
  const good = attempt().target;
  for (const forged of [null, undefined, {}, { ...good }, Object.freeze({ ...good })]) {
    assert.throws(() => readLocalKeys(forged, spy), TargetVerificationError);
    assert.throws(() => assertVerified(forged), /not been verified/);
  }
  assert.equal(statusCalls, 0);
});

test("12b. keys are refused when supabase status changed after verification", () => {
  const target = attempt().target;
  const status = (over) => () => JSON.stringify({ API_URL: "http://127.0.0.1:55321", DB_URL: "postgresql://u:p@127.0.0.1:55322/postgres", ANON_KEY: "a", SERVICE_ROLE_KEY: "s", PUBLISHABLE_KEY: "p", ...over });
  assert.deepEqual(readLocalKeys(target, status({})), { anon: "a", service: "s", publishable: "p" });
  assert.throws(() => readLocalKeys(target, status({ API_URL: "http://127.0.0.1:54321" })), /changed after verification/);
  assert.throws(() => readLocalKeys(target, status({ DB_URL: "postgresql://u:p@127.0.0.1:54322/postgres" })), /changed after verification/);
  assert.throws(() => readLocalKeys(target, status({ SERVICE_ROLE_KEY: "" })), /no SERVICE_ROLE_KEY/);
  assert.throws(() => readLocalKeys(target, () => "not json"), /valid JSON/);
  assert.throws(() => readLocalKeys(target, () => { throw new Error("boom"); }), /supabase status failed/);
});

test("config parser reads only the identity keys and ignores sub-tables and arrays", () => {
  assert.deepEqual(parseSupabaseConfig(CONFIG), { projectId: PROJECT, apiEnabled: true, apiPort: 55321, dbPort: 55322 });
  assert.deepEqual(parseSupabaseConfig("[api]\nport = 1 # c\n"), { projectId: null, apiEnabled: null, apiPort: 1, dbPort: null });
  assert.throws(() => parseSupabaseConfig("[db]\nport = 1\n[db]\nport = 2\n"), /more than once/);
  assert.throws(() => parseSupabaseConfig("[api]\nport = \"55321\"\n"), /unexpected value for api.port/);
  assert.throws(() => parseSupabaseConfig(null), TargetVerificationError);
  assertRejected(attempt((s) => (s.config = CONFIG.replace("[api]\nenabled = true", "[api]\nenabled = false"))), /API is disabled/);
  assertRejected(attempt((s) => (s.config = CONFIG.replace("[db]\nport = 55322", "[db]"))), /no \[db\] port/);
});

// Source checks: both harnesses -------------------------------------------------
for (const file of ["material-crud.mjs", "stock-opname.mjs"]) {
  const source = readFileSync(new URL(`../integration/http/${file}`, import.meta.url), "utf8");
  const main = source.slice(source.indexOf("async function main()"));

  test(`${file}: opt-in, then target verification, before any database, key, server, or Auth access`, () => {
    const optIn = main.indexOf("process.env.FIRAZA_ALLOW_");
    const verify = main.indexOf("verifyTarget();");
    assert.ok(optIn > 0 && verify > optIn, "opt-in checked before verification");
    for (const marker of ["dbRead(", "psql(", "sqlCount(", "count(", "snapshot(", "localKeys()", "startServer(", "admin(", "/auth/v1/admin", "send(", ".request("]) {
      const at = main.indexOf(marker);
      assert.ok(at === -1 || at > verify, `${marker} appears before verifyTarget()`);
    }
    assert.match(source, /function verifyTarget\(\) \{\s*try \{\s*TARGET = verifyLocalTarget\(process\.env, createRealDeps\(\{ supabaseBin: SUPABASE_BIN \}\)\);/);
  });

  test(`${file}: every docker exec uses the verified container id; keys only via readLocalKeys`, () => {
    // The old unverified constants and direct reads of the identity variables are gone.
    assert.doesNotMatch(source, /(^|[^_A-Z])(DB_CONTAINER|SYSTEM_IDENTIFIER|WORKDIR)\b|checkConfig/m);
    assert.doesNotMatch(source, /process\.env\.FIRAZA_TEST_(DB_CONTAINER|SYSTEM_IDENTIFIER|SUPABASE_WORKDIR)/);
    const execs = [...source.matchAll(/\["exec", "-i",[^\]]*\]/g)].map((m) => m[0]);
    assert.ok(execs.length >= 1);
    for (const e of execs) assert.match(e, /dbContainerId, "psql"/);
    const guarded = [...source.matchAll(/const \{ dbContainerId \} = assertVerified\(TARGET\);/g)].length;
    assert.equal(guarded, execs.length, "each docker exec is preceded by assertVerified(TARGET)");
    assert.match(source, /return readLocalKeys\(TARGET, runSupabaseStatus\(SUPABASE_BIN\)\);/);
    assert.equal([...source.matchAll(/\["status", "-o", "json"/g)].length, 0, "no direct supabase status call left in the harness");
    assert.match(source, /let TARGET = null;/);
  });
}
