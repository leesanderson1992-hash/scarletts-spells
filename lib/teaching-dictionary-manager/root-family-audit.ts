import type { MultiSenseCsvBundle } from "./multi-sense-csv";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";

export const ROOT_REVIEW_FOCUS = [
  { root: "vis", forms: ["vis"] }, { root: "dict", forms: ["dict"] },
  { root: "spect", forms: ["spect"] }, { root: "aud", forms: ["aud"] },
  { root: "min", forms: ["min"] }, { root: "max", forms: ["max"] },
  { root: "port", forms: ["port"] }, { root: "pict", forms: ["pict", "picto"] },
  { root: "scribe", forms: ["scribe", "scrib", "script"] },
  { root: "struct", forms: ["struct"] }, { root: "cred", forms: ["cred"] },
  { root: "initi", forms: ["initi"] }, { root: "ple", forms: ["ple"] },
  { root: "popul", forms: ["popul"] }, { root: "pos", forms: ["pos", "pose"] },
  { root: "sci", forms: ["sci"] }, { root: "soci", forms: ["soci"] },
  { root: "vent", forms: ["vent"] },
] as const;

export function focusRootForFamily(root: string) {
  return ROOT_REVIEW_FOCUS.find(group => group.forms.some(form => form === root.toLowerCase()))?.root;
}

export type RootAuditRow = {
  wordId: string; word: string; senseId: string | null; meaning: string; partOfSpeech: string;
  wordSum: string; parts: string; source: "Reviewed meaning" | "Spelling-level facts" | "No analysis";
  linked: boolean; excluded: boolean; issues: string[];
};

export function rootCandidateFingerprint(row: RootAuditRow) {
  return fingerprintSnapshotValue({ word: row.word, senseId: row.senseId, meaning: row.meaning,
    partOfSpeech: row.partOfSpeech, wordSum: row.wordSum, parts: row.parts, source: row.source });
}

/** An audit hint never confers a family relationship or a word–skill approval. */
export function rootBreakdownIssues(input: {
  word: string; forms: readonly string[]; familyRoots: readonly string[];
  analysis?: MultiSenseCsvBundle["analyses"][number]; linked: boolean; reviewed: boolean;
}) {
  const issues: string[] = [];
  if (!input.linked) issues.push("Spelling match only. Confirm the root relationship before assigning.");
  if (!input.reviewed) issues.push("Review the meaning-specific word parts.");
  const analysis = input.analysis;
  if (!analysis?.parts.length) return [...issues, "No reviewed breakdown recorded."];
  if (analysis.parts.map(part => part.surfaceText).join("") !== input.word)
    issues.push("The visible parts do not reconstruct the word.");
  const roots = analysis.parts.filter(part => part.kind === "root");
  const matching = roots.filter(part => input.forms.some(form => form === part.sourceText.toLowerCase()));
  if (!matching.length) {
    if (analysis.parts.some(part => part.kind === "base" && part.surfaceText.toLowerCase() === input.word.toLowerCase()))
      issues.push("Currently a whole Base word. Decide whether to retain it or review the internal root.");
    else if (analysis.parts.some(part => part.kind === "base" && input.forms.some(form => part.sourceText.toLowerCase().includes(form))))
      issues.push("The possible root is inside a larger base. Nested analysis needs separate review.");
    else issues.push("The requested root is not an explicit root part in this breakdown.");
  } else if (input.familyRoots.length && matching.some(part => !input.familyRoots.includes(part.sourceText)
    || part.sourceText !== part.surfaceText)) {
    issues.push("The root form differs from the registered family. Review the related form.");
  }
  if (analysis.transformations.length) issues.push("Spelling transformations need review for the current root lesson.");
  return issues;
}

/** Completion hides a group only while no unselected candidates need review. */
export function rootReviewGroupIsComplete(group: { reviewed: boolean; rows: { linked: boolean }[] }) {
  return group.reviewed && group.rows.every(row => row.linked);
}
