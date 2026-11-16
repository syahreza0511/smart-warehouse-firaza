"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { formatDateTime, formatNumber } from "@/components/inventory-format";
import { OpnameStatusBadge, actorLabel } from "@/components/opname-status-badge";
import { ErrorState, LoadingState } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";
import { loadPendingCreate } from "@/lib/stock-opname-outcome";
import { OPNAME_LIST_LIMIT } from "@/lib/validation/stock-opname";

function pendingCreateFor(userId) {
  try {
    return loadPendingCreate(window.sessionStorage, userId);
  } catch {
    return null;
  }
}

const FILTERS = [
  { key: "", label: "Semua", empty: "Belum ada Sesi Pemeriksaan." },
  { key: "ACTIVE", label: "Berlangsung", empty: "Tidak ada Sesi Pemeriksaan yang berlangsung." },
  { key: "POSTED", label: "Difinalisasi", empty: "Belum ada Sesi Pemeriksaan yang difinalisasi." },
  { key: "CANCELLED", label: "Dibatalkan", empty: "Belum ada Sesi Pemeriksaan yang dibatalkan." },
];

// Stock Opname sessions (FR-OPN-01, FR-OPN-02). Owner and Staff read; only
// Staff Warehouse can start a session.
export default function StockOpnamesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const [filter, setFilter] = useState("");
  const [state, setState] = useState({ status: "loading", opnames: [], error: null });
  const isStaff = session.user?.role === "STAFF_WAREHOUSE";
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState({ status: "loading", opnames: [], error: null });
    try {
      const { data } = await api.get("/stock-opnames", { params: filter ? { status: filter } : {} });
      if (requestId !== latestRequest.current) return;
      setState({ status: "ready", opnames: data.opnames, error: null });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      const apiError = toApiError(error);
      if (requiresLogin(apiError)) {
        redirectToLogin(router, pathname, apiError);
        return;
      }
      setState({ status: "error", opnames: [], error: apiError });
    }
  }, [filter, router, pathname]);

  useEffect(() => {
    if (session.status === "ready") load();
  }, [session.status, load]);

  // A create with an unknown outcome stays discoverable from the list too.
  const [pendingCreate, setPendingCreate] = useState(null);
  const userId = session.user?.id;
  useEffect(() => {
    setPendingCreate(userId ? pendingCreateFor(userId) : null);
  }, [userId]);

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl">Pemeriksaan Stok</h1>
            <p className="text-muted-foreground">
              Sesi Pemeriksaan untuk penghitungan fisik. Material di Sesi Pemeriksaan yang berlangsung dibekukan sampai
              sesi difinalisasi atau dibatalkan.
            </p>
          </div>
          {isStaff && (
            <Button asChild>
              <Link href="/stock-opnames/new">Mulai Pemeriksaan</Link>
            </Button>
          )}
        </div>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && (
          <>
            {pendingCreate && (
              <div role="alert" className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <p>
                  Ada permintaan memulai Sesi Pemeriksaan ({pendingCreate.payload.materialIds.length} material) yang
                  statusnya belum pasti di tab ini. Periksa Sesi Pemeriksaan yang berlangsung di bawah, lalu selesaikan di
                  halaman pemulihan.
                </p>
                <Button asChild size="sm" variant="outline" className="justify-self-start">
                  <Link href="/stock-opnames/new">Buka pemulihan permintaan Sesi Pemeriksaan</Link>
                </Button>
              </div>
            )}

            {!isStaff && (
              <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                Anda masuk sebagai Owner: Anda dapat memantau Pemeriksaan Stok, tetapi tidak dapat memulai, menghitung,
                memfinalisasi, atau membatalkan Sesi Pemeriksaan.
              </p>
            )}

            <div role="group" aria-label="Filter status Sesi Pemeriksaan" className="flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <Button
                  key={item.key || "all"}
                  type="button"
                  size="sm"
                  variant={filter === item.key ? "default" : "outline"}
                  aria-pressed={filter === item.key}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            {state.status === "loading" && <LoadingState label="Memuat Pemeriksaan Stok…" />}
            {state.status === "error" && <ErrorState message={state.error.message} onRetry={load} />}
            {state.status === "ready" && state.opnames.length === 0 && (
              <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
                {FILTERS.find((item) => item.key === filter).empty}
              </p>
            )}
            {state.status === "ready" && state.opnames.length > 0 && (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <caption className="sr-only">Daftar Sesi Pemeriksaan</caption>
                  <thead className="bg-muted text-left">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Dibuat</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Pembuat</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Material</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Sudah dihitung</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.opnames.map((opname) => (
                      <tr key={opname.id} className="border-t">
                        <td className="px-4 py-3">
                          <Link
                            href={`/stock-opnames/${opname.id}`}
                            className="font-medium text-forest underline-offset-4 hover:underline"
                          >
                            {formatDateTime(opname.createdAt)}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{actorLabel(opname.createdByMe)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatNumber(opname.itemCount)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatNumber(opname.countedCount)} / {formatNumber(opname.itemCount)}
                        </td>
                        <td className="px-4 py-3">
                          <OpnameStatusBadge status={opname.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {state.status === "ready" && state.opnames.length >= OPNAME_LIST_LIMIT && (
              <p className="text-sm text-muted-foreground">
                Menampilkan {OPNAME_LIST_LIMIT} Sesi Pemeriksaan terbaru. Sesi yang lebih lama belum dapat ditampilkan pada
                versi ini.
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
