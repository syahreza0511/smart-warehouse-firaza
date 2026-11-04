// Server-only: maps errors from public.post_stock_movement to HTTP responses.
// Business codes arrive as SQLSTATE P0001 with the code in the message;
// authorization codes as SQLSTATE 42501 (migration 20261101064015).
import { errorResponse, errors } from "@/lib/server/http";

const BUSINESS_ERRORS = {
  INVALID_QUANTITY: [400, "Jumlah harus bilangan bulat positif dalam rentang yang didukung."],
  INVALID_TRANSACTION_TYPE: [400, "Jenis transaksi tidak didukung."],
  IDEMPOTENCY_KEY_REQUIRED: [400, "Idempotency key wajib dikirim."],
  INVALID_IDEMPOTENCY_KEY: [400, "Idempotency key tidak valid."],
  MATERIAL_NOT_FOUND: [404, "Material tidak ditemukan."],
  MATERIAL_ARCHIVED: [409, "Material sudah diarsipkan dan tidak dapat menerima transaksi."],
  MATERIAL_FROZEN: [409, "Material sedang dalam Stock Opname aktif sehingga stoknya dibekukan."],
  INSUFFICIENT_STOCK: [409, "Stok tidak mencukupi."],
  STOCK_LIMIT_EXCEEDED: [409, "Stok hasil melebihi batas maksimum yang didukung."],
  IDEMPOTENCY_KEY_REUSED: [
    422,
    "Idempotency key ini sudah dipakai untuk data yang berbeda. Kirim transaksi baru dengan key baru.",
  ],
};

// Lock timeout, serialization failure, deadlock, query cancelled, and
// connection loss can succeed on retry with the same idempotency key.
const RETRYABLE_SQLSTATES = new Set(["55P03", "40001", "40P01", "57014", "08000", "08003", "08006"]);

export function stockMovementErrorResponse(error) {
  const code = error?.code;
  const message = error?.message;

  if (code === "P0001" && BUSINESS_ERRORS[message]) {
    const [status, text] = BUSINESS_ERRORS[message];
    return errorResponse(status, message, text);
  }

  if (code === "42501") {
    return message === "FORBIDDEN" ? errors.forbidden() : errors.sessionNotAuthorized();
  }

  if (code === "22P02" || code === "22003") {
    return errorResponse(400, "INVALID_INPUT", "Format data tidak dapat diproses.");
  }

  if (RETRYABLE_SQLSTATES.has(code) || !code) {
    return errorResponse(
      503,
      "RETRYABLE",
      "Transaksi belum dapat diproses. Ulangi dengan data yang sama; transaksi tidak akan tercatat ganda.",
      {},
      { "Retry-After": "2" }
    );
  }

  console.error("[api] stock movement failed", code, message);
  return errors.internal();
}
