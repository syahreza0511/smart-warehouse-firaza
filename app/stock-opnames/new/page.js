"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { formatNumber } from "@/components/inventory-format";
import { ErrorState, LoadingState } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { redirectToLogin, useSession } from "@/components/use-session";
import { api, requiresLogin, toApiError } from "@/lib/api-client";
import { abandonCreate, beginCreate, loadPendingCreate, sendCreate } from "@/lib/stock-opname-outcome";
import { MAX_OPNAME_MATERIALS } from "@/lib/validation/stock-opname";

function browserStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

async function postCreate(payload, key) {
  const { data } = await api.post("/stock-opnames", payload, { headers: { "Idempotency-Key": key } });
  return data.opname;
}

// Recovery for a create whose outcome is unknown. Rendered on its own, so it
// stays visible when the material list fails to load or the account can no
// longer create sessions. It never claims more than is known: a rejected
// resend proves only that the resend did not commit, not that an earlier,
// delayed request never will.
function PendingCreatePanel({ attempt, failure, isStaff, submitting, onResend, onAbandon }) {
  const [confirming, setConfirming] = useState(false);
  const count = attempt.payload.materialIds.length;

  return (
    <div role="alert" className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-medium">Ada pembuatan sesi Stock Opname ({count} material) yang statusnya belum pasti.</p>
      {failure?.message && <p>{failure.message}</p>}
      {attempt.lastConflict ? (
        <p>
          Kiriman ulang terakhir ditolak ({attempt.lastConflict}). Itu hanya membuktikan kiriman ulang tersebut tidak
          membuat sesi. Permintaan pertama yang terputus belum tentu tidak akan diproses belakangan. Periksa daftar sesi
          aktif sebelum memutuskan.
        </p>
      ) : (
        <p>
          Sesi mungkin sudah dibuat, mungkin belum. Kirim ulang memakai kode permintaan dan pilihan material yang sama,
          sehingga sesi tidak akan dibuat dua kali.
        </p>
      )}
      {!isStaff && (
        <p>
          Akun Anda saat ini tidak dapat membuat sesi, sehingga kiriman ulang akan ditolak. Periksa daftar sesi, atau minta
          Staff Warehouse memeriksanya.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {isStaff && (
          <Button type="button" size="sm" disabled={submitting} onClick={onResend}>
            {submitting ? "Mengirim ulang…" : "Kirim ulang untuk memastikan"}
          </Button>
        )}
        <Button asChild size="sm" variant="outline">
          <Link href="/stock-opnames">Lihat daftar sesi Stock Opname</Link>
        </Button>
      </div>
      {confirming ? (
        <div className="grid gap-2 rounded-md bg-white/60 p-3">
          <p>
            Akhiri pelacakan hanya jika Anda sudah memeriksa daftar sesi. Ini tidak menjamin permintaan pertama tidak akan
            diproses: bila sesi baru dari Anda muncul belakangan dan tidak diinginkan, batalkan sesi itu dengan alasan.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" size="sm" variant="destructive" disabled={submitting} onClick={onAbandon}>
              Ya, akhiri pelacakan
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Tidak
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="justify-self-start text-sm underline underline-offset-2"
          disabled={submitting}
          onClick={() => setConfirming(true)}
        >
          Saya sudah memeriksa daftar sesi — akhiri pelacakan
        </button>
      )}
    </div>
  );
}

// New Stock Opname session (FR-OPN-01, OD-01): the materials are chosen
// here and frozen when the session is created. Only active materials that
// are not already in another active session can be chosen; the database
// checks this again under row locks.
//
// The create has idempotent replay (provisional; OD-20 pending). One logical
// submission keeps one key; after an unknown outcome the selection locks and
// the attempt is kept until the user resolves it. Nothing is resent
// automatically, and the attempt is never ended without the user's action.
export default function NewStockOpnamePage() {
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  const userId = session.user?.id;
  const isStaff = session.user?.role === "STAFF_WAREHOUSE";
  const [materials, setMaterials] = useState({ status: "idle", items: [], error: null });
  const [selected, setSelected] = useState(() => new Set());
  const [status, setStatus] = useState("idle"); // idle | submitting | error | uncertain
  const [failure, setFailure] = useState(null);
  const [pendingAttempt, setPendingAttempt] = useState(null);
  const inFlight = useRef(false);
  const attempt = useRef(null);

  const loadMaterials = useCallback(async () => {
    setMaterials({ status: "loading", items: [], error: null });
    try {
      const { data } = await api.get("/materials");
      setMaterials({ status: "ready", items: data.materials, error: null });
    } catch (error) {
      const apiError = toApiError(error);
      if (requiresLogin(apiError)) {
        redirectToLogin(router, pathname, apiError);
        return;
      }
      setMaterials({ status: "error", items: [], error: apiError });
    }
  }, [router, pathname]);

  useEffect(() => {
    if (session.status === "ready" && isStaff) loadMaterials();
  }, [session.status, isStaff, loadMaterials]);

  // Restore an attempt left unresolved by a reload or a re-login, whatever
  // the current role.
  useEffect(() => {
    if (!userId) return;
    const pending = loadPendingCreate(browserStorage(), userId);
    if (pending) {
      attempt.current = pending;
      setPendingAttempt(pending);
      setSelected(new Set(pending.payload.materialIds));
      setStatus("uncertain");
    }
  }, [userId]);

  const locked = status === "uncertain" || status === "submitting";
  const available = materials.items.filter((m) => !m.isFrozen && !m.isArchived);
  const frozen = materials.items.filter((m) => m.isFrozen);

  function toggle(id) {
    if (locked) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send(current) {
    inFlight.current = true;
    setStatus("submitting");
    setFailure(null);
    const sent = await sendCreate({ attempt: current, post: postCreate, toApiError, storage: browserStorage() });
    inFlight.current = false;

    // An answer for an attempt this page already ended or replaced changes
    // nothing here.
    if (attempt.current?.key !== current.key) return;

    // Failed while storage does not hold this attempt (for example storage
    // writes are failing): keep it in memory as unresolved, conservatively.
    if (sent.outcome === "stale") {
      attempt.current = { ...current, uncertain: true };
      setPendingAttempt(attempt.current);
      setFailure(sent.error);
      setStatus("uncertain");
      return;
    }

    if (sent.outcome === "success") {
      attempt.current = null;
      setPendingAttempt(null);
      router.push(`/stock-opnames/${sent.opname.id}`);
      return;
    }

    setFailure(sent.error);
    if (requiresLogin(sent.error)) redirectToLogin(router, pathname, sent.error);
    if (sent.outcome === "uncertain") {
      attempt.current = sent.attempt;
      setPendingAttempt(sent.attempt);
      setStatus("uncertain");
      return;
    }
    attempt.current = null;
    setPendingAttempt(null);
    setStatus("error");
    // A material changed state since the list was loaded: reload it.
    if (sent.error.status === 409) await loadMaterials();
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current || locked || attempt.current || !userId) return;
    if (selected.size === 0) {
      setFailure({ message: "Pilih minimal satu material." });
      setStatus("error");
      return;
    }
    if (selected.size > MAX_OPNAME_MATERIALS) {
      setFailure({ message: `Maksimal ${MAX_OPNAME_MATERIALS} material per sesi.` });
      setStatus("error");
      return;
    }
    attempt.current = beginCreate({
      storage: browserStorage(),
      userId,
      materialIds: [...selected],
      pending: attempt.current,
      newKey: () => crypto.randomUUID(),
    });
    setPendingAttempt(attempt.current);
    send(attempt.current);
  }

  function handleResend() {
    if (inFlight.current || !attempt.current) return;
    send(attempt.current);
  }

  function handleAbandon() {
    if (inFlight.current || !attempt.current) return;
    abandonCreate(browserStorage(), attempt.current);
    attempt.current = null;
    setPendingAttempt(null);
    setFailure(null);
    setStatus("idle");
    if (isStaff) loadMaterials();
  }

  // Keep only choices that are still available after a reload.
  useEffect(() => {
    if (materials.status !== "ready" || locked) return;
    const ids = new Set(available.map((m) => m.id));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials]);

  const showPending = pendingAttempt && (status === "uncertain" || (status === "submitting" && pendingAttempt.uncertain));

  return (
    <>
      <AppHeader user={session.user} />
      <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
        <Link href="/stock-opnames" className="text-sm text-forest underline-offset-4 hover:underline">
          ← Kembali ke daftar Stock Opname
        </Link>

        {session.status === "error" && <ErrorState message={session.error.message} onRetry={session.reload} />}
        {(session.status === "loading" || session.status === "redirecting") && <LoadingState />}

        {session.status === "ready" && showPending && (
          <PendingCreatePanel
            attempt={pendingAttempt}
            failure={failure}
            isStaff={isStaff}
            submitting={status === "submitting"}
            onResend={handleResend}
            onAbandon={handleAbandon}
          />
        )}

        {session.status === "ready" && !isStaff && (
          <p className="rounded-lg border bg-card p-6 text-muted-foreground">
            Anda masuk sebagai Owner. Owner dapat memantau Stock Opname, tetapi tidak dapat membuat sesi.
          </p>
        )}

        {session.status === "ready" && isStaff && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h1 className="m-0 text-2xl">Mulai sesi Stock Opname</h1>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Pilih material yang akan dihitung. Material terpilih langsung dibekukan: Stock In, Stock Out, dan arsip
                ditolak sampai sesi diposting atau dibatalkan. Daftar material tidak dapat diubah setelah sesi dibuat.
              </p>
            </CardHeader>
            <CardContent>
              {(materials.status === "idle" || materials.status === "loading") && (
                <LoadingState label="Memuat material…" />
              )}
              {materials.status === "error" && (
                <ErrorState message={materials.error.message} onRetry={loadMaterials} />
              )}
              {materials.status === "ready" && (
                <form onSubmit={handleSubmit} noValidate className="grid gap-4" aria-describedby="opname-create-status">
                  {available.length === 0 ? (
                    <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                      Tidak ada material aktif yang dapat dipilih. Material arsip dan material yang sedang berada di sesi
                      aktif lain tidak dapat dipilih.
                    </p>
                  ) : (
                    <fieldset className="grid gap-2" disabled={locked}>
                      <legend className="mb-2 flex flex-wrap items-center gap-3 text-sm font-medium">
                        Material ({selected.size} dipilih)
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          onClick={() => setSelected(new Set(available.map((m) => m.id)))}
                        >
                          Pilih semua
                        </Button>
                        <Button type="button" size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
                          Kosongkan
                        </Button>
                      </legend>
                      <ul className="grid gap-1">
                        {available.map((material) => (
                          <li key={material.id}>
                            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted/50">
                              <input
                                type="checkbox"
                                className="size-4 accent-forest"
                                checked={selected.has(material.id)}
                                onChange={() => toggle(material.id)}
                              />
                              <span className="flex-1">
                                <span className="font-medium">{material.name}</span>
                                <span className="block text-xs text-muted-foreground">{material.categoryName}</span>
                              </span>
                              <span className="tabular-nums text-muted-foreground">
                                {formatNumber(material.currentStock)} {material.unit}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </fieldset>
                  )}

                  {frozen.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {frozen.length} material tidak ditampilkan karena sedang berada di sesi Stock Opname aktif.
                    </p>
                  )}

                  <div id="opname-create-status" aria-live="polite">
                    {status === "error" && failure && (
                      <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
                        {failure.message}
                      </p>
                    )}
                  </div>

                  {!locked && available.length > 0 && (
                    <Button type="submit" size="lg" className="justify-self-start">
                      Buat sesi dan bekukan material
                    </Button>
                  )}
                  {status === "submitting" && !showPending && <LoadingState label="Membuat sesi…" />}
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
