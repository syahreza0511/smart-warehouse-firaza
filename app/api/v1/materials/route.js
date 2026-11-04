import { getAuthContext } from "@/lib/server/auth-context";
import { jsonResponse, readErrorResponse } from "@/lib/server/http";
import { listMaterials, toMaterial } from "@/lib/server/materials";

// GET /api/v1/materials
// Active materials with computed stock status. The session is authorized
// first, so an empty list means there are no materials, not a silent RLS
// denial.
export async function GET() {
  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  const { data, error } = await listMaterials(ctx.supabase);
  if (error) return readErrorResponse(error);

  return jsonResponse({ materials: data.map(toMaterial) });
}
