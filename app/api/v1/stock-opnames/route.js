import { getAuthContext } from "@/lib/server/auth-context";
import { errorResponse, errors, jsonResponse, readErrorResponse, readJsonMutation } from "@/lib/server/http";
import { createOpname } from "@/lib/server/stock-opname-commands";
import { listOpnames, toOpnameSummary } from "@/lib/server/stock-opnames";
import { opnameStatusFilterSchema } from "@/lib/validation/stock-opname";

// GET /api/v1/stock-opnames[?status=ACTIVE|POSTED|CANCELLED]
// Most recent sessions first (up to 100). Owner and Staff can read.
export async function GET(request) {
  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  const statusParam = request.nextUrl.searchParams.get("status");
  let status;
  if (statusParam !== null) {
    const parsed = opnameStatusFilterSchema.safeParse(statusParam);
    if (!parsed.success) {
      return errorResponse(400, "VALIDATION_ERROR", "Parameter status harus ACTIVE, POSTED, atau CANCELLED.");
    }
    status = parsed.data;
  }

  const { data, error } = await listOpnames(ctx.supabase, { status });
  if (error) return readErrorResponse(error);

  return jsonResponse({ opnames: data.map((row) => toOpnameSummary(row, ctx.user.id)) });
}

// POST /api/v1/stock-opnames
// Headers: Idempotency-Key: <uuid>
// Body:    { materialIds: [uuid, ...] }
// Creates an ACTIVE session with one item per material and freezes those
// materials (OD-01, FR-OPN-04) through public.create_stock_opname, which
// re-checks the role and every rule.
export async function POST(request) {
  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  return createOpname(ctx.supabase, body, request.headers.get("idempotency-key"));
}
