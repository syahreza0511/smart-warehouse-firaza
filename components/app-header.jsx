"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { api, toApiError } from "@/lib/api-client";
import { removeAllDrafts } from "@/lib/opname-draft-store";

// Same-tab logout removes every Stock Opname count draft kept in this tab
// (B4-S7), so the next account to sign in here never sees them.
function clearTabCountDrafts() {
  try {
    removeAllDrafts(window.sessionStorage);
  } catch {
    // storage unavailable: nothing was stored
  }
}

// Navigation and logout for signed-in pages. The layout (sidebar, mobile top
// bar, drawer) lives in AppShell; the logout logic stays here, unchanged.
export function AppHeader({ user }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function logout() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api.post("/auth/logout");
      clearTabCountDrafts();
      router.replace("/login");
    } catch (err) {
      const apiError = toApiError(err);
      // LOGOUT_INCOMPLETE: cookies are already cleared on this device.
      if (apiError.code === "LOGOUT_INCOMPLETE") {
        clearTabCountDrafts();
        router.replace("/login");
        return;
      }
      setError(apiError.message);
      setPending(false);
    }
  }

  // Rendered in the sidebar and in the drawer (only one is visible at a time).
  const logoutControl = (place) => (
    <Button key={place} variant="secondary" onClick={logout} disabled={pending} data-leave-page className="h-11 w-full">
      {pending ? "Keluar…" : "Keluar"}
    </Button>
  );

  return <AppShell user={user} logoutControl={logoutControl} error={error} />;
}
