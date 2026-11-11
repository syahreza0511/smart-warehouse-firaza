// How the browser reads a failed material mutation (create, update, delete,
// archive, reactivate). None of these has idempotent replay, so the UI never
// resends one automatically and never treats a rejection of a repeat
// (NAME_TAKEN, ALREADY_ARCHIVED, NOT_ARCHIVED, MATERIAL_NOT_FOUND) as proof
// that an earlier request succeeded. No imports, so node --test can load it.

export const REJECTED = "rejected";
export const UNKNOWN = "unknown";

// REJECTED: the server answered that nothing was changed: a 4xx (validation,
// authorization, business rule) or OPERATION_NOT_APPLIED (the database
// rolled the change back).
// UNKNOWN: no answer (network error, timeout) or any other server error.
// The change may or may not have been saved, so the user must reload and
// check the current data before deciding to send anything again.
export function classifyMutationFailure(apiError) {
  if (apiError?.code === "OPERATION_NOT_APPLIED") return REJECTED;

  const status = apiError?.status;
  if (Number.isInteger(status) && status >= 400 && status < 500) return REJECTED;

  return UNKNOWN;
}

export const UNKNOWN_OUTCOME_MESSAGE =
  "Hasil perubahan belum diketahui: mungkin sudah tersimpan, mungkin belum. Jangan mengirim ulang sebelum memeriksa data terbaru.";

// Rejections that only say the current state differs from what this page
// showed. They are not a confirmation of this user's earlier request: the
// change may have come from another user.
const STATE_CHANGED_ELSEWHERE = {
  ALREADY_ARCHIVED:
    "Material ini sudah berstatus arsip. Data terbaru dimuat ulang; perubahan status mungkin dilakukan oleh pengguna lain.",
  NOT_ARCHIVED:
    "Material ini sudah tidak berstatus arsip. Data terbaru dimuat ulang; perubahan status mungkin dilakukan oleh pengguna lain.",
  MATERIAL_NOT_FOUND:
    "Material ini tidak ditemukan lagi. Material mungkin sudah dihapus, termasuk oleh pengguna lain.",
};

// Text for a failed status change or delete, and whether the page must
// reload its data. Rejections caused by stale data (409, 404) and unknown
// outcomes reload; validation and authorization errors do not.
export function describeMutationFailure(apiError) {
  if (classifyMutationFailure(apiError) === UNKNOWN) {
    return { outcome: UNKNOWN, message: UNKNOWN_OUTCOME_MESSAGE, reload: true };
  }

  const code = apiError?.code;
  if (typeof code === "string" && Object.hasOwn(STATE_CHANGED_ELSEWHERE, code)) {
    return { outcome: REJECTED, message: STATE_CHANGED_ELSEWHERE[code], reload: true };
  }

  return {
    outcome: REJECTED,
    message: apiError?.message ?? "Permintaan ditolak.",
    reload: apiError?.status === 409 || apiError?.code === "OPERATION_NOT_APPLIED",
  };
}
