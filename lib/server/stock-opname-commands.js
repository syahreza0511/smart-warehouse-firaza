// Server-only: Stock Opname write commands behind the /api/v1/stock-opnames
// Route Handlers. The handler checks origin, session, and role first; these
// functions validate input, call the RPC with the caller's Supabase client,
// and map the result. Each returns a Response.
//
// The database functions (migration 20261110120000) are the enforcement:
// role, creator-only count and post (OD-02/OD-16), session state, row locks,
// freeze invariant, and the stock arithmetic are all checked there.
//
// Outcome classes, as for material commands:
//   - create_stock_opname has idempotent replay (provisional: OD-20 is still
//     pending Owner approval): resending the same key and material list
//     returns the first result, so an unknown outcome is resolved by
//     resending exactly that request (never a new key).
//   - record_stock_opname_counts overwrites values (SET semantics); resending
//     the same counts cannot double anything.
//   - post_stock_opname and cancel_stock_opname have NO replay. A repeat is
//     rejected with OPNAME_NOT_ACTIVE, which does not prove that an earlier
//     request of this user succeeded. The client must reload and read the
//     session status. The server never retries.
//
// Relative imports keep this module loadable by node --test.
import { errorResponse, errors, jsonResponse } from "./http.js";
import { fieldErrors, idempotencyKeySchema, uuidSchema } from "../validation/schemas.js";
import {
  cancelOpnameRequestSchema,
  createOpnameRequestSchema,
  postOpnameRequestSchema,
  recordCountsRequestSchema,
} from "../validation/stock-opname.js";

// Business codes raised as SQLSTATE P0001 with the code as the message:
// [HTTP status, display message, form field the error belongs to].
export const OPNAME_ERRORS = {
  OPNAME_MATERIALS_REQUIRED: [400, "Pilih minimal satu material.", "materialIds"],
  INVALID_MATERIAL_LIST: [400, "Daftar material tidak valid.", "materialIds"],
  OPNAME_TOO_MANY_MATERIALS: [400, "Maksimal 200 material per sesi.", "materialIds"],
  DUPLICATE_MATERIAL: [400, "Material yang sama tidak boleh dipilih dua kali.", "materialIds"],
  IDEMPOTENCY_KEY_REQUIRED: [400, "Idempotency key wajib dikirim."],
  INVALID_IDEMPOTENCY_KEY: [400, "Idempotency key tidak valid."],
  IDEMPOTENCY_KEY_REUSED: [
    422,
    "Idempotency key ini sudah dipakai untuk data yang berbeda. Buat sesi baru dengan key baru.",
  ],
  MATERIAL_NOT_FOUND: [
    409,
    "Ada material yang tidak ditemukan lagi. Muat ulang daftar material, lalu pilih ulang.",
    "materialIds",
  ],
  MATERIAL_ARCHIVED: [
    409,
    "Ada material yang sudah diarsipkan sehingga tidak dapat masuk Stock Opname. Muat ulang daftar material.",
    "materialIds",
  ],
  MATERIAL_ALREADY_IN_OPNAME: [
    409,
    "Ada material yang sudah berada di sesi Stock Opname aktif lain. Muat ulang daftar material.",
    "materialIds",
  ],
  OPNAME_NOT_FOUND: [404, "Sesi Stock Opname tidak ditemukan."],
  OPNAME_NOT_ACTIVE: [409, "Sesi Stock Opname ini sudah tidak aktif (sudah diposting atau dibatalkan)."],
  OPNAME_CREATOR_ONLY: [403, "Hanya pembuat sesi yang dapat mengisi hasil hitung dan memposting sesi ini."],
  INVALID_COUNTS: [400, "Data hasil hitung tidak valid.", "counts"],
  INVALID_COUNTED_STOCK: [400, "Hasil hitung harus bilangan bulat 0 atau lebih.", "counts"],
  OPNAME_ITEM_NOT_FOUND: [409, "Ada item yang bukan bagian dari sesi ini. Muat ulang data sesi.", "counts"],
  OPNAME_EMPTY: [409, "Sesi tanpa material tidak dapat diposting; batalkan sesi ini."],
  OPNAME_UNCOUNTED: [409, "Masih ada material yang belum dihitung. Isi semua hasil hitung sebelum posting."],
  OPNAME_INVARIANT_VIOLATION: [
    409,
    "Data sesi tidak konsisten dengan stok material (stok berubah sejak snapshot atau pembekuan tidak sesuai). Tidak ada yang diposting; laporkan ke pengelola sistem.",
  ],
  REASON_REQUIRED: [400, "Alasan pembatalan wajib diisi.", "reason"],
  INVALID_REASON: [400, "Alasan maksimal 500 karakter.", "reason"],
};

// PostgreSQL answered with an error, so the RPC's transaction was rolled
// back and nothing changed.
const NOT_APPLIED_SQLSTATES = new Set(["55P03", "40001", "40P01", "57014"]);

// No answer from the database, or the connection broke mid-request: the
// transaction may or may not have committed.
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

export function opnameRpcErrorResponse(error) {
  const code = error?.code;
  const message = error?.message;

  if (code === "P0001" && typeof message === "string" && Object.hasOwn(OPNAME_ERRORS, message)) {
    const [status, text, field] = OPNAME_ERRORS[message];
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

  // Any other database or Data API error, including IDEMPOTENCY_STATE_INVALID.
  // The client treats a 500 as an unknown outcome.
  console.error("[api] stock opname operation failed", code, message);
  return errors.internal();
}

const invalidId = () => errorResponse(400, "INVALID_ID", "ID sesi Stock Opname tidak valid.");

const isUuid = (value) => typeof value === "string" && uuidSchema.safeParse(value).success;

// A successful RPC returns an object naming the session. The RPC returned
// without an error, so its transaction may have committed: an unexpected
// result is reported as an unknown outcome, never as success or "not saved".
function opnameResult(data, id, key, status = 200) {
  if (!data || typeof data !== "object" || !isUuid(data.opname_id) || (id && data.opname_id !== id)) {
    console.error("[api] stock opname operation returned an unexpected result");
    return outcomeUnknown(500);
  }
  return jsonResponse({ [key]: toCommandResult(data) }, status);
}

function toCommandResult(data) {
  const result = { id: data.opname_id };
  if (data.status !== undefined) result.status = data.status;
  if (data.item_count !== undefined) result.itemCount = data.item_count;
  if (data.created_at !== undefined) result.createdAt = data.created_at;
  if (data.updated !== undefined) result.updated = data.updated;
  if (data.posted_at !== undefined) result.postedAt = data.posted_at;
  if (data.cancelled_at !== undefined) result.cancelledAt = data.cancelled_at;
  if (data.released !== undefined) result.released = data.released;
  if (Array.isArray(data.adjustments)) {
    result.adjustments = data.adjustments.map((a) => ({
      itemId: a.item_id,
      materialId: a.material_id,
      quantityDelta: a.quantity_delta,
      transactionId: a.transaction_id,
    }));
  }
  return result;
}

// POST /api/v1/stock-opnames — session with its materials (OD-01).
// Headers: Idempotency-Key: <uuid>. 201 for the first run and for a replay.
export async function createOpname(supabase, body, idempotencyKey) {
  const key = idempotencyKeySchema.safeParse(idempotencyKey ?? undefined);
  if (!key.success) {
    return errorResponse(400, "IDEMPOTENCY_KEY_REQUIRED", "Header Idempotency-Key wajib berupa UUID.");
  }

  const parsed = createOpnameRequestSchema.safeParse(body);
  if (!parsed.success) return errors.validation(fieldErrors(parsed.error));

  const { data, error } = await supabase.rpc("create_stock_opname", {
    p_material_ids: parsed.data.materialIds,
    p_idempotency_key: key.data,
  });

  if (error) return opnameRpcErrorResponse(error);
  return opnameResult(data, null, "opname", 201);
}

// PUT /api/v1/stock-opnames/:id/counts — creator only (OD-02).
export async function recordCounts(supabase, id, body) {
  if (!isUuid(id)) return invalidId();

  const parsed = recordCountsRequestSchema.safeParse(body);
  if (!parsed.success) return errors.validation(fieldErrors(parsed.error));

  const { data, error } = await supabase.rpc("record_stock_opname_counts", {
    p_opname_id: id,
    p_counts: parsed.data.counts.map((c) => ({ item_id: c.itemId, counted_stock: c.countedStock })),
  });

  if (error) return opnameRpcErrorResponse(error);
  return opnameResult(data, id, "result");
}

// POST /api/v1/stock-opnames/:id/post — creator only (OD-16), atomic.
export async function postOpname(supabase, id, body) {
  if (!isUuid(id)) return invalidId();

  const parsed = postOpnameRequestSchema.safeParse(body);
  if (!parsed.success) return errors.validation(fieldErrors(parsed.error));

  const { data, error } = await supabase.rpc("post_stock_opname", { p_opname_id: id });

  if (error) return opnameRpcErrorResponse(error);
  return opnameResult(data, id, "result");
}

// POST /api/v1/stock-opnames/:id/cancel — any Staff, reason required.
export async function cancelOpname(supabase, id, body) {
  if (!isUuid(id)) return invalidId();

  const parsed = cancelOpnameRequestSchema.safeParse(body);
  if (!parsed.success) return errors.validation(fieldErrors(parsed.error));

  const { data, error } = await supabase.rpc("cancel_stock_opname", {
    p_opname_id: id,
    p_reason: parsed.data.reason,
  });

  if (error) return opnameRpcErrorResponse(error);
  return opnameResult(data, id, "result");
}
