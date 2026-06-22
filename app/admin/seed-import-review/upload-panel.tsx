"use client";

import { useActionState } from "react";

import {
  confirmSeedImportUpload,
  previewSeedImportUpload,
  type SeedImportUploadState,
} from "./upload-actions";

const initialState: SeedImportUploadState = {};
const CONFIRM_UPLOAD_IMPORT = "IMPORT_SEED_UPLOAD_ROWS";

function formatStatus(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function SeedImportUploadPanel() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewSeedImportUpload,
    initialState,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmSeedImportUpload,
    initialState,
  );
  const state = confirmState.saved || confirmState.error ? confirmState : previewState;
  const preview = previewState.preview;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white/90 p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="brand-eyebrow">CSV upload</p>
          <h2 className="brand-title mt-2 text-2xl font-semibold">
            Import seed candidates
          </h2>
          <p className="brand-copy mt-2 max-w-3xl text-sm leading-6">
            Upload up to 1000 CSV rows, preview the dry-run result, then confirm
            import into the admin review queue. Rows with unknown micro-skills
            are imported for manual review with the stored skill left blank.
          </p>
        </div>
      </div>

      <form action={previewAction} className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-xs font-semibold text-[color:var(--ink)]">
          CSV file
          <input
            name="seed_csv"
            type="file"
            accept=".csv,text/csv"
            required
            className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal text-[color:var(--ink)]"
          />
        </label>
        <button
          type="submit"
          disabled={previewPending}
          className="min-h-11 self-end rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--scarlett-dark)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {previewPending ? "Previewing..." : "Preview CSV"}
        </button>
      </form>

      {state.error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-950">
          {state.error}
        </div>
      ) : null}

      {state.saved ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-950">
          {state.saved}
        </div>
      ) : null}

      {preview ? (
        <div className="mt-5 grid gap-5">
          <div className="grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,247,220,0.45)] p-4">
              <p className="text-xs font-semibold uppercase text-[color:var(--mid)]">
                Total rows
              </p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--ink)]">
                {preview.summary.total_rows}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase text-emerald-900">
                Importable
              </p>
              <p className="mt-2 text-2xl font-semibold text-emerald-950">
                {preview.summary.importable_rows}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase text-amber-900">
                Manual review
              </p>
              <p className="mt-2 text-2xl font-semibold text-amber-950">
                {preview.summary.manual_review_rows}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase text-rose-900">
                Rejected
              </p>
              <p className="mt-2 text-2xl font-semibold text-rose-950">
                {preview.summary.rejected_rows}
              </p>
            </div>
          </div>

          {preview.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
              {preview.warnings.join(" ")}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[860px] border-collapse text-left text-xs">
              <thead>
                <tr className="bg-[rgba(255,247,220,0.45)] text-[10px] font-semibold uppercase text-[color:var(--mid)]">
                  <th className="px-3 py-3">Row</th>
                  <th className="px-3 py-3">Pair</th>
                  <th className="px-3 py-3">Uploaded skill</th>
                  <th className="px-3 py-3">Stored skill</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.map((row) => (
                  <tr key={row.rowNumber}>
                    <td className="border-t border-[var(--border)] px-3 py-3">
                      {row.rowNumber}
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-3 font-semibold text-[color:var(--ink)]">
                      {row.pair}
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-3">
                      {row.uploadedMicroSkillKey || "Blank"}
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-3">
                      {row.storedMicroSkillKey ?? "Manual review"}
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-3">
                      {formatStatus(row.status)}
                    </td>
                    <td className="border-t border-[var(--border)] px-3 py-3">
                      {row.reasons.length > 0 ? row.reasons.join(" ") : "Ready"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={confirmAction} className="grid gap-3 rounded-xl border border-[var(--border)] bg-[rgba(247,250,255,0.8)] p-4">
            <input type="hidden" name="encoded_csv" value={preview.encodedCsv} />
            <input type="hidden" name="encoded_preview" value={preview.encodedPreview} />
            <label className="grid gap-1 text-xs font-semibold text-[color:var(--ink)]">
              Source/license note
              <textarea
                name="source_license_note"
                required
                maxLength={1000}
                rows={3}
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal text-[color:var(--ink)]"
                defaultValue="Admin CSV upload; candidate evidence only, not learner evidence or canonical truth."
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-[color:var(--ink)]">
              Confirmation
              <input
                name="upload_import_confirmation"
                required
                pattern={CONFIRM_UPLOAD_IMPORT}
                placeholder={CONFIRM_UPLOAD_IMPORT}
                className="min-h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-normal text-[color:var(--ink)]"
              />
              <span className="text-[11px] font-normal text-[color:var(--mid)]">
                Type {CONFIRM_UPLOAD_IMPORT} exactly to confirm this import.
              </span>
            </label>
            <button
              type="submit"
              disabled={confirmPending}
              className="min-h-11 rounded-lg bg-[var(--scarlett)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--scarlett-dark)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {confirmPending ? "Importing..." : "Confirm import"}
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
