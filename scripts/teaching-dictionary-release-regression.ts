import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  CANONICAL_PACKAGE_SCHEMA,
  CANONICAL_PACKAGE_TYPE,
  canonicalJson,
  packageSha256,
  parseCsv,
  stringifyCsv,
  validateCanonicalCsv,
  type CsvRow,
  type ReleaseManifestFingerprint,
} from "./teaching-dictionary-release-contract";
import { assertDatabaseTarget, stableUuid } from "./teaching-dictionary-release";

const ROOT = resolve(import.meta.dirname, "..");

function sourceRow(): CsvRow {
  return {
    source_key: "source_v1",
    source_category: "internal_authored",
    source_name: "Reviewed source",
    source_url: "",
    source_licence: "internal",
    source_use_note: "Human-reviewed source.",
    importability_status: "importable",
    legal_review_status: "passed",
  };
}

function packageRows(): Record<string, CsvRow[]> {
  return {
    "canonical_words.csv": [
      {
        word_key: "cat_en_gb",
        normalised_word: "cat",
        display_word: "cat",
        dialect_code: "en-GB",
        frequency_band: "high",
        age_band: "early_primary",
        complexity_band: "low",
        source_category: "internal_authored",
        source_name: "Reviewed source",
        source_url: "",
        source_licence: "internal",
        source_use_note: "Reviewed.",
        confidence: "high",
        review_status: "approved_for_first_exposure",
        row_status: "active",
      },
    ],
    "canonical_word_metadata.csv": [
      {
        word_key: "cat_en_gb",
        syllables: "1",
        phoneme_hint: "/kæt/",
        grapheme_notes: "",
        stress_pattern: "primary",
        has_schwa: "FALSE",
        morphemes: "cat",
        morphology_notes: "Whole word.",
        irregularity_notes: "",
        source_category: "internal_authored",
        source_name: "Reviewed source",
        source_url: "",
        source_licence: "internal",
        source_use_note: "Reviewed.",
        confidence: "high",
        review_status: "approved_for_first_exposure",
      },
    ],
    "canonical_word_morphology.csv": [
      {
        word_key: "cat_en_gb",
        raw_morpholex_segmentation: "{(cat)}",
        raw_morpholex_pos: "NN",
        morphology_parts: '[{"text":"cat","type":"whole_word"}]',
        feature_keys: "[]",
        morphology_joins: "[]",
        transformation_notes: "",
        word_sum: "cat",
        analysis_status: "approved",
        source_category: "internal_authored",
        source_name: "Reviewed source",
        source_url: "",
        source_licence: "internal",
        source_use_note: "Reviewed.",
        confidence: "high",
        review_status: "approved_for_first_exposure",
        reviewed_by: "Reviewer",
        reviewed_at: "2026-07-26",
        review_notes: "",
      },
    ],
    "dictation_sentences.csv": [
      {
        word_key: "cat_en_gb",
        display_word: "cat",
        age_band: "early_primary",
        complexity_band: "low",
        dictation_sentence: "The cat slept.",
        dictation_target_token_index: "1",
        audio_text: "The cat slept.",
        source_category: "internal_authored",
        source_name: "Reviewed source",
        source_url: "",
        source_licence: "internal",
        source_use_note: "Reviewed.",
        confidence: "high",
        review_status: "approved_for_first_exposure",
        reviewed_by: "Reviewer",
        reviewed_at: "2026-07-26",
        review_notes: "",
      },
    ],
    "teaching_content_sources.csv": [sourceRow()],
  };
}

function mustThrow(action: () => unknown, pattern: RegExp): void {
  assert.throws(action, pattern);
}

async function main(): Promise<void> {
  assert.equal(
    stableUuid("word", "beautiful_en_gb"),
    "1b4466e9-0651-5fec-9069-0932dde3695d",
    "TypeScript UUIDv5 must remain compatible with the existing Python importer.",
  );

  const parsed = parseCsv('a,b,c\r\none,"two, with comma","three\nwith newline"\r\n');
  assert.deepEqual(parsed, [{ a: "one", b: "two, with comma", c: "three\nwith newline" }]);
  assert.deepEqual(parseCsv(stringifyCsv(["a", "b"], [{ a: 'a"b', b: "x,y" }])), [
    { a: 'a"b', b: "x,y" },
  ]);

  const rows = packageRows();
  assert.deepEqual(validateCanonicalCsv(rows), {
    sources: 1,
    words: 1,
    metadata: 1,
    morphology: 1,
    dictations: 1,
    repairs: 0,
    deferredRepairIntents: 0,
  });

  const missingIpa = structuredClone(rows);
  missingIpa["canonical_word_metadata.csv"][0].phoneme_hint = "";
  mustThrow(() => validateCanonicalCsv(missingIpa), /pronunciation metadata/);

  const unresolvedMorphology = structuredClone(rows);
  unresolvedMorphology["canonical_word_morphology.csv"][0].analysis_status = "in_review";
  mustThrow(() => validateCanonicalCsv(unresolvedMorphology), /unresolved analysis_status/);

  const invalidWordSum = structuredClone(rows);
  invalidWordSum["canonical_word_morphology.csv"][0].word_sum = "";
  mustThrow(() => validateCanonicalCsv(invalidWordSum), /empty word sum/);

  const invalidDictation = structuredClone(rows);
  invalidDictation["dictation_sentences.csv"][0].dictation_target_token_index = "0";
  mustThrow(() => validateCanonicalCsv(invalidDictation), /contextual-dictation contract/);

  const invalidSource = structuredClone(rows);
  invalidSource["teaching_content_sources.csv"][0].legal_review_status = "required";
  mustThrow(() => validateCanonicalCsv(invalidSource), /legally approved/);

  const incompleteRepair = structuredClone(rows);
  incompleteRepair["canonical_word_repairs.csv"] = [
    {
      word_key: "tall_en_gb",
      repair_type: "metadata_add",
      expected_active_metadata_count: "0",
      review_status: "approved",
    },
  ];
  mustThrow(() => validateCanonicalCsv(incompleteRepair), /missing columns/);

  const fingerprint: ReleaseManifestFingerprint = {
    schemaVersion: CANONICAL_PACKAGE_SCHEMA,
    releaseId: "release-example-v1",
    packageType: CANONICAL_PACKAGE_TYPE,
    packageSchemaVersion: "v2",
    workbookSha256: "b".repeat(64),
    sourceCommit: "c".repeat(40),
    requiredMigrationVersions: ["20260726174000"],
    fileSha256: { "canonical_words.csv": "a".repeat(64) },
    rowCounts: {
      sources: 1,
      words: 1,
      metadata: 1,
      morphology: 1,
      dictations: 1,
      repairs: 0,
      deferredRepairIntents: 0,
    },
    reviewerSummary: { reviewers: ["Reviewer"], reviewedDates: ["2026-07-26"] },
    sourceApprovalSummary: { importable: 1, legalPassedOrNotRequired: 1 },
    expectedTargetTables: ["canonical_teaching_dictionary_words"],
    prohibitedTableFamilies: ["learner"],
    deferredRepairIntentFile: null,
    deferredRepairIntentsSha256: null,
  };
  const firstHash = packageSha256(fingerprint);
  const secondHash = packageSha256(structuredClone(fingerprint));
  assert.equal(firstHash, secondHash, "Package fingerprint must be deterministic.");
  const changedMigration = structuredClone(fingerprint);
  changedMigration.requiredMigrationVersions = ["20260726175000"];
  assert.notEqual(
    packageSha256(changedMigration),
    firstHash,
    "Migration policy must be part of the immutable package fingerprint.",
  );
  const changedReview = structuredClone(fingerprint);
  changedReview.reviewerSummary.reviewers = ["Different reviewer"];
  assert.notEqual(
    packageSha256(changedReview),
    firstHash,
    "Review provenance must be part of the immutable package fingerprint.",
  );
  assert.equal(
    canonicalJson({ packageType: CANONICAL_PACKAGE_TYPE, schema: CANONICAL_PACKAGE_SCHEMA }),
    canonicalJson({ schema: CANONICAL_PACKAGE_SCHEMA, packageType: CANONICAL_PACKAGE_TYPE }),
    "Canonical JSON must ignore object key insertion order.",
  );

  assert.doesNotThrow(() =>
    assertDatabaseTarget(
      "postgresql://postgres.jlhotktspjvffslvuyfz:secret@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
      "staging",
    ),
  );
  mustThrow(
    () =>
      assertDatabaseTarget(
        "postgresql://postgres.wwohrqtunajrbwxyssjf:secret@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
        "staging",
      ),
    /does not identify/,
  );

  const migration = await readFile(
    resolve(
      ROOT,
      "supabase/migrations/20260726150000_add_teaching_dictionary_release_ledger.sql",
    ),
    "utf8",
  );
  assert.match(migration, /create role teaching_dictionary_releaser nologin noinherit/);
  assert.match(migration, /revoke insert, update, delete/);
  assert.doesNotMatch(migration, /insert into public\.canonical_teaching_dictionary_words/i);

  const restriction = await readFile(
    resolve(
      ROOT,
      "supabase/migrations/20260726174000_restrict_canonical_word_release_role.sql",
    ),
    "utf8",
  );
  assert.match(restriction, /canonical_word_release_tables/);
  assert.match(restriction, /revoke all privileges on table/);
  assert.match(restriction, /canonical_teaching_dictionary_word_morphology/);
  assert.doesNotMatch(restriction, /'canonical_teaching_dictionary_word_support'/);

  console.log("teaching-dictionary-release-regression: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
