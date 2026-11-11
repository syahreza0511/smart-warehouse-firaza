import { z } from "zod";
import { getAuthContext } from "@/lib/server/auth-context";
import { errorResponse, jsonResponse, readErrorResponse } from "@/lib/server/http";
import { getMaterial, listStatusEvents, toStatusEvent } from "@/lib/server/materials";
import { uuidSchema } from "@/lib/validation/schemas";

const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

// GET /api/v1/materials/:id/status-events?limit=20
// Archive and reactivation history, most recent first. The actor is only
// "you" or "someone else" (OD-28).
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

  const { data, error } = await listStatusEvents(ctx.supabase, id, limit.data);
  if (error) return readErrorResponse(error);

  return jsonResponse({ events: data.map((row) => toStatusEvent(row, ctx.user.id)) });
}
