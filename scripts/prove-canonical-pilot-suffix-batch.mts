/** Rollback-only governed proof for all ten missing reviewed pilot suffix members. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { routeBlockers, routeContentsForSelectedSkills,
  routeWithSingleProfileDefaults } from "../lib/teaching-dictionary-manager/contracts";
import { loadDynamicSuffixProfiles } from "../lib/adle/morphology/dynamic-suffix-profile-loader";
import { compileDynamicAffixWordLabPayload, selectDynamicAffixWordLab,
  validateDynamicAffixWordLabPayload } from "../lib/adle/morphology/affix-word-lab";

const skill = "D4_MOR_SUFFIXES_ABLE_IBLE";
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=reviewed-14-word-able-ible-pilot"))
  throw new Error("EXACT_REVIEWED_PILOT_CONFIRMATION_REQUIRED");
const missingWords = ["available", "reliable", "adorable", "reasonable", "noticeable",
  "understandable", "desirable", "respectable", "applicable", "considerable"];
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_ROLLBACK_ONLY_DATABASE_REQUIRED");
const pilotFile = readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv");
assert.equal(createHash("sha256").update(pilotFile).digest("hex"),
  "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f");
const pilot = parseDictionaryCsv(pilotFile.toString("utf8"));
assert.equal(pilot.length, 14);
const byWord = new Map(pilot.map((row) => [row.normalisedWord, row]));
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
  await db.query("begin");
  await db.query("set local lock_timeout='5s'");
  const profiles = await db.query(`select * from public.canonical_teaching_dictionary_suffix_profiles
    where micro_skill_key=$1 and row_status='active' and production_enabled=true for update`, [skill]);
  assert.equal(profiles.rows.length, 1);
  const profile = profiles.rows[0];
  assert.equal(profile.id, "abd3c9a9-ba0a-4953-bf9e-47d5bfeccc5c",
    "REVIEWED_PROFILE_GENERATION_CHANGED");
  assert.equal(profile.source_row_hash,
    "7d5002b82a5376c3d30e206715c1e270ddd1ec64cfe448fff34dd00560158aa9");
  assert.equal(profile.suffix_meaning, "Capable of, fit for, or able to be");
  assert.deepEqual(profile.meaning_bins.map((bin: { id: string }) => bin.id), ["can_be"]);
  const baseline = await db.query(`select m.canonical_word_id,w.normalised_word from
    public.canonical_teaching_dictionary_suffix_members m
    join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
    where m.suffix_profile_id=$1 and m.row_status='active'
      and m.review_status='approved_for_first_exposure' order by w.normalised_word`, [profile.id]);
  assert.equal(baseline.rows.length, 6);
  assert.deepEqual(baseline.rows.map((row) => row.normalised_word),
    ["comfortable", "enjoyable", "possible", "readable", "responsible", "visible"]);
  const versions: string[] = [];
  for (const word of missingWords) {
    const row = byWord.get(word);
    assert(row && row.canonicalWordId && !row.error && row.payload.skillKeys.includes(skill));
    const source = await db.query(`select d.id,d.created_by,d.payload,
        w.display_word,m.morphology_parts,m.morphology_joins,m.word_sum,
        (select x.definition from public.teaching_dictionary_definition_versions x
          where x.canonical_word_id=w.id and x.route_id is null
          order by x.published_at desc,x.id desc limit 1) definition
      from public.teaching_dictionary_manager_drafts d
      join public.teaching_dictionary_manager_publications pub on pub.draft_id=d.id
      join public.canonical_teaching_dictionary_words w on w.id=d.canonical_word_id
      join public.canonical_teaching_dictionary_word_morphology m
        on m.canonical_word_id=w.id and m.row_status='active'
      where w.id=$1 and d.source_reference like 'CSV batch d596f473-19fd-4b15-94a5-1b69b043391f,%'
        and w.row_status='active' and w.review_status='approved_for_first_exposure'`,
    [row.canonicalWordId]);
    assert.equal(source.rows.length, 1, `REVIEWED_PILOT_PUBLICATION_MISSING:${word}`);
    const current = source.rows[0];
    assert.deepEqual(current.morphology_parts, row.payload.canonicalMorphology.parts);
    assert.deepEqual(current.morphology_joins, row.payload.canonicalMorphology.joins);
    assert.equal(current.word_sum, row.payload.canonicalMorphology.wordSum);
    assert.equal(current.display_word, row.payload.displayWord);
    assert.equal(current.definition, row.payload.definition);
    const route = routeContentsForSelectedSkills(row.payload).find((candidate) =>
      candidate.routeId === "dynamic_affix_word_lab" && candidate.microSkillKey === skill);
    assert(route);
    const prepared = routeWithSingleProfileDefaults(route, {
      choices: profile.suffix_choices.filter((choice: { status: string }) =>
        choice.status === "target").map((choice: { text: string }) => choice.text),
      meaningBins: profile.meaning_bins,
    });
    prepared.content.expectedProfileId = profile.id;
    prepared.content.expectedSourceRowHash = profile.source_row_hash;
    prepared.content.transformationNotes = row.payload.canonicalMorphology.transformationNotes;
    assert.deepEqual(routeBlockers(prepared, row.payload), [], `ROUTE_BLOCKED:${word}`);
    const payload = { ...row.payload, routeContents: [prepared] };
    const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,
        source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'csv',$4,$5) returning id`,
    [row.canonicalWordId, word, JSON.stringify(payload),
      `Reviewed 14-word CSV pilot SHA 43920532d314; owner meaning 2026-11-03; ${word}; source row ${row.sourceRowHash}`,
      current.created_by]);
    const draftId = draft.rows[0].id as string;
    await db.query("select public.review_teaching_dictionary_overview($1,$2)",
      [draftId, current.created_by]);
    const staged = await db.query(`select public.stage_teaching_dictionary_route_draft($1,$2) ids`,
      [draftId, current.created_by]);
    assert.equal(staged.rows[0].ids.length, 1);
    const versionId = staged.rows[0].ids[0] as string;
    await db.query("select public.review_teaching_dictionary_route_content($1,$2)",
      [versionId, current.created_by]);
    versions.push(versionId);
  }
  const actor = await db.query(`select distinct d.created_by from
    public.teaching_dictionary_route_content_versions v
    join public.teaching_dictionary_manager_drafts d on d.id=v.draft_id
    where v.id=any($1::uuid[])`, [versions]);
  assert.equal(actor.rows.length, 1);
  const published = await db.query(`select public.publish_teaching_dictionary_lesson(
    'dynamic_affix_word_lab',$1,$2::uuid[],$3) profile_id`,
  [skill, versions, actor.rows[0].created_by]);
  const newProfileId = published.rows[0].profile_id as string;
  const members = await db.query(`select count(*)::int total,
      count(distinct canonical_word_id)::int distinct_words
    from public.canonical_teaching_dictionary_suffix_members
    where suffix_profile_id=$1 and row_status='active' and review_status='approved_for_first_exposure'`,
  [newProfileId]);
  assert.equal(members.rows[0].total, 16);
  assert.equal(members.rows[0].distinct_words, 16);
  const publications = await db.query(`select count(*)::int n from
    public.teaching_dictionary_route_content_publications where content_version_id=any($1::uuid[])`,
  [versions]);
  assert.equal(publications.rows[0].n, 10);
  const ids = await db.query(`select canonical_word_id from
    public.canonical_teaching_dictionary_suffix_members where suffix_profile_id=$1
      and row_status='active'`, [newProfileId]);
  const wordIds = ids.rows.map((item) => item.canonical_word_id as string);
  const loadedProfile = await db.query(`select * from
    public.canonical_teaching_dictionary_suffix_profiles where id=$1`, [newProfileId]);
  const loadedMembers = await db.query(`select * from
    public.canonical_teaching_dictionary_suffix_members where suffix_profile_id=$1`, [newProfileId]);
  const words = await db.query(`select * from public.canonical_teaching_dictionary_words
    where id=any($1::uuid[]) and row_status='active'`, [wordIds]);
  const dictations = await db.query(`select * from public.canonical_teaching_dictionary_dictation_sentences
    where canonical_word_id=any($1::uuid[]) and row_status='active'`, [wordIds]);
  const metadata = await db.query(`select * from public.canonical_teaching_dictionary_word_metadata
    where canonical_word_id=any($1::uuid[]) and row_status='active'`, [wordIds]);
  const morphology = await db.query(`select * from public.canonical_teaching_dictionary_word_morphology
    where canonical_word_id=any($1::uuid[]) and row_status='active'`, [wordIds]);
  const definitions = await db.query(`select * from public.teaching_dictionary_definition_versions
    where canonical_word_id=any($1::uuid[]) and route_id is null
    order by published_at desc,id desc`, [wordIds]);
  const skillRow = await db.query(`select * from public.micro_skill_catalog where micro_skill_key=$1`, [skill]);
  const tables: Record<string, unknown[]> = {
    canonical_teaching_dictionary_suffix_profiles: [{ ...loadedProfile.rows[0],
      canonical_teaching_dictionary_suffix_members: loadedMembers.rows }],
    canonical_teaching_dictionary_words: words.rows,
    canonical_teaching_dictionary_dictation_sentences: dictations.rows,
    canonical_teaching_dictionary_word_metadata: metadata.rows,
    canonical_teaching_dictionary_word_morphology: morphology.rows,
    teaching_dictionary_definition_versions: definitions.rows,
    teaching_dictionary_dictation_heads: [],
    micro_skill_catalog: skillRow.rows,
    adle_learning_items: [],
  };
  const client = { from(table: string) { return new ReadOnlyQuery(tables[table] ?? []); } };
  const loaded = await loadDynamicSuffixProfiles(client as unknown as SupabaseClient,
    "rollback-proof-child", {
    microSkillKeys: [skill], dictationSeed: "reviewed-pilot-rollback-proof",
  });
  const wordById = new Map(words.rows.map((item) => [item.id, item.normalised_word]));
  const diagnostics = loaded.diagnostics.map((item) => ({ ...item,
    word: item.memberIndex === undefined ? null
      : wordById.get(loadedMembers.rows[item.memberIndex]?.canonical_word_id) ?? null }));
  assert.equal(loaded.profiles.length, 1, JSON.stringify(diagnostics));
  assert.equal(loaded.profiles[0]?.wordsByCanonicalId.size, 16,
    JSON.stringify(diagnostics));
  assert.deepEqual(diagnostics, []);
  assert.equal(loaded.profiles[0]?.affixMeaning, "Capable of, fit for, or able to be");
  for (const word of missingWords) {
    const canonicalWordId = byWord.get(word)?.canonicalWordId;
    assert(canonicalWordId);
    const selected = selectDynamicAffixWordLab({ profiles: loaded.profiles,
      learningItems: [{ learningItemId: `rollback:${word}`, childId: "rollback-proof-child",
        canonicalWordId, microSkillKey: skill, itemStatus: "pending",
        sourceKind: "verified_misspelling", sourceRef: "rollback-proof",
        sourceAttemptText: null, reteachPriority: false, ejectedOn: null,
        intakeOn: "2026-11-03", rowStatus: "active" }],
    });
    assert(selected, `LESSON_SELECTION_FAILED:${word}`);
    const lesson = compileDynamicAffixWordLabPayload(selected);
    assert(lesson && validateDynamicAffixWordLabPayload(lesson),
      `LESSON_JSON_INVALID:${word}`);
    assert(lesson.authenticCanonicalWordIds.includes(canonicalWordId));
  }
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ status: apply ? "applied" : "rollback_proof",
    existingMembers: baseline.rows.length,
    reviewedCandidateWords: missingWords, publishedVersions: versions.length,
    projectedCurrentMembers: members.rows[0].total,
    runtimeLoaderReadyMembers: loaded.profiles[0]?.wordsByCanonicalId.size,
    generatedLessonsValidated: missingWords.length }, null, 2));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
