// Tab-local recovery of unsaved Stock Opname counts (B4-S7, F1). Kept free of
// React and browser globals so node --test can load it.
//
// Purpose: a browser Back/Forward in the App Router unmounts the detail page
// without any event that can be cancelled, so unsaved inputs were lost. They
// are now kept in sessionStorage (this tab only; never localStorage or
// IndexedDB, never sent to the server) and offered again when the page comes
// back. A restored value is still an UNSAVED draft: it blocks posting until
// it is saved or discarded, and it is reconciled with the server first.
//
// Record (version 1), key "firaza.opnameCountDraft.v1.<userId>.<opnameId>":
//   { v: 1, userId, opnameId, updatedAt: <ms>,
//     drafts: { <itemId>: { text: "<input>", base: <stored count or null>,
//                           conflict?: true } } }
// Nothing else: no credentials, tokens, profile, or material data.
//
// Expiry: 8 hours after the last change (one working shift). sessionStorage
// already ends with the tab; the bound keeps a tab left open overnight from
// offering yesterday's count. An expired, unreadable, or foreign record is
// removed and reported, never applied.
//
// Separate from the create-attempt recovery (firaza.opnameCreate.pending.*).

export const DRAFT_VERSION = 1;
export const DRAFT_TTL_MS = 8 * 60 * 60 * 1000;
export const DRAFT_PREFIX = "firaza.opnameCountDraft.";
const MAX_ITEMS = 500;
const MAX_TEXT = 32;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const draftKey = (userId, opnameId) => `${DRAFT_PREFIX}v${DRAFT_VERSION}.${userId}.${opnameId}`;

function validDraft(d) {
  return (
    d !== null &&
    typeof d === "object" &&
    typeof d.text === "string" &&
    d.text.length <= MAX_TEXT &&
    (d.base === null || (Number.isInteger(d.base) && d.base >= 0 && d.base <= 2147483647)) &&
    (d.conflict === undefined || d.conflict === true)
  );
}

function safeRemove(storage, key) {
  try {
    const had = storage.getItem(key) !== null;
    storage.removeItem(key);
    return had;
  } catch {
    return false;
  }
}

// Returns { status, drafts? }:
//   unavailable  storage missing or throwing
//   none         nothing stored
//   ok           drafts to reconcile
//   expired | corrupt | incompatible   removed, not applied
export function readDraft(storage, userId, opnameId, now) {
  if (!storage) return { status: "unavailable" };
  const key = draftKey(userId, opnameId);
  let raw;
  try {
    raw = storage.getItem(key);
  } catch {
    return { status: "unavailable" };
  }
  if (raw === null) return { status: "none" };
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    safeRemove(storage, key);
    return { status: "corrupt" };
  }
  if (!record || typeof record !== "object" || record.v !== DRAFT_VERSION || record.userId !== userId || record.opnameId !== opnameId) {
    safeRemove(storage, key);
    return { status: "incompatible" };
  }
  const entries = record.drafts && typeof record.drafts === "object" ? Object.entries(record.drafts) : null;
  if (!Number.isFinite(record.updatedAt) || !entries || entries.length > MAX_ITEMS || !entries.every(([id, d]) => UUID.test(id) && validDraft(d))) {
    safeRemove(storage, key);
    return { status: "corrupt" };
  }
  if (now - record.updatedAt > DRAFT_TTL_MS || record.updatedAt > now + 60_000) {
    safeRemove(storage, key);
    return { status: "expired" };
  }
  const drafts = {};
  for (const [id, d] of entries) drafts[id] = d.conflict ? { text: d.text, base: d.base, conflict: true } : { text: d.text, base: d.base };
  return { status: "ok", drafts };
}

// Writes the drafts, or removes the record when there are none. Returns
// false when storage is unavailable or full (the page keeps working without
// recovery).
export function writeDraft(storage, userId, opnameId, drafts, now) {
  if (!storage) return false;
  const key = draftKey(userId, opnameId);
  if (Object.keys(drafts).length === 0) {
    safeRemove(storage, key);
    return true;
  }
  try {
    storage.setItem(key, JSON.stringify({ v: DRAFT_VERSION, userId, opnameId, updatedAt: now, drafts }));
    return true;
  } catch {
    return false;
  }
}

// Returns true when a record existed.
export function removeDraft(storage, userId, opnameId) {
  if (!storage) return false;
  return safeRemove(storage, draftKey(userId, opnameId));
}

// Same-tab logout: drop every count draft of every user in this tab.
export function removeAllDrafts(storage) {
  if (!storage) return 0;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
    return keys.length;
  } catch {
    return 0;
  }
}

// Reconciles stored drafts with the session as the server returned it:
//   - an item the session does not have      -> { kind: "mismatch" } (apply
//     nothing; fail closed)
//   - server already holds the draft value    -> dropped (alreadySaved),
//     e.g. after a save whose response was lost
//   - empty draft over an empty server value  -> dropped
//   - stored base equals the server value     -> restored as an unsaved draft
//   - server value changed since the draft    -> restored with conflict: true
//     (must be reviewed: keep the draft or revert; never saved silently)
// parseCount: (text) => { kind: "empty" | "invalid" | "number", value? }
export function reconcileDrafts(items, stored, parseCount) {
  const byId = new Map(items.map((item) => [item.id, item]));
  if (Object.keys(stored).some((id) => !byId.has(id))) return { kind: "mismatch" };
  const drafts = {};
  let restored = 0;
  let conflicts = 0;
  let alreadySaved = 0;
  for (const [id, d] of Object.entries(stored)) {
    const server = byId.get(id).countedStock;
    const parsed = parseCount(d.text);
    if (parsed.kind === "number" && parsed.value === server) {
      alreadySaved += 1;
      continue;
    }
    if (parsed.kind === "empty" && server === null) continue;
    if (d.base === server && !d.conflict) {
      drafts[id] = { text: d.text, base: d.base };
      restored += 1;
    } else {
      drafts[id] = { text: d.text, base: d.base, conflict: true };
      conflicts += 1;
    }
  }
  return { kind: "ok", drafts, restored, conflicts, alreadySaved };
}
