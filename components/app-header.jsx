"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/components/inventory-format";
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

  return (
    <header className="border-b bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link href="/materials" className="font-semibold text-forest">
            Smart Warehouse Firaza
          </Link>
          <nav aria-label="Navigasi utama" className="flex gap-4 text-sm">
            <Link href="/materials" className="text-forest underline-offset-4 hover:underline">
              Material
            </Link>
            <Link href="/stock-opnames" className="text-forest underline-offset-4 hover:underline">
              Stock Opname
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {user && (
            <span className="text-muted-foreground">
              {user.name} · <span className="font-medium text-foreground">{ROLE_LABEL[user.role] ?? user.role}</span>
            </span>
          )}
          <Button variant="outline" size="sm" onClick={logout} disabled={pending} data-leave-page>
            {pending ? "Keluar…" : "Keluar"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mx-auto max-w-5xl px-4 pb-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </header>
  );
}
