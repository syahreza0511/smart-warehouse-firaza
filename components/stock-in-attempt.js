// Stock movement attempt tracking (Stock In and Stock Out), kept free of
// React so it can be tested directly.
//
// A request can commit in PostgreSQL while its HTTP response is lost. Until
// the outcome is known, the attempt (idempotency key + payload) is the only
// safe way to find out: resending it either replays the stored result or
// runs the operation once. So an unresolved attempt is never discarded and
// never replaced by a new key. It is kept in sessionStorage, scoped to the
// movement type, user, and material, so a reload or a trip through /login
// keeps it, and a Stock In attempt never blocks or restores as a Stock Out.
//
// Limits of that storage: sessionStorage belongs to one browser tab. Closing
// the tab, opening the material in another tab or browser, or a browser with
// storage unavailable (some private modes, blocked site data) leaves only the
// in-memory guard of the current page; a fresh page then allows a new key.
// Nothing here protects across browser sessions.

// The STOCK_IN prefix predates Stock Out and is kept so attempts already
// stored by earlier builds are still found.
const STORAGE_PREFIXES = {
  STOCK_IN: "firaza.stockIn.pending.",
  STOCK_OUT: "firaza.stockOut.pending.",
};

// Codes that post_stock_movement raises only after its idempotency lookup
// found no stored result for this user and key (migration 20261101064015,
// step 4). If the original attempt had committed, a resend would have been
// replayed before reaching these checks, so they prove it did not commit.
// MATERIAL_NOT_FOUND is excluded because the function can also raise it
// before the lookup (step 2).
const NOT_COMMITTED_CODES = new Set([
  "MATERIAL_ARCHIVED",
  "MATERIAL_FROZEN",
  "INSUFFICIENT_STOCK",
  "STOCK_LIMIT_EXCEEDED",
]);

export class UnresolvedAttemptError extends Error {
  constructor() {
    super("A stock movement attempt with an unknown outcome must be resolved first.");
    this.name = "UnresolvedAttemptError";
  }
}

function storageKey(type, userId, materialId) {
  const prefix = STORAGE_PREFIXES[type];
  if (!prefix) throw new TypeError(`Unsupported movement type: ${type}`);
  return `${prefix}${userId}.${materialId}`;
}

// `type` defaults to STOCK_IN for callers written before Stock Out existed.
export function loadPendingAttempt(storage, userId, materialId, type = "STOCK_IN") {
  try {
    const raw = storage?.getItem(storageKey(type, userId, materialId));
    if (!raw) return null;
    const attempt = JSON.parse(raw);
    const valid =
      attempt &&
      typeof attempt.key === "string" &&
      attempt.userId === userId &&
      attempt.payload?.materialId === materialId &&
      attempt.payload?.type === type;
    return valid ? attempt : null;
  } catch {
    return null;
  }
}

function savePendingAttempt(storage, attempt) {
  const { type, materialId } = attempt.payload;
  try {
    storage?.setItem(storageKey(type, attempt.userId, materialId), JSON.stringify(attempt));
  } catch {
    // Storage can be unavailable (private mode, quota); the in-memory attempt
    // still protects this page.
  }
}

function clearPendingAttempt(storage, attempt) {
  const { type, materialId } = attempt.payload;
  try {
    storage?.removeItem(storageKey(type, attempt.userId, materialId));
  } catch {
    // See savePendingAttempt.
  }
}

// Starts a new logical submission with a fresh key. Refuses while an earlier
// attempt of the same type for the same user and material is unresolved. The
// attempt is stored before it is sent, so an interrupted page still knows
// about it.
export function beginAttempt({ storage, userId, payload, pending, newKey }) {
  if (!STORAGE_PREFIXES[payload.type]) {
    throw new TypeError(`Unsupported movement type: ${payload.type}`);
  }

  if (pending || loadPendingAttempt(storage, userId, payload.materialId, payload.type)) {
    throw new UnresolvedAttemptError();
  }

  const attempt = { key: newKey(), userId, payload, uncertain: false };
  savePendingAttempt(storage, attempt);
  return attempt;
}

// True when the failure says nothing about whether the attempt committed.
//   - No response or a server error: always unresolved.
//   - First send: any 4xx is the server's answer to this request, which did
//     not commit.
//   - Resend of an uncertain attempt: a 4xx (401, 403, 429, validation, ...)
//     usually comes from a check before the database replay and says nothing
//     about the original. Only a 409 with a code in NOT_COMMITTED_CODES does.
export function isUnresolved(apiError, attempt) {
  if (apiError.status === 0 || apiError.status >= 500) return true;
  if (!attempt.uncertain) return false;
  return !(apiError.status === 409 && NOT_COMMITTED_CODES.has(apiError.code));
}

// Sends the attempt with its original key and payload and classifies the
// result:
//   { outcome: "success", movement }   committed (first run or replay)
//   { outcome: "rejected", error }     the database did not commit it
//   { outcome: "uncertain", error, attempt }  still unknown; resend later
export async function sendAttempt({ attempt, post, toApiError, storage }) {
  try {
    const movement = await post(attempt.payload, attempt.key);
    clearPendingAttempt(storage, attempt);
    return { outcome: "success", movement };
  } catch (error) {
    const apiError = toApiError(error);

    if (isUnresolved(apiError, attempt)) {
      const unresolved = { ...attempt, uncertain: true };
      savePendingAttempt(storage, unresolved);
      return { outcome: "uncertain", error: apiError, attempt: unresolved };
    }

    clearPendingAttempt(storage, attempt);
    return { outcome: "rejected", error: apiError };
  }
}
