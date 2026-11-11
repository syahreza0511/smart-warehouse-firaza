// Zod schemas shared by Client Components (form feedback) and Route Handlers
// (enforcement). The database re-validates everything (ADR-15 B5.3).
import { z } from "zod";

export const MAX_QUANTITY = 2147483647;
export const MAX_NOTES_LENGTH = 500;

export const uuidSchema = z.uuid({ error: "ID tidak valid." });

export const loginSchema = z.object({
  email: z.email({ error: "Masukkan alamat email yang valid." }).max(320),
  password: z
    .string({ error: "Kata sandi wajib diisi." })
    .min(1, { error: "Kata sandi wajib diisi." })
    .max(1024),
});

export const quantitySchema = z
  .number({ error: "Jumlah wajib diisi dengan angka." })
  .int({ error: "Jumlah harus bilangan bulat." })
  .min(1, { error: "Jumlah minimal 1." })
  .max(MAX_QUANTITY, { error: "Jumlah melebihi batas yang didukung." });

// Blank notes are stored as null.
export const notesSchema = z
  .string()
  .trim()
  .max(MAX_NOTES_LENGTH, { error: `Catatan maksimal ${MAX_NOTES_LENGTH} karakter.` })
  .nullish()
  .transform((value) => (value ? value : null));

// Movement types exposed by the API (ADR-15 B5.2). ADJUSTMENT, REVERSAL, and
// OPENING_BALANCE stay database-only.
export const STOCK_MOVEMENT_TYPES = ["STOCK_IN", "STOCK_OUT"];

// Form fields shared by the Stock In and Stock Out forms. Whether a Stock Out
// fits the current balance is decided by the database, not here.
export const stockMovementFormSchema = z.object({
  quantity: quantitySchema,
  notes: notesSchema,
});

export const stockInFormSchema = stockMovementFormSchema;

// Unknown fields, such as a role, are dropped.
export const stockMovementRequestSchema = z.object({
  materialId: uuidSchema,
  type: z.enum(STOCK_MOVEMENT_TYPES, { error: "Jenis transaksi tidak didukung." }),
  quantity: quantitySchema,
  notes: notesSchema,
});

export const idempotencyKeySchema = z.uuid({ error: "Header Idempotency-Key harus berupa UUID." });

// Material management (FR-MAT-01, FR-MAT-02, FR-MAT-10). The same limits are
// enforced by the database functions in migration 20261110090000.
export const MAX_MATERIAL_NAME_LENGTH = 120;
export const MAX_MATERIAL_UNIT_LENGTH = 30;
export const MAX_MINIMUM_STOCK = MAX_QUANTITY;
export const MAX_REASON_LENGTH = 500;

const CONTROL_CHARACTER = /\p{Cc}/u;

// Leading and trailing whitespace is trimmed here; the database rejects any
// that still arrives, so "Kardus" and "Kardus " never become two names.
function materialTextSchema(label, max) {
  return z
    .string({ error: `${label} wajib diisi.` })
    .trim()
    .min(1, { error: `${label} wajib diisi.` })
    .max(max, { error: `${label} maksimal ${max} karakter.` })
    .refine((value) => !CONTROL_CHARACTER.test(value), {
      error: `${label} tidak boleh berisi karakter kontrol.`,
    });
}

export const minimumStockSchema = z
  .number({ error: "Stok minimum wajib diisi dengan angka." })
  .int({ error: "Stok minimum harus bilangan bulat." })
  .min(0, { error: "Stok minimum tidak boleh negatif." })
  .max(MAX_MINIMUM_STOCK, { error: "Stok minimum melebihi batas yang didukung." });

// Create and update share one body: every editable field is sent. Stock is
// never part of it (FR-MAT-04). Unknown fields, such as currentStock or a
// role, are dropped.
export const materialRequestSchema = z.object({
  categoryId: z.uuid({ error: "Pilih kategori." }),
  name: materialTextSchema("Nama material", MAX_MATERIAL_NAME_LENGTH),
  unit: materialTextSchema("Satuan", MAX_MATERIAL_UNIT_LENGTH),
  minimumStock: minimumStockSchema,
});

// Archive and reactivation reason (FR-MAT-06, FR-MAT-08).
export const materialStatusRequestSchema = z.object({
  reason: z
    .string({ error: "Alasan wajib diisi." })
    .trim()
    .min(1, { error: "Alasan wajib diisi." })
    .max(MAX_REASON_LENGTH, { error: `Alasan maksimal ${MAX_REASON_LENGTH} karakter.` }),
});

// Form helper: an empty number input means "not filled", not 0.
export function parseIntegerInput(value) {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : Number(text);
}

export function fieldErrors(zodError) {
  return z.flattenError(zodError).fieldErrors;
}
