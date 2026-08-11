import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import pg from "pg";

const ROOT = resolve(import.meta.dirname, "..");
const ANALYSES_PATH = resolve(
  ROOT,
  "data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json",
);
const OUTPUT_PATH = resolve(
  ROOT,
  "data/adle/review/d4-mor/v2/compound-word-v2-readiness-review.json",
);
const COMPOUND_SKILLS = new Set([
  "D4_MOR_COMPOUND_WORDS_CLOSED_COMPOUNDS",
  "D4_MOR_COMPOUND_WORDS_SEPARATED_HYPHENATED",
]);
const PRODUCTION_HOST = "aws-0-eu-west-1.pooler.supabase.com";
const PRODUCTION_USER = "postgres.wwohrqtunajrbwxyssjf";

type Analysis = {
  microSkillKey: string;
  displayWord: string;
  parts: Array<{ surfaceText: string }>;
  joins: Array<{ joinType: "none" | "space" | "hyphen" }>;
  source: { artifact: string; sheet: string; row: number };
  humanReviewStatus: string;
  approvalStatus: string;
};

type DictionaryWord = {
  id: string;
  display_word: string;
  row_status: string;
  review_status: string;
};

type Dictation = {
  canonical_word_id: string;
  dictation_sentence: string;
  dictation_target_token_index: number;
  review_status: string;
};

type CompoundFact = {
  canonical_word_id: string;
  first_word: string;
  second_word: string;
  first_word_meaning: string;
  second_word_meaning: string;
  child_friendly_definition: string;
  true_morphology_provenance: Record<string, unknown>;
  assignment_eligible: boolean;
  transfer_eligible: boolean;
  review_status: string;
  source_sheet: string;
  source_row_number: number;
  source_row_hash: string;
};

function tokenise(sentence: string): string[] {
  return sentence
    .trim()
    .split(/\s+/)
    .map((token) => token.toLocaleLowerCase("en-GB").replace(/[^a-z'-]/g, ""))
    .filter(Boolean);
}

function separator(kind: Analysis["joins"][number]["joinType"]): string {
  if (kind === "space") return " ";
  if (kind === "hyphen") return "-";
  return "";
}

function reconstruct(analysis: Analysis): string {
  return analysis.parts.reduce(
    (written, part, index) =>
      index === 0
        ? part.surfaceText
        : `${written}${separator(analysis.joins[index - 1].joinType)}${part.surfaceText}`,
    "",
  );
}

function dictionaryUrl(): string {
  const value = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
  if (!value) throw new Error("SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED is required");
  const parsed = new URL(value);
  if (
    parsed.hostname !== PRODUCTION_HOST ||
    decodeURIComponent(parsed.username) !== PRODUCTION_USER
  ) {
    throw new Error("CW-1 review projection requires the guarded Production read-only source");
  }
  return value;
}

async function main(): Promise<void> {
  if (!process.argv.includes("--write")) {
    throw new Error("Use --write to replace only the deterministic local review artifact");
  }
  const parsed = JSON.parse(readFileSync(ANALYSES_PATH, "utf8")) as {
    wordAnalyses: Analysis[];
  };
  const analyses = parsed.wordAnalyses.filter((analysis) =>
    COMPOUND_SKILLS.has(analysis.microSkillKey),
  );
  const surfaces = [
    ...new Set(
      analyses.flatMap((analysis) => [
        analysis.displayWord,
        ...analysis.parts.map((part) => part.surfaceText),
      ]),
    ),
  ];

  const client = new pg.Client({ connectionString: dictionaryUrl() });
  await client.connect();
  try {
    await client.query("begin read only");
    const words = await client.query<DictionaryWord>(
      "select id,display_word,row_status,review_status from canonical_teaching_dictionary_words where display_word=any($1) order by display_word",
      [surfaces],
    );
    const wholeIds = analyses
      .map((analysis) =>
        words.rows.find((word) => word.display_word === analysis.displayWord)?.id,
      )
      .filter((id): id is string => Boolean(id));
    const [dictations, facts] = await Promise.all([
      client.query<Dictation>(
        "select canonical_word_id,dictation_sentence,dictation_target_token_index,review_status from canonical_teaching_dictionary_dictation_sentences where canonical_word_id=any($1) and row_status='active' order by canonical_word_id",
        [wholeIds],
      ),
      client.query<CompoundFact>(
        "select canonical_word_id,first_word,second_word,first_word_meaning,second_word_meaning,child_friendly_definition,true_morphology_provenance,assignment_eligible,transfer_eligible,review_status,source_sheet,source_row_number,source_row_hash from canonical_teaching_dictionary_compound_facts where canonical_word_id=any($1) and row_status='active' order by canonical_word_id",
        [wholeIds],
      ),
    ]);

    const wordBySurface = new Map(
      words.rows
        .filter(
          (word) =>
            word.row_status === "active" &&
            word.review_status === "approved_for_first_exposure",
        )
        .map((word) => [word.display_word, word]),
    );
    const dictationByWord = new Map(
      dictations.rows.map((dictation) => [dictation.canonical_word_id, dictation]),
    );
    const factByWord = new Map(facts.rows.map((fact) => [fact.canonical_word_id, fact]));

    const rows = analyses.map((analysis) => {
      const whole = wordBySurface.get(analysis.displayWord);
      const fact = whole ? factByWord.get(whole.id) : undefined;
      const dictation = whole ? dictationByWord.get(whole.id) : undefined;
      const components = analysis.parts.map((part, index) => ({
        ordinal: index + 1,
        display_surface: part.surfaceText,
        canonical_word_id: wordBySurface.get(part.surfaceText)?.id ?? null,
        meaning:
          fact && analysis.parts.length === 2
            ? index === 0
              ? fact.first_word_meaning
              : fact.second_word_meaning
            : null,
        sense: null,
      }));
      const reconstructed = reconstruct(analysis);
      const targetToken = dictation
        ? tokenise(dictation.dictation_sentence)[dictation.dictation_target_token_index] ?? null
        : null;
      const targetSpanStatus = !dictation
        ? "missing"
        : targetToken === analysis.displayWord.toLocaleLowerCase("en-GB")
          ? "ready_single_token"
          : analysis.displayWord.includes(" ")
            ? "requires_multi_token_span_review"
            : "target_mismatch";
      const blockers: string[] = [];
      if (!whole) blockers.push("whole_canonical_word_missing");
      if (components.some((component) => !component.canonical_word_id)) {
        blockers.push("component_canonical_word_missing");
      }
      if (!fact?.child_friendly_definition) blockers.push("whole_meaning_missing");
      if (components.some((component) => !component.meaning)) {
        blockers.push("component_meanings_missing");
      }
      blockers.push("component_to_whole_relationship_missing");
      if (!dictation) blockers.push("dictation_missing");
      if (targetSpanStatus !== "ready_single_token" && targetSpanStatus !== "missing") {
        blockers.push("dictation_target_span_review_required");
      }
      if (reconstructed !== analysis.displayWord) blockers.push("reconstruction_mismatch");

      return {
        micro_skill_key: analysis.microSkillKey,
        whole_word: analysis.displayWord,
        whole_canonical_word_id: whole?.id ?? null,
        component_count: components.length,
        ordered_component_surfaces: components.map(
          (component) => component.display_surface,
        ),
        ordered_component_canonical_word_ids: components.map(
          (component) => component.canonical_word_id,
        ),
        components,
        ordered_join_kinds: analysis.joins.map((join) => join.joinType),
        joins: analysis.joins.map((join, index) => ({
          ordinal: index + 1,
          kind: join.joinType,
        })),
        reconstructed_written_form: reconstructed,
        whole_child_friendly_meaning: fact?.child_friendly_definition ?? null,
        component_to_whole_relationship: null,
        dictation_status: dictation?.review_status ?? "missing",
        dictation_target_span_status: targetSpanStatus,
        structure_provenance: {
          artifact: analysis.source.artifact,
          sheet: analysis.source.sheet,
          row: analysis.source.row,
          approval_status: analysis.approvalStatus,
          human_review_status: analysis.humanReviewStatus,
          released_fact_provenance: fact?.true_morphology_provenance ?? null,
          released_fact_source: fact
            ? {
                sheet: fact.source_sheet,
                row: fact.source_row_number,
                row_hash: fact.source_row_hash,
                review_status: fact.review_status,
              }
            : null,
        },
        assignment_eligible: fact?.assignment_eligible ?? false,
        transfer_eligible: fact?.transfer_eligible ?? false,
        publication_ready: blockers.length === 0,
        current_blocker: blockers[0] ?? null,
        publication_blockers: blockers,
        human_review_required: blockers.filter((blocker) =>
          blocker.includes("meaning") ||
          blocker.includes("relationship") ||
          blocker.includes("target_span") ||
          blocker.includes("canonical_word") ||
          blocker === "dictation_missing",
        ),
      };
    });

    const summary = {
      reviewed_words: rows.length,
      whole_canonical_words: rows.filter((row) => row.whole_canonical_word_id).length,
      complete_canonical_component_identity: rows.filter((row) =>
        row.components.every((component) => component.canonical_word_id),
      ).length,
      complete_component_and_whole_meanings: rows.filter(
        (row) =>
          row.whole_child_friendly_meaning &&
          row.components.every((component) => component.meaning),
      ).length,
      reviewed_component_to_whole_relationships: rows.filter(
        (row) => row.component_to_whole_relationship,
      ).length,
      dictation_ready: rows.filter((row) => row.dictation_status !== "missing").length,
      dictation_target_span_ready: rows.filter(
        (row) => row.dictation_target_span_status === "ready_single_token",
      ).length,
      publication_ready: rows.filter((row) => row.publication_ready).length,
      human_review_required: rows.filter((row) => row.human_review_required.length > 0)
        .length,
    };
    const artifact = {
      schema_version: 1,
      purpose: "CW-1 deterministic review projection; not a curriculum release or activation",
      source_as_of: "2026-08-11",
      approved_analysis_source:
        "data/adle/approved/d4-mor/v1/d4-mor-v1-word-analyses.json",
      canonical_identity_source:
        "Production canonical Teaching Dictionary queried inside BEGIN READ ONLY",
      summary,
      rows,
    };
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
    await client.query("rollback");
    console.log(JSON.stringify({ output: OUTPUT_PATH, summary }, null, 2));
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {}
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
