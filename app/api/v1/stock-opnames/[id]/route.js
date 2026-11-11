import { getAuthContext } from "@/lib/server/auth-context";
import { errorResponse, jsonResponse, readErrorResponse } from "@/lib/server/http";
import { getOpname, listOpnameItems, toOpname } from "@/lib/server/stock-opnames";
import { uuidSchema } from "@/lib/validation/schemas";

// GET /api/v1/stock-opnames/:id
// The session, its items with system stock, count, and difference, the
// difference summary, and what the viewer may do (hints only; the database
// decides). Owner and Staff can read.
export async function GET(request, { params }) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (!uuidSchema.safeParse(id).success) {
    return errorResponse(400, "INVALID_ID", "ID sesi Stock Opname tidak valid.");
  }

  const session = await getOpname(ctx.supabase, id);
  if (session.error) return readErrorResponse(session.error);
  if (!session.data) return errorResponse(404, "OPNAME_NOT_FOUND", "Sesi Stock Opname tidak ditemukan.");

  const items = await listOpnameItems(ctx.supabase, id);
  if (items.error) return readErrorResponse(items.error);

  return jsonResponse({
    opname: toOpname(session.data, items.data, { id: ctx.user.id, role: ctx.profile.role }),
  });
}
