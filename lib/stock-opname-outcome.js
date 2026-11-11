// How the browser reads Stock Opname mutation results and keeps local state
// that must not be lost or trusted too early. Kept free of React so
// node --test can load it.
//
// Nothing here resends a request automatically. The user decides, with the
// rules below:
//   - Create has idempotent replay (Idempotency-Key; provisional, OD-20 is
//     still pending Owner approval). After an unknown outcome the attempt
//     (key + material list) is kept until the user resolves it: resending
//     reuses the SAME key and list; a new key is refused meanwhile.
//   - Counts overwrite values, so resending the same counts is harmless.
//     Unsaved inputs are drafts: they block posting and are cleared only
//     after the server data, reloaded after a successful save, shows them.
//   - Post and cancel have no replay. A rejection of a repeat
//     (OPNAME_NOT_ACTIVE) is never shown as the success of an earlier
//     request: the page reloads and shows the session's real status.
import { REJECTED, UNKNOWN, UNKNOWN_OUTCOME_MESSAGE, classifyMutationFailure } from "./mutation-outcome.js";

export { REJECTED, UNKNOWN };

const STATE_CHANGED_ELSEWHERE = {
  OPNAME_NOT_ACTIVE:
    "Sesi ini sudah tidak aktif. Data terbaru dimuat ulang; sesi mungkin sudah diposting atau dibatalkan oleh pengguna lain atau oleh permintaan sebelumnya. Periksa status sesi.",
  OPNAME_NOT_FOUND: "Sesi Stock Opname ini tidak ditemukan.",
  OPNAME_ITEM_NOT_FOUND: "Ada item yang tidak sesuai dengan sesi ini. Data terbaru dimuat ulang.",
};

// Text for a failed count, post, or cancel, and whether the page must reload.
export function describeOpnameFailure(apiError) {
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

// ---------------------------------------------------------------------------
// Create attempts (one unresolved attempt per user and browser tab)
//
// What a response can and cannot prove:
//   - First send, 4xx: the server's answer to that very request, which
//     arrived and did not commit. It cannot arrive again, so the attempt ends.
//   - First send, no answer or 5xx: unknown. The request may still be in
//     flight or may have committed.
//   - Resend (same key), success: the first run or the replay of an earlier
//     commit. Resolved.
//   - Resend, any 4xx (409 MATERIAL_ALREADY_IN_OPNAME, 403 after a role
//     change, ...): says only that THIS resend did not commit. An earlier
//     request that timed out may still be delayed somewhere and arrive later,
//     so nothing proves it never commits. The attempt stays pending, with the
//     conflict noted; the user can resend again (same key, safe) or, after
//     checking the session list, end the tracking manually.
// The tracking is never ended automatically after an unknown outcome.
// ---------------------------------------------------------------------------
const STORAGE_PREFIX = "firaza.opnameCreate.pending.";

export class UnresolvedCreateError extends Error {
  constructor() {
    super("A Stock Opname create attempt with an unknown outcome must be resolved first.");
    this.name = "UnresolvedCreateError";
  }
}

export function loadPendingCreate(storage, userId) {
  try {
    const raw = storage?.getItem(STORAGE_PREFIX + userId);
    if (!raw) return null;
    const attempt = JSON.parse(raw);
    const valid =
      attempt &&
      typeof attempt.key === "string" &&
      attempt.userId === userId &&
      Array.isArray(attempt.payload?.materialIds) &&
      attempt.payload.materialIds.every((id) => typeof id === "string");
    return valid ? attempt : null;
  } catch {
    return null;
  }
}

function savePendingCreate(storage, attempt) {
  try {
    storage?.setItem(STORAGE_PREFIX + attempt.userId, JSON.stringify(attempt));
  } catch {
    // Storage can be unavailable; the in-memory attempt still guards the page.
  }
}

function clearPendingCreate(storage, attempt) {
  try {
    storage?.removeItem(STORAGE_PREFIX + attempt.userId);
  } catch {
    // See savePendingCreate.
  }
}

// True while storage is readable and holds a different attempt (or none):
// the attempt this response belongs to was ended or replaced meanwhile.
function isSuperseded(storage, attempt) {
  if (!storage) return false;
  try {
    const raw = storage.getItem(STORAGE_PREFIX + attempt.userId);
    if (raw === null) return true;
    return JSON.parse(raw)?.key !== attempt.key;
  } catch {
    return false;
  }
}

// Starts a new logical create with a fresh key. The material list is sorted
// so the payload is stable. Refuses while an earlier attempt is unresolved.
export function beginCreate({ storage, userId, materialIds, pending, newKey }) {
  if (pending || loadPendingCreate(storage, userId)) throw new UnresolvedCreateError();
  const attempt = { key: newKey(), userId, payload: { materialIds: [...materialIds].sort() }, uncertain: false };
  savePendingCreate(storage, attempt);
  return attempt;
}

// True when the failure leaves the attempt unresolved (see above).
export function isCreateUnresolved(apiError, attempt) {
  if (apiError.status === 0 || apiError.status >= 500) return true;
  return attempt.uncertain === true;
}

// Sends the attempt with its original key and payload:
//   { outcome: "success", opname }            committed (first run or replay)
//   { outcome: "rejected", error }            first send answered with a 4xx
//   { outcome: "uncertain", error, attempt }  still unknown; kept
//   { outcome: "stale", error }               failed, but storage no longer
//                                             holds this attempt (ended or
//                                             replaced meanwhile, or never
//                                             stored); nothing is written, so
//                                             an ended attempt is not revived
// A success is always reported as success: the session exists. Storage is
// cleared only if it still holds this attempt, never a newer one.
export async function sendCreate({ attempt, post, toApiError, storage }) {
  let opname;
  try {
    opname = await post(attempt.payload, attempt.key);
  } catch (error) {
    const apiError = toApiError(error);
    if (isSuperseded(storage, attempt)) return { outcome: "stale", error: apiError };
    if (isCreateUnresolved(apiError, attempt)) {
      const unresolved = {
        ...attempt,
        uncertain: true,
        lastConflict: apiError.status >= 400 && apiError.status < 500 ? apiError.code ?? "HTTP_ERROR" : null,
      };
      savePendingCreate(storage, unresolved);
      return { outcome: "uncertain", error: apiError, attempt: unresolved };
    }
    clearPendingCreate(storage, attempt);
    return { outcome: "rejected", error: apiError };
  }
  if (!isSuperseded(storage, attempt)) clearPendingCreate(storage, attempt);
  return { outcome: "success", opname };
}

// The user ends the tracking after checking the session list. Only an
// explicit action calls this; it does not claim the request never commits.
export function abandonCreate(storage, attempt) {
  clearPendingCreate(storage, attempt);
}

// ---------------------------------------------------------------------------
// Count drafts (unsaved physical-count inputs)
//
// drafts: { [itemId]: { text, base } } for inputs the user touched. base is
// the stored count when editing started, so a later server change under a
// draft is visible instead of being overwritten silently. A draft only
// counts as unsaved while it differs from the stored value.
// ---------------------------------------------------------------------------
const MAX_COUNT = 2147483647;

export function parseCountText(text) {
  const value = String(text ?? "").trim();
  if (value === "") return { kind: "empty" };
  if (!/^\d+$/.test(value)) return { kind: "invalid", message: "Isi dengan bilangan bulat 0 atau lebih." };
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > MAX_COUNT) {
    return { kind: "invalid", message: "Hasil hitung melebihi batas yang didukung." };
  }
  return { kind: "number", value: number };
}

// A recovered draft whose server value changed keeps conflict: true through
// further edits until the user reviews it (acknowledgeConflict) or reverts.
export function editDraft(drafts, item, text) {
  const current = Object.hasOwn(drafts, item.id) ? drafts[item.id] : null;
  const base = current ? current.base : item.countedStock;
  return { ...drafts, [item.id]: current?.conflict ? { text, base, conflict: true } : { text, base } };
}

// The user reviewed a conflicting recovered draft and keeps it: it becomes an
// ordinary unsaved draft against the CURRENT server value.
export function acknowledgeConflict(drafts, item) {
  if (!Object.hasOwn(drafts, item.id)) return drafts;
  return { ...drafts, [item.id]: { text: drafts[item.id].text, base: item.countedStock } };
}

export function discardDraft(drafts, itemId) {
  const next = { ...drafts };
  delete next[itemId];
  return next;
}

// Every draft that is not yet the stored value:
//   changed  a valid new count (will be sent on save)
//   cleared  emptied input over a stored count; clearing does not delete the
//            stored value, so it cannot be saved and must be discarded or
//            replaced by a number
//   invalid  not a non-negative integer
// serverChanged: the stored value moved since editing started.
// conflict: a recovered draft whose server value changed and that the user
// has not reviewed yet (B4-S7); it blocks saving and posting.
export function pendingCountChanges(items, drafts) {
  const pending = [];
  for (const item of items) {
    if (!Object.hasOwn(drafts, item.id)) continue;
    const draft = drafts[item.id];
    const parsed = parseCountText(draft.text);
    const serverChanged = draft.base !== item.countedStock;
    const conflict = draft.conflict === true;
    if (parsed.kind === "empty") {
      if (item.countedStock !== null) pending.push({ itemId: item.id, kind: "cleared", stored: item.countedStock, serverChanged, conflict });
    } else if (parsed.kind === "invalid") {
      pending.push({ itemId: item.id, kind: "invalid", message: parsed.message, stored: item.countedStock, serverChanged, conflict });
    } else if (parsed.value !== item.countedStock) {
      pending.push({ itemId: item.id, kind: "changed", value: parsed.value, stored: item.countedStock, serverChanged, conflict });
    }
  }
  return pending;
}

// Body for PUT /counts: only valid changed drafts that are not in an
// unreviewed conflict.
export function countsToSave(pending) {
  return pending.filter((p) => p.kind === "changed" && !p.conflict).map((p) => ({ itemId: p.itemId, countedStock: p.value }));
}

// After a successful save AND a reload of the session: drops the drafts the
// reloaded server data now shows exactly as sent. Everything else stays.
export function confirmSavedDrafts(freshItems, drafts, sent) {
  const stored = new Map(freshItems.map((item) => [item.id, item.countedStock]));
  let next = drafts;
  for (const { itemId, countedStock } of sent) {
    const draft = drafts[itemId];
    if (!draft) continue;
    const parsed = parseCountText(draft.text);
    if (parsed.kind === "number" && parsed.value === countedStock && stored.get(itemId) === countedStock) {
      next = discardDraft(next, itemId);
    }
  }
  return next;
}

// Posting is allowed only with no unsaved draft and no save in flight. Read
// at click time from the latest state, never from a cached summary.
export function postingBlockedReason({ pendingCount, saving }) {
  if (saving) return "Hasil hitung sedang disimpan. Tunggu sampai selesai sebelum posting.";
  if (pendingCount > 0) {
    return `Ada ${pendingCount} perubahan hasil hitung yang belum disimpan. Simpan atau buang perubahan itu sebelum posting; posting memakai hasil hitung yang tersimpan di server.`;
  }
  return null;
}
