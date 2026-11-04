// HTTP integration check for the auth cookie attributes (F-01). Talks to a
// running Next.js server at http://127.0.0.1:3000; no database access and no
// inventory change. One STAFF_WAREHOUSE login, logged out at the end (one
// Auth session created and revoked, plus Auth audit entries).
//
// Run only with owner approval, against a server started with the
// AUTH_COOKIE_SECURE value under test, and tell the script what the server
// must send:
//
//   FIRAZA_DEMO_CREDENTIALS_FILE=/path/outside/repo/credentials.json \
//   FIRAZA_EXPECT_SECURE_COOKIE=true \
//   node tests/integration/http/auth-cookie.mjs
//
// FIRAZA_EXPECT_SECURE_COOKIE=true  server with AUTH_COOKIE_SECURE unset,
//                                   "true", or any value other than "false"
// FIRAZA_EXPECT_SECURE_COOKIE=false server with AUTH_COOKIE_SECURE=false
//
// Cookie values, tokens, and passwords are never printed.
// Exit codes: 0 all PASS, 1 FAIL or abort.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "http://127.0.0.1:3000";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let passed = 0;
let failed = 0;
function check(id, ok, description, observed = "") {
  console.log(`${id} | ${ok ? "PASS" : "FAIL"} | ${description} | ${observed}`);
  ok ? passed++ : failed++;
  return ok;
}

function fail(message) {
  throw new Error(message);
}

function expectedSecure() {
  const raw = process.env.FIRAZA_EXPECT_SECURE_COOKIE;
  if (raw !== "true" && raw !== "false") fail("Set FIRAZA_EXPECT_SECURE_COOKIE to true or false.");
  return raw === "true";
}

function loadStaff() {
  const file = process.env.FIRAZA_DEMO_CREDENTIALS_FILE;
  if (!file) fail("Set FIRAZA_DEMO_CREDENTIALS_FILE to the private credential file.");
  const resolved = path.resolve(file);
  if (resolved === REPO_ROOT || resolved.startsWith(REPO_ROOT + path.sep)) fail("The credential file must be outside the repository.");
  if ((statSync(resolved).mode & 0o077) !== 0) fail("The credential file must not be readable by group or others.");
  let accounts;
  try {
    accounts = JSON.parse(readFileSync(resolved, "utf8")).accounts;
  } catch {
    fail("The credential file could not be parsed (contents not shown).");
  }
  const staff = Array.isArray(accounts) ? accounts.find((a) => a?.role === "STAFF_WAREHOUSE") : null;
  if (!staff?.email || !staff?.password) fail("No STAFF_WAREHOUSE account in the credential file.");
  return { email: staff.email, password: staff.password };
}

// Parses Set-Cookie lines of Supabase auth cookies (sb-*) into
// { name, cleared, attrs } without keeping values.
function authCookies(response) {
  return response.headers
    .getSetCookie()
    .map((line) => {
      const [pair, ...rest] = line.split(";").map((s) => s.trim());
      const name = pair.slice(0, pair.indexOf("="));
      const value = pair.slice(pair.indexOf("=") + 1);
      const attrs = new Map(
        rest.map((a) => {
          const i = a.indexOf("=");
          return i === -1 ? [a.toLowerCase(), true] : [a.slice(0, i).toLowerCase(), a.slice(i + 1)];
        })
      );
      const cleared = value === "" || attrs.get("max-age") === "0" || (attrs.has("expires") && Date.parse(attrs.get("expires")) <= Date.now());
      return { name, value, cleared, attrs };
    })
    .filter((c) => c.name.startsWith("sb-"));
}

const describe = (c) =>
  `${c.name}: ${["HttpOnly", "Secure", "SameSite", "Path"]
    .map((a) => `${a}=${c.attrs.get(a.toLowerCase()) ?? "-"}`)
    .join(" ")}`;

async function request(method, url, { body, cookie } = {}) {
  const headers = { Origin: BASE_URL };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  return fetch(BASE_URL + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
}

async function main() {
  const secure = expectedSecure();
  const staff = loadStaff();
  console.log(`Expecting Secure=${secure} on auth cookies from ${BASE_URL}`);

  // Rejected login: no session cookie is issued.
  const bad = await request("POST", "/api/v1/auth/login", { body: { ...staff, password: `${staff.password}-wrong` } });
  check("AC-01", bad.status === 401 && authCookies(bad).every((c) => c.cleared), "wrong password -> 401, no auth cookie set", `${bad.status}`);

  // Login: every auth cookie carries the expected attributes.
  const login = await request("POST", "/api/v1/auth/login", { body: staff });
  const set = authCookies(login).filter((c) => !c.cleared);
  let loggedIn = login.status === 200;
  check("AC-02", login.status === 200 && set.length > 0, "login -> 200 with auth cookie(s)", `${login.status}, ${set.length} cookie(s)`);
  for (const c of set) {
    check(
      "AC-03",
      c.attrs.get("httponly") === true &&
        String(c.attrs.get("samesite")).toLowerCase() === "lax" &&
        c.attrs.get("path") === "/" &&
        c.attrs.has("secure") === secure,
      `HttpOnly, SameSite=Lax, Path=/, Secure=${secure}`,
      describe(c)
    );
  }
  const cookie = set.map((c) => `${c.name}=${c.value}`).join("; ");

  try {
    const session = await request("GET", "/api/v1/auth/session", { cookie });
    const body = await session.json().catch(() => null);
    check("AC-04", session.status === 200 && body?.user?.role === "STAFF_WAREHOUSE", "session with the login cookies -> 200 STAFF_WAREHOUSE", `${session.status}`);
  } finally {
    if (loggedIn) {
      const logout = await request("POST", "/api/v1/auth/logout", { body: {}, cookie });
      const cleared = authCookies(logout).filter((c) => c.cleared).map((c) => c.name);
      loggedIn = logout.status !== 200;
      check(
        "AC-05",
        logout.status === 200 && set.every((c) => cleared.includes(c.name)),
        "logout -> 200 and clears every auth cookie",
        `${logout.status}, cleared ${cleared.length}/${set.length}`
      );
    }
  }

  const after = await request("GET", "/api/v1/auth/session", { cookie });
  check("AC-06", after.status === 401, "logged-out cookies -> 401", `${after.status}`);
  if (loggedIn) console.error("WARNING: logout was not confirmed; revoke the session before further runs.");

  console.log(`\n${passed}/${passed + failed} PASS`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`ABORT: ${error.message}`);
  process.exitCode = 1;
});
