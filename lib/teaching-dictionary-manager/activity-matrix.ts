import type { LessonActivityKind } from "../adle/composable-lesson/contracts";
import type { WordActivityAssessment } from "./activity-assessment";

const ORDER: readonly LessonActivityKind[] = [
  "introduction", "discovery", "guided_prompt", "family_reveal", "cleaver",
  "word_build", "compound_jigsaw", "meaning_match", "meaning_sort",
  "cover_check", "dictation", "review_quick_sort", "must_use_writing",
  "diagnostic_probe", "reflection",
];

export const ACTIVITY_LABELS: Record<LessonActivityKind, string> = {
  introduction: "Intro", discovery: "Discover", guided_prompt: "Guided prompt",
  family_reveal: "Word family", cleaver: "Cleaver", word_build: "Word build",
  compound_jigsaw: "Compound", meaning_match: "Meaning match",
  meaning_sort: "Meaning sort", cover_check: "Cover check",
  dictation: "Dictation", review_quick_sort: "Review sort",
  must_use_writing: "Writing", diagnostic_probe: "Diagnostic",
  reflection: "Reflection",
};

export function matrixColumns(rows: readonly (readonly WordActivityAssessment[])[]): LessonActivityKind[] {
  const present = new Set(rows.flatMap((row) => row.map((assessment) => assessment.variant.kind)));
  return ORDER.filter((kind) => present.has(kind));
}

export type MatrixCell = {
  state: "ready" | "warning" | "not_applicable";
  reason: string;
  action: { label: string; href: string } | null;
  remainingIssues: number;
};

export function matrixCell(assessment: WordActivityAssessment | undefined, microSkillKey: string): MatrixCell {
  if (!assessment || assessment.status === "not_used") {
    return { state: "not_applicable", reason: "This lesson does not use the word for this activity.", action: null, remainingIssues: 0 };
  }
  if (assessment.variant.wordScope === "no_word") {
    return { state: "not_applicable", reason: "This is a lesson-level activity with no word-specific requirement.", action: null, remainingIssues: 0 };
  }
  if (assessment.status === "ready" && assessment.validatorConfirmed) {
    return { state: "ready", reason: "The released lesson member passed the existing compiler and validation checks.", action: null, remainingIssues: 0 };
  }
  const issues = assessment.requirements.filter((requirement) => requirement.status !== "present")
    .sort((a, b) => Number(b.status === "missing") - Number(a.status === "missing"));
  const first = issues[0];
  const target = first?.editTarget ?? `td-route-${microSkillKey}`;
  return {
    state: "warning",
    reason: first ? `${first.status === "missing" ? "Missing" : "Needs review"}: ${first.label}`
      : assessment.status === "incompatible" ? "This word does not fit this question variant. Review its route facts."
        : "Facts are present; validate and publish this route member.",
    action: { label: first ? `${first.status === "missing" ? "Add" : "Review"} ${first.label}` : "Validate route", href: `#${target}` },
    remainingIssues: Math.max(issues.length - 1, 0),
  };
}
