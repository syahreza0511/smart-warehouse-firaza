// Server-only: resolves the caller of a Route Handler.
import { ConfigError, createSupabaseServerClient } from "@/lib/server/supabase";
import { errors, isTransientAuthError, readErrorResponse } from "@/lib/server/http";

// Two separate checks, so the API can tell the cases apart:
//   1. Supabase Auth accepts the session (getUser asks the Auth server, so a
//      revoked or logged-out session fails here)          -> else 401
//   2. The database authorizes the session: the own-profile RLS policy only
//      returns a row while app_private.current_app_role() is not NULL, i.e.
//      an active profile and a session created after session_valid_after
//      (deactivation, G1)                                  -> else 403
// The role comes from the database row, never from the request.
//
// Returns { supabase, user, profile } or { response } with the error to send.
export async function getAuthContext() {
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error("[api] configuration error:", error.message);
      return { response: errors.internal() };
    }
    throw error;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return {
      response: isTransientAuthError(userError) && userError.name !== "AuthSessionMissingError"
        ? errors.serviceUnavailable()
        : errors.unauthenticated(),
    };
  }

  const user = userData?.user;
  if (!user) {
    return { response: errors.unauthenticated() };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { response: readErrorResponse(profileError) };
  }

  if (!profile) {
    return { response: errors.sessionNotAuthorized() };
  }

  return { supabase, user: { id: user.id }, profile };
}

export function publicUser(profile) {
  return { id: profile.id, name: profile.name, role: profile.role };
}
