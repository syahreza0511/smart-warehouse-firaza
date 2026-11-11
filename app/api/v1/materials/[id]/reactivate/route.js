import { getAuthContext } from "@/lib/server/auth-context";
import { errors, readJsonMutation } from "@/lib/server/http";
import { reactivateMaterial } from "@/lib/server/material-commands";

// POST /api/v1/materials/:id/reactivate
// Body: { reason }
// Makes an archived material active again (FR-MAT-08). Writes the
// REACTIVATED status event in the same transaction.
export async function POST(request, { params }) {
  const { id } = await params;

  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return reactivateMaterial(ctx.supabase, id, body);
}
