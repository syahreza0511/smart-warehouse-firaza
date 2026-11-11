"use client";

import { useEffect, useRef } from "react";
import { LEAVE_SELECTOR, isLeavingNavigation } from "@/lib/leave-guard";

// Asks before the page is left while `active` (B4-S6, D12):
//   - in-app links, header links, and [data-leave-page] elements: a native
//     confirm dialog. The listener runs in the capture phase on window, so a
//     refused click is stopped before Next.js <Link> handles it. Accepting
//     calls onConfirmLeave (the page drops its now obsolete drafts) and lets
//     the click continue normally.
//   - reload, closing the tab, typing a URL: the browser's beforeunload
//     prompt, skipped once the user already confirmed above (no second
//     dialog).
// Browser Back/Forward is not covered (see lib/leave-guard.js).
export function useLeaveGuard(active, message, onConfirmLeave) {
  const confirmedRef = useRef(false);
  const onConfirmRef = useRef(onConfirmLeave);

  useEffect(() => {
    onConfirmRef.current = onConfirmLeave;
  }, [onConfirmLeave]);

  useEffect(() => {
    if (!active) return undefined;
    confirmedRef.current = false;

    const onBeforeUnload = (event) => {
      if (confirmedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const onClick = (event) => {
      const element = event.target instanceof Element ? event.target.closest(LEAVE_SELECTOR) : null;
      if (!isLeavingNavigation(element, event, window.location)) return;
      if (window.confirm(message)) {
        confirmedRef.current = true;
        onConfirmRef.current?.();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
    };
  }, [active, message]);
}
