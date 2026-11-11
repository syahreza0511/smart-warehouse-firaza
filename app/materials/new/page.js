"use client";

import { useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { MaterialForm } from "@/components/material-form";
import { ErrorState, LoadingState } from "@/components/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCategories } from "@/components/use-categories";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";

// New material (FR-MAT-01). Stock starts at 0; opening stock is recorded
// afterwards as a Stock In with the note "Saldo awal" (OD-17).
export default function NewMaterialPage() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const isStaff = session.user?.role === "STAFF_WAREHOUSE";

  const handleAuthError = useCallback(
    (apiError) => {
      if (requiresLogin(apiError)) redirectToLogin(router, pathname, apiError);
    },
    [router, pathname]
  );

  const categories = useCategories(session.status === "ready" && isStaff, handleAuthError);

  async function createMaterial(payload) {
    try {
      const { data } = await api.post("/materials", payload);
      router.push(`/materials/${data.material.id}`);
    } catch (error) {
      const apiError = toApiError(error);
      handleAuthError(apiError);
      throw apiError;
    }
  }

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
        <Link href="/materials" className="text-sm text-forest underline-offset-4 hover:underline">
          ← Kembali ke daftar material
        </Link>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && !isStaff && (
          <p className="rounded-lg border bg-card p-6 text-muted-foreground">
            Anda masuk sebagai Owner. Owner dapat melihat material, tetapi tidak dapat menambah material.
          </p>
        )}

        {session.status === "ready" && isStaff && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h1 className="m-0 text-2xl">Tambah material</h1>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Material baru dimulai dengan stok 0. Catat stok awal lewat Stock In dengan catatan &ldquo;Saldo
                awal&rdquo; setelah material tersimpan.
              </p>
            </CardHeader>
            <CardContent>
              {(categories.status === "idle" || categories.status === "loading") && (
                <LoadingState label="Memuat kategori…" />
              )}
              {categories.status === "error" && (
                <ErrorState message={categories.error.message} onRetry={categories.reload} />
              )}
              {categories.status === "ready" && categories.categories.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Belum ada kategori. Kategori disiapkan oleh pengelola sistem dan belum dapat ditambah dari aplikasi.
                </p>
              )}
              {categories.status === "ready" && categories.categories.length > 0 && (
                <MaterialForm
                  categories={categories.categories}
                  submitLabel="Simpan material"
                  cancelHref="/materials"
                  onSubmit={createMaterial}
                  reconcile={{
                    label: "Buka daftar material untuk memeriksa",
                    run: () => router.push("/materials"),
                  }}
                />
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
