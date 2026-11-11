"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, toApiError } from "@/lib/api-client";
import { REJECTED, UNKNOWN, describeOpnameFailure } from "@/lib/stock-opname-outcome";
import { MAX_REASON_LENGTH, fieldErrors } from "@/lib/validation/schemas";
import { cancelOpnameRequestSchema } from "@/lib/validation/stock-opname";

// Post and cancel have no idempotent replay. Nothing is resent
// automatically; after any failure the page data reloads and the notice
// explains what is known. A rejection of a repeat (OPNAME_NOT_ACTIVE) is
// never shown as success. The notice lives here, above both actions, so it
// survives the reload that may hide them.

function Notice({ notice }) {
  if (!notice) return null;
  const unknown = notice.outcome === UNKNOWN;
  return (
    <p
      role="alert"
      className={
        unknown
          ? "rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
          : "rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
      }
    >
      {notice.message}
      {unknown && " Data terbaru sudah dimuat ulang; periksa status sesi sebelum mencoba lagi."}
    </p>
  );
}

// Posting uses the counts stored on the server. It is disabled while any
// physical-count input is unsaved or a count save is running (M-1). The
// guard is read three times: at render (button state), when opening the
// confirmation, and again on confirm, through getPostingBlock(), which reads
// the page's latest state rather than this render's props.
function PostOpname({ opname, postingBlock, getPostingBlock, onChanged, onAuthError, onNotice }) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const { summary } = opname;
  const ready = summary.itemCount > 0 && summary.uncountedCount === 0 && summary.mismatchCount === 0;
  const blocked = Boolean(postingBlock);

  function blockedNow() {
    const reason = getPostingBlock();
    if (reason) {
      setConfirming(false);
      onNotice({ outcome: REJECTED, message: reason });
      return true;
    }
    return false;
  }

  async function confirmPost() {
    if (inFlight.current) return;
    if (blockedNow()) return;
    inFlight.current = true;
    setSubmitting(true);
    onNotice(null);
    try {
      await api.post(`/stock-opnames/${opname.id}/post`, {});
      setConfirming(false);
      onChanged?.({ quiet: true });
    } catch (error) {
      const apiError = toApiError(error);
      const failure = describeOpnameFailure(apiError);
      onNotice(failure);
      setConfirming(false);
      onAuthError?.(apiError);
      if (failure.reload) onChanged?.({ quiet: true });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-base font-semibold">Posting hasil Stock Opname</h3>
      <p className="text-sm text-muted-foreground">
        Posting menerapkan seluruh selisih sekaligus: material dengan selisih tidak nol mendapat transaksi
        Penyesuaian, stoknya menjadi hasil hitung, dan pembekuan dilepas. Material dengan selisih nol tidak
        mendapat transaksi. Posting tidak dapat dibatalkan.
      </p>
      {blocked && <p className="text-sm text-amber-900">{postingBlock}</p>}
      {!blocked && !ready && (
        <p className="text-sm text-amber-900">
          {summary.uncountedCount > 0
            ? `Masih ada ${summary.uncountedCount} material yang belum dihitung (berdasarkan data tersimpan).`
            : summary.mismatchCount > 0
              ? "Ada material yang stoknya berbeda dari snapshot; sesi ini tidak dapat diposting."
              : "Sesi belum siap diposting."}
        </p>
      )}
      {confirming ? (
        <div role="alertdialog" aria-labelledby="post-confirm-text" className="grid gap-3 rounded-lg bg-sage/40 p-3">
          <p id="post-confirm-text" className="text-sm">
            Posting {summary.itemCount} material berdasarkan hasil hitung yang tersimpan di server:{" "}
            {summary.increaseCount} bertambah, {summary.decreaseCount} berkurang, {summary.unchangedCount} tanpa selisih.
            Lanjutkan?
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" disabled={submitting || blocked} onClick={confirmPost}>
              {submitting ? "Memposting…" : "Ya, posting sekarang"}
            </Button>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setConfirming(false)}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          className="justify-self-start"
          disabled={!ready || blocked}
          onClick={() => {
            onNotice(null);
            if (blockedNow()) return;
            setConfirming(true);
          }}
        >
          Posting sesi
        </Button>
      )}
    </div>
  );
}

function CancelOpname({ opname, onChanged, onAuthError, onNotice }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return;

    const parsed = cancelOpnameRequestSchema.safeParse({ reason });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    onNotice(null);
    inFlight.current = true;
    setSubmitting(true);
    try {
      await api.post(`/stock-opnames/${opname.id}/cancel`, parsed.data);
      setOpen(false);
      setReason("");
      onChanged?.({ quiet: true });
    } catch (error) {
      const apiError = toApiError(error);
      const failure = describeOpnameFailure(apiError);
      onNotice(failure);
      if (apiError.fields) setErrors(apiError.fields);
      onAuthError?.(apiError);
      if (failure.reload) onChanged?.({ quiet: true });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-3">
      <h3 className="text-base font-semibold">Batalkan sesi</h3>
      <p className="text-sm text-muted-foreground">
        Pembatalan tidak mengubah stok dan melepas pembekuan semua material di sesi ini. Sesi yang dibatalkan tidak
        dapat diaktifkan kembali.
        {!opname.createdByMe && " Sesi ini dibuat oleh pengguna lain; Anda tetap dapat membatalkannya dengan alasan."}
      </p>
      {open ? (
        <form
          onSubmit={handleSubmit}
          noValidate
          role="dialog"
          aria-labelledby="cancel-title"
          className="grid gap-3 rounded-lg bg-destructive/5 p-3"
        >
          <p id="cancel-title" className="text-sm font-medium text-destructive">
            Batalkan sesi Stock Opname ini?
          </p>
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">Alasan pembatalan</Label>
            <Textarea
              id="cancel-reason"
              name="reason"
              required
              maxLength={MAX_REASON_LENGTH}
              value={reason}
              readOnly={submitting}
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={errors.reason ? "cancel-reason-error" : undefined}
              onChange={(event) => setReason(event.target.value)}
            />
            {errors.reason && (
              <p id="cancel-reason-error" className="text-sm text-destructive">
                {errors.reason[0]}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? "Membatalkan…" : "Ya, batalkan sesi"}
            </Button>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
              Tutup
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="destructive"
          className="justify-self-start"
          onClick={() => {
            onNotice(null);
            setOpen(true);
          }}
        >
          Batalkan sesi
        </Button>
      )}
    </div>
  );
}

export function OpnameActions({ opname, postingBlock, getPostingBlock, onChanged, onAuthError }) {
  const [notice, setNotice] = useState(null);
  const { canPost, canCancel } = opname.permissions;

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        <Notice notice={notice} />
      </div>
      {canPost && (
        <PostOpname
          opname={opname}
          postingBlock={postingBlock}
          getPostingBlock={getPostingBlock}
          onChanged={onChanged}
          onAuthError={onAuthError}
          onNotice={setNotice}
        />
      )}
      {opname.status === "ACTIVE" && !canPost && canCancel && (
        <p className="text-sm text-muted-foreground">
          Hanya pembuat sesi yang dapat mengisi hasil hitung dan memposting sesi ini.
        </p>
      )}
      {canCancel && <CancelOpname opname={opname} onChanged={onChanged} onAuthError={onAuthError} onNotice={setNotice} />}
    </div>
  );
}
