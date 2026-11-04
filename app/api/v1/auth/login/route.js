import { publicUser } from "@/lib/server/auth-context";
import { errorResponse, errors, isTransientAuthError, jsonResponse, readErrorResponse, readJsonMutation } from "@/lib/server/http";
import { ConfigError, createSupabaseServerClient } from "@/lib/server/supabase";
import { fieldErrors, loginSchema } from "@/lib/validation/schemas";

const invalidCredentials = () =>
  errorResponse(401, "INVALID_CREDENTIALS", "Email atau kata sandi salah.");

// POST /api/v1/auth/login  { email, password }
// Sets the Supabase session cookies, then requires the database to authorize
// the new session before reporting success. Every Auth rejection (wrong
// password, unknown email, banned, unconfirmed) gets the same response.
export async function POST(request) {
  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validation(fieldErrors(parsed.error));
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

  // Signing in over an existing session would leave that session alive on
  // the Auth server, so end it first.
  const { data: existing } = await supabase.auth.getSession();
  if (existing?.session) {
    await supabase.auth.signOut({ scope: "local" });
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return isTransientAuthError(error) ? errors.serviceUnavailable() : invalidCredentials();
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    await supabase.auth.signOut({ scope: "local" });
    return profileError ? readErrorResponse(profileError) : errors.sessionNotAuthorized();
  }

  return jsonResponse({ user: publicUser(profile) });
}
