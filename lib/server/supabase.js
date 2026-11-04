// Server-only: import this module from Route Handlers only, never from a
// Client Component. The browser never talks to Supabase directly (OD-18
// Option C, ADR-15); every business read and write goes through /api/v1.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export class ConfigError extends Error {}

// Only the project URL and the publishable (anon) key are read. The
// service-role key is never used by the application runtime (ADR-15 B5.3).
function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new ConfigError("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set");
  }

  return { url, key };
}

// One client per request, bound to the caller's auth cookies, so every query
// runs as the signed-in user and RLS plus the role helper apply. Token
// refreshes are written back through setAll.
//
// The auth cookies are HttpOnly because no browser code reads them. Secure is
// opt-in through AUTH_COOKIE_SECURE so local HTTP development keeps working;
// set it to "true" wherever the app is served over HTTPS.
export async function createSupabaseServerClient() {
  const { url, key } = getSupabaseConfig();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.AUTH_COOKIE_SECURE === "true",
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

// Removes every Supabase auth cookie from the response. Used when remote
// sign-out fails, so the browser still drops the session.
export async function clearAuthCookies() {
  const cookieStore = await cookies();

  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      cookieStore.delete(cookie.name);
    }
  }
}
