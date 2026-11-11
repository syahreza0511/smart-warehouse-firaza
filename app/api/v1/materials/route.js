import { getAuthContext } from "@/lib/server/auth-context";
import { errorResponse, errors, jsonResponse, readErrorResponse, readJsonMutation } from "@/lib/server/http";
import { createMaterial } from "@/lib/server/material-commands";
import { listMaterials, toMaterial } from "@/lib/server/materials";

// GET /api/v1/materials[?archived=true]
// Active materials with computed stock status, or archived ones with
// ?archived=true. The session is authorized first, so an empty list means
// there are no materials, not a silent RLS denial.
export async function GET(request) {
  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  const archivedParam = request.nextUrl.searchParams.get("archived");
  if (archivedParam !== null && archivedParam !== "true" && archivedParam !== "false") {
    return errorResponse(400, "VALIDATION_ERROR", "Parameter archived harus true atau false.");
  }

  const { data, error } = await listMaterials(ctx.supabase, { archived: archivedParam === "true" });
  if (error) return readErrorResponse(error);

  return jsonResponse({ materials: data.map(toMaterial) });
}

// POST /api/v1/materials
// Body: { categoryId, name, unit, minimumStock }
// Creates the material with stock 0 through public.create_material, which
// re-checks the role and every rule (FR-MAT-01, FR-MAT-04, FR-MAT-10).
export async function POST(request) {
  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return createMaterial(ctx.supabase, body);
}
