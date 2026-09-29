"use client";

import { useMemo, useState } from "react";

import { VisualConvergenceCandidatePreview } from "@/app/admin/adle/activity-catalogue/visual-convergence-candidates";
import { GuidedActivity } from "@/components/adle/activities/guided-activity";
import {
  ADLE_ACTIVITY_CATALOGUE,
  type ActivityCatalogueEntry,
} from "@/lib/adle/activity-catalogue";
import type { AdleSessionItem } from "@/lib/adle/loaders/daily-plan-surface";
import { ComparativeModePreviews } from "./comparative-mode-previews";
import { ReflectionLessonPreviews } from "./reflection-lesson-previews";

const AVAILABLE_TEMPLATES = ADLE_ACTIVITY_CATALOGUE.filter(
  (activity) => activity.status === "CANONICAL",
);

const TEMPLATE_VISUAL_CUES: Record<string, { symbol: string; label: string; surface: string }> = {
  INTRODUCTION: { symbol: "✦", label: "Open book and bright idea", surface: "bg-amber-100 text-amber-700" },
  READING_PAGE: { symbol: "☰", label: "Stacked reading pages", surface: "bg-sky-100 text-sky-700" },
  MEANING_DISCOVERY: { symbol: "💡", label: "Lightbulb moment", surface: "bg-yellow-100 text-yellow-700" },
  WORD_FAMILY_REVEAL: { symbol: "🌿", label: "Growing word family", surface: "bg-emerald-100 text-emerald-700" },
  CLEAVER: { symbol: "✂", label: "Split word into parts", surface: "bg-rose-100 text-rose-700" },
  WORD_ASSEMBLY: { symbol: "🧩", label: "Build word from tiles", surface: "bg-violet-100 text-violet-700" },
  COMPOUND_JIGSAW: { symbol: "🧩", label: "Join compound-word pieces", surface: "bg-indigo-100 text-indigo-700" },
  MEANING_MATCH: { symbol: "↔", label: "Connect word and meaning", surface: "bg-cyan-100 text-cyan-700" },
  MEANING_SORT: { symbol: "⇄", label: "Sort words into groups", surface: "bg-teal-100 text-teal-700" },
  COVER_CHECK: { symbol: "◐", label: "Reveal, cover, recall", surface: "bg-orange-100 text-orange-700" },
  DICTATION: { symbol: "♫", label: "Listen and write", surface: "bg-fuchsia-100 text-fuchsia-700" },
  COLD_WORD_RECALL: { symbol: "❄", label: "Cold recall before reveal", surface: "bg-blue-100 text-blue-700" },
  ERROR_REPAIR: { symbol: "↻", label: "Repair and retry", surface: "bg-lime-100 text-lime-700" },
  LESSON_REFLECTION: { symbol: "☁", label: "Think back on learning", surface: "bg-purple-100 text-purple-700" },
  MEMORY_CUE: { symbol: "🗝", label: "A key to remember", surface: "bg-pink-100 text-pink-700" },
};

function TemplateVisualCue({ activity, large = false }: { activity: ActivityCatalogueEntry; large?: boolean }) {
  const cue = TEMPLATE_VISUAL_CUES[activity.activityKey] ?? {
    symbol: "✦",
    label: "Learning activity",
    surface: "bg-slate-100 text-slate-700",
  };

  return (
    <div
      aria-label={cue.label}
      title={cue.label}
      className={`grid shrink-0 place-items-center rounded-2xl font-semibold ${cue.surface} ${
        large ? "h-20 w-20 text-4xl" : "h-12 w-12 text-2xl"
      }`}
    >
      <span aria-hidden="true">{cue.symbol}</span>
    </div>
  );
}

const ACTUAL_TASK_PREVIEW: Record<string, { groupId: string; candidateId: string }> = {
  INTRODUCTION: { groupId: "teaching", candidateId: "teaching-pages" },
  READING_PAGE: { groupId: "teaching", candidateId: "teaching-pages" },
  MEANING_DISCOVERY: { groupId: "meaning", candidateId: "discovery" },
  WORD_FAMILY_REVEAL: { groupId: "teaching", candidateId: "family-reveal" },
  CLEAVER: { groupId: "split", candidateId: "split-handle" },
  WORD_ASSEMBLY: { groupId: "build", candidateId: "prefix-build" },
  COMPOUND_JIGSAW: { groupId: "build", candidateId: "compound-generalized" },
  MEANING_MATCH: { groupId: "meaning", candidateId: "meaning-connection" },
  MEANING_SORT: { groupId: "meaning", candidateId: "bin-sort" },
  COVER_CHECK: { groupId: "spell", candidateId: "cover-check" },
  DICTATION: { groupId: "spell", candidateId: "generic-dictation" },
  COLD_WORD_RECALL: { groupId: "spell", candidateId: "review-cold-recall" },
  ERROR_REPAIR: { groupId: "spell", candidateId: "error-repair" },
  LESSON_REFLECTION: { groupId: "reflection", candidateId: "morphology-reflection" },
};

const MEMORY_CUE_FIXTURE: AdleSessionItem = {
  id: "template-menu-memory-cue",
  sourceEntityId: "template-menu-memory-cue",
  sectionKey: "guided_practice",
  templateKey: "MEMORY_CUE",
  position: 0,
  status: "preview",
  targetWord: "necessary",
  canonicalWordId: "template-menu-necessary",
  microSkillKey: null,
  adleLearningItemRef: null,
  promptData: {
    childFacingCopy: "Make a memory cue to help you remember this word.",
    purpose: "Use a picture, phrase, or pattern that makes sense to you.",
  },
};

function ActualTaskPreview({ activity }: { activity: ActivityCatalogueEntry }) {
  const [memoryCue, setMemoryCue] = useState("");
  const preview = ACTUAL_TASK_PREVIEW[activity.activityKey];

  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-950 p-4 text-white sm:p-5" aria-label={`${activity.displayName} learner preview`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">What the learner sees</p>
          <p className="mt-1 text-sm text-slate-300">Interactive fixture only — nothing is saved, assessed, or assigned.</p>
        </div>
        <span className="rounded-full border border-cyan-200/30 bg-cyan-200/10 px-3 py-1 text-xs font-semibold text-cyan-100">
          Live preview
        </span>
      </div>
      <div className="rounded-2xl bg-slate-900 p-3 sm:p-4">
        {activity.activityKey === "MEMORY_CUE" ? (
          <GuidedActivity
            item={MEMORY_CUE_FIXTURE}
            variant="memory_cue"
            value={memoryCue}
            onChange={setMemoryCue}
          />
        ) : preview ? (
          <VisualConvergenceCandidatePreview
            key={activity.activityKey}
            groupId={preview.groupId}
            candidateId={preview.candidateId}
            state="initial"
          />
        ) : null}
      </div>
    </section>
  );
}

function AvailabilityBadge({ activity }: { activity: ActivityCatalogueEntry }) {
  const labels = [
    activity.firstImpressionEligible ? "First impression" : null,
    activity.reviewEligible ? "Review" : null,
    activity.evidenceBearing ? "Evidence" : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full bg-[var(--mist)] px-2.5 py-1 text-xs font-semibold text-[color:var(--ink)]"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function AdleTemplateMenu() {
  const [selectedKey, setSelectedKey] = useState(AVAILABLE_TEMPLATES[0]?.activityKey ?? "");
  const selected = useMemo(
    () => AVAILABLE_TEMPLATES.find((activity) => activity.activityKey === selectedKey) ?? null,
    [selectedKey],
  );

  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-7">
        <header className="max-w-3xl">
          <p className="brand-eyebrow">Development-only · ADLE activity chooser</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">Choose an ADLE lesson template</h1>
          <p className="brand-copy mt-4">
            Browse the current canonical learning activities and select one to inspect its teaching purpose,
            supported modes, and required lesson content. This is a read-only planning menu: it does not
            create an assignment or record learner data.
          </p>
        </header>

        <ComparativeModePreviews />
        <ReflectionLessonPreviews />
        <section className="brand-card rounded-3xl p-5" aria-labelledby="template-library-title">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="brand-eyebrow">Template library</p>
              <h2 id="template-library-title" className="mt-1 text-2xl font-semibold text-[color:var(--ink)]">
                {AVAILABLE_TEMPLATES.length} available templates
              </h2>
            </div>
            <label className="grid min-w-[260px] gap-1.5 text-sm font-medium text-[color:var(--ink)]">
              Choose a template
              <select
                value={selectedKey}
                onChange={(event) => setSelectedKey(event.target.value)}
                className="brand-input h-11 rounded-2xl px-4 text-sm"
              >
                {AVAILABLE_TEMPLATES.map((activity) => (
                  <option key={activity.activityKey} value={activity.activityKey}>
                    {activity.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {AVAILABLE_TEMPLATES.map((activity) => {
              const isSelected = activity.activityKey === selectedKey;
              return (
                <button
                  key={activity.activityKey}
                  type="button"
                  onClick={() => setSelectedKey(activity.activityKey)}
                  aria-pressed={isSelected}
                  className={`rounded-2xl border p-4 text-left transition ${
                    isSelected
                      ? "border-[var(--scarlett)] bg-[rgba(252,228,244,0.45)] shadow-sm"
                      : "border-[var(--border)] bg-white hover:border-[var(--scarlett)]/60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <TemplateVisualCue activity={activity} />
                    <div>
                      <p className="text-base font-semibold text-[color:var(--ink)]">{activity.displayName}</p>
                      <p className="mt-1 text-xs font-medium text-[color:var(--mid)]">
                        {TEMPLATE_VISUAL_CUES[activity.activityKey]?.label ?? "Learning activity"}
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-[color:var(--mid)]">
                    {activity.pedagogicalPurpose}
                  </p>
                  <AvailabilityBadge activity={activity} />
                </button>
              );
            })}
          </div>
        </section>

        {selected ? (
          <section className="brand-card grid gap-5 rounded-3xl p-5" aria-live="polite">
            <div className="flex flex-wrap items-start gap-4">
              <TemplateVisualCue activity={selected} large />
              <div>
                <p className="brand-eyebrow">Selected template</p>
                <h2 className="mt-1 text-3xl font-semibold text-[color:var(--ink)]">{selected.displayName}</h2>
                <p className="mt-3 max-w-3xl text-[color:var(--mid)]">{selected.pedagogicalPurpose}</p>
                <AvailabilityBadge activity={selected} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                <h3 className="font-semibold text-[color:var(--ink)]">When to use it</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">{selected.whenToUse}</p>
                <h3 className="mt-4 font-semibold text-[color:var(--ink)]">Not the right fit when</h3>
                <p className="mt-2 text-sm leading-6 text-[color:var(--mid)]">{selected.whenNotToUse}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                <h3 className="font-semibold text-[color:var(--ink)]">Supported modes</h3>
                <ul className="mt-2 grid gap-2 text-sm text-[color:var(--mid)]">
                  {selected.supportedModes.map((mode) => (
                    <li key={mode}>
                      <span className="font-medium text-[color:var(--ink)]">{mode.replaceAll("_", " ")}</span>
                      {selected.modeDescriptions[mode] ? ` — ${selected.modeDescriptions[mode]}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                <h3 className="font-semibold text-[color:var(--ink)]">Required lesson content</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--mid)]">
                  {selected.requiredInputs.map((input) => <li key={input}>{input}</li>)}
                </ul>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
                <h3 className="font-semibold text-[color:var(--ink)]">Implementation</h3>
                <p className="mt-2 text-sm text-[color:var(--mid)]">
                  {selected.canonicalComponent ?? "No canonical component"}
                </p>
                {selected.canonicalComponentPath ? (
                  <code className="mt-2 block break-all text-xs text-[color:var(--mid)]">
                    {selected.canonicalComponentPath}
                  </code>
                ) : null}
              </div>
            </div>

            <ActualTaskPreview activity={selected} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
