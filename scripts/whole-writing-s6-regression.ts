import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildWholeWritingKnownErrorFindings } from "../lib/writing-engine/whole-writing/known-errors";
import { getReturnedCorrectionEvidenceFlags } from "../lib/lessons/returned-correction-evidence";

const mapping = (input: Partial<{
  mappingId: string;
  misspellingNormalized: string;
  correctSpellingNormalized: string;
  microSkillKey: string;
}> = {}) => ({
  mappingId: input.mappingId ?? "00000000-0000-4000-8000-000000000001",
  misspellingNormalized: input.misspellingNormalized ?? "becuase",
  correctSpellingNormalized: input.correctSpellingNormalized ?? "because",
  microSkillKey: input.microSkillKey ?? "d4_transposition",
  dialectCode: "en-GB",
  normalizationVersion: "spelling_normalize_v1",
  authorityReference: `fixture:${input.mappingId ?? "one"}`,
});

const occurrences = [
  { id: "target-or-not-is-irrelevant:1", observedText: "Becuase", provenance: "learner_response" as const },
  { id: "target-or-not-is-irrelevant:2", observedText: "becuase", provenance: "learner_response" as const },
  { id: "unknown-authorship", observedText: "becuase", provenance: "unknown" as const },
  { id: "ordinary-correct-word", observedText: "garden", provenance: "learner_response" as const },
];
const first = buildWholeWritingKnownErrorFindings({ occurrences, mappings: [mapping()] });
assert.equal(first.findings.length, 2, "Repeated eligible occurrences remain separate findings.");
assert.deepEqual(first.checks.map((check) => check.disposition), ["FINDING", "FINDING", "INELIGIBLE_AUTHORSHIP", "NO_MAPPING"]);
assert.equal(first.eligibleOccurrenceCount, 3);
assert.equal(first.ineligibleOccurrenceCount, 1);
assert.ok(first.findings.every((finding) => finding.intendedNormalized === "because"));

const sameCorrection = buildWholeWritingKnownErrorFindings({
  occurrences: [occurrences[0]],
  mappings: [mapping(), mapping({ mappingId: "00000000-0000-4000-8000-000000000002", microSkillKey: "d4_vowel_order" })],
});
assert.equal(sameCorrection.findings.length, 1, "Several governed skills for one correction make one occurrence finding.");
assert.deepEqual(sameCorrection.findings[0].microSkillKeys, ["d4_transposition", "d4_vowel_order"]);

const conflicting = buildWholeWritingKnownErrorFindings({
  occurrences: [occurrences[0]],
  mappings: [mapping(), mapping({ mappingId: "00000000-0000-4000-8000-000000000003", correctSpellingNormalized: "became" })],
});
assert.equal(conflicting.findings.length, 0);
assert.equal(conflicting.checks[0].disposition, "ABSTAINED");

const replay = buildWholeWritingKnownErrorFindings({ occurrences, mappings: [mapping()] });
assert.deepEqual(replay.findings.map((finding) => finding.findingKey), first.findings.map((finding) => finding.findingKey));

assert.deepEqual(
  getReturnedCorrectionEvidenceFlags({ approvedReplacement: "because", attemptedCorrection: "because" }),
  { markedFixed: true, correctionOutcome: "correct", correctedIndependently: false, assistanceState: "unknown", answerVisibility: "unknown" },
  "Answer equality establishes correctness only.",
);
assert.equal(getReturnedCorrectionEvidenceFlags({ approvedReplacement: "because", attemptedCorrection: "becuase" }).correctionOutcome, "incorrect");
assert.equal(getReturnedCorrectionEvidenceFlags({ approvedReplacement: "because", attemptedCorrection: null }).correctionOutcome, "unknown");

const worker = readFileSync("lib/writing-engine/whole-writing/worker.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260907100000_add_whole_writing_known_errors_and_retries.sql", "utf8");
assert.match(migration, /known_error_detection_enabled boolean not null default false/);
assert.match(migration, /known_error_review_enabled boolean not null default false/);
assert.doesNotMatch(worker, /context[-_/ ]resolver|ContextResolver/i);
assert.doesNotMatch(worker, /learning_items|word_treasures|gold_bar|retirement|authentic_use/i);
assert.doesNotMatch(migration, /insert into public\.(learning_items|word_treasures|child_gold_bar_ledger_events|learner_word_evidence_events)/i);
assert.match(migration, /source_writing_occurrence_id/);
assert.match(migration, /writing_correction_attempt_fact_immutable/);

console.log("whole-writing-s6-regression: ok");
