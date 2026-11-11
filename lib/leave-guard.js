// Decides whether a click leaves the current page, for guarding unsaved
// input (B4-S6, D12). Kept free of React and the DOM globals so node --test
// can load it.
//
// Guarded: a plain left click on a link to another page of this app (Next.js
// <Link> navigates client-side, so beforeunload never fires for it), a link to
// another site, and any element marked data-leave-page (for example the
// logout button). Not guarded: clicks that open a new tab or window or
// download (modifier keys, middle button, target other than _self,
// download), links to the same page (hash only), and clicks another handler
// already cancelled.
//
// Browser Back/Forward is NOT covered: in the App Router it is a popstate
// navigation that cannot be cancelled without patching history, so it is a
// documented limitation (beforeunload still covers reload and closing).

export const LEAVE_SELECTOR = "a[href], [data-leave-page]";

export function isLeavingNavigation(element, event, location) {
  if (!element || event.defaultPrevented) return false;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (element.hasAttribute("data-leave-page")) return true;

  const target = element.getAttribute("target");
  if (target && target !== "_self") return false;
  if (element.hasAttribute("download")) return false;

  let url;
  try {
    url = new URL(element.getAttribute("href"), location.href);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.origin !== location.origin) return true;
  return url.pathname !== location.pathname || url.search !== location.search;
}
