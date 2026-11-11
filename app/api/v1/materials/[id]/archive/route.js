import { getAuthContext } from "@/lib/server/auth-context";
import { errors, readJsonMutation } from "@/lib/server/http";
import { archiveMaterial } from "@/lib/server/material-commands";

// POST /api/v1/materials/:id/archive
// Body: { reason }
// Only at stock 0 and not while frozen by an active Stock Opname (FR-MAT-06,
// OD-05). Writes the ARCHIVED status event in the same transaction.
export async function POST(request, { params }) {
  const { id } = await params;

  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return archiveMaterial(ctx.supabase, id, body);
}
