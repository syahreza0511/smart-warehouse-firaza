import { getAuthContext } from "@/lib/server/auth-context";
import { errors, readJsonMutation } from "@/lib/server/http";
import { cancelOpname } from "@/lib/server/stock-opname-commands";

// POST /api/v1/stock-opnames/:id/cancel
// Body: { reason }
// Any Staff Warehouse may cancel an active session, including one created by
// another Staff (FR-OPN-14). Stock does not change; the freeze is released
// atomically. A repeat is rejected with OPNAME_NOT_ACTIVE.
export async function POST(request, { params }) {
  const { id } = await params;

  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return cancelOpname(ctx.supabase, id, body);
}
