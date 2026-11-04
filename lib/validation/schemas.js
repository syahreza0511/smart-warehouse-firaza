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

export function fieldErrors(zodError) {
  return z.flattenError(zodError).fieldErrors;
}
