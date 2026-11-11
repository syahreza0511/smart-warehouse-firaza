// Request schemas for Stock Opname (FR-OPN-01, FR-OPN-06, FR-OPN-14). The
// same limits are enforced by the database functions in migration
// 20261110120000; these only give early, field-level errors.
//
// Relative imports keep this module loadable by node --test.
import { z } from "zod";
import { MAX_QUANTITY, MAX_REASON_LENGTH } from "./schemas.js";

export const MAX_OPNAME_MATERIALS = 200;
export const MAX_OPNAME_COUNTS = 500;

// Known MVP limitation (B4-S2 L-6): the session list returns only the most
// recent 100 sessions; there is no pagination yet.
export const OPNAME_LIST_LIMIT = 100;
export const OPNAME_STATUSES = ["ACTIVE", "POSTED", "CANCELLED"];

// Materials are chosen when the session is created (OD-01). Each material at
// most once; the database rejects duplicates as well.
export const createOpnameRequestSchema = z.object({
  materialIds: z
    .array(z.uuid({ error: "ID material tidak valid." }), { error: "Pilih minimal satu material." })
    .min(1, { error: "Pilih minimal satu material." })
    .max(MAX_OPNAME_MATERIALS, { error: `Maksimal ${MAX_OPNAME_MATERIALS} material per sesi.` })
    .refine((ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length, {
      error: "Material yang sama tidak boleh dipilih dua kali.",
    }),
});

export const countedStockSchema = z
  .number({ error: "Hasil hitung wajib diisi dengan angka." })
  .int({ error: "Hasil hitung harus bilangan bulat." })
  .min(0, { error: "Hasil hitung tidak boleh negatif." })
  .max(MAX_QUANTITY, { error: "Hasil hitung melebihi batas yang didukung." });

// Physical counts for one or more items of the session. A count replaces the
// previous value (SET semantics, FR-OPN-06); it is never added to it.
export const recordCountsRequestSchema = z.object({
  counts: z
    .array(
      z.object({
        itemId: z.uuid({ error: "ID item tidak valid." }),
        countedStock: countedStockSchema,
      }),
      { error: "Isi minimal satu hasil hitung." }
    )
    .min(1, { error: "Isi minimal satu hasil hitung." })
    .max(MAX_OPNAME_COUNTS, { error: `Maksimal ${MAX_OPNAME_COUNTS} hasil hitung sekaligus.` })
    .refine((counts) => new Set(counts.map((c) => c.itemId.toLowerCase())).size === counts.length, {
      error: "Satu item hanya boleh diisi sekali per penyimpanan.",
    }),
});

// Posting takes no input: the session, its items, and their counts are read
// in the database. Unknown fields (a stock value, an actor) are dropped.
export const postOpnameRequestSchema = z.object({});

export const cancelOpnameRequestSchema = z.object({
  reason: z
    .string({ error: "Alasan pembatalan wajib diisi." })
    .trim()
    .min(1, { error: "Alasan pembatalan wajib diisi." })
    .max(MAX_REASON_LENGTH, { error: `Alasan maksimal ${MAX_REASON_LENGTH} karakter.` }),
});

export const opnameStatusFilterSchema = z.enum(OPNAME_STATUSES, { error: "Status harus ACTIVE, POSTED, atau CANCELLED." });
