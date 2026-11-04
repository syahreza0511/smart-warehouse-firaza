import { getAuthContext } from "@/lib/server/auth-context";
import { errorResponse, jsonResponse, readErrorResponse } from "@/lib/server/http";
import { getMaterial, toMaterial } from "@/lib/server/materials";
import { uuidSchema } from "@/lib/validation/schemas";

// GET /api/v1/materials/:id
export async function GET(request, { params }) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (!uuidSchema.safeParse(id).success) {
    return errorResponse(400, "INVALID_ID", "ID material tidak valid.");
  }

  const { data, error } = await getMaterial(ctx.supabase, id);
  if (error) return readErrorResponse(error);
  if (!data) return errorResponse(404, "MATERIAL_NOT_FOUND", "Material tidak ditemukan.");

  return jsonResponse({ material: toMaterial(data) });
}
