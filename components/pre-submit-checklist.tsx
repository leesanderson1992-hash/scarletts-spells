"use client";

import { useMemo, useState } from "react";

type PreSubmitChecklistProps = {
  submitLabel: string;
  onBeforeSubmit?: () => void;
};

const CHECKS = [
  "I checked my capital letters",
  "I checked my full stops",
  "I read it back once",
] as const;

export function PreSubmitChecklist({
  submitLabel,
  onBeforeSubmit,
}: PreSubmitChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<boolean[]>(
    CHECKS.map(() => false),
  );

  const allChecked = useMemo(
    () => checkedItems.every(Boolean),
    [checkedItems],
  );

  return (
    <div className="rounded-[1.75rem] border border-[var(--border)] bg-[rgba(255,247,220,0.45)] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
        Before I submit
      </p>
      <div className="mt-3 grid gap-2">
        {CHECKS.map((label, index) => (
          <label
            key={label}
            className="inline-flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[color:var(--ink)]"
          >
            <input
              type="checkbox"
              checked={checkedItems[index]}
              onChange={(event) => {
                setCheckedItems((current) =>
                  current.map((value, currentIndex) =>
                    currentIndex === index ? event.target.checked : value,
                  ),
                );
              }}
              className="mt-1 h-4 w-4 rounded border-[var(--border)] text-[var(--scarlett)]"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <button
        type="submit"
        onClick={() => {
          if (allChecked) {
            onBeforeSubmit?.();
          }
        }}
        disabled={!allChecked}
        className="brand-primary-btn mt-4 w-fit disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  );
}
