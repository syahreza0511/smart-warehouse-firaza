"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { formatNumber } from "@/components/inventory-format";
import { ErrorState, LoadingState } from "@/components/page-state";
import { StockStatusBadge } from "@/components/stock-status-badge";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";

export default function MaterialsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const [state, setState] = useState({ status: "loading", materials: [], error: null });

  const load = useCallback(async () => {
    setState({ status: "loading", materials: [], error: null });
    try {
      const { data } = await api.get("/materials");
      setState({ status: "ready", materials: data.materials, error: null });
    } catch (error) {
      const apiError = toApiError(error);
      if (requiresLogin(apiError)) {
        redirectToLogin(router, pathname, apiError);
        return;
      }
      setState({ status: "error", materials: [], error: apiError });
    }
  }, [router, pathname]);

  useEffect(() => {
    if (session.status === "ready") load();
  }, [session.status, load]);

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <div>
          <h1 className="text-2xl md:text-3xl">Material</h1>
          <p className="text-muted-foreground">Daftar material aktif beserta stok dan status operasionalnya.</p>
        </div>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && (
          <>
            {state.status === "loading" && <LoadingState label="Memuat material…" />}
            {state.status === "error" && <ErrorState message={state.error.message} onRetry={load} />}
            {state.status === "ready" && state.materials.length === 0 && (
              <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">Belum ada material.</p>
            )}
            {state.status === "ready" && state.materials.length > 0 && (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <caption className="sr-only">Daftar material</caption>
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
                          <StockStatusBadge status={material.stockStatus} />
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
