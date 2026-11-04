"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/components/inventory-format";
import { beginAttempt, loadPendingAttempt, sendAttempt } from "@/components/stock-in-attempt";
import { api, toApiError } from "@/lib/api-client";
import { MAX_NOTES_LENGTH, fieldErrors, stockInFormSchema } from "@/lib/validation/schemas";

function browserStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

async function postStockIn(payload, key) {
  const { data } = await api.post("/stock-movements", payload, { headers: { "Idempotency-Key": key } });
  return data.movement;
}

// Stock In for one material (FR-TRX-01, FR-TRX-05).
//
// Every logical submission gets one UUID key (see stock-in-attempt.js). When
// the outcome is unknown (network failure, timeout, 5xx) the fields lock and
// the only action is to resend the same key and payload until the server
// gives a definitive answer. There is no way to discard that attempt or
// start a new one before then, because the first request may already have
// committed.
//
// Double submit: a ref is checked synchronously before any request starts,
// in addition to the disabled button.
export function StockInForm({ material, userId, onSuccess, onAuthError }) {
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error | uncertain
  const [result, setResult] = useState(null);
  const [failure, setFailure] = useState(null);
  const inFlight = useRef(false);
  const attempt = useRef(null);

  // Restore an attempt left unresolved by a reload or a re-login.
  useEffect(() => {
    const pending = loadPendingAttempt(browserStorage(), userId, material.id);
    if (pending) {
      attempt.current = pending;
      setQuantity(String(pending.payload.quantity));
      setNotes(pending.payload.notes ?? "");
      setStatus("uncertain");
    }
  }, [userId, material.id]);

  const locked = status === "uncertain" || status === "submitting";

  async function send(current) {
    inFlight.current = true;
    setStatus("submitting");
    setFailure(null);
    const sent = await sendAttempt({ attempt: current, post: postStockIn, toApiError, storage: browserStorage() });
    inFlight.current = false;

    if (sent.outcome === "success") {
      attempt.current = null;
      setResult(sent.movement);
      setStatus("success");
      setQuantity("");
      setNotes("");
      onSuccess?.(sent.movement);
      return;
    }

    setFailure(sent.error);
    if (sent.outcome === "uncertain") {
      attempt.current = sent.attempt;
      setStatus("uncertain");
    } else {
      attempt.current = null;
      setStatus("error");
      if (sent.error.fields) setErrors(sent.error.fields);
    }
    onAuthError?.(sent.error);
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current || locked || attempt.current) return;

    const parsed = stockInFormSchema.safeParse({
      quantity: quantity.trim() === "" ? undefined : Number(quantity),
      notes,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});

    attempt.current = beginAttempt({
      storage: browserStorage(),
      userId,
      pending: attempt.current,
      newKey: () => crypto.randomUUID(),
      payload: {
        materialId: material.id,
        type: "STOCK_IN",
        quantity: parsed.data.quantity,
        notes: parsed.data.notes,
      },
    });
    send(attempt.current);
  }

  function handleRetry() {
    if (inFlight.current || !attempt.current) return;
    send(attempt.current);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4" aria-describedby="stock-in-status">
      <div className="grid gap-2">
        <Label htmlFor="stock-in-quantity">Jumlah masuk ({material.unit})</Label>
        <Input
          id="stock-in-quantity"
          name="quantity"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={quantity}
          readOnly={locked}
          aria-invalid={errors.quantity ? true : undefined}
          aria-describedby={errors.quantity ? "stock-in-quantity-error" : undefined}
          onChange={(event) => setQuantity(event.target.value)}
        />
        {errors.quantity && (
          <p id="stock-in-quantity-error" className="text-sm text-destructive">
            {errors.quantity[0]}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="stock-in-notes">Catatan (opsional)</Label>
        <Textarea
          id="stock-in-notes"
          name="notes"
          maxLength={MAX_NOTES_LENGTH}
          value={notes}
          readOnly={locked}
          aria-invalid={errors.notes ? true : undefined}
          aria-describedby={errors.notes ? "stock-in-notes-error" : undefined}
          onChange={(event) => setNotes(event.target.value)}
        />
        {errors.notes && (
          <p id="stock-in-notes-error" className="text-sm text-destructive">
            {errors.notes[0]}
          </p>
        )}
      </div>

      <div id="stock-in-status" aria-live="polite">
        {status === "success" && result && (
          <p role="status" className="rounded-lg bg-sage/60 p-3 text-sm text-forest">
            Stock In tercatat: +{formatNumber(result.quantity)} {material.unit}. Stok sekarang{" "}
            <strong>{formatNumber(result.currentStock)}</strong> {material.unit}.
          </p>
        )}
        {status === "error" && failure && (
          <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
            {failure.message}
          </p>
        )}
        {status === "uncertain" && (
          <div role="alert" className="grid gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            {failure && <p>{failure.message}</p>}
            <p>
              Status Stock In ini belum pasti: bisa jadi sudah tercatat, bisa jadi belum. Kirim ulang untuk
              memastikannya. Data dan kode transaksi yang sama dipakai lagi, sehingga stok tidak akan tercatat dua
              kali. Form baru dapat dipakai setelah statusnya pasti.
            </p>
            <Button type="button" size="sm" className="justify-self-start" onClick={handleRetry}>
              Kirim ulang untuk memastikan
            </Button>
          </div>
        )}
      </div>

      {status !== "uncertain" && (
        <Button type="submit" size="lg" disabled={status === "submitting"} className="justify-self-start">
          {status === "submitting" ? "Menyimpan…" : "Simpan Stock In"}
        </Button>
      )}
    </form>
  );
}
