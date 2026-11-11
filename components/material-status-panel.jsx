"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/components/inventory-format";
import { api, toApiError } from "@/lib/api-client";
import { UNKNOWN, describeMutationFailure } from "@/lib/mutation-outcome";
import { MAX_REASON_LENGTH, fieldErrors, materialStatusRequestSchema } from "@/lib/validation/schemas";

// Archive, reactivate, and delete have no idempotent replay. After any
// failure nothing is resent automatically. A rejection caused by stale data
// (409, 404) or an unknown outcome reloads the page data and shows a notice;
// the notice lives in MaterialStatusPanel so it survives the reload, which
// can swap the archive form for the reactivate form. A rejection of a repeat
// (ALREADY_ARCHIVED, NOT_ARCHIVED, MATERIAL_NOT_FOUND) is never shown as the
// success of an earlier request.

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
      {unknown && " Data terbaru sudah dimuat ulang; periksa status material sebelum mencoba lagi."}
    </p>
  );
}

// Archive or reactivate with a required reason (FR-MAT-06, FR-MAT-08).
// The hints shown (stock not 0, frozen) come from data that may be stale, so
// they never disable the action; the database decides.
function StatusChangeForm({ material, onChanged, onAuthError, onNotice }) {
  const archiving = !material.isArchived;
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const fieldId = archiving ? "archive-reason" : "reactivate-reason";

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return;

    const parsed = materialStatusRequestSchema.safeParse({ reason });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    onNotice(null);
    inFlight.current = true;
    setSubmitting(true);

    try {
      await api.post(`/materials/${material.id}/${archiving ? "archive" : "reactivate"}`, parsed.data);
      setReason("");
      onChanged?.({ quiet: true });
    } catch (error) {
      const apiError = toApiError(error);
      const failure = describeMutationFailure(apiError);
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
    <form onSubmit={handleSubmit} noValidate className="grid gap-3">
      {archiving ? (
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>
            Material arsip tidak dapat dipakai untuk Stock In, Stock Out, atau Stock Opname baru. Histori tetap
            tersimpan.
          </p>
          {material.currentStock !== 0 && (
            <p className="text-amber-900">
              Stok saat ini {formatNumber(material.currentStock)} {material.unit}. Material hanya dapat diarsipkan saat
              stoknya 0.
            </p>
          )}
          {material.isFrozen && (
            <p className="text-amber-900">Material sedang dalam Stock Opname aktif sehingga tidak dapat diarsipkan.</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Setelah aktif kembali, material dapat diedit dan dipakai lagi dalam transaksi.
        </p>
      )}

      <div className="grid gap-2">
        <Label htmlFor={fieldId}>{archiving ? "Alasan pengarsipan" : "Alasan mengaktifkan kembali"}</Label>
        <Textarea
          id={fieldId}
          name="reason"
          required
          maxLength={MAX_REASON_LENGTH}
          value={reason}
          readOnly={submitting}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? `${fieldId}-error` : undefined}
          onChange={(event) => setReason(event.target.value)}
        />
        {errors.reason && (
          <p id={`${fieldId}-error`} className="text-sm text-destructive">
            {errors.reason[0]}
          </p>
        )}
      </div>

      <Button
        type="submit"
        variant={archiving ? "outline" : "default"}
        disabled={submitting}
        className="justify-self-start"
      >
        {submitting ? "Menyimpan…" : archiving ? "Arsipkan material" : "Aktifkan kembali"}
      </Button>
    </form>
  );
}

// Permanent delete with an explicit confirmation step (FR-MAT-05). Offered
// only when the API hint says the material has no history; the database
// re-checks under a row lock. Only a 200 answer counts as deleted.
function DeleteMaterial({ material, onDeleted, onChanged, onAuthError, onNotice }) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  async function confirmDelete() {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    onNotice(null);

    try {
      await api.delete(`/materials/${material.id}`);
      onDeleted?.();
      return;
    } catch (error) {
      const apiError = toApiError(error);
      const failure = describeMutationFailure(apiError);
      onNotice(failure);
      setConfirming(false);
      onAuthError?.(apiError);
      if (failure.reload) onChanged?.({ quiet: true });
    }
    inFlight.current = false;
    setSubmitting(false);
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Material ini belum memiliki riwayat transaksi, Stock Opname, maupun arsip, sehingga dapat dihapus permanen.
      </p>
      {confirming ? (
        <div role="alertdialog" aria-labelledby="delete-confirm-text" className="grid gap-3 rounded-lg bg-destructive/5 p-3">
          <p id="delete-confirm-text" className="text-sm text-destructive">
            Hapus <strong>{material.name}</strong> secara permanen? Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="destructive" disabled={submitting} onClick={confirmDelete}>
              {submitting ? "Menghapus…" : "Ya, hapus permanen"}
            </Button>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setConfirming(false)}>
              Batal
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="destructive"
          className="justify-self-start"
          onClick={() => {
            onNotice(null);
            setConfirming(true);
          }}
        >
          Hapus material
        </Button>
      )}
    </div>
  );
}

export function MaterialStatusPanel({ material, management, onChanged, onDeleted, onAuthError }) {
  const [notice, setNotice] = useState(null);

  return (
    <div className="grid gap-6">
      <div aria-live="polite">
        <Notice notice={notice} />
      </div>
      <StatusChangeForm
        key={material.isArchived ? "reactivate" : "archive"}
        material={material}
        onChanged={onChanged}
        onAuthError={onAuthError}
        onNotice={setNotice}
      />
      {management?.deletable ? (
        <DeleteMaterial
          material={material}
          onDeleted={onDeleted}
          onChanged={onChanged}
          onAuthError={onAuthError}
          onNotice={setNotice}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Hapus permanen tidak tersedia karena material sudah memiliki riwayat transaksi, Stock Opname, atau arsip.
        </p>
      )}
    </div>
  );
}
