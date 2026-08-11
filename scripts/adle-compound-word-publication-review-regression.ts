import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildCompoundWordPublicationReviewPackage } from "./build-adle-compound-word-v2-publication-review";

const ROOT = resolve(import.meta.dirname, "..");
const candidatePath = resolve(
  ROOT,
  "data/adle/review/d4-mor/v2/compound-word-v2-publication-candidate.json",
);
const csvPath = resolve(
  ROOT,
  "data/adle/review/d4-mor/v2/compound-word-v2-publication-readiness-review.csv",
);
const built = buildCompoundWordPublicationReviewPackage();
const candidateText = `${JSON.stringify(built.candidate, null, 2)}\n`;
assert.equal(
  readFileSync(candidatePath, "utf8"),
  candidateText,
  "candidate package is deterministic",
);
assert.equal(
  readFileSync(csvPath, "utf8"),
  built.csv,
  "review CSV is deterministic",
);

const candidate = built.candidate as {
  purpose: string;
  base_sha: string;
  production_state: {
    compound_word_v2_dark: boolean;
    model_c_release_rows: number;
    model_c_activation_rows: number;
    migration_20260811130000_applied: boolean;
  };
  summary: Record<string, number | Record<string, number>>;
  proposed_canonical_words: Array<Record<string, unknown>>;
  rows: Array<Record<string, unknown>>;
};
assert.match(candidate.purpose, /human-review candidate only/);
assert.equal(candidate.base_sha, "ca6289327b5a8c7f73f3287271d177d54b5a35b2");
assert.deepEqual(candidate.production_state, {
  compound_word_v2_dark: true,
  model_c_release_rows: 0,
  model_c_activation_rows: 0,
  migration_20260811130000_applied: false,
  evidence: "CW-3A starting-gate read-only Production check",
});
assert.equal(candidate.rows.length, 14);
assert.equal(candidate.proposed_canonical_words.length, 17);
assert.equal(candidate.summary.total_rows, 14);
assert.equal(candidate.summary.completely_reusable, 0);
assert.equal(candidate.summary.semantic_relationship_only, 4);
assert.equal(candidate.summary.missing_whole_canonical_identity, 8);
assert.equal(candidate.summary.missing_component_canonical_identity, 8);
assert.equal(candidate.summary.missing_component_or_whole_meanings, 10);
assert.equal(candidate.summary.proposed_meaning_facts, 26);
assert.equal(candidate.summary.missing_dictation, 8);
assert.equal(candidate.summary.missing_or_uncertain_target_span, 0);
assert.equal(candidate.summary.proposed_semantic_relationships, 14);
assert.equal(candidate.summary.genuine_ambiguity, 2);
assert.equal(candidate.summary.publication_ready, 0);
assert.deepEqual(candidate.summary.classification_counts, {
  ready_by_existing_governed_reuse: 0,
  semantic_relationship_review_only: 4,
  canonical_identity_review_required: 0,
  meaning_review_required: 0,
  dictation_review_required: 0,
  multiple_review_items_required: 10,
});

const rows = new Map(candidate.rows.map((row) => [String(row.whole_word), row]));
assert.equal(rows.size, 14);
for (const row of rows.values()) {
  assert.equal(row.publication_ready, false);
  assert.equal(row.review_decision, "pending_human_review");
  assert.equal(
    (row.component_to_whole_relationship as { status: string }).status,
    "proposed_for_review",
  );
  assert.ok((row.publication_blockers as string[]).length > 0);
  assert.ok(String(row.required_action).startsWith("Approve"));
  const dictation = row.dictation as {
    sentence: string;
    target_start: number;
    target_end_exclusive: number;
    exact_governed_answer: string;
    target_span_status: string;
  };
  assert.equal(dictation.target_span_status, "exact_deterministic");
  const tokens =
    dictation.sentence.match(/[\p{L}]+(?:['’-][\p{L}]+)*/gu) ?? [];
  assert.equal(
    tokens.slice(dictation.target_start, dictation.target_end_exclusive).join(" "),
    dictation.exact_governed_answer,
  );
}

const motherInLaw = rows.get("mother-in-law")!;
assert.deepEqual(motherInLaw.ordered_component_surfaces, ["mother", "in", "law"]);
assert.deepEqual(motherInLaw.ordered_joins, ["hyphen", "hyphen"]);
assert.equal(motherInLaw.component_count, 3);
assert.equal(motherInLaw.reconstructed_written_form, "mother-in-law");
assert.match(String(motherInLaw.genuine_ambiguity), /fixed unit in-law/);

assert.deepEqual(
  (rows.get("ice cream")!.dictation as Record<string, unknown>),
  {
    sentence: "We had ice cream after the park.",
    target_start: 2,
    target_end_exclusive: 4,
    exact_governed_answer: "ice cream",
    target_span_status: "exact_deterministic",
    review_status: "approved_existing_governed_reuse",
    provenance:
      "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/dictation_sentences.csv#ice_cream_en_gb",
  },
);
assert.deepEqual(rows.get("twenty-one")!.ordered_joins, ["hyphen"]);
assert.equal(rows.get("bedroom")!.compound_form, "closed");
assert.equal(rows.get("ice cream")!.compound_form, "open");
assert.equal(rows.get("twenty-one")!.compound_form, "hyphenated");

const proposedSurfaces = candidate.proposed_canonical_words.map((entry) => {
  assert.equal(entry.canonical_word_id, null, "no canonical UUID is fabricated");
  assert.equal(entry.review_state, "proposed_for_review");
  assert.equal(
    (entry.canonical_words_csv as Record<string, unknown>).row_status,
    "draft",
  );
  assert.equal(
    (entry.canonical_words_csv as Record<string, unknown>).review_status,
    "in_review",
  );
  assert.equal(
    (entry.canonical_word_metadata_csv as Record<string, unknown>).review_status,
    "in_review",
  );
  assert.equal(
    (entry.canonical_word_morphology_csv as Record<string, unknown>).analysis_status,
    "in_review",
  );
  assert.equal(
    (entry.dictation_sentences_csv as Record<string, unknown>).reviewed_by,
    null,
  );
  return String((entry.canonical_words_csv as Record<string, unknown>).display_word);
});
assert.deepEqual(
  proposedSurfaces.sort(),
  [
    "cream",
    "grand",
    "grandmother",
    "homework",
    "in",
    "known",
    "law",
    "living",
    "living room",
    "mother-in-law",
    "office",
    "part",
    "part-time",
    "post office",
    "sunflower",
    "twenty",
    "well-known",
  ].sort(),
);

const csvLines = built.csv.trimEnd().split("\n");
assert.equal(csvLines.length, 15, "CSV has one header and 14 review rows");
assert.ok(csvLines[0].includes("component_to_whole_relationship"));
assert.ok(csvLines[0].includes("dictation_target_end_exclusive"));
assert.ok(csvLines[0].includes("review_decision"));

console.log(
  "Compound Word v2 publication review regression passed: deterministic 14-row CSV/candidate package, 17 non-authoritative canonical proposals, exact spans, and no publication or activation authority.",
);
