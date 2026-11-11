import { getAuthContext } from "@/lib/server/auth-context";
import { errors, jsonResponse, readErrorResponse } from "@/lib/server/http";
import { loadDashboard } from "@/lib/server/dashboard";

// GET /api/v1/dashboard
// Inventory summary for Owner and Staff (read-only): exact counts of active
// materials by operational status, and the materials that need attention
// (OUT_OF_STOCK first, then LOW_STOCK), bounded, with their total.
export async function GET() {
  const ctx = await getAuthContext();
  if (ctx.response) return ctx.response;

  const { data, error } = await loadDashboard(ctx.supabase);
  if (error) {
    if (error.code === "DASHBOARD_UNEXPECTED_RESULT") {
      console.error("[api] dashboard read returned an unexpected result");
      return errors.internal();
    }
    return readErrorResponse(error);
  }

  return jsonResponse({ dashboard: { ...data, generatedAt: new Date().toISOString() } });
}
