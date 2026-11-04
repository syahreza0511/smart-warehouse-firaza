import { errorResponse, errors, isSameOrigin, jsonResponse } from "@/lib/server/http";
import { ConfigError, clearAuthCookies, createSupabaseServerClient } from "@/lib/server/supabase";

// POST /api/v1/auth/logout
// Revokes the current session on the Auth server (scope "local": this
// session only) and clears the auth cookies. The cookies are cleared even
// when revocation fails, and the response says so.
export async function POST(request) {
  if (!isSameOrigin(request)) {
    return errors.csrfRejected();
  }

  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("[api] configuration error:", error.message);
      return errors.internal();
    }
    throw error;
  }

  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    await clearAuthCookies();
    return errorResponse(
      503,
      "LOGOUT_INCOMPLETE",
      "Anda sudah keluar dari perangkat ini, tetapi sesi di server belum dapat dicabut. Coba keluar lagi nanti."
    );
  }

  return jsonResponse({ ok: true });
}
