// Server-only: attributes of the Supabase auth cookies (F-01).
//
// HttpOnly because no browser code reads them; SameSite=Lax plus the Origin
// check on mutations (lib/server/http.js) against CSRF.
//
// Secure is on unless AUTH_COOKIE_SECURE is exactly "false". A hosted HTTPS
// deployment that leaves the variable unset, or sets an unexpected value
// ("TRUE", "0", "flase"), still gets Secure cookies (fail closed). Set
// "false" only to run the app over plain HTTP on 127.0.0.1 (local
// development and test runs). Request headers such as X-Forwarded-Proto are
// never consulted, so a client cannot turn Secure off.
export function authCookieOptions(env = process.env) {
  return {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE !== "false",
  };
}
