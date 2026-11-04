import { getAuthContext, publicUser } from "@/lib/server/auth-context";
import { jsonResponse } from "@/lib/server/http";

// GET /api/v1/auth/session
// The signed-in user's own id, name, and role as authorized by the database.
// The UI uses it to choose between Staff and read-only Owner views; the API
// and database enforce the role independently.
export async function GET() {
  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  return jsonResponse({ user: publicUser(ctx.profile) });
}
