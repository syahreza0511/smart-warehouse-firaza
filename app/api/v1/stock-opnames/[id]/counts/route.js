import { getAuthContext } from "@/lib/server/auth-context";
import { errors, readJsonMutation } from "@/lib/server/http";
import { recordCounts } from "@/lib/server/stock-opname-commands";

// PUT /api/v1/stock-opnames/:id/counts
// Body: { counts: [{ itemId, countedStock }, ...] }
// Replaces the physical count of each listed item (SET semantics,
// FR-OPN-06). Only the session's creator, only while ACTIVE (OD-02); no
// stock transaction is written.
export async function PUT(request, { params }) {
  const { id } = await params;

  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return recordCounts(ctx.supabase, id, body);
}
