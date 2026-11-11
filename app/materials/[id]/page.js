"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { TRANSACTION_LABEL, formatDateTime, formatDelta, formatNumber } from "@/components/inventory-format";
import { MaterialStatusPanel } from "@/components/material-status-panel";
import { ErrorState, LoadingState } from "@/components/page-state";
import { StockInForm } from "@/components/stock-in-form";
import { StockOutForm } from "@/components/stock-out-form";
import { StockStatusBadge } from "@/components/stock-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";

const STATUS_EVENT_LABEL = {
  ARCHIVED: "Diarsipkan",
  REACTIVATED: "Diaktifkan kembali",
};

export default function MaterialDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const [state, setState] = useState({
    status: "loading",
    material: null,
    management: null,
    transactions: [],
    events: [],
    error: null,
  });

  // Balance, state, and history always come from the API, including after a
  // stock movement or a status change.
  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setState((s) => ({ ...s, status: "loading", error: null }));
      try {
        const [materialRes, historyRes, eventsRes] = await Promise.all([
          api.get(`/materials/${id}`),
          api.get(`/materials/${id}/transactions`, { params: { limit: 20 } }),
          api.get(`/materials/${id}/status-events`, { params: { limit: 20 } }),
        ]);
        setState({
          status: "ready",
          material: materialRes.data.material,
          management: materialRes.data.management,
          transactions: historyRes.data.transactions,
          events: eventsRes.data.events,
          error: null,
        });
      } catch (error) {
        const apiError = toApiError(error);
        if (requiresLogin(apiError)) {
          redirectToLogin(router, pathname, apiError);
          return;
        }
        setState((s) => ({ ...s, status: "error", error: apiError }));
      }
    },
    [id, router, pathname]
  );

  useEffect(() => {
    if (session.status === "ready") load();
  }, [session.status, load]);

  const handleAuthError = useCallback(
    (apiError) => {
      if (requiresLogin(apiError)) redirectToLogin(router, pathname, apiError);
    },
    [router, pathname]
  );

  // A 409 (insufficient stock, frozen, archived) means the balance or state
  // shown may be stale; reload it without hiding the form.
  const handleRejected = useCallback(
    (apiError) => {
      if (apiError.status === 409) load({ quiet: true });
    },
    [load]
  );

  const { material, management, transactions, events } = state;
  const isStaff = session.user?.role === "STAFF_WAREHOUSE";

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <Link href="/materials" className="text-sm text-forest underline-offset-4 hover:underline">
          ← Kembali ke daftar material
        </Link>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && state.status === "loading" && !material && <LoadingState label="Memuat material…" />}
        {session.status === "ready" && state.status === "error" && (
          <ErrorState
            message={state.error.message}
            onRetry={state.error.status === 404 || state.error.status === 400 ? undefined : () => load()}
          />
        )}

        {session.status === "ready" && material && state.status !== "error" && (
          <>
            {material.isArchived && (
              <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                Material ini diarsipkan{material.archivedAt ? ` sejak ${formatDateTime(material.archivedAt)}` : ""}. Material
                arsip tidak dapat dipakai untuk Stock In, Stock Out, atau Stock Opname baru, dan datanya tidak dapat
                diubah sebelum diaktifkan kembali.
              </p>
            )}

            <section aria-labelledby="material-title" className="grid gap-4 md:grid-cols-[1fr_1fr]">
              <Card>
                <CardHeader>
                  <p className="text-sm text-muted-foreground">{material.categoryName}</p>
                  <CardTitle>
                    <h1 id="material-title" className="m-0 text-2xl">
                      {material.name}
                    </h1>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-sm text-muted-foreground">Stok saat ini</dt>
                      <dd className="m-0 text-3xl font-bold tabular-nums">
                        {formatNumber(material.currentStock)} <span className="text-base font-normal">{material.unit}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted-foreground">Stok minimum</dt>
                      <dd className="m-0 text-xl tabular-nums">
                        {formatNumber(material.minimumStock)} {material.unit}
                      </dd>
                    </div>
                  </dl>
                  <div>
                    {material.isArchived ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
                        Diarsipkan
                      </span>
                    ) : (
                      <StockStatusBadge status={material.stockStatus} />
                    )}
                  </div>
                  {material.isFrozen && (
                    <p className="text-sm text-amber-900">Material sedang dalam Stock Opname aktif; stok dibekukan.</p>
                  )}
                  {isStaff && !material.isArchived && (
                    <Button asChild variant="outline" size="sm" className="justify-self-start">
                      <Link href={`/materials/${material.id}/edit`}>Ubah data material</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>

              {isStaff ? (
                <div className="grid content-start gap-4">
                  {material.isArchived ? (
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          <h2 className="m-0 text-lg">Transaksi stok</h2>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Stock In dan Stock Out tidak tersedia untuk material arsip. Aktifkan kembali material lebih
                          dulu.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle>
                            <h2 className="m-0 text-lg">Stock In</h2>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {material.isFrozen ? (
                            <p className="text-sm text-muted-foreground">Stock In tidak tersedia selama Stock Opname aktif.</p>
                          ) : (
                            <StockInForm
                              material={material}
                              userId={session.user.id}
                              onSuccess={() => load({ quiet: true })}
                              onAuthError={handleAuthError}
                            />
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>
                            <h2 className="m-0 text-lg">Stock Out</h2>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {material.isFrozen ? (
                            <p className="text-sm text-muted-foreground">Stock Out tidak tersedia selama Stock Opname aktif.</p>
                          ) : (
                            <StockOutForm
                              material={material}
                              userId={session.user.id}
                              onSuccess={() => load({ quiet: true })}
                              onRejected={handleRejected}
                              onAuthError={handleAuthError}
                            />
                          )}
                        </CardContent>
                      </Card>
                    </>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="m-0 text-lg">{material.isArchived ? "Aktifkan kembali" : "Arsip dan hapus"}</h2>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <MaterialStatusPanel
                        material={material}
                        management={management}
                        onChanged={load}
                        onDeleted={() => router.replace("/materials")}
                        onAuthError={handleAuthError}
                      />
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      <h2 className="m-0 text-lg">Transaksi stok</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Anda masuk sebagai Owner. Owner dapat melihat stok dan histori, tetapi tidak dapat mencatat Stock In
                      maupun Stock Out atau mengubah material.
                    </p>
                  </CardContent>
                </Card>
              )}
            </section>

            <section aria-labelledby="history-title" className="grid gap-3">
              <h2 id="history-title" className="text-lg font-semibold">
                Histori transaksi terbaru
              </h2>
              {transactions.length === 0 ? (
                <p className="rounded-lg border bg-card p-6 text-center text-muted-foreground">Belum ada transaksi.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Histori transaksi {material.name}</caption>
                    <thead className="bg-muted text-left">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">Waktu</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Jenis</th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold">Jumlah</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Catatan</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Oleh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="border-t">
                          <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(tx.createdAt)}</td>
                          <td className="px-4 py-3">{TRANSACTION_LABEL[tx.type] ?? tx.type}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {formatDelta(tx.quantityDelta)} {material.unit}
                          </td>
                          <td className="px-4 py-3">{tx.notes ?? "—"}</td>
                          <td className="px-4 py-3">{tx.createdByMe ? "Anda" : "Pengguna lain"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {events.length > 0 && (
              <section aria-labelledby="status-history-title" className="grid gap-3">
                <h2 id="status-history-title" className="text-lg font-semibold">
                  Riwayat arsip
                </h2>
                <div className="overflow-x-auto rounded-xl border bg-card">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Riwayat arsip {material.name}</caption>
                    <thead className="bg-muted text-left">
                      <tr>
                        <th scope="col" className="px-4 py-3 font-semibold">Waktu</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Peristiwa</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Alasan</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Oleh</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id} className="border-t">
                          <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(event.createdAt)}</td>
                          <td className="px-4 py-3">{STATUS_EVENT_LABEL[event.type] ?? event.type}</td>
                          <td className="px-4 py-3 whitespace-pre-line">{event.reason}</td>
                          <td className="px-4 py-3">{event.createdByMe ? "Anda" : "Pengguna lain"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
