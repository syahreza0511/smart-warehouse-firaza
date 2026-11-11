"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDelta, formatNumber } from "@/components/inventory-format";
import { actorLabel } from "@/components/opname-status-badge";
import { api, toApiError } from "@/lib/api-client";
import {
  UNKNOWN,
  confirmSavedDrafts,
  countsToSave,
  describeOpnameFailure,
  acknowledgeConflict,
  discardDraft,
  editDraft,
} from "@/lib/stock-opname-outcome";

function Difference({ value, unit }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span className={value > 0 ? "font-medium text-forest" : "font-medium text-destructive"}>
      {formatDelta(value)} {unit}
    </span>
  );
}

function pendingText(change, unit) {
  const prefix = change.conflict ? "Konflik, perlu ditinjau: draf dipulihkan tetapi nilai di server sudah berubah. " : "";
  return prefix + pendingBody(change, unit);
}

function pendingBody(change, unit) {
  if (change.kind === "cleared") {
    return `Isian dikosongkan, tetapi hasil hitung tersimpan (${formatNumber(change.stored)} ${unit}) tidak terhapus. Isi angka baru untuk menggantinya, atau buang perubahan ini.`;
  }
  if (change.kind === "invalid") return change.message;
  return change.stored === null
    ? `Belum disimpan: ${formatNumber(change.value)} ${unit}.`
    : `Belum disimpan: ${formatNumber(change.stored)} → ${formatNumber(change.value)} ${unit}.`;
}

// Items of one session: system stock (snapshot when the session was
// created), physical count, and difference = saved count − system stock.
//
// Inputs are drafts owned by the page (drafts / onDraftsChange), so a
// background reload never overwrites them. Every draft that differs from the
// stored value is listed as unsaved and blocks posting (see OpnameActions).
// A save sends only valid changed drafts; they are cleared only after the
// session has been reloaded and the server shows the values sent. After a
// failed or unknown save nothing is assumed saved and the drafts stay.
//
// Only the session's creator gets inputs (OD-02); everyone else sees the
// table read-only.
export function OpnameCountForm({ opname, drafts, onDraftsChange, pending, saving, onSavingChange, onReload, onAuthError }) {
  const editable = opname.permissions.canCount;
  const [notice, setNotice] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inFlight = useRef(false);
  const pendingById = new Map(pending.map((p) => [p.itemId, p]));
  const unitById = new Map(opname.items.map((i) => [i.id, i.unit]));
  const nameById = new Map(opname.items.map((i) => [i.id, i.materialName]));

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current || !editable) return;

    const counts = countsToSave(pending);
    // B4-S7: a recovered draft whose server value changed is never saved
    // until the user explicitly keeps it or reverts it.
    const conflicts = pending.filter((p) => p.conflict).length;
    if (conflicts > 0) {
      setNotice({
        tone: "error",
        message: `Ada ${conflicts} draf yang berkonflik dengan nilai di server. Pilih "Pakai nilai draf" atau "Kembalikan" pada setiap baris bertanda konflik sebelum menyimpan.`,
      });
      return;
    }
    if (pending.some((p) => p.kind === "invalid")) {
      setNotice({ tone: "error", message: "Periksa kembali hasil hitung yang ditandai sebelum menyimpan." });
      return;
    }
    if (counts.length === 0) {
      setNotice({ tone: "info", message: "Tidak ada hasil hitung baru untuk disimpan." });
      return;
    }

    inFlight.current = true;
    onSavingChange(true);
    setNotice(null);
    try {
      await api.put(`/stock-opnames/${opname.id}/counts`, { counts });
    } catch (error) {
      const apiError = toApiError(error);
      const failure = describeOpnameFailure(apiError);
      setNotice({
        tone: failure.outcome === UNKNOWN ? "unknown" : "error",
        message: `${failure.message} Perubahan Anda tetap ditandai belum disimpan.`,
      });
      onAuthError?.(apiError);
      if (failure.reload) await onReload({ quiet: true });
      inFlight.current = false;
      onSavingChange(false);
      return;
    }

    // Saved. Clear drafts only from the reloaded server data.
    const fresh = await onReload({ quiet: true });
    if (fresh) {
      onDraftsChange((current) => confirmSavedDrafts(fresh.items, current, counts));
      setNotice({ tone: "success", message: `${counts.length} hasil hitung tersimpan dan sudah dimuat ulang dari server.` });
    } else {
      setNotice({
        tone: "unknown",
        message:
          "Server menerima penyimpanan, tetapi data terbaru gagal dimuat. Perubahan tetap ditandai belum disimpan sampai data berhasil dimuat ulang.",
      });
    }
    inFlight.current = false;
    onSavingChange(false);
  }

  const noticeClass = {
    success: "bg-sage/60 text-forest",
    info: "bg-muted text-foreground",
    error: "bg-destructive/5 text-destructive",
    unknown: "bg-amber-50 text-amber-950",
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      {editable && (
        <p className="text-sm text-muted-foreground">
          Hasil hitung baru menggantikan nilai yang tersimpan, tidak ditambahkan. Mengosongkan isian tidak menghapus nilai
          yang sudah tersimpan.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Material dalam sesi Stock Opname</caption>
          <thead className="bg-muted text-left">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Material</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Stok sistem</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                {editable ? "Hasil hitung" : "Hasil hitung tersimpan"}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Selisih tersimpan</th>
              <th scope="col" className="px-4 py-3 font-semibold">Dihitung oleh</th>
            </tr>
          </thead>
          <tbody>
            {opname.items.map((item) => {
              const inputId = `count-${item.id}`;
              const noteId = `${inputId}-note`;
              const change = pendingById.get(item.id);
              const value = Object.hasOwn(drafts, item.id)
                ? drafts[item.id].text
                : item.countedStock === null
                  ? ""
                  : String(item.countedStock);
              return (
                <tr key={item.id} className={`border-t align-top ${change ? "bg-amber-50/60" : ""}`}>
                  <td className="px-4 py-3">
                    <span className="font-medium">{item.materialName ?? "Material"}</span>
                    <span className="block text-xs text-muted-foreground">{item.unit}</span>
                    {item.stockMismatch && (
                      <span className="mt-1 block text-xs text-destructive">
                        Stok saat ini ({formatNumber(item.currentStock)}) berbeda dari snapshot. Sesi tidak dapat
                        diposting.
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(item.systemStock)}</td>
                  <td className="px-4 py-3 text-right">
                    {editable ? (
                      <div className="grid justify-items-end gap-1">
                        <label htmlFor={inputId} className="sr-only">
                          Hasil hitung {item.materialName} ({item.unit})
                        </label>
                        <Input
                          id={inputId}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          className="w-28 text-right tabular-nums"
                          value={value}
                          readOnly={saving}
                          aria-invalid={change?.kind === "invalid" ? true : undefined}
                          aria-describedby={change ? noteId : undefined}
                          onChange={(event) => {
                            onDraftsChange((current) => editDraft(current, item, event.target.value));
                            // OBS-1: an informational notice ("discarded", "nothing
                            // to save") is obsolete once the user edits again; the
                            // unsaved indicator takes over. Error and unknown-outcome
                            // notices stay until reconciled.
                            setNotice((current) => (current?.tone === "info" ? null : current));
                          }}
                        />
                        {change && (
                          <span
                            id={noteId}
                            className={`max-w-56 text-right text-xs ${change.kind === "invalid" ? "text-destructive" : "text-amber-900"}`}
                          >
                            {pendingText(change, item.unit)}
                            {change.serverChanged &&
                              ` Nilai tersimpan di server berubah sejak Anda mulai mengedit (sekarang ${
                                item.countedStock === null ? "kosong" : formatNumber(item.countedStock)
                              }).`}{" "}
                            <button
                              type="button"
                              className="underline underline-offset-2"
                              disabled={saving}
                              onClick={() => onDraftsChange((current) => discardDraft(current, item.id))}
                            >
                              Kembalikan
                            </button>
                            {change.conflict && (
                              <>
                                {" "}
                                <button
                                  type="button"
                                  className="underline underline-offset-2"
                                  disabled={saving}
                                  onClick={() => onDraftsChange((current) => acknowledgeConflict(current, item))}
                                >
                                  Pakai nilai draf
                                </button>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    ) : item.countedStock === null ? (
                      <span className="text-muted-foreground">Belum dihitung</span>
                    ) : (
                      <span className="tabular-nums">{formatNumber(item.countedStock)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <Difference value={item.difference} unit={item.unit} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.countedByMe === null ? "—" : actorLabel(item.countedByMe)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pending.length > 0 && (
        <div role="status" className="grid gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">
            {pending.length} perubahan hasil hitung belum disimpan. Posting tidak tersedia sampai perubahan disimpan atau
            dibuang.
          </p>
          <ul className="list-disc pl-5">
            {pending.map((p) => (
              <li key={p.itemId}>
                {nameById.get(p.itemId) ?? "Material"}: {pendingText(p, unitById.get(p.itemId) ?? "")}
              </li>
            ))}
          </ul>
          {confirmDiscard ? (
              <div className="flex flex-wrap items-center gap-3">
                <span>Buang semua perubahan yang belum disimpan?</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={() => {
                    onDraftsChange(() => ({}));
                    setConfirmDiscard(false);
                    setNotice({ tone: "info", message: "Perubahan yang belum disimpan dibuang." });
                  }}
                >
                  Ya, buang
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>
                  Tidak
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-self-start"
                disabled={saving}
                onClick={() => setConfirmDiscard(true)}
              >
                Buang perubahan
              </Button>
            )}
          {!editable && (
            <p>Sesi ini tidak lagi dapat dihitung, sehingga perubahan ini tidak dapat disimpan.</p>
          )}
        </div>
      )}

      <div aria-live="polite">
        {notice && (
          <p
            role={notice.tone === "success" || notice.tone === "info" ? "status" : "alert"}
            className={`rounded-lg p-3 text-sm ${noticeClass[notice.tone]}`}
          >
            {notice.message}
          </p>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Menyimpan…" : "Simpan hasil hitung"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Menyimpan hasil hitung tidak mengubah stok. Stok baru berubah saat sesi diposting.
          </p>
        </div>
      )}
    </form>
  );
}
