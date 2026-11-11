import { getAuthContext } from "@/lib/server/auth-context";
import { jsonResponse, readErrorResponse } from "@/lib/server/http";
import { listCategories } from "@/lib/server/materials";

// GET /api/v1/categories
// Read-only in the MVP (OD-19): categories are seeded and the app has no
// create, update, or delete path for them.
export async function GET() {
  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  const { data, error } = await listCategories(ctx.supabase);
  if (error) return readErrorResponse(error);

  return jsonResponse({ categories: data.map((row) => ({ id: row.id, name: row.name })) });
}
