// Unit tests for the auth cookie attributes (F-01). No network, no Next.js
// runtime, no Supabase: authCookieOptions() is a pure function of the
// environment. Whether the attributes reach the Set-Cookie header is checked
// by tests/integration/http/auth-cookie.mjs.
//
// Run: node --test 'tests/unit/*.test.mjs'
import test from "node:test";
import assert from "node:assert/strict";

const { authCookieOptions } = await import(new URL("../../lib/server/auth-cookie.js", import.meta.url));

const FIXED = { path: "/", sameSite: "lax", httpOnly: true };

test("Secure when AUTH_COOKIE_SECURE is unset (hosted default)", () => {
  assert.deepEqual(authCookieOptions({}), { ...FIXED, secure: true });
});

test('Secure when AUTH_COOKIE_SECURE is "true"', () => {
  assert.deepEqual(authCookieOptions({ AUTH_COOKIE_SECURE: "true" }), { ...FIXED, secure: true });
});

test('not Secure only when AUTH_COOKIE_SECURE is exactly "false" (local HTTP)', () => {
  assert.deepEqual(authCookieOptions({ AUTH_COOKIE_SECURE: "false" }), { ...FIXED, secure: false });
});

test("any other value fails closed to Secure", () => {
  for (const value of ["", " ", "FALSE", "False", " false", "false ", "0", "no", "off", "TRUE", "1", "flase"]) {
    assert.equal(authCookieOptions({ AUTH_COOKIE_SECURE: value }).secure, true, JSON.stringify(value));
  }
});

test("HttpOnly, SameSite=Lax and Path=/ never depend on AUTH_COOKIE_SECURE", () => {
  for (const value of [undefined, "true", "false", "garbage"]) {
    const { secure, ...rest } = authCookieOptions(value === undefined ? {} : { AUTH_COOKIE_SECURE: value });
    assert.deepEqual(rest, FIXED, String(value));
  }
});

test("reads process.env by default", () => {
  const saved = process.env.AUTH_COOKIE_SECURE;
  try {
    delete process.env.AUTH_COOKIE_SECURE;
    assert.equal(authCookieOptions().secure, true);
    process.env.AUTH_COOKIE_SECURE = "false";
    assert.equal(authCookieOptions().secure, false);
  } finally {
    if (saved === undefined) delete process.env.AUTH_COOKIE_SECURE;
    else process.env.AUTH_COOKIE_SECURE = saved;
  }
});
