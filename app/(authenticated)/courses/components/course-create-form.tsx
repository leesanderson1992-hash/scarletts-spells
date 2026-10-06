"use client";

import Link from "next/link";
import { useState } from "react";

import { createCourse } from "@/app/courses/actions";
import { BuilderInfoHint } from "@/app/courses/components/builder-info-hint";

type CourseCreateFormProps = {
  childFirstName: string;
  childId: string;
  closeHref: string;
  redirectPath: string;
};

export function CourseCreateForm({
  childFirstName,
  childId,
  closeHref,
  redirectPath,
}: CourseCreateFormProps) {
  const [structureType, setStructureType] = useState<"phased" | "timed">("phased");
  const showTimedFields = structureType === "timed";

  return (
    <form
      action={createCourse}
      className="mt-3 grid gap-3 rounded-[1.5rem] border border-[var(--border)] bg-white px-4 py-4"
    >
      <input type="hidden" name="child_id" value={childId} />
      <input type="hidden" name="redirect_path" value={redirectPath} />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
          Create course
        </p>
        <BuilderInfoHint label="Course creation help">
          Progress courses move through ordered stages. Timed courses generate visible cycles for tasks and checkpoints.
        </BuilderInfoHint>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(252,228,244,0.2)] px-4 py-3.5 text-sm text-[color:var(--ink)]">
          <span className="flex items-start gap-3">
            <input
              type="radio"
              name="structure_type"
              value="phased"
              checked={structureType === "phased"}
              onChange={() => setStructureType("phased")}
              className="mt-1 h-4 w-4 border-[var(--border)] text-[var(--scarlett)]"
            />
            <span className="grid gap-1">
              <span className="font-semibold">Progress course</span>
              <span className="text-sm text-[color:var(--mid)]">Ordered stages</span>
            </span>
          </span>
        </label>

        <label className="rounded-[1.35rem] border border-[var(--border)] bg-[rgba(255,247,220,0.45)] px-4 py-3.5 text-sm text-[color:var(--ink)]">
          <span className="flex items-start gap-3">
            <input
              type="radio"
              name="structure_type"
              value="timed"
              checked={structureType === "timed"}
              onChange={() => setStructureType("timed")}
              className="mt-1 h-4 w-4 border-[var(--border)] text-[var(--scarlett)]"
            />
            <span className="grid gap-1">
              <span className="font-semibold">Timed course</span>
              <span className="text-sm text-[color:var(--mid)]">Visible cycles and timing</span>
            </span>
          </span>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Title
          </span>
          <input
            type="text"
            name="title"
            className="brand-input h-11 rounded-2xl px-4 text-sm"
            placeholder="Creative Writing"
          />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
            Summary
          </span>
          <textarea
            name="description"
            rows={2}
            className="brand-input min-h-11 rounded-2xl px-4 py-3 text-sm"
            placeholder="What is this course for?"
          />
        </label>
      </div>

      {showTimedFields ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--mid)]">
              Timing
            </p>
            <BuilderInfoHint label="Timed course timing help">
              These dates generate the visible cycles used for timed planning.
            </BuilderInfoHint>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <input
              type="date"
              name="start_date"
              className="brand-input h-11 rounded-2xl px-4 text-sm"
              aria-label="Course start date"
            />
            <input
              type="number"
              name="duration_weeks"
              min={1}
              max={104}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
              placeholder="Weeks"
              aria-label="Course duration in weeks"
            />
            <input
              type="number"
              name="cycle_length_weeks"
              min={1}
              max={12}
              defaultValue={4}
              className="brand-input h-11 rounded-2xl px-4 text-sm"
              placeholder="Cycle"
              aria-label="Cycle length in weeks"
            />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="start_date" value="" />
          <input type="hidden" name="duration_weeks" value="" />
          <input type="hidden" name="cycle_length_weeks" value="4" />
        </>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-full bg-[var(--scarlett)] px-5 text-sm font-medium text-white transition hover:brightness-105"
          title={`Create course for ${childFirstName}`}
          aria-label={`Create course for ${childFirstName}`}
        >
          Create course
        </button>
        <Link
          href={closeHref}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[color:var(--mid)] transition hover:text-[var(--scarlett)]"
          title="Close add course"
          aria-label="Close add course"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
            <path d="M5.7 5.7a1 1 0 0 1 1.4 0L10 8.6l2.9-2.9a1 1 0 1 1 1.4 1.4L11.4 10l2.9 2.9a1 1 0 0 1-1.4 1.4L10 11.4l-2.9 2.9a1 1 0 0 1-1.4-1.4l2.9-2.9-2.9-2.9a1 1 0 0 1 0-1.4Z" />
          </svg>
        </Link>
      </div>
    </form>
  );
}
