// Server-only: material write commands behind the /api/v1/materials Route
// Handlers. The handler checks origin, session, and role first; these
// functions validate input, call the RPC with the caller's Supabase client,
// and map the result. Each returns a Response.
//
// The database functions (migration 20261110090000) are the enforcement:
// role, input, row lock, archive/frozen/history state, unit lock, and name
// uniqueness are all re-checked there. Validation here only gives early,
// field-level errors.
//
// Relative imports keep this module loadable by node --test.
import { errorResponse, errors, jsonResponse } from "./http.js";
import { toMaterial } from "./materials.js";
import {
  fieldErrors,
  materialRequestSchema,
  materialStatusRequestSchema,
  uuidSchema,
} from "../validation/schemas.js";

// Business codes raised as SQLSTATE P0001 with the code as the message:
// [HTTP status, display message, form field the error belongs to].
export const MATERIAL_ERRORS = {
  INVALID_NAME: [400, "Nama material tidak valid.", "name"],
  INVALID_UNIT: [400, "Satuan tidak valid.", "unit"],
  INVALID_MINIMUM_STOCK: [400, "Stok minimum harus bilangan bulat 0 atau lebih.", "minimumStock"],
  CATEGORY_NOT_FOUND: [400, "Kategori tidak ditemukan. Pilih kategori yang tersedia.", "categoryId"],
  REASON_REQUIRED: [400, "Alasan wajib diisi.", "reason"],
  INVALID_REASON: [400, "Alasan maksimal 500 karakter.", "reason"],
  MATERIAL_NOT_FOUND: [404, "Material tidak ditemukan."],
  NAME_TAKEN: [409, "Nama material sudah dipakai, termasuk oleh material yang diarsipkan.", "name"],
  MATERIAL_ARCHIVED: [409, "Material ini diarsipkan. Aktifkan kembali material sebelum mengubah datanya."],
  UNIT_LOCKED: [
    409,
    "Satuan tidak dapat diubah karena material sudah memiliki transaksi atau tercatat dalam Stock Opname.",
    "unit",
  ],
  MATERIAL_HAS_HISTORY: [
    409,
    "Material sudah memiliki riwayat transaksi, Stock Opname, atau arsip sehingga tidak dapat dihapus permanen. Arsipkan material ini sebagai gantinya.",
  ],
  MATERIAL_FROZEN: [409, "Material sedang dalam Stock Opname aktif sehingga statusnya tidak dapat diubah."],
  STOCK_NOT_ZERO: [409, "Material hanya dapat diarsipkan jika stoknya 0."],
  ALREADY_ARCHIVED: [409, "Material sudah diarsipkan."],
  NOT_ARCHIVED: [409, "Material tidak sedang diarsipkan."],
};

// None of the material operations has idempotent replay (no idempotency
// key). A repeated request is not answered with the first result; at best it
// is rejected by a state or uniqueness check (NAME_TAKEN, ALREADY_ARCHIVED,
// NOT_ARCHIVED, MATERIAL_NOT_FOUND), and such a rejection does not prove that
// an earlier request succeeded. A repeated update simply writes again and can
// overwrite another user's change (last write wins). So the server never
// retries, and it tells the client which of two cases it is in:
//
// NOT APPLIED: PostgreSQL answered with an error, so the RPC's transaction
// was rolled back and nothing changed: lock timeout, serialization failure,
// deadlock, statement cancelled.
const NOT_APPLIED_SQLSTATES = new Set(["55P03", "40001", "40P01", "57014"]);

// OUTCOME UNKNOWN: no answer from the database (transport failure between
// this server and the Data API, no error code) or the connection broke
// mid-request. The transaction may or may not have committed; the client must
// reload and reconcile before sending anything again.
const OUTCOME_UNKNOWN_SQLSTATES = new Set(["08000", "08003", "08006"]);

const notApplied = () =>
  errorResponse(
    503,
    "OPERATION_NOT_APPLIED",
    "Perubahan tidak disimpan karena database sedang sibuk. Muat ulang data, lalu ulangi bila masih diperlukan.",
    {},
    { "Retry-After": "2" }
  );

const outcomeUnknown = (status = 503) =>
  errorResponse(
    status,
    "OUTCOME_UNKNOWN",
    "Hasil perubahan belum diketahui: mungkin sudah tersimpan, mungkin belum. Muat ulang data dan periksa keadaannya sebelum mengirim ulang."
  );

export function materialRpcErrorResponse(error) {
  const code = error?.code;
  const message = error?.message;

  if (code === "P0001" && typeof message === "string" && Object.hasOwn(MATERIAL_ERRORS, message)) {
    const [status, text, field] = MATERIAL_ERRORS[message];
    return errorResponse(status, message, text, field ? { fields: { [field]: [text] } } : {});
  }

  if (code === "42501") {
    return message === "FORBIDDEN" ? errors.forbidden() : errors.sessionNotAuthorized();
  }

  if (code === "22P02" || code === "22003") {
    return errorResponse(400, "INVALID_INPUT", "Format data tidak dapat diproses.");
  }

  if (NOT_APPLIED_SQLSTATES.has(code)) {
    return notApplied();
  }

  if (OUTCOME_UNKNOWN_SQLSTATES.has(code) || !code) {
    return outcomeUnknown();
  }

  // Any other database or Data API error. The client treats a 500 as an
  // unknown outcome, which is the safe reading for errors not listed above.
  console.error("[api] material operation failed", code, message);
  return errors.internal();
}

const invalidId = () => errorResponse(400, "INVALID_ID", "ID material tidak valid.");

// A successful RPC must return the material row. The RPC returned without
// an error, so its transaction may have committed: an unexpected result is
// reported as an unknown outcome, never as success and never as "not saved".
function materialResult(data, status = 200) {
  if (!data || typeof data !== "object" || typeof data.id !== "string") {
    console.error("[api] material operation returned an unexpected result");
    return outcomeUnknown(500);
  }
  return jsonResponse({ material: toMaterial(data) }, status);
}

// POST /api/v1/materials — new material with stock 0 (FR-MAT-04).
export async function createMaterial(supabase, body) {
  const parsed = materialRequestSchema.safeParse(body);
  if (!parsed.success) return errors.validation(fieldErrors(parsed.error));

  const { categoryId, name, unit, minimumStock } = parsed.data;
  const { data, error } = await supabase.rpc("create_material", {
    p_category_id: categoryId,
    p_name: name,
    p_unit: unit,
    p_minimum_stock: minimumStock,
  });

  if (error) return materialRpcErrorResponse(error);
  return materialResult(data, 201);
}

// PUT /api/v1/materials/:id — name, category, unit, minimum stock.
export async function updateMaterial(supabase, id, body) {
  if (!uuidSchema.safeParse(id).success) return invalidId();

  const parsed = materialRequestSchema.safeParse(body);
  if (!parsed.success) return errors.validation(fieldErrors(parsed.error));

  const { categoryId, name, unit, minimumStock } = parsed.data;
  const { data, error } = await supabase.rpc("update_material", {
    p_material_id: id,
    p_category_id: categoryId,
    p_name: name,
    p_unit: unit,
    p_minimum_stock: minimumStock,
  });

  if (error) return materialRpcErrorResponse(error);
  return materialResult(data);
}

// DELETE /api/v1/materials/:id — only without any history (FR-MAT-05).
export async function deleteMaterial(supabase, id) {
  if (!uuidSchema.safeParse(id).success) return invalidId();

  const { data, error } = await supabase.rpc("delete_material", { p_material_id: id });

  if (error) return materialRpcErrorResponse(error);
  if (data?.id !== id) {
    console.error("[api] material delete returned an unexpected result");
    return outcomeUnknown(500);
  }
  return jsonResponse({ deleted: { id } });
}

async function changeStatus(rpcName, supabase, id, body) {
  if (!uuidSchema.safeParse(id).success) return invalidId();

  const parsed = materialStatusRequestSchema.safeParse(body);
  if (!parsed.success) return errors.validation(fieldErrors(parsed.error));

  const { data, error } = await supabase.rpc(rpcName, {
    p_material_id: id,
    p_reason: parsed.data.reason,
  });

  if (error) return materialRpcErrorResponse(error);
  return materialResult(data);
}

// POST /api/v1/materials/:id/archive — stock 0, not frozen (OD-05), reason.
export function archiveMaterial(supabase, id, body) {
  return changeStatus("archive_material", supabase, id, body);
}

// POST /api/v1/materials/:id/reactivate — reason required (FR-MAT-08).
export function reactivateMaterial(supabase, id, body) {
  return changeStatus("reactivate_material", supabase, id, body);
}
