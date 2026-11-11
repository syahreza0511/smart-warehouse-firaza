"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { MaterialForm } from "@/components/material-form";
import { ErrorState, LoadingState } from "@/components/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/components/use-categories";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";

// Edit name, category, unit, and minimum stock (FR-MAT-01, FR-MAT-03).
// Archived materials cannot be edited until reactivated (FR-MAT-11).
export default function EditMaterialPage() {
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const isStaff = session.user?.role === "STAFF_WAREHOUSE";
  const [state, setState] = useState({ status: "loading", material: null, management: null, error: null });

  const handleAuthError = useCallback(
    (apiError) => {
      if (requiresLogin(apiError)) redirectToLogin(router, pathname, apiError);
    },
    [router, pathname]
  );

  const categories = useCategories(session.status === "ready" && isStaff, handleAuthError);

  const load = useCallback(async () => {
    setState({ status: "loading", material: null, management: null, error: null });
    try {
      const { data } = await api.get(`/materials/${id}`);
      setState({ status: "ready", material: data.material, management: data.management, error: null });
    } catch (error) {
      const apiError = toApiError(error);
      if (requiresLogin(apiError)) {
        redirectToLogin(router, pathname, apiError);
        return;
      }
      setState({ status: "error", material: null, management: null, error: apiError });
    }
  }, [id, router, pathname]);

  useEffect(() => {
    if (session.status === "ready" && isStaff) load();
  }, [session.status, isStaff, load]);

  async function updateMaterial(payload) {
    try {
      await api.put(`/materials/${id}`, payload);
      router.push(`/materials/${id}`);
    } catch (error) {
      const apiError = toApiError(error);
      handleAuthError(apiError);
      throw apiError;
    }
  }

  const { material, management } = state;

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
        <Link href={`/materials/${id}`} className="text-sm text-forest underline-offset-4 hover:underline">
          ← Kembali ke detail material
        </Link>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && !isStaff && (
          <p className="rounded-lg border bg-card p-6 text-muted-foreground">
            Anda masuk sebagai Owner. Owner dapat melihat material, tetapi tidak dapat mengubahnya.
          </p>
        )}

        {session.status === "ready" && isStaff && (
          <>
            {state.status === "loading" && <LoadingState label="Memuat material…" />}
            {state.status === "error" && (
              <ErrorState
                message={state.error.message}
                onRetry={state.error.status === 404 || state.error.status === 400 ? undefined : load}
              />
            )}
            {state.status === "ready" && material.isArchived && (
              <p role="status" className="rounded-lg border bg-card p-6 text-muted-foreground">
                Material ini diarsipkan dan tidak dapat diubah. Aktifkan kembali material dari halaman detail sebelum
                mengubah datanya.
              </p>
            )}
            {state.status === "ready" && !material.isArchived && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h1 className="m-0 text-2xl">Ubah material</h1>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Stok tidak diubah dari sini. Stok hanya berubah lewat transaksi dan Stock Opname.
                  </p>
                </CardHeader>
                <CardContent>
                  {(categories.status === "idle" || categories.status === "loading") && (
                    <LoadingState label="Memuat kategori…" />
                  )}
                  {categories.status === "error" && (
                    <ErrorState message={categories.error.message} onRetry={categories.reload} />
                  )}
                  {categories.status === "ready" && (
                    <MaterialForm
                      categories={categories.categories}
                      initial={material}
                      unitLocked={management?.unitLocked ?? true}
                      submitLabel="Simpan perubahan"
                      cancelHref={`/materials/${id}`}
                      onSubmit={updateMaterial}
                      reconcile={{ label: "Muat ulang data material", run: () => load() }}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </>
  );
}
