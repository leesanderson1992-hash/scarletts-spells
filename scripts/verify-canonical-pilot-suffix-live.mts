/** Read-only Production loader and lesson JSON proof after governed publication. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { loadDynamicSuffixProfiles } from "../lib/adle/morphology/dynamic-suffix-profile-loader";
import { compileDynamicAffixWordLabPayload, selectDynamicAffixWordLab,
  validateDynamicAffixWordLabPayload } from "../lib/adle/morphology/affix-word-lab";

const skill = "D4_MOR_SUFFIXES_ABLE_IBLE";
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_READ_ONLY_DATABASE_REQUIRED");
const pilot = parseDictionaryCsv(readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv", "utf8"));
const suffixWords = pilot.filter((row) => row.payload.skillKeys.includes(skill));
assert.equal(suffixWords.length, 13);
class ReadOnlyQuery implements PromiseLike<{ data: unknown[]; error: null }> {
  constructor(private readonly rows: unknown[]) {}
  select() { return this; }
  in() { return this; }
  eq() { return this; }
  is() { return this; }
  order() { return this; }
  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin read only");
  const active = await db.query(`select * from public.canonical_teaching_dictionary_suffix_profiles
    where micro_skill_key=$1 and row_status='active' and review_status='approved_for_first_exposure'`, [skill]);
  assert.equal(active.rows.length, 1);
  const profile = active.rows[0];
  assert.equal(profile.production_enabled, true);
  assert.equal(profile.suffix_meaning, "Capable of, fit for, or able to be");
  const members = await db.query(`select * from public.canonical_teaching_dictionary_suffix_members
    where suffix_profile_id=$1 and row_status='active' order by canonical_word_id`, [profile.id]);
  assert.equal(members.rows.length, 16);
  const ids = members.rows.map((row) => row.canonical_word_id as string);
  const words = await db.query(`select * from public.canonical_teaching_dictionary_words
    where id=any($1::uuid[]) and row_status='active'`, [ids]);
  const dictations = await db.query(`select * from public.canonical_teaching_dictionary_dictation_sentences
    where canonical_word_id=any($1::uuid[]) and row_status='active'`, [ids]);
  const metadata = await db.query(`select * from public.canonical_teaching_dictionary_word_metadata
    where canonical_word_id=any($1::uuid[]) and row_status='active'`, [ids]);
  const morphology = await db.query(`select * from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=any($1::uuid[]) and row_status='active'`, [ids]);
  const definitions = await db.query(`select * from public.teaching_dictionary_definition_versions
    where canonical_word_id=any($1::uuid[]) and route_id is null
    order by published_at desc,id desc`, [ids]);
  const microSkill = await db.query(`select * from public.micro_skill_catalog
    where micro_skill_key=$1`, [skill]);
  const tables: Record<string, unknown[]> = {
    canonical_teaching_dictionary_suffix_profiles: [{ ...profile,
      canonical_teaching_dictionary_suffix_members: members.rows }],
    canonical_teaching_dictionary_words: words.rows,
    canonical_teaching_dictionary_dictation_sentences: dictations.rows,
    canonical_teaching_dictionary_word_metadata: metadata.rows,
    canonical_teaching_dictionary_word_morphology: morphology.rows,
    teaching_dictionary_definition_versions: definitions.rows,
    teaching_dictionary_dictation_heads: [],
    micro_skill_catalog: microSkill.rows,
    adle_learning_items: [],
  };
  const client = { from(table: string) { return new ReadOnlyQuery(tables[table] ?? []); } };
  const loaded = await loadDynamicSuffixProfiles(client as unknown as SupabaseClient,
    "read-only-verification", { microSkillKeys: [skill], dictationSeed: "reviewed-pilot-live-proof" });
  assert.equal(loaded.profiles.length, 1, JSON.stringify(loaded.diagnostics));
  assert.equal(loaded.profiles[0]?.wordsByCanonicalId.size, 16,
    JSON.stringify(loaded.diagnostics));
  assert.deepEqual(loaded.diagnostics, []);
  for (const row of suffixWords) {
    assert(row.canonicalWordId && !row.error);
    assert(loaded.profiles[0]?.wordsByCanonicalId.has(row.canonicalWordId),
      `PILOT_MEMBER_NOT_READY:${row.normalisedWord}`);
    const selected = selectDynamicAffixWordLab({ profiles: loaded.profiles,
      learningItems: [{ learningItemId: `verify:${row.normalisedWord}`,
        childId: "read-only-verification", canonicalWordId: row.canonicalWordId,
        microSkillKey: skill, itemStatus: "pending", sourceKind: "verified_misspelling",
        sourceRef: "read-only-verification", sourceAttemptText: null,
        reteachPriority: false, ejectedOn: null, intakeOn: "2026-11-03",
        rowStatus: "active" }],
    });
    assert(selected, `PILOT_SELECTION_FAILED:${row.normalisedWord}`);
    const lesson = compileDynamicAffixWordLabPayload(selected);
    assert(lesson && validateDynamicAffixWordLabPayload(lesson),
      `PILOT_LESSON_JSON_INVALID:${row.normalisedWord}`);
    assert(lesson.authenticCanonicalWordIds.includes(row.canonicalWordId));
  }
  console.log(JSON.stringify({ status: "verified", profileId: profile.id,
    activeMembers: members.rows.length, runtimeReadyMembers: loaded.profiles[0]?.wordsByCanonicalId.size,
    pilotSuffixMembers: suffixWords.length, validGeneratedLessons: suffixWords.length,
    affixMeaning: loaded.profiles[0]?.affixMeaning }, null, 2));
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
