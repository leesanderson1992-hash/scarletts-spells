/** Read-only staging proof: each boxing meaning gets its own lesson verdict. */
import assert from "node:assert/strict";
import pg from "pg";
import { evaluateLessonCandidate } from "../lib/teaching-dictionary-manager/lesson-candidate";
import type { DictionarySenseSet } from "../lib/teaching-dictionary-manager/senses";

process.loadEnvFile(".env.staging.local");
const url = process.env.SUPABASE_STAGING_DB_URL;
assert(url && new URL(url).username.split(".").at(-1) === "qkpjbajicacbrphthibk",
  "STAGING_DATABASE_TARGET_MISMATCH");
const wordId = "efa04f55-0f0c-528a-954c-30baacb32e33";
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  const set = await db.query<{ sense_set: DictionarySenseSet }>(`select sense_set
    from public.teaching_dictionary_reviewed_sense_sets where canonical_word_id=$1`, [wordId]);
  assert.equal(set.rows.length, 1);
  const analyses = await db.query<{ id: string; sense_id: string; morphology_parts: unknown[];
    morphology_joins: unknown[]; word_sum: string }>(`select id,sense_id,morphology_parts,
    morphology_joins,word_sum from public.teaching_dictionary_current_sense_morphology
    where canonical_word_id=$1`, [wordId]);
  const links = await db.query<{ sense_id: string; family_key: string;
    component_part_id: string; relationship_kind: string }>(`select sense_id,
    family_key,component_part_id,relationship_kind
    from public.teaching_dictionary_current_sense_family_memberships
    where canonical_word_id=$1`, [wordId]);
  const expected: Record<string, "ready" | "not_match"> = {
    "boxing-noun-sport": "not_match",
    "boxing-verb-fighting": "ready",
    "boxing-verb-packing": "ready",
  };
  const decisions = Object.fromEntries(Object.keys(expected).map(senseId => {
    const analysis = analyses.rows.find(row => row.sense_id === senseId);
    assert(analysis, `Missing ${senseId} analysis`);
    const decision = evaluateLessonCandidate({ wordId, displayWord: "boxing",
      skillKey: "D4_INF_ING_ENDINGS_REGULAR", senseId,
      senseSet: set.rows[0].sense_set,
      morphology: { parts: analysis.morphology_parts, joins: analysis.morphology_joins,
        wordSum: analysis.word_sum, analysisStatus: "approved",
        reviewStatus: "approved_for_first_exposure" },
      familyLinks: links.rows.filter(row => row.sense_id === senseId) });
    assert.equal(decision.status, expected[senseId], `${senseId}: ${JSON.stringify(decision.issues)}`);
    return [senseId, decision.status];
  }));
  assert.equal(links.rows.length, 3);
  assert.equal(new Set(links.rows.map(row => row.family_key)).size, 2);
  console.log(JSON.stringify({ target: "staging", result: "passed", decisions,
    familyLinks: links.rows.length }));
} finally { await db.end(); }
