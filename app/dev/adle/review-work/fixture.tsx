"use client";

import { useState } from "react";

import {
  AdleWritingIssuePicker,
  type AdleWritingHighlight,
  type AdleWritingIssuePickerAddInput,
  type AdleWritingIssuePickerAddResult,
} from "@/app/courses/review/adle-writing-issue-picker";
import { UnifiedSpellingReviewTable } from "@/app/courses/review/unified-spelling-review-table";
import { classifyAdditionalSpellingOccurrence } from "@/lib/adle/review-work/additional-spelling";
import {
  formatErrorPatternLabel,
  type ErrorPattern,
} from "@/lib/spelling/errorPatterns";
import { WORD_FAMILIES } from "@/lib/spelling/wordFamilies";
import { analyseParentAddedMisspellingPair } from "@/lib/writing-engine/spelling/parent-added-misspelling-analysis";
import type { ReviewWorkCandidateCaptureMicroSkillOption } from "@/lib/writing-engine/persistence/learning-items";
import type { UnifiedSpellingReviewItem } from "@/lib/writing-engine/persistence/unified-spelling-review-items";

const ROOT_SKILL = "D4_MOR_ROOTS_ROOT_FAMILY_SPELLING";
const SCHWA_SKILL = "D4_SCHWA_MEDIAL_COMMON_WEAK_VOWELS";

const submittedWritingText =
  "I think homework can feel imposible when every subject gives a task on the same night. It is neccessary to practise important skills, because repetition can make a different result possible. However, the home enviroment should also leave time for famly, exercise and rest. Children may recieve better support if teachers coordinate their plans. My favourite solution is a short, focused task instead of a seperate worksheet for every lesson. This would definately reduce stress without removing useful practice. A seperate plan would still need agreement. I would be surprised if a balanced plan did not help, just as a well-maintained bicycle works better than one pushed too hard.";

function occurrence(word: string, occurrenceNumber = 1) {
  let start = -1;
  let cursor = 0;
  for (let index = 0; index < occurrenceNumber; index += 1) {
    start = submittedWritingText.indexOf(word, cursor);
    cursor = start + word.length;
  }
  return { start, end: start + word.length };
}

const targetOccurrenceModels = [
  { encounterId: "target-impossible", canonicalSpelling: "impossible", originalObservedSpelling: "imposible", ...occurrence("imposible") },
  { encounterId: "target-necessary", canonicalSpelling: "necessary", originalObservedSpelling: "neccessary", ...occurrence("neccessary") },
  { encounterId: "target-environment", canonicalSpelling: "environment", originalObservedSpelling: "enviroment", ...occurrence("enviroment") },
  { encounterId: "target-receive", canonicalSpelling: "receive", originalObservedSpelling: "recieve", ...occurrence("recieve") },
].map((target) => ({
  ...target,
  originalOutcomeSource: "writing" as const,
  positionStart: target.start,
  positionEnd: target.end,
}));

const highlights: AdleWritingHighlight[] = [
  ...targetOccurrenceModels.map((target) => ({
    start: target.positionStart,
    end: target.positionEnd,
    label:
      target.encounterId === "target-impossible" || target.encounterId === "target-necessary"
        ? "Target Word: repaired"
        : "Target Word: not secured",
    tone:
      target.encounterId === "target-impossible" || target.encounterId === "target-necessary"
        ? ("repaired" as const)
        : ("not_secured" as const),
  })),
  ...["different", "possible", "favourite", "solution", "surprised"].map((word) => ({
    ...occurrence(word),
    label: "Target Word: originally successful",
    tone: "success" as const,
  })),
];

const options: ReviewWorkCandidateCaptureMicroSkillOption[] = [
  {
    microSkillKey: ROOT_SKILL,
    displayName: "Keep the root spelling across a word family",
    skillFamilyKey: "D4_MOR",
    skillFamilyDisplayName: "Morphology",
    skillClusterKey: "D4_MOR_ROOTS",
    skillClusterDisplayName: "Roots and word families",
  },
  {
    microSkillKey: SCHWA_SKILL,
    displayName: "Common medial weak vowels",
    skillFamilyKey: "D4_SCHWA",
    skillFamilyDisplayName: "Unstressed vowels / schwa",
    skillClusterKey: "D4_SCHWA_MEDIAL",
    skillClusterDisplayName: "Medial schwa",
  },
];

function recommendation(input: {
  authority: "known_match" | "possible_match";
  microSkillKey: string;
  familyKey: string;
  clusterKey: string;
  confidence: number;
  reason: string;
}): NonNullable<UnifiedSpellingReviewItem["microSkillRecommendation"]> {
  return {
    recommendationStatus: "recommended",
    recommendationAuthority: input.authority,
    recommendedFamilyKey: input.familyKey,
    recommendedClusterKey: input.clusterKey,
    recommendedMicroSkillKey: input.microSkillKey,
    rankedMicroSkillCandidates: [],
    confidence: input.confidence >= 90 ? "high" : "medium",
    confidencePercent: input.confidence,
    reason: input.reason,
    sourceSignals: [],
    fallbackReason: "low_confidence",
    isPrefillAllowed: true,
  };
}

function row(input: {
  id: string;
  observed: string;
  correct: string;
  category: string;
  secondary: string | null;
  pattern: ErrorPattern;
  familyId: string;
  familyLabel: string;
  recommendation: UnifiedSpellingReviewItem["microSkillRecommendation"];
  positionStart?: number;
  positionEnd?: number;
}): UnifiedSpellingReviewItem {
  return {
    id: input.id,
    source: "adle_parent_added_missed_word",
    state: "categorisation_needed",
    categorisationStatus: "categorisation_needed",
    observedText: input.observed,
    expectedCorrection: input.correct,
    latestChildAttempt: null,
    childReflection: null,
    correctionOutcome: null,
    draftFinalClassification: null,
    draftFinalClassificationUpdatedAt: null,
    suggestedMicroSkillKey: null,
    verifiedMicroSkillKey: null,
    microSkillKey: null,
    microSkillRecommendation: input.recommendation,
    knownMatchAutoResolution: null,
    terminalStatus: null,
    readyForApproval: false,
    parentNote: "Parent identified this occurrence in the completed ADLE Review writing.",
    analysis: {
      primaryCategory: input.category,
      secondaryCategory: input.secondary,
      detectedErrorPattern: input.pattern,
      detectedErrorPatternLabel: formatErrorPatternLabel(input.pattern),
      selectedWordFamilyId: input.familyId,
      selectedWordFamilyLabel: input.familyLabel,
    },
    sourceIds: {
      currentTaskSubmissionId: null,
      writingSampleId: null,
      misspellingInstanceId: null,
      writingIssueSuggestionId: `suggestion-${input.id}`,
      parentVerificationId: null,
      writingIssueId: null,
      originalWritingIssueId: null,
      correctionAttemptId: null,
      catalogReviewCaseId: null,
      candidateMappingId: null,
      canonicalRecommendationId: null,
      canonicalRecommendationStatus: null,
      adleReviewSessionId: "fixture-session",
      adleParentIssueLinkId: input.id,
    },
    provenance: {
      parentAuthored: true,
      sourceKind: "adle_review_submitted_writing_parent_identified",
      previousTaskSubmissionId: null,
      metadata: {
        context_text: submittedWritingText.slice(
          Math.max(0, (input.positionStart ?? 0) - 28),
          Math.min(submittedWritingText.length, (input.positionEnd ?? 0) + 28),
        ),
        position_start: input.positionStart,
        position_end: input.positionEnd,
      },
    },
  };
}

const initialRows = [
  row({
    id: "fixture-definately",
    observed: "definately",
    correct: "definitely",
    category: "Morphology",
    secondary: null,
    pattern: "root_family_preservation_error",
    familyId: "igh-ie-y",
    familyLabel: "igh / ie / y",
    recommendation: recommendation({
      authority: "possible_match",
      microSkillKey: ROOT_SKILL,
      familyKey: "D4_MOR",
      clusterKey: "D4_MOR_ROOTS",
      confidence: 84,
      reason: "The root-family diagnosis supports this route.",
    }),
    positionStart: occurrence("definately").start,
    positionEnd: occurrence("definately").end,
  }),
  row({
    id: "fixture-seperate",
    observed: "seperate",
    correct: "separate",
    category: "Phonic",
    secondary: "Pattern/rule",
    pattern: "wrong_vowel_grapheme",
    familyId: "schwa_unstressed_vowel",
    familyLabel: "Schwa unstressed vowel",
    recommendation: recommendation({
      authority: "known_match",
      microSkillKey: SCHWA_SKILL,
      familyKey: "D4_SCHWA",
      clusterKey: "D4_SCHWA_MEDIAL",
      confidence: 100,
      reason: "A resolver-visible canonical pair maps this spelling to medial schwa.",
    }),
    positionStart: occurrence("seperate").start,
    positionEnd: occurrence("seperate").end,
  }),
];

const fixtureTargetGroups = [
  {
    label: "Successful",
    words: ["different", "possible", "favourite", "solution", "surprised", "bicycle"],
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    label: "Repaired",
    words: ["impossible", "necessary"],
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
  {
    label: "Missed",
    words: ["environment", "receive"],
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
];

export function AdleReviewWorkDevFixture() {
  const [rows, setRows] = useState(initialRows);
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const unresolvedCount = rows.filter((item) => !item.terminalStatus).length;

  function addFixtureMisspelling(
    input: AdleWritingIssuePickerAddInput,
  ): AdleWritingIssuePickerAddResult {
    const analysis = analyseParentAddedMisspellingPair(input);
    if (!analysis) {
      return {
        ok: false,
        message: "Enter two different spellings before adding this observation.",
      };
    }

    const occurrenceDecision = classifyAdditionalSpellingOccurrence({
      ...input,
      targets: targetOccurrenceModels,
    });
    if (occurrenceDecision.status === "already_captured") {
      return {
        ok: false,
        message: "Already captured by ADLE Review. Use the Target Word evidence above.",
      };
    }

    const duplicate = rows.some((item) => {
      const start = item.provenance.metadata.position_start;
      const end = item.provenance.metadata.position_end;
      return start === input.positionStart && end === input.positionEnd;
    });
    if (duplicate) {
      return { ok: false, message: "That exact occurrence is already in the spelling table." };
    }

    const teachingFamily = WORD_FAMILIES.find(
      (family) => family.id === analysis.selectedWordFamilyId,
    );
    const recommendedOption =
      analysis.primaryCategory === "Morphology" ? options[0] : options[1];
    const id = `fixture-added-${input.positionStart}-${input.positionEnd}`;
    const newRow = row({
      id,
      observed: analysis.observedSpelling,
      correct: analysis.correctSpelling,
      category: analysis.primaryCategory,
      secondary: analysis.secondaryCategory,
      pattern: analysis.detectedErrorPattern,
      familyId: analysis.selectedWordFamilyId ?? "tricky-words",
      familyLabel: teachingFamily?.label ?? "No teaching family selected",
      positionStart: input.positionStart,
      positionEnd: input.positionEnd,
      recommendation: recommendation({
        authority: "possible_match",
        microSkillKey: recommendedOption.microSkillKey,
        familyKey: recommendedOption.skillFamilyKey ?? "",
        clusterKey: recommendedOption.skillClusterKey ?? "",
        confidence: 78,
        reason: `Shared spelling analysis identified ${formatErrorPatternLabel(
          analysis.detectedErrorPattern,
        ).toLocaleLowerCase("en-GB")}.`,
      }),
    });

    setRows((current) => [...current, newRow]);
    setNotice(`${analysis.observedSpelling} → ${analysis.correctSpelling} was added in memory.`);
    return { ok: true, message: "Added to the spelling table with shared analysis." };
  }

  function resolveRow(
    rowId: string,
    resolution: "confirmed" | "not_a_learning_issue" | "sent_to_admin",
    microSkillKey?: string,
  ) {
    setRows((current) =>
      current.map((item) => {
        if (item.id !== rowId) return item;
        const terminalStatus =
          resolution === "confirmed"
            ? "resolved_known_match"
            : resolution === "sent_to_admin"
              ? "sent_to_admin"
              : "not_an_issue";
        return {
          ...item,
          state:
            resolution === "confirmed"
              ? "resolved"
              : resolution === "sent_to_admin"
                ? "sent_to_admin"
                : "not_an_issue",
          categorisationStatus:
            resolution === "confirmed"
              ? "categorised"
              : resolution === "sent_to_admin"
                ? "sent_to_admin"
                : "not_applicable",
          microSkillKey: microSkillKey ?? item.microSkillKey,
          terminalStatus,
          readyForApproval: true,
          sourceIds: {
            ...item.sourceIds,
            parentVerificationId: resolution === "sent_to_admin" ? null : `verification-${item.id}`,
            candidateMappingId: resolution === "confirmed" ? `mapping-${item.id}` : null,
            catalogReviewCaseId: resolution === "sent_to_admin" ? `catalog-${item.id}` : null,
          },
        };
      }),
    );
    setNotice(
      resolution === "confirmed"
        ? "Learning route confirmed. The fixture created one in-memory canonical intake signal."
        : resolution === "sent_to_admin"
          ? "Sent to catalog review in memory."
          : "Marked as not a learning issue in memory.",
    );
  }

  return (
    <main className="brand-page min-h-screen px-4 py-8 md:px-6">
      <div className="mx-auto grid max-w-6xl gap-4">
        <header className="brand-card rounded-3xl p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="brand-eyebrow">ADLE Review · Local fixture</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--ink)] md:text-3xl">
                Should Homework Be Banned?
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Learner Review complete</span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">{reviewed ? "Reviewed" : "Available to review"}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-xs font-medium sm:grid-cols-4">
              <span className="rounded-2xl border border-[var(--border)] bg-white px-3 py-2">10 targets</span>
              <span className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">6 correct</span>
              <span className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">2 repaired</span>
              <span className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">2 not secured</span>
            </div>
          </div>
          {notice ? <p role="status" className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{notice}</p> : null}
        </header>

        <AdleWritingIssuePicker
          submittedWritingText={submittedWritingText}
          highlights={highlights}
          sourceId="fixture"
          childId="fixture-child"
          redirectPath="/dev/adle/review-work"
          readOnly={reviewed}
          onPreviewAdd={addFixtureMisspelling}
        />

        <section className="brand-card rounded-3xl p-5 md:p-6">
          <details className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-4">
            <summary className="cursor-pointer font-semibold">View Target Word details</summary>
            <p className="mt-2 text-sm text-[color:var(--mid)]">10 immutable Target Word rows: 6 successful, 2 repaired, and 2 not secured.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {fixtureTargetGroups.map((group) => (
                <section
                  key={group.label}
                  className={`rounded-2xl border p-4 ${group.className}`}
                >
                  <h3 className="font-semibold">
                    {group.label} · {group.words.length}
                  </h3>
                  <ul className="mt-2 grid gap-1 text-sm">
                    {group.words.map((word) => (
                      <li key={word}>{word}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </details>
        </section>

        <UnifiedSpellingReviewTable
          rows={rows}
          options={options}
          submissionId=""
          redirectPath="/dev/adle/review-work"
          reviewWorkflowPhase="adle_observational"
          adleContext={{ sourceId: "fixture", childId: "fixture-child", readOnly: reviewed }}
          previewActions={{ resolve: resolveRow }}
        />

        <section className="brand-card rounded-3xl p-5 md:p-6">
          <p className="text-sm leading-6 text-[color:var(--mid)]">Submit finishes only this parent inspection. It never changes learner completion, schedules, Target Word outcomes or rewards. Confirmed spelling signals may enter the child queue when governed intake is ready; they do not create a Golden Nugget under the current rule.</p>
          <button
            type="button"
            className="brand-primary-btn mt-3 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={reviewed || unresolvedCount > 0}
            onClick={() => { setReviewed(true); setNotice("Submitted. Only the in-memory observational status changed."); }}
          >
            {reviewed ? "Reviewed" : "Submit"}
          </button>
          {!reviewed && unresolvedCount > 0 ? <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[color:var(--mid)]">Finish or dismiss {unresolvedCount} added spellings before submitting.</p> : null}
        </section>
      </div>
    </main>
  );
}
