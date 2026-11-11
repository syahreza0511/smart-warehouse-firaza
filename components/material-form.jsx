"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_MATERIAL_NAME_LENGTH,
  MAX_MATERIAL_UNIT_LENGTH,
  fieldErrors,
  materialRequestSchema,
  parseIntegerInput,
} from "@/lib/validation/schemas";
import { UNKNOWN, UNKNOWN_OUTCOME_MESSAGE, classifyMutationFailure } from "@/lib/mutation-outcome";

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm";

function FieldError({ id, messages }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages[0]}
    </p>
  );
}

// Create and edit form for a material (FR-MAT-01, FR-MAT-02, FR-MAT-03).
// Current stock is never an input (FR-MAT-04): a new material starts at 0
// and stock changes only through transactions.
//
// onSubmit(payload) sends the request; it resolves on success (the page
// navigates away) or throws the normalized API error, whose field errors are
// shown next to the inputs. unitLocked is a hint from the API; the database
// rejects a locked unit change regardless.
//
// Create and update have no idempotent replay. When the outcome is unknown
// (network error, timeout, server error), the form does not resend and does
// not offer to: submitting stays blocked and the user is sent to reconcile
// with the current data through reconcile = { label, run } (the page decides
// what reloading means). A rejection (4xx, OPERATION_NOT_APPLIED) leaves the
// form usable, because nothing was saved.
export function MaterialForm({ categories, initial, unitLocked = false, submitLabel, cancelHref, onSubmit, reconcile }) {
  const [values, setValues] = useState({
    categoryId: initial?.categoryId ?? "",
    name: initial?.name ?? "",
    unit: initial?.unit ?? "",
    minimumStock: initial ? String(initial.minimumStock) : "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const inFlight = useRef(false);

  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));
  const describedBy = (field) => (errors[field] ? `material-${field}-error` : undefined);

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current || outcomeUnknown) return;

    const parsed = materialRequestSchema.safeParse({
      categoryId: values.categoryId,
      name: values.name,
      unit: values.unit,
      minimumStock: parseIntegerInput(values.minimumStock),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFailure(null);
      return;
    }

    setErrors({});
    setFailure(null);
    inFlight.current = true;
    setSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } catch (apiError) {
      if (classifyMutationFailure(apiError) === UNKNOWN) {
        // Keep inFlight set: no further submit until the page reconciles.
        setOutcomeUnknown(true);
        setFailure(null);
        setSubmitting(false);
        return;
      }
      setFailure(apiError);
      if (apiError?.fields) setErrors(apiError.fields);
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const locked = submitting || outcomeUnknown;

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5" aria-describedby="material-form-status">
      <div className="grid gap-2">
        <Label htmlFor="material-categoryId">Kategori</Label>
        <select
          id="material-categoryId"
          name="categoryId"
          className={SELECT_CLASS}
          value={values.categoryId}
          required
          disabled={locked}
          aria-invalid={errors.categoryId ? true : undefined}
          aria-describedby={describedBy("categoryId")}
          onChange={set("categoryId")}
        >
          <option value="">Pilih kategori…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <FieldError id="material-categoryId-error" messages={errors.categoryId} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="material-name">Nama material</Label>
        <Input
          id="material-name"
          name="name"
          autoComplete="off"
          maxLength={MAX_MATERIAL_NAME_LENGTH}
          required
          value={values.name}
          readOnly={locked}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy("name")}
          onChange={set("name")}
        />
        <FieldError id="material-name-error" messages={errors.name} />
        <p className="text-xs text-muted-foreground">
          Nama tidak boleh sama dengan material lain, termasuk material yang diarsipkan (huruf besar/kecil dianggap
          sama).
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="material-unit">Satuan dasar</Label>
        <Input
          id="material-unit"
          name="unit"
          autoComplete="off"
          placeholder="pcs, pack, roll, lembar…"
          maxLength={MAX_MATERIAL_UNIT_LENGTH}
          required
          value={values.unit}
          readOnly={locked || unitLocked}
          aria-invalid={errors.unit ? true : undefined}
          aria-describedby={[describedBy("unit"), unitLocked ? "material-unit-locked" : undefined]
            .filter(Boolean)
            .join(" ") || undefined}
          onChange={set("unit")}
        />
        <FieldError id="material-unit-error" messages={errors.unit} />
        {unitLocked && (
          <p id="material-unit-locked" className="text-xs text-muted-foreground">
            Satuan terkunci karena material sudah memiliki transaksi atau tercatat dalam Stock Opname.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="material-minimumStock">Stok minimum</Label>
        <Input
          id="material-minimumStock"
          name="minimumStock"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          required
          value={values.minimumStock}
          readOnly={locked}
          aria-invalid={errors.minimumStock ? true : undefined}
          aria-describedby={describedBy("minimumStock")}
          onChange={set("minimumStock")}
        />
        <FieldError id="material-minimumStock-error" messages={errors.minimumStock} />
        <p className="text-xs text-muted-foreground">
          Status menjadi Stok Rendah saat stok di atas 0 tetapi tidak melebihi angka ini.
        </p>
      </div>

      <div id="material-form-status" aria-live="polite">
        {failure && (
          <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">
            {failure.message}
          </p>
        )}
        {outcomeUnknown && (
          <div role="alert" className="grid gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            <p>{UNKNOWN_OUTCOME_MESSAGE}</p>
            <p>
              Mengirim ulang bisa ditolak karena data sudah berubah, atau menimpa perubahan pengguna lain. Formulir
              dikunci sampai Anda memeriksa data terbaru.
            </p>
            {reconcile && (
              <Button type="button" size="sm" className="justify-self-start" onClick={reconcile.run}>
                {reconcile.label}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {!outcomeUnknown && (
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? "Menyimpan…" : submitLabel}
          </Button>
        )}
        {cancelHref && (
          <Button asChild variant="outline" size="lg">
            <Link href={cancelHref}>Batal</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
