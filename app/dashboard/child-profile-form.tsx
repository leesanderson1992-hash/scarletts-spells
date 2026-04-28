"use client";

import { useActionState } from "react";

import type { ChildFormState } from "./actions";

type ChildProfileFormProps = {
  action: (
    state: ChildFormState,
    formData: FormData,
  ) => Promise<ChildFormState>;
  title: string;
  description: string;
  submitLabel: string;
  initialName?: string;
  initialAge?: number | null;
  childId?: string;
};

const initialState: ChildFormState = {
  error: null,
};

export function ChildProfileForm({
  action,
  title,
  description,
  submitLabel,
  initialName = "",
  initialAge = null,
  childId,
}: ChildProfileFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <section className="brand-card rounded-3xl p-6">
      <div className="mb-5">
        <h2 className="brand-title text-3xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="brand-copy mt-2 text-sm leading-6">
          {description}
        </p>
      </div>

      <form action={formAction} className="grid gap-4">
        {childId ? <input type="hidden" name="child_id" value={childId} /> : null}

        <label className="grid gap-2 text-sm font-medium text-[color:var(--mid)]">
          Child name
          <input
            type="text"
            name="name"
            required
            defaultValue={initialName}
            className="brand-input h-11 rounded-2xl px-4 text-sm transition"
            placeholder="Scarlett Anderson"
          />
        </label>

        <label className="grid gap-2 text-sm font-medium text-[color:var(--mid)]">
          Age
          <input
            type="number"
            name="age"
            min="1"
            max="18"
            defaultValue={initialAge ?? ""}
            className="brand-input h-11 rounded-2xl px-4 text-sm transition"
            placeholder="Optional"
          />
        </label>

        {state.error ? (
          <p className="text-sm text-rose-600">{state.error}</p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="brand-primary-btn disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Saving..." : submitLabel}
        </button>
      </form>
    </section>
  );
}
