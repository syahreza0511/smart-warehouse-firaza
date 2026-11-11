"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readDraft, reconcileDrafts, removeDraft, writeDraft } from "@/lib/opname-draft-store";
import { parseCountText } from "@/lib/stock-opname-outcome";

function tabStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

// Keeps unsaved counts of one Stock Opname session in this tab's
// sessionStorage and offers them again when the page comes back (B4-S7, F1).
//
//   - Restores once per (user, session), only after the session and its
//     saved counts were loaded from the server, only while the session is
//     ACTIVE and this user may count; restored values are reconciled with the
//     server (lib/opname-draft-store.js) and stay unsaved drafts.
//   - Persists the unsaved drafts after every change; an empty set removes
//     the record (successful save + reload, discard, nothing left).
//   - Removes the record once the session is seen terminal or not countable.
//   - Never removes a record just because the page unmounts, and never
//     writes anything to the server.
//
// Returns { notice, clearNotice, discardStored } where notice describes what
// happened on restore (for the page to show).
export function useCountDraftPersistence({ userId, opname, drafts, setDrafts, pending }) {
  const [notice, setNotice] = useState(null);
  const [readyKey, setReadyKey] = useState(null);
  const blockedKeyRef = useRef(null);
  const key = userId && opname ? `${userId}:${opname.id}` : null;
  const editable = Boolean(opname && opname.status === "ACTIVE" && opname.permissions.canCount);

  // Restore (once per key) and terminal cleanup (every load).
  useEffect(() => {
    if (!key) return;
    const storage = tabStorage();
    if (!editable) {
      if (removeDraft(storage, userId, opname.id) && readyKey !== key) {
        setNotice({ kind: "terminal" });
      }
      setReadyKey(null);
      return;
    }
    if (readyKey === key || blockedKeyRef.current === key) return;

    const stored = readDraft(storage, userId, opname.id, Date.now());
    if (stored.status === "ok") {
      const result = reconcileDrafts(opname.items, stored.drafts, parseCountText);
      if (result.kind === "mismatch") {
        // Fail closed: apply nothing and stop persisting until the user
        // removes the record, so it is not overwritten silently.
        blockedKeyRef.current = key;
        setNotice({ kind: "mismatch" });
        return;
      }
      setDrafts((current) => ({ ...result.drafts, ...current }));
      if (result.restored || result.conflicts || result.alreadySaved) {
        setNotice({ kind: "restored", restored: result.restored, conflicts: result.conflicts, alreadySaved: result.alreadySaved });
      }
    } else if (stored.status === "expired" || stored.status === "corrupt" || stored.status === "incompatible") {
      setNotice({ kind: stored.status });
    }
    setReadyKey(key);
  }, [key, editable, userId, opname, readyKey, setDrafts]);

  // Persist after every change, once restoration for this key is done.
  useEffect(() => {
    if (!key || readyKey !== key || !editable) return;
    const keep = {};
    for (const change of pending) {
      if (Object.hasOwn(drafts, change.itemId)) keep[change.itemId] = drafts[change.itemId];
    }
    writeDraft(tabStorage(), userId, opname.id, keep, Date.now());
  }, [key, readyKey, editable, userId, opname, drafts, pending]);

  // Synchronous removal for discards that are immediately followed by
  // navigation (the persist effect may not run before the page unmounts).
  const discardStored = useCallback(() => {
    if (userId && opname) removeDraft(tabStorage(), userId, opname.id);
    if (key && blockedKeyRef.current === key) {
      // The mismatching record is gone: nothing left to restore, persisting
      // can start for this key.
      blockedKeyRef.current = null;
      setNotice(null);
      setReadyKey(key);
    }
  }, [userId, opname, key]);

  const clearNotice = useCallback(() => setNotice(null), []);

  return { notice, clearNotice, discardStored };
}
