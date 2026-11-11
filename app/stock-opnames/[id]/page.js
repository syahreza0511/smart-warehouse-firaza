"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { formatDateTime, formatNumber } from "@/components/inventory-format";
import { OpnameActions } from "@/components/opname-actions";
import { OpnameCountForm } from "@/components/opname-count-form";
import { OpnameStatusBadge, actorLabel } from "@/components/opname-status-badge";
import { ErrorState, LoadingState } from "@/components/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";
import { pendingCountChanges, postingBlockedReason } from "@/lib/stock-opname-outcome";
import { useLeaveGuard } from "@/components/use-leave-guard";
import { useCountDraftPersistence } from "@/components/use-count-draft-persistence";

function DraftRecoveryNotice({ notice, onClose, onDiscardStored }) {
  if (!notice) return null;
  const text = {
    restored: () =>
      [
        notice.restored + notice.conflicts > 0 &&
          `${notice.restored + notice.conflicts} hasil hitung dipulihkan dari draf di tab ini dan BELUM disimpan ke server. Simpan atau buang sebelum posting.`,
        notice.conflicts > 0 &&
          `${notice.conflicts} di antaranya berkonflik karena nilai di server sudah berubah; tinjau baris bertanda konflik.`,
        notice.alreadySaved > 0 &&
          `${notice.alreadySaved} draf ternyata sudah tersimpan di server, jadi tidak dipulihkan.`,
      ]
        .filter(Boolean)
        .join(" "),
    expired: () => "Draf hitungan di tab ini berumur lebih dari 8 jam, jadi tidak dipulihkan dan sudah dihapus.",
    corrupt: () => "Draf hitungan di tab ini tidak dapat dibaca, jadi tidak dipulihkan dan sudah dihapus.",
    incompatible: () => "Draf hitungan di tab ini tidak sesuai dengan akun atau sesi ini, jadi tidak dipulihkan dan sudah dihapus.",
    terminal: () => "Sesi ini sudah tidak dapat dihitung, jadi draf hitungan lama di tab ini dihapus.",
    mismatch: () =>
      "Draf hitungan di tab ini tidak cocok dengan daftar material sesi ini, jadi tidak dipulihkan. Hapus draf lokal itu untuk melanjutkan; nilai di server tidak berubah.",
  }[notice.kind]?.();
  if (!text) return null;
  const warn = notice.kind === "mismatch" || notice.conflicts > 0 || notice.kind === "restored";
  return (
    <div role="status" className={`grid gap-2 rounded-lg p-3 text-sm ${warn ? "bg-amber-50 text-amber-950" : "bg-muted text-foreground"}`}>
      <p>{text}</p>
      <div className="flex flex-wrap gap-3">
        {notice.kind === "mismatch" ? (
          <button type="button" className="underline underline-offset-2" onClick={onDiscardStored}>
            Hapus draf lokal
          </button>
        ) : (
          <button type="button" className="underline underline-offset-2" onClick={onClose}>
            Tutup pesan
          </button>
        )}
      </div>
    </div>
  );
}

const LEAVE_MESSAGE =
  "Ada hasil hitung yang belum disimpan. Tinggalkan halaman ini dan buang perubahan tersebut? Pilih Batal untuk tetap di halaman ini.";

function SummaryTile({ label, value, tone = "" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-xl font-semibold tabular-nums ${tone}`}>{formatNumber(value)}</dd>
    </div>
  );
}

// One Stock Opname session: items with system stock, count, and difference;
// the difference summary; counting and posting for the creator; cancelling
// for any Staff. Owner reads only.
export default function StockOpnameDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const [state, setState] = useState({ status: "loading", opname: null, error: null });
  const latestRequest = useRef(0);

  // Unsaved physical-count inputs live here, outside the form and the loaded
  // data, so no reload (background, after a failure, or after an error state)
  // overwrites them. They are compared with the latest server values on every
  // render; the refs give click handlers the current result (M-1, L-9).
  const [drafts, setDrafts] = useState({});
  const [countsSaving, setCountsSaving] = useState(false);
  const blockRef = useRef(null);
  const savingRef = useRef(false);
  const setSaving = useCallback((value) => {
    savingRef.current = value;
    setCountsSaving(value);
  }, []);

  const handleAuthError = useCallback(
    (apiError) => {
      if (requiresLogin(apiError)) redirectToLogin(router, pathname, apiError);
    },
    [router, pathname]
  );

  // quiet: keep the current data on screen while reloading (after a write).
  // Returns the session as loaded, or null when this request failed or a
  // newer one replaced it.
  const load = useCallback(
    async ({ quiet = false } = {}) => {
      const requestId = ++latestRequest.current;
      if (!quiet) setState({ status: "loading", opname: null, error: null });
      try {
        const { data } = await api.get(`/stock-opnames/${id}`);
        if (requestId !== latestRequest.current) return null;
        setState({ status: "ready", opname: data.opname, error: null });
        return data.opname;
      } catch (error) {
        if (requestId !== latestRequest.current) return null;
        const apiError = toApiError(error);
        if (requiresLogin(apiError)) {
          redirectToLogin(router, pathname, apiError);
          return null;
        }
        setState({ status: "error", opname: null, error: apiError });
        return null;
      }
    },
    [id, router, pathname]
  );

  useEffect(() => {
    if (session.status === "ready") load();
  }, [session.status, load]);

  const opname = state.opname;
  const isStaff = session.user?.role === "STAFF_WAREHOUSE";
  const pending = opname ? pendingCountChanges(opname.items, drafts) : [];
  const postingBlock = postingBlockedReason({ pendingCount: pending.length, saving: countsSaving });
  blockRef.current = postingBlock;
  const getPostingBlock = useCallback(
    () => (savingRef.current ? postingBlockedReason({ pendingCount: 0, saving: true }) : blockRef.current),
    []
  );

  // Leaving the page with unsaved counts asks first (D12): in-app and header
  // links and logout get a confirmation; reload and closing get the browser's
  // beforeunload prompt. Only while the drafts can still be saved; confirming
  // drops them. Browser Back/Forward is not covered (lib/leave-guard.js).
  const guardLeave = pending.length > 0 && Boolean(opname?.permissions.canCount);

  // Tab-local recovery of unsaved counts for browser Back/Forward (B4-S7).
  const draftStore = useCountDraftPersistence({ userId: session.user?.id, opname, drafts, setDrafts, pending });
  const { discardStored } = draftStore;

  // Confirming "leave and discard" removes the stored draft synchronously,
  // because the page may unmount before any effect runs.
  const discardDrafts = useCallback(() => {
    discardStored();
    setDrafts({});
  }, [discardStored]);
  useLeaveGuard(guardLeave, LEAVE_MESSAGE, discardDrafts);

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-8">
        <Link href="/stock-opnames" className="text-sm text-forest underline-offset-4 hover:underline">
          ← Kembali ke daftar Stock Opname
        </Link>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && (
          <>
            {state.status === "loading" && <LoadingState label="Memuat sesi Stock Opname…" />}
            {state.status === "error" && (
              <ErrorState
                message={state.error.message}
                onRetry={state.error.status === 404 || state.error.status === 400 ? undefined : () => load()}
              />
            )}
            {state.status === "ready" && opname && (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="grid gap-1">
                    <h1 className="flex flex-wrap items-center gap-3 text-2xl md:text-3xl">
                      Sesi Stock Opname <OpnameStatusBadge status={opname.status} />
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Dibuat {formatDateTime(opname.createdAt)} oleh {actorLabel(opname.createdByMe)}.
                      {opname.status === "POSTED" &&
                        ` Diposting ${formatDateTime(opname.postedAt)} oleh ${actorLabel(opname.postedByMe)}.`}
                      {opname.status === "CANCELLED" &&
                        ` Dibatalkan ${formatDateTime(opname.cancelledAt)} oleh ${actorLabel(opname.cancelledByMe)}.`}
                    </p>
                    {opname.status === "CANCELLED" && opname.cancelReason && (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Alasan pembatalan:</span> {opname.cancelReason}
                      </p>
                    )}
                  </div>
                </div>

                {opname.status === "ACTIVE" && (
                  <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                    {opname.summary.itemCount} material dibekukan selama sesi ini aktif. Stock In, Stock Out, dan arsip
                    untuk material tersebut ditolak sampai sesi diposting atau dibatalkan.
                  </p>
                )}
                {opname.status === "POSTED" && (
                  <p role="status" className="rounded-lg bg-sage/60 p-3 text-sm text-forest">
                    Sesi diposting. Material dengan selisih tidak nol mendapat transaksi Penyesuaian; pembekuan sudah
                    dilepas.
                  </p>
                )}
                {!isStaff && (
                  <p className="text-sm text-muted-foreground">
                    Anda masuk sebagai Owner: halaman ini hanya untuk memantau.
                  </p>
                )}

                <section aria-labelledby="summary-title" className="grid gap-3">
                  <h2 id="summary-title" className="text-lg font-semibold">
                    Ringkasan selisih
                  </h2>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <SummaryTile label="Material" value={opname.summary.itemCount} />
                    <SummaryTile label="Sudah dihitung" value={opname.summary.countedCount} />
                    <SummaryTile label="Belum dihitung" value={opname.summary.uncountedCount} tone={opname.summary.uncountedCount > 0 ? "text-amber-900" : ""} />
                    <SummaryTile label="Tanpa selisih" value={opname.summary.unchangedCount} />
                    <SummaryTile label="Bertambah" value={opname.summary.increaseCount} tone="text-forest" />
                    <SummaryTile label="Berkurang" value={opname.summary.decreaseCount} tone="text-destructive" />
                  </dl>
                </section>

                <section aria-labelledby="items-title" className="grid gap-3">
                  <h2 id="items-title" className="text-lg font-semibold">
                    Hasil hitung
                  </h2>
                  <DraftRecoveryNotice
                    notice={draftStore.notice}
                    onClose={draftStore.clearNotice}
                    onDiscardStored={draftStore.discardStored}
                  />
                  <OpnameCountForm
                    key={opname.id}
                    opname={opname}
                    drafts={drafts}
                    onDraftsChange={setDrafts}
                    pending={pending}
                    saving={countsSaving}
                    onSavingChange={setSaving}
                    onReload={load}
                    onAuthError={handleAuthError}
                  />
                </section>

                {isStaff && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <h2 className="m-0 text-lg">Tindakan sesi</h2>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {opname.status !== "ACTIVE" && (
                        <p className="mb-4 text-sm text-muted-foreground">
                          Sesi ini sudah {opname.status === "POSTED" ? "diposting" : "dibatalkan"} dan tidak dapat
                          diubah lagi.
                        </p>
                      )}
                      <OpnameActions
                        key={opname.id}
                        opname={opname}
                        postingBlock={postingBlock}
                        getPostingBlock={getPostingBlock}
                        onChanged={load}
                        onAuthError={handleAuthError}
                      />
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
