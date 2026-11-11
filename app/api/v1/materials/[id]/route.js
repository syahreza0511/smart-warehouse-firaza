import { getAuthContext } from "@/lib/server/auth-context";
import {
  errorResponse,
  errors,
  jsonResponse,
  readErrorResponse,
  readJsonMutation,
  rejectCrossOrigin,
} from "@/lib/server/http";
import { deleteMaterial, updateMaterial } from "@/lib/server/material-commands";
import { getMaterial, getMaterialUsage, toMaterial } from "@/lib/server/materials";
import { uuidSchema } from "@/lib/validation/schemas";

// GET /api/v1/materials/:id
// The material plus UI hints: whether the unit can still change and whether
// a permanent delete can succeed. The hints never authorize anything.
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

  const usage = await getMaterialUsage(ctx.supabase, id);
  if (usage.error) return readErrorResponse(usage.error);

  return jsonResponse({ material: toMaterial(data), management: usage.data });
}

// PUT /api/v1/materials/:id
// Body: { categoryId, name, unit, minimumStock } — every editable field.
// public.update_material rejects archived materials and locked unit changes.
export async function PUT(request, { params }) {
  const { id } = await params;

  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return updateMaterial(ctx.supabase, id, body);
}

// DELETE /api/v1/materials/:id
// Permanent delete, only for a material without transactions, Stock Opname
// items, or status events (FR-MAT-05). Otherwise the answer is
// MATERIAL_HAS_HISTORY and the material can be archived instead.
export async function DELETE(request, { params }) {
  const { id } = await params;

  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return deleteMaterial(ctx.supabase, id);
}
