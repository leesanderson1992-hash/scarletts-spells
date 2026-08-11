#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REVIEW_DIR = resolve(ROOT, "data/adle/review/d4-mor/v2");
const READINESS_PATH = resolve(REVIEW_DIR, "compound-word-v2-readiness-review.json");
const INPUT_PATH = resolve(
  REVIEW_DIR,
  "compound-word-v2-publication-review-input.json",
);
const CANDIDATE_PATH = resolve(
  REVIEW_DIR,
  "compound-word-v2-publication-candidate.json",
);
const CSV_PATH = resolve(
  REVIEW_DIR,
  "compound-word-v2-publication-readiness-review.csv",
);

const FACT_STATUSES = [
  "approved_existing_governed_reuse",
  "proposed_for_review",
] as const;
type FactStatus = (typeof FACT_STATUSES)[number];
type ReviewClassification =
  | "ready_by_existing_governed_reuse"
  | "semantic_relationship_review_only"
  | "canonical_identity_review_required"
  | "meaning_review_required"
  | "dictation_review_required"
  | "multiple_review_items_required";

type ReadinessComponent = {
  ordinal: number;
  display_surface: string;
  canonical_word_id: string | null;
  meaning: string | null;
  sense: string | null;
};

type ReadinessRow = {
  micro_skill_key: string;
  whole_word: string;
  whole_canonical_word_id: string | null;
  component_count: number;
  components: ReadinessComponent[];
  ordered_join_kinds: Array<"none" | "space" | "hyphen">;
  reconstructed_written_form: string;
  structure_provenance: Record<string, unknown>;
};

type ReviewFact = {
  value: string;
  status: FactStatus;
  provenance: string;
};

type ReviewInputRow = {
  whole_word: string;
  component_meanings: ReviewFact[];
  whole_meaning: ReviewFact;
  component_to_whole_relationship: string;
  dictation: {
    sentence: string;
    target_start: number;
    target_end_exclusive: number;
    status: FactStatus;
    provenance: string;
  };
  assignment_eligible: {
    value: boolean;
    status: FactStatus;
    provenance: string;
  };
  genuine_ambiguity: string | null;
  required_action: string;
};

type CanonicalWordProposal = {
  word_key: string;
  normalised_word: string;
  display_word: string;
  frequency_band: string;
  age_band: string;
  complexity_band: string;
  syllables: number;
  phoneme_hint: string;
  stress_pattern: string;
  has_schwa: boolean;
  child_friendly_lexical_meaning: string;
  dictation_sentence: string;
  dictation_target_start: number;
  dictation_target_end_exclusive: number;
  ambiguity_review: string | null;
};

type ReviewInput = {
  schema_version: number;
  purpose: string;
  source_as_of: string;
  base_sha: string;
  review_state: "proposed_for_review";
  canonical_word_proposals: CanonicalWordProposal[];
  rows: ReviewInputRow[];
};

const CSV_COLUMNS = [
  "micro_skill_key",
  "whole_word",
  "whole_canonical_word_id",
  "whole_canonical_identity_status",
  "compound_form",
  "component_count",
  "ordered_component_surfaces",
  "ordered_component_canonical_word_ids",
  "component_identity_statuses",
  "ordered_component_meanings",
  "component_meaning_statuses",
  "ordered_joins",
  "whole_child_friendly_meaning",
  "whole_meaning_status",
  "component_to_whole_relationship",
  "semantic_relationship_status",
  "dictation_sentence",
  "dictation_status",
  "dictation_target_start",
  "dictation_target_end_exclusive",
  "dictation_target_span_status",
  "assignment_eligible",
  "assignment_eligibility_status",
  "source_provenance",
  "existing_governed_reuse",
  "current_blocker",
  "required_action",
  "human_review_required",
  "readiness_classification",
  "genuine_ambiguity",
  "review_decision",
] as const;

function fail(message: string): never {
  throw new Error(message);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) fail(`${label} is required`);
  return value;
}

function status(value: unknown, label: string): FactStatus {
  if (!FACT_STATUSES.includes(value as FactStatus)) fail(`${label} has invalid status`);
  return value as FactStatus;
}

function tokenise(sentence: string): string[] {
  return sentence.match(/[\p{L}]+(?:['’-][\p{L}]+)*/gu) ?? [];
}

function validateTargetSpan(
  wholeWord: string,
  sentence: string,
  start: number,
  endExclusive: number,
  label: string,
): void {
  const tokens = tokenise(sentence);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(endExclusive) ||
    start < 0 ||
    endExclusive <= start ||
    endExclusive > tokens.length
  ) {
    fail(`${label} has invalid target span`);
  }
  const target = tokens.slice(start, endExclusive).join(" ");
  if (target.toLocaleLowerCase("en-GB") !== wholeWord.toLocaleLowerCase("en-GB")) {
    fail(`${label} target span reconstructs ${target}, not ${wholeWord}`);
  }
}

function deriveForm(joins: readonly string[]): "closed" | "open" | "hyphenated" {
  if (joins.length < 1) fail("Compound requires a governed join");
  if (joins.every((join) => join === "none")) return "closed";
  if (joins.every((join) => join === "space")) return "open";
  if (joins.every((join) => join === "hyphen")) return "hyphenated";
  fail("The reviewed 14-word roster unexpectedly contains a mixed-form compound");
}

function separator(join: string): string {
  if (join === "space") return " ";
  if (join === "hyphen") return "-";
  if (join === "none") return "";
  fail(`Unsupported join ${join}`);
}

function reconstruct(row: ReadinessRow): string {
  return row.components.reduce(
    (whole, component, index) =>
      index === 0
        ? component.display_surface
        : `${whole}${separator(row.ordered_join_kinds[index - 1])}${component.display_surface}`,
    "",
  );
}

function csvEscape(value: unknown): string {
  const rendered = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(rendered)
    ? `"${rendered.replaceAll('"', '""')}"`
    : rendered;
}

function toCsv(rows: readonly Record<string, unknown>[]): string {
  return `${CSV_COLUMNS.join(",")}\n${rows
    .map((row) => CSV_COLUMNS.map((column) => csvEscape(row[column])).join(","))
    .join("\n")}\n`;
}

function sourceCommon() {
  return {
    source_category: "internal_authored",
    source_name: "CW-3A Compound Word publication readiness proposal",
    source_url:
      "data/adle/review/d4-mor/v2/compound-word-v2-publication-review-input.json",
    source_licence: "internal/project-authored",
    source_use_note:
      "Human-review proposal only. This row is not approved curriculum authority and is not importable until a named reviewer approves it.",
    confidence: "medium",
    review_status: "in_review",
  } as const;
}

function canonicalProposalProjection(
  proposal: CanonicalWordProposal,
  readinessByWord: ReadonlyMap<string, ReadinessRow>,
) {
  validateTargetSpan(
    proposal.display_word,
    proposal.dictation_sentence,
    proposal.dictation_target_start,
    proposal.dictation_target_end_exclusive,
    `canonical proposal ${proposal.display_word}`,
  );
  if (proposal.normalised_word !== proposal.display_word) {
    fail(`canonical proposal ${proposal.display_word} must preserve its governed form`);
  }
  if (!/^[a-z0-9_]+_en_gb$/.test(proposal.word_key)) {
    fail(`canonical proposal ${proposal.display_word} has invalid word_key`);
  }
  const structure = readinessByWord.get(proposal.display_word);
  const morphologyParts = structure
    ? structure.components.map((component) => ({
        text: component.display_surface,
        type: "base",
      }))
    : [{ text: proposal.display_word, type: "base" }];
  const morphologyJoins = structure ? [...structure.ordered_join_kinds] : [];
  const wordSum = structure
    ? `${structure.components.map((component) => component.display_surface).join(" + ")} → ${proposal.display_word}`
    : proposal.display_word;
  const common = sourceCommon();
  return {
    canonical_word_id: null,
    review_state: "proposed_for_review",
    canonical_words_csv: {
      word_key: proposal.word_key,
      normalised_word: proposal.normalised_word,
      display_word: proposal.display_word,
      dialect_code: "en-GB",
      frequency_band: proposal.frequency_band,
      age_band: proposal.age_band,
      complexity_band: proposal.complexity_band,
      ...common,
      row_status: "draft",
    },
    canonical_word_metadata_csv: {
      word_key: proposal.word_key,
      syllables: proposal.syllables,
      phoneme_hint: proposal.phoneme_hint,
      grapheme_notes: "CW-3A British-English pronunciation proposal; human review required.",
      stress_pattern: proposal.stress_pattern,
      has_schwa: proposal.has_schwa,
      morphemes: wordSum,
      morphology_notes: structure
        ? "Reuse the human-approved D4 Compound Word analysis for ordered components and governed separators."
        : "Proposed single-base canonical component row for Compound Word v2 closure.",
      irregularity_notes: "",
      ...common,
    },
    canonical_word_morphology_csv: {
      word_key: proposal.word_key,
      morphology_parts: morphologyParts,
      feature_keys: [],
      morphology_joins: morphologyJoins,
      transformation_notes: "",
      word_sum: wordSum,
      analysis_status: "in_review",
      ...common,
      reviewed_by: null,
      reviewed_at: null,
      review_notes:
        "Approve against the existing Teaching Dictionary import contract before creating an append-only release package.",
    },
    dictation_sentences_csv: {
      word_key: proposal.word_key,
      display_word: proposal.display_word,
      age_band: proposal.age_band,
      complexity_band: proposal.complexity_band,
      dictation_sentence: proposal.dictation_sentence,
      dictation_target_token_index: proposal.dictation_target_start,
      dictation_target_start: proposal.dictation_target_start,
      dictation_target_end_exclusive: proposal.dictation_target_end_exclusive,
      audio_text: proposal.dictation_sentence,
      ...common,
      reviewed_by: null,
      reviewed_at: null,
      review_notes:
        "Proposed British-English sentence; target span is deterministic but the sentence requires human approval.",
    },
    proposed_child_friendly_lexical_meaning: {
      value: proposal.child_friendly_lexical_meaning,
      status: "proposed_for_review",
    },
    ambiguity_review: proposal.ambiguity_review,
  };
}

function classificationFor(categories: Set<string>): ReviewClassification {
  if (categories.size === 0) return "ready_by_existing_governed_reuse";
  if (categories.size === 1 && categories.has("relationship")) {
    return "semantic_relationship_review_only";
  }
  if (categories.size === 1 && categories.has("canonical_identity")) {
    return "canonical_identity_review_required";
  }
  if (categories.size === 1 && categories.has("meaning")) {
    return "meaning_review_required";
  }
  if (categories.size === 1 && categories.has("dictation")) {
    return "dictation_review_required";
  }
  return "multiple_review_items_required";
}

export function buildCompoundWordPublicationReviewPackage(): {
  candidate: Record<string, unknown>;
  csv: string;
} {
  const readinessText = readFileSync(READINESS_PATH, "utf8");
  const inputText = readFileSync(INPUT_PATH, "utf8");
  const readiness = JSON.parse(readinessText) as {
    schema_version: number;
    rows: ReadinessRow[];
  };
  const input = JSON.parse(inputText) as ReviewInput;
  if (readiness.schema_version !== 1 || input.schema_version !== 1) {
    fail("Unsupported CW-3A source schema");
  }
  if (
    input.review_state !== "proposed_for_review" ||
    !/^[0-9a-f]{40}$/.test(input.base_sha)
  ) {
    fail("CW-3A input must retain its review-only state and exact base SHA");
  }
  if (readiness.rows.length !== 14 || input.rows.length !== 14) {
    fail("CW-3A requires exactly 14 reviewed Compound Word rows");
  }
  const readinessByWord = new Map(
    readiness.rows.map((row) => [row.whole_word, row] as const),
  );
  const inputByWord = new Map(input.rows.map((row) => [row.whole_word, row] as const));
  if (readinessByWord.size !== 14 || inputByWord.size !== 14) {
    fail("CW-3A whole words must be unique");
  }
  const missingInput = [...readinessByWord.keys()].filter(
    (word) => !inputByWord.has(word),
  );
  const unexpectedInput = [...inputByWord.keys()].filter(
    (word) => !readinessByWord.has(word),
  );
  if (missingInput.length || unexpectedInput.length) {
    fail(
      `CW-3A roster drift: missing=${missingInput.join("|")} unexpected=${unexpectedInput.join("|")}`,
    );
  }

  const missingCanonicalSurfaces = new Set<string>();
  for (const row of readiness.rows) {
    if (!row.whole_canonical_word_id) missingCanonicalSurfaces.add(row.whole_word);
    for (const component of row.components) {
      if (!component.canonical_word_id) {
        missingCanonicalSurfaces.add(component.display_surface);
      }
    }
  }
  const proposalBySurface = new Map(
    input.canonical_word_proposals.map((proposal) => [proposal.display_word, proposal]),
  );
  if (
    proposalBySurface.size !== input.canonical_word_proposals.length ||
    proposalBySurface.size !== missingCanonicalSurfaces.size ||
    [...missingCanonicalSurfaces].some((surface) => !proposalBySurface.has(surface)) ||
    [...proposalBySurface.keys()].some((surface) => !missingCanonicalSurfaces.has(surface))
  ) {
    fail("Canonical proposal rows do not exactly close the governed identity gaps");
  }

  const rows = readiness.rows.map((base) => {
    const review = inputByWord.get(base.whole_word)!;
    if (base.component_count < 2 || base.components.length !== base.component_count) {
      fail(`${base.whole_word} has invalid component cardinality`);
    }
    if (base.ordered_join_kinds.length !== base.component_count - 1) {
      fail(`${base.whole_word} has invalid join cardinality`);
    }
    if (
      reconstruct(base) !== base.whole_word ||
      base.reconstructed_written_form !== base.whole_word
    ) {
      fail(`${base.whole_word} does not reconstruct exactly`);
    }
    if (review.component_meanings.length !== base.component_count) {
      fail(`${base.whole_word} component meanings do not match component count`);
    }
    review.component_meanings.forEach((fact, index) => {
      text(fact.value, `${base.whole_word} component meaning ${index + 1}`);
      status(fact.status, `${base.whole_word} component meaning ${index + 1}`);
      text(fact.provenance, `${base.whole_word} component provenance ${index + 1}`);
    });
    text(review.whole_meaning.value, `${base.whole_word} whole meaning`);
    status(review.whole_meaning.status, `${base.whole_word} whole meaning`);
    text(review.component_to_whole_relationship, `${base.whole_word} relationship`);
    status(review.dictation.status, `${base.whole_word} dictation`);
    status(review.assignment_eligible.status, `${base.whole_word} eligibility`);
    validateTargetSpan(
      base.whole_word,
      review.dictation.sentence,
      review.dictation.target_start,
      review.dictation.target_end_exclusive,
      `${base.whole_word} dictation`,
    );

    const reviewItems: string[] = [];
    const categories = new Set<string>();
    if (!base.whole_canonical_word_id) {
      reviewItems.push(`approve_whole_canonical_identity:${base.whole_word}`);
      categories.add("canonical_identity");
    }
    base.components.forEach((component) => {
      if (!component.canonical_word_id) {
        reviewItems.push(
          `approve_component_canonical_identity:${component.display_surface}`,
        );
        categories.add("canonical_identity");
      }
    });
    review.component_meanings.forEach((fact, index) => {
      if (fact.status === "proposed_for_review") {
        reviewItems.push(
          `approve_component_meaning:${base.components[index].display_surface}`,
        );
        categories.add("meaning");
      }
    });
    if (review.whole_meaning.status === "proposed_for_review") {
      reviewItems.push(`approve_whole_meaning:${base.whole_word}`);
      categories.add("meaning");
    }
    reviewItems.push(`approve_component_to_whole_relationship:${base.whole_word}`);
    categories.add("relationship");
    if (review.dictation.status === "proposed_for_review") {
      reviewItems.push(`approve_dictation_sentence:${base.whole_word}`);
      categories.add("dictation");
    }
    if (review.assignment_eligible.status === "proposed_for_review") {
      reviewItems.push(`approve_assignment_eligibility:${base.whole_word}`);
      categories.add("assignment_eligibility");
    }
    if (review.genuine_ambiguity) {
      reviewItems.push(`resolve_genuine_ambiguity:${base.whole_word}`);
      categories.add("ambiguity");
    }

    const components = base.components.map((component, index) => ({
      ordinal: index + 1,
      display_surface: component.display_surface,
      canonical_word_id: component.canonical_word_id,
      canonical_identity_status: component.canonical_word_id
        ? "approved_existing_governed_reuse"
        : "proposed_for_review",
      meaning: review.component_meanings[index],
      sense: review.component_meanings[index].value,
    }));
    const existingGovernedReuse = [
      `approved_structure:${base.structure_provenance.artifact as string}#row=${String(base.structure_provenance.row)}`,
      ...(base.whole_canonical_word_id
        ? [`approved_whole_identity:${base.whole_canonical_word_id}`]
        : []),
      ...components
        .filter((component) => component.canonical_word_id)
        .map(
          (component) =>
            `approved_component_identity:${component.display_surface}:${component.canonical_word_id}`,
        ),
      ...review.component_meanings
        .filter((fact) => fact.status === "approved_existing_governed_reuse")
        .map((fact) => `approved_meaning:${fact.provenance}`),
      ...(review.whole_meaning.status === "approved_existing_governed_reuse"
        ? [`approved_whole_meaning:${review.whole_meaning.provenance}`]
        : []),
      ...(review.dictation.status === "approved_existing_governed_reuse"
        ? [`approved_dictation:${review.dictation.provenance}`]
        : []),
      ...(review.assignment_eligible.status === "approved_existing_governed_reuse"
        ? [`approved_assignment_eligibility:${review.assignment_eligible.provenance}`]
        : []),
    ];

    return {
      micro_skill_key: base.micro_skill_key,
      whole_word: base.whole_word,
      whole_canonical_word_id: base.whole_canonical_word_id,
      whole_canonical_identity_status: base.whole_canonical_word_id
        ? "approved_existing_governed_reuse"
        : "proposed_for_review",
      compound_form: deriveForm(base.ordered_join_kinds),
      component_count: base.component_count,
      components,
      ordered_component_surfaces: components.map(
        (component) => component.display_surface,
      ),
      ordered_component_canonical_word_ids: components.map(
        (component) => component.canonical_word_id,
      ),
      ordered_joins: [...base.ordered_join_kinds],
      reconstructed_written_form: base.whole_word,
      whole_child_friendly_meaning: review.whole_meaning,
      component_to_whole_relationship: {
        value: review.component_to_whole_relationship,
        status: "proposed_for_review",
        provenance: "CW-3A child-friendly semantic proposal",
      },
      dictation: {
        sentence: review.dictation.sentence,
        target_start: review.dictation.target_start,
        target_end_exclusive: review.dictation.target_end_exclusive,
        exact_governed_answer: base.whole_word,
        target_span_status: "exact_deterministic",
        review_status: review.dictation.status,
        provenance: review.dictation.provenance,
      },
      assignment_eligibility: review.assignment_eligible,
      structure_provenance: base.structure_provenance,
      source_provenance: [
        {
          kind: "approved_compound_structure",
          value: base.structure_provenance,
        },
        ...existingGovernedReuse.map((value) => ({ kind: "governed_reuse", value })),
      ],
      existing_governed_reuse: existingGovernedReuse,
      publication_ready: reviewItems.length === 0,
      current_blocker: reviewItems[0] ?? null,
      publication_blockers: reviewItems,
      required_action: review.required_action,
      human_review_required: reviewItems,
      readiness_classification: classificationFor(categories),
      genuine_ambiguity: review.genuine_ambiguity,
      review_decision: "pending_human_review",
    };
  });

  const classificationCounts = Object.fromEntries(
    [
      "ready_by_existing_governed_reuse",
      "semantic_relationship_review_only",
      "canonical_identity_review_required",
      "meaning_review_required",
      "dictation_review_required",
      "multiple_review_items_required",
    ].map((classification) => [
      classification,
      rows.filter((row) => row.readiness_classification === classification).length,
    ]),
  );
  const summary = {
    total_rows: rows.length,
    completely_reusable: classificationCounts.ready_by_existing_governed_reuse,
    semantic_relationship_only:
      classificationCounts.semantic_relationship_review_only,
    missing_whole_canonical_identity: rows.filter(
      (row) => !row.whole_canonical_word_id,
    ).length,
    missing_component_canonical_identity: rows.filter((row) =>
      row.components.some((component) => !component.canonical_word_id),
    ).length,
    missing_component_or_whole_meanings: rows.filter(
      (row) =>
        row.whole_child_friendly_meaning.status === "proposed_for_review" ||
        row.components.some(
          (component) => component.meaning.status === "proposed_for_review",
        ),
    ).length,
    proposed_meaning_facts:
      rows.filter(
        (row) => row.whole_child_friendly_meaning.status === "proposed_for_review",
      ).length +
      rows.reduce(
        (count, row) =>
          count +
          row.components.filter(
            (component) => component.meaning.status === "proposed_for_review",
          ).length,
        0,
      ),
    missing_dictation: rows.filter(
      (row) => row.dictation.review_status === "proposed_for_review",
    ).length,
    missing_or_uncertain_target_span: rows.filter(
      (row) => row.dictation.target_span_status !== "exact_deterministic",
    ).length,
    proposed_dictation_spans_tied_to_sentence_review: rows.filter(
      (row) => row.dictation.review_status === "proposed_for_review",
    ).length,
    proposed_semantic_relationships: rows.filter(
      (row) =>
        row.component_to_whole_relationship.status === "proposed_for_review",
    ).length,
    genuine_ambiguity: rows.filter((row) => Boolean(row.genuine_ambiguity)).length,
    publication_ready: rows.filter((row) => row.publication_ready).length,
    proposed_canonical_word_rows: input.canonical_word_proposals.length,
    classification_counts: classificationCounts,
  };
  const proposedCanonicalWords = input.canonical_word_proposals.map((proposal) =>
    canonicalProposalProjection(proposal, readinessByWord),
  );
  const candidate = {
    schema_version: 1,
    package_key: "compound_word_v2_publication_candidate_2026_08_11",
    purpose:
      "CW-3A deterministic human-review candidate only; not a Teaching Dictionary authority, curriculum release, route release, activation, or learner-data mutation",
    source_as_of: input.source_as_of,
    base_sha: input.base_sha,
    production_state: {
      compound_word_v2_dark: true,
      model_c_release_rows: 0,
      model_c_activation_rows: 0,
      migration_20260811130000_applied: false,
      evidence: "CW-3A starting-gate read-only Production check",
    },
    source_files: [
      {
        path: "data/adle/review/d4-mor/v2/compound-word-v2-readiness-review.json",
        sha256: sha256(readinessText),
      },
      {
        path: "data/adle/review/d4-mor/v2/compound-word-v2-publication-review-input.json",
        sha256: sha256(inputText),
      },
      {
        path: "data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json",
        sha256: sha256(
          readFileSync(
            resolve(ROOT, "data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json"),
            "utf8",
          ),
        ),
      },
      {
        path: "data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds-dictionary-pool-review.json",
        sha256: sha256(
          readFileSync(
            resolve(
              ROOT,
              "data/adle/candidates/d4-mor-remaining-profiles/v1/closed-compounds-dictionary-pool-review.json",
            ),
            "utf8",
          ),
        ),
      },
      {
        path: "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/dictation_sentences.csv",
        sha256: sha256(
          readFileSync(
            resolve(
              ROOT,
              "docs/implementation/seed-data/teaching-dictionary/candidates/2026-06-29-phase-5-source-intake/csv/dictation_sentences.csv",
            ),
            "utf8",
          ),
        ),
      },
      {
        path: "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-09-base-word-family-meanings-v1/audit/family-meaning-audit.csv",
        sha256: sha256(
          readFileSync(
            resolve(
              ROOT,
              "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-09-base-word-family-meanings-v1/audit/family-meaning-audit.csv",
            ),
            "utf8",
          ),
        ),
      },
    ],
    review_state: "human_review_required",
    summary,
    proposed_canonical_words: proposedCanonicalWords,
    rows,
  };

  const csvRows = rows.map((row) => ({
    micro_skill_key: row.micro_skill_key,
    whole_word: row.whole_word,
    whole_canonical_word_id: row.whole_canonical_word_id,
    whole_canonical_identity_status: row.whole_canonical_identity_status,
    compound_form: row.compound_form,
    component_count: row.component_count,
    ordered_component_surfaces: JSON.stringify(row.ordered_component_surfaces),
    ordered_component_canonical_word_ids: JSON.stringify(
      row.ordered_component_canonical_word_ids,
    ),
    component_identity_statuses: JSON.stringify(
      row.components.map((component) => component.canonical_identity_status),
    ),
    ordered_component_meanings: JSON.stringify(
      row.components.map((component) => component.meaning.value),
    ),
    component_meaning_statuses: JSON.stringify(
      row.components.map((component) => component.meaning.status),
    ),
    ordered_joins: JSON.stringify(row.ordered_joins),
    whole_child_friendly_meaning: row.whole_child_friendly_meaning.value,
    whole_meaning_status: row.whole_child_friendly_meaning.status,
    component_to_whole_relationship: row.component_to_whole_relationship.value,
    semantic_relationship_status: row.component_to_whole_relationship.status,
    dictation_sentence: row.dictation.sentence,
    dictation_status: row.dictation.review_status,
    dictation_target_start: row.dictation.target_start,
    dictation_target_end_exclusive: row.dictation.target_end_exclusive,
    dictation_target_span_status: row.dictation.target_span_status,
    assignment_eligible: row.assignment_eligibility.value,
    assignment_eligibility_status: row.assignment_eligibility.status,
    source_provenance: JSON.stringify(row.source_provenance),
    existing_governed_reuse: JSON.stringify(row.existing_governed_reuse),
    current_blocker: row.publication_blockers.join(" | "),
    required_action: row.required_action,
    human_review_required: JSON.stringify(row.human_review_required),
    readiness_classification: row.readiness_classification,
    genuine_ambiguity: row.genuine_ambiguity,
    review_decision: row.review_decision,
  }));
  return { candidate, csv: toCsv(csvRows) };
}

function main(): void {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    fail("Use --write to generate artifacts or --check to verify deterministic output");
  }
  const built = buildCompoundWordPublicationReviewPackage();
  const candidateText = `${JSON.stringify(built.candidate, null, 2)}\n`;
  if (mode === "--write") {
    writeFileSync(CANDIDATE_PATH, candidateText);
    writeFileSync(CSV_PATH, built.csv);
  } else {
    if (readFileSync(CANDIDATE_PATH, "utf8") !== candidateText) {
      fail("Compound Word publication candidate drifted from deterministic generation");
    }
    if (readFileSync(CSV_PATH, "utf8") !== built.csv) {
      fail("Compound Word publication review CSV drifted from deterministic generation");
    }
  }
  const summary = (built.candidate.summary ?? {}) as Record<string, unknown>;
  console.log(
    JSON.stringify(
      {
        mode,
        candidate: CANDIDATE_PATH,
        csv: CSV_PATH,
        summary,
        mutation_scope:
          mode === "--write" ? "local_review_artifacts_only" : "none",
      },
      null,
      2,
    ),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
