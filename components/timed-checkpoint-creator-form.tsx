"use client";

import { useMemo, useState } from "react";

type TimedCheckpointOption = {
  value: string;
  label: string;
  endDate: string;
};

export function TimedCheckpointCreatorForm({
  action,
  courseId,
  redirectPath,
  cycleOptions,
  defaultCycleValue,
}: {
  action: (formData: FormData) => void | Promise<void>;
  courseId: string;
  redirectPath: string;
  cycleOptions: TimedCheckpointOption[];
  defaultCycleValue?: string | null;
}) {
  const initialCycleValue =
    defaultCycleValue && cycleOptions.some((option) => option.value === defaultCycleValue)
      ? defaultCycleValue
      : cycleOptions[0]?.value ?? "";

  const initialDate =
    cycleOptions.find((option) => option.value === initialCycleValue)?.endDate ?? "";

  const [cycleValue, setCycleValue] = useState(initialCycleValue);
  const [scheduledDate, setScheduledDate] = useState(initialDate);
  const [didOverrideDate, setDidOverrideDate] = useState(false);

  const activeCycle = useMemo(
    () => cycleOptions.find((option) => option.value === cycleValue) ?? null,
    [cycleOptions, cycleValue],
  );

  return (
    <form
      action={action}
      className="mt-3 grid gap-2 rounded-[1.35rem] border border-[var(--border)] bg-white px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_200px_170px_auto]"
    >
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="redirect_path" value={redirectPath} />
      <input
        type="text"
        name="title"
        className="brand-input h-11 rounded-2xl px-4 text-sm"
        placeholder="Checkpoint title"
      />
      <select
        name="cycle_number"
        value={cycleValue}
        onChange={(event) => {
          const nextCycleValue = event.target.value;
          const nextCycle = cycleOptions.find((option) => option.value === nextCycleValue) ?? null;
          setCycleValue(nextCycleValue);
          if (!didOverrideDate) {
            setScheduledDate(nextCycle?.endDate ?? "");
          }
        }}
        className="brand-input h-11 rounded-2xl px-4 text-sm"
        aria-label="Cycle for this checkpoint"
      >
        {cycleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        name="scheduled_date"
        value={scheduledDate}
        onChange={(event) => {
          setDidOverrideDate(true);
          setScheduledDate(event.target.value);
        }}
        className="brand-input h-11 rounded-2xl px-4 text-sm"
        aria-label={
          activeCycle ? `${activeCycle.label} checkpoint date` : "Checkpoint date"
        }
      />
      <button
        type="submit"
        className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
      >
        Add checkpoint
      </button>
    </form>
  );
}
