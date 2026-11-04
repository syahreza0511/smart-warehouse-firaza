import { getAuthContext } from "@/lib/server/auth-context";
import { errorResponse, errors, jsonResponse, readJsonMutation } from "@/lib/server/http";
import { stockMovementErrorResponse } from "@/lib/server/rpc-errors";
import { fieldErrors, idempotencyKeySchema, stockMovementRequestSchema } from "@/lib/validation/schemas";

// POST /api/v1/stock-movements
// Headers: Idempotency-Key: <uuid>
// Body:    { materialId, type: "STOCK_IN" | "STOCK_OUT", quantity, notes? }
//
// Stock arithmetic, locking, idempotency, and the authoritative role check
// all happen in public.post_stock_movement. The checks here only give early,
// clear errors. A replay with the same key and payload returns the original
// result without a new transaction.
export async function POST(request) {
  const { body, response } = await readJsonMutation(request);
  if (response) return response;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (ctx.profile.role !== "STAFF_WAREHOUSE") {
    return errors.forbidden();
  }

  const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key") ?? undefined);
  if (!key.success) {
    return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", "Header Idempotency-Key wajib berupa UUID.");
  }

  const parsed = stockMovementRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errors.validation(fieldErrors(parsed.error));
  }

  const { materialId, type, quantity, notes } = parsed.data;

  const { data, error } = await ctx.supabase.rpc("post_stock_movement", {
    p_material_id: materialId,
    p_type: type,
    p_quantity: quantity,
    p_notes: notes,
    p_idempotency_key: key.data,
  });

  if (error) {
    return stockMovementErrorResponse(error);
  }

  return jsonResponse(
    {
      movement: {
        transactionId: data.transaction_id,
        materialId: data.material_id,
        type: data.type,
        quantity: data.quantity,
        quantityDelta: data.quantity_delta,
        currentStock: data.current_stock,
        notes: data.notes,
        createdBy: data.created_by,
        createdAt: data.created_at,
      },
    },
    201
  );
}
