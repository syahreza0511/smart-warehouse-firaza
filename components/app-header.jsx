"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/components/inventory-format";
import { api, toApiError } from "@/lib/api-client";

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
      router.replace("/login");
    } catch (err) {
      const apiError = toApiError(err);
      // LOGOUT_INCOMPLETE: cookies are already cleared on this device.
      if (apiError.code === "LOGOUT_INCOMPLETE") {
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
        <Link href="/materials" className="font-semibold text-forest">
          Smart Warehouse Firaza
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {user && (
            <span className="text-muted-foreground">
              {user.name} · <span className="font-medium text-foreground">{ROLE_LABEL[user.role] ?? user.role}</span>
            </span>
          )}
          <Button variant="outline" size="sm" onClick={logout} disabled={pending}>
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
