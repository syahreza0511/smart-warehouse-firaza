import { z } from "zod";
import { getAuthContext } from "@/lib/server/auth-context";
import { errorResponse, jsonResponse, readErrorResponse } from "@/lib/server/http";
import { getMaterial, listTransactions, toTransaction } from "@/lib/server/materials";
import { uuidSchema } from "@/lib/validation/schemas";

const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// GET /api/v1/materials/:id/transactions?limit=20
// Most recent transactions first.
export async function GET(request, { params }) {
  const { id } = await params;

  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  if (!uuidSchema.safeParse(id).success) {
    return errorResponse(400, "INVALID_ID", "ID material tidak valid.");
  }

  const limit = limitSchema.safeParse(request.nextUrl.searchParams.get("limit") ?? undefined);
  if (!limit.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Parameter limit harus 1 sampai 100.");
  }

  const material = await getMaterial(ctx.supabase, id);
  if (material.error) return readErrorResponse(material.error);
  if (!material.data) return errorResponse(404, "MATERIAL_NOT_FOUND", "Material tidak ditemukan.");

  const { data, error } = await listTransactions(ctx.supabase, id, limit.data);
  if (error) return readErrorResponse(error);

  return jsonResponse({ transactions: data.map((row) => toTransaction(row, ctx.user.id)) });
}
