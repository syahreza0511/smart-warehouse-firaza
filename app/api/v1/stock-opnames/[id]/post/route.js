import { getAuthContext } from "@/lib/server/auth-context";
import { errors, readJsonMutation } from "@/lib/server/http";
import { postOpname } from "@/lib/server/stock-opname-commands";

// POST /api/v1/stock-opnames/:id/post
// Body: {} (nothing is read from it; counts and stock come from the database)
// Posts the session atomically (FR-OPN-10): ADJUSTMENT for every non-zero
// difference, stock set to the count, freeze released, status POSTED. Only
// the session's creator (OD-16). A repeat is rejected with
// OPNAME_NOT_ACTIVE; it is not a replay of the first result.
export async function POST(request, { params }) {
  const { id } = await params;

  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return postOpname(ctx.supabase, id, body);
}
