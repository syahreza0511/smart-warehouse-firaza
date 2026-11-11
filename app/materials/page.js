"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { formatNumber } from "@/components/inventory-format";
import { ErrorState, LoadingState } from "@/components/page-state";
import { StockStatusBadge } from "@/components/stock-status-badge";
import { Button } from "@/components/ui/button";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";

const VIEWS = [
  { key: "active", label: "Aktif", empty: "Belum ada material aktif." },
  { key: "archived", label: "Arsip", empty: "Tidak ada material yang diarsipkan." },
];

export default function MaterialsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const [view, setView] = useState("active");
  const [state, setState] = useState({ status: "loading", materials: [], error: null });
  const isStaff = session.user?.role === "STAFF_WAREHOUSE";
  const archived = view === "archived";

  // Only the latest request may update the list, so a slow answer for the
  // previous tab never replaces the current one.
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState({ status: "loading", materials: [], error: null });
    try {
      const { data } = await api.get("/materials", { params: archived ? { archived: true } : {} });
      if (requestId !== latestRequest.current) return;
      setState({ status: "ready", materials: data.materials, error: null });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      const apiError = toApiError(error);
      if (requiresLogin(apiError)) {
        redirectToLogin(router, pathname, apiError);
        return;
      }
      setState({ status: "error", materials: [], error: apiError });
    }
  }, [archived, router, pathname]);

  useEffect(() => {
    if (session.status === "ready") load();
  }, [session.status, load]);

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl">Material</h1>
            <p className="text-muted-foreground">
              {archived
                ? "Material yang diarsipkan. Histori tetap tersimpan; aktifkan kembali dari halaman detail."
                : "Daftar material aktif beserta stok dan status operasionalnya."}
            </p>
          </div>
          {isStaff && (
            <Button asChild>
              <Link href="/materials/new">Tambah material</Link>
            </Button>
          )}
        </div>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && (
          <>
            <div role="group" aria-label="Tampilan material" className="flex gap-2">
              {VIEWS.map((item) => (
                <Button
                  key={item.key}
                  type="button"
                  size="sm"
                  variant={view === item.key ? "default" : "outline"}
                  aria-pressed={view === item.key}
                  onClick={() => setView(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            {state.status === "loading" && <LoadingState label="Memuat material…" />}
            {state.status === "error" && <ErrorState message={state.error.message} onRetry={load} />}
            {state.status === "ready" && state.materials.length === 0 && (
              <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
                {VIEWS.find((item) => item.key === view).empty}
              </p>
            )}
            {state.status === "ready" && state.materials.length > 0 && (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <caption className="sr-only">{archived ? "Daftar material arsip" : "Daftar material aktif"}</caption>
                  <thead className="bg-muted text-left">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Material</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Kategori</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Satuan</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Stok</th>
                      <th scope="col" className="px-4 py-3 text-right font-semibold">Stok minimum</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.materials.map((material) => (
                      <tr key={material.id} className="border-t">
                        <td className="px-4 py-3">
                          <Link href={`/materials/${material.id}`} className="font-medium text-forest underline-offset-4 hover:underline">
                            {material.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">{material.categoryName}</td>
                        <td className="px-4 py-3">{material.unit}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatNumber(material.currentStock)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatNumber(material.minimumStock)}</td>
                        <td className="px-4 py-3">
                          {material.isArchived ? (
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap">
                              Diarsipkan
                            </span>
                          ) : (
                            <StockStatusBadge status={material.stockStatus} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
