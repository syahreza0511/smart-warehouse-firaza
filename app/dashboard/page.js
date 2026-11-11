"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { formatDateTime, formatNumber } from "@/components/inventory-format";
import { ErrorState, LoadingState } from "@/components/page-state";
import { StockStatusBadge } from "@/components/stock-status-badge";
import { Button } from "@/components/ui/button";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";

const CARDS = [
  { key: "totalActive", label: "Total Material Aktif", tone: "text-foreground" },
  { key: "normal", label: "Stok Normal", tone: "text-forest" },
  { key: "lowStock", label: "Stok Rendah", tone: "text-amber-900" },
  { key: "outOfStock", label: "Stok Habis", tone: "text-destructive" },
];

// Inventory dashboard (PRD FR-DASH-01, FR-DASH-02; Project Plan scope #5,
// #6). Owner and Staff read the same data; nothing here changes inventory.
// All numbers come from GET /api/v1/dashboard (exact database counts of
// active materials; status computed by the database). Quantities of
// different units are never added up (OD-14).
export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const [state, setState] = useState({ status: "loading", dashboard: null, error: null });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState((current) => ({ status: "loading", dashboard: current.dashboard, error: null }));
    try {
      const { data } = await api.get("/dashboard");
      if (requestId !== latestRequest.current) return;
      setState({ status: "ready", dashboard: data.dashboard, error: null });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      const apiError = toApiError(error);
      if (requiresLogin(apiError)) {
        redirectToLogin(router, pathname, apiError);
        return;
      }
      setState({ status: "error", dashboard: null, error: apiError });
    }
  }, [router, pathname]);

  useEffect(() => {
    if (session.status === "ready") load();
  }, [session.status, load]);

  const isStaff = session.user?.role === "STAFF_WAREHOUSE";
  const dashboard = state.dashboard;
  const summary = dashboard?.summary;
  const attention = dashboard?.attention;

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl">Dashboard</h1>
            <p className="text-muted-foreground">Kondisi inventori material aktif saat ini.</p>
          </div>
          {state.status === "ready" && (
            <Button type="button" variant="outline" size="sm" onClick={load}>
              Muat ulang
            </Button>
          )}
        </div>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && (
          <>
            {state.status === "loading" && <LoadingState label="Memuat ringkasan inventori…" />}
            {state.status === "error" && <ErrorState message={state.error.message} onRetry={load} />}

            {state.status === "ready" && summary && (
              <>
                <section aria-labelledby="summary-title" className="grid gap-3">
                  <h2 id="summary-title" className="sr-only">
                    Ringkasan stok
                  </h2>
                  <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {CARDS.map((card) => (
                      <div key={card.key} className="rounded-xl border bg-card p-4">
                        <dt className="text-sm text-muted-foreground">{card.label}</dt>
                        <dd className={`mt-1 text-3xl font-semibold tabular-nums ${card.tone}`}>
                          {formatNumber(summary[card.key])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs text-muted-foreground">
                    Material arsip tidak dihitung. Data per {formatDateTime(dashboard.generatedAt)}.
                    {!dashboard.consistent &&
                      " Data berubah saat ringkasan dimuat sehingga angka bisa sedikit berbeda; muat ulang untuk angka terbaru."}
                  </p>
                </section>

                {summary.totalActive === 0 ? (
                  <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
                    <p>Belum ada material aktif.</p>
                    {isStaff && (
                      <Button asChild size="sm" className="mt-3">
                        <Link href="/materials/new">Tambah material</Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <section aria-labelledby="attention-title" className="grid gap-3">
                    <div>
                      <h2 id="attention-title" className="text-lg font-semibold">
                        Material yang perlu perhatian
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Stok habis ditampilkan lebih dulu, lalu stok rendah (stok saat ini tidak melebihi stok minimum).
                      </p>
                    </div>
                    {attention.total === 0 ? (
                      <p role="status" className="rounded-lg bg-sage/60 p-4 text-sm text-forest">
                        Tidak ada material yang perlu perhatian. Semua material aktif berada pada stok normal.
                      </p>
                    ) : (
                      <>
                        <div className="overflow-x-auto rounded-xl border bg-card">
                          <table className="w-full text-sm">
                            <caption className="sr-only">Material dengan stok habis atau rendah</caption>
                            <thead className="bg-muted text-left">
                              <tr>
                                <th scope="col" className="px-4 py-3 font-semibold">Material</th>
                                <th scope="col" className="px-4 py-3 font-semibold">Kategori</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold">Stok</th>
                                <th scope="col" className="px-4 py-3 text-right font-semibold">Stok minimum</th>
                                <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {attention.materials.map((material) => (
                                <tr key={material.id} className="border-t">
                                  <td className="px-4 py-3">
                                    <Link
                                      href={`/materials/${material.id}`}
                                      className="font-medium text-forest underline-offset-4 hover:underline"
                                    >
                                      {material.name}
                                    </Link>
                                  </td>
                                  <td className="px-4 py-3">{material.categoryName}</td>
                                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                                    {formatNumber(material.currentStock)} {material.unit}
                                  </td>
                                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                                    {formatNumber(material.minimumStock)} {material.unit}
                                  </td>
                                  <td className="px-4 py-3">
                                    <StockStatusBadge status={material.stockStatus} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {attention.shown < attention.total && (
                          <p className="text-sm text-muted-foreground">
                            Menampilkan {formatNumber(attention.shown)} dari {formatNumber(attention.total)} material yang
                            perlu perhatian. Lihat semuanya di daftar material.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}

                <section aria-labelledby="report-title" className="grid gap-2 rounded-xl border bg-card p-4">
                  <h2 id="report-title" className="text-lg font-semibold">
                    Kondisi inventori lengkap
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Daftar material memuat setiap material aktif beserta kategori, satuan, stok saat ini, stok minimum, dan
                    status operasionalnya. Material arsip tersedia di tab Arsip.
                  </p>
                  <Button asChild variant="outline" size="sm" className="justify-self-start">
                    <Link href="/materials">Buka daftar material</Link>
                  </Button>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
