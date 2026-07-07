"use client";

/**
 * ADLE Slice 7a (7a-A): the read-only lesson intro — a warm reveal of today's
 * teaching point and the lesson words (with their true display spelling and a
 * provenance badge). Read-only: no attempt, no submission.
 */

import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";

interface Preview {
  canonicalWordId?: string;
  displayWord?: string | null;
  provenance?: string;
}

const PROVENANCE_LABEL: Readonly<Record<string, string>> = {
  learning_item: "your word",
  stretch: "a stretch word",
  probe_miss: "a detective word",
};

function readPreviews(item: AdleSessionItem): Preview[] {
  const previews = item.promptData.lessonWordPreviews;
  return Array.isArray(previews) ? (previews as Preview[]) : [];
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function IntroActivity(props: { item: AdleSessionItem }) {
  const { item } = props;
  const objective = str(item.promptData.teachingObjective);
  const explanation = str(item.promptData.childFriendlyExplanation);
  const rule = str(item.promptData.ruleExplanation);
  const previews = readPreviews(item);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
      {objective !== null ? (
        <p className="text-sm font-semibold text-[color:var(--scarlett)]">✨ {objective}</p>
      ) : null}
      {explanation !== null ? <p className="mt-1 text-sm text-[color:var(--ink)]">{explanation}</p> : null}
      {rule !== null ? <p className="mt-1 text-sm text-[color:var(--mid)]">{rule}</p> : null}
      {previews.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[color:var(--mid)]">Today&apos;s words</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {previews.map((preview, index) => (
              <li
                key={preview.canonicalWordId ?? index}
                className="rounded-full bg-[color:var(--wash,#faf5f8)] px-3 py-1 text-sm"
              >
                <span className="font-semibold text-[color:var(--ink)]">{preview.displayWord}</span>
                {preview.provenance && PROVENANCE_LABEL[preview.provenance] ? (
                  <span className="text-xs text-[color:var(--mid)]"> · {PROVENANCE_LABEL[preview.provenance]}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
