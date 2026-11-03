/** Governed transaction for six reviewed pilot Base Word route approvals. Rollback by default. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { parseDictionaryCsv } from "../lib/teaching-dictionary-manager/csv";
import { routeBlockers, routeContentsForSelectedSkills } from "../lib/teaching-dictionary-manager/contracts";

const skill = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const expectedFamilies: Record<string, string> = {
  reasonable: "reason_noun_base_family", comfortable: "comfort_noun_base_family",
  noticeable: "notice_verb_base_family", understandable: "understand_verb_base_family",
  respectable: "respect_noun_base_family", considerable: "consider_verb_base_family",
};
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm=reviewed-14-word-base-route-pilot"))
  throw new Error("EXACT_REVIEWED_PILOT_CONFIRMATION_REQUIRED");
delete process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
process.loadEnvFile(".env.local");
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
if (!url || new URL(url).username.split(".").at(-1) !== "wwohrqtunajrbwxyssjf")
  throw new Error("PRODUCTION_DATABASE_REQUIRED");
const file = readFileSync(
  "docs/implementation/seed-data/teaching-dictionary/candidates/2026-11-03-canonical-pilot/reviewed-14-word-pilot.csv");
const hash = createHash("sha256").update(file).digest("hex");
assert.equal(hash, "43920532d314cfe413b0fba7a760bcab296c0ba334b0bf5dc27b72248999306f");
const pilot = parseDictionaryCsv(file.toString("utf8"));
assert.equal(pilot.length, 14);
const byWord = new Map(pilot.map((row) => [row.normalisedWord, row]));
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });
await db.connect();
try {
  await db.query("begin isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const protectedState = async () => (await db.query(`select jsonb_build_object(
    'children',(select count(*) from public.children),
    'learningItems',(select count(*) from public.adle_learning_items),
    'completedAssignments',(select count(*) from public.daily_assignments where status='completed'),
    'reviewSessions',(select count(*) from public.adle_review_sessions)) state`)).rows[0].state;
  const before = await protectedState();
  const versions: Array<{ word: string; versionId: string; familyKey: string }> = [];
  for (const [word, familyKey] of Object.entries(expectedFamilies)) {
    const row = byWord.get(word);
    assert(row?.canonicalWordId && !row.error && row.payload.skillKeys.includes(skill));
    const current = await db.query(`select w.display_word,w.normalised_word,w.row_status,w.review_status,
        m.morphology_parts,m.morphology_joins,m.word_sum,d.created_by,
        (select x.definition from public.teaching_dictionary_definition_versions x
          where x.canonical_word_id=w.id and x.route_id is null
          order by x.published_at desc,x.id desc limit 1) definition
      from public.canonical_teaching_dictionary_words w
      join public.canonical_teaching_dictionary_word_morphology m on m.canonical_word_id=w.id and m.row_status='active'
      join public.teaching_dictionary_manager_drafts d on d.canonical_word_id=w.id
      join public.teaching_dictionary_manager_publications pub on pub.draft_id=d.id
      where w.id=$1 and d.source_reference like 'CSV batch d596f473-19fd-4b15-94a5-1b69b043391f,%'`,
    [row.canonicalWordId]);
    assert.equal(current.rows.length, 1, `REVIEWED_PILOT_OVERVIEW_MISSING:${word}`);
    const facts = current.rows[0];
    assert.equal(facts.row_status, "active");
    assert.equal(facts.review_status, "approved_for_first_exposure");
    assert.equal(facts.display_word, row.payload.displayWord);
    assert.equal(facts.normalised_word, word);
    assert.equal(facts.definition, row.payload.definition);
    assert.equal(facts.word_sum, row.payload.canonicalMorphology.wordSum);
    assert.deepEqual(facts.morphology_parts, row.payload.canonicalMorphology.parts);
    assert.deepEqual(facts.morphology_joins, row.payload.canonicalMorphology.joins);
    const family = await db.query(`select f.review_status,f.base_kind,f.semantic_fingerprint,
        (a.authorized_at is not null and a.withdrawn_at is null) authorized,
        (member.morphology_parts=$3::jsonb and member.morphology_joins=$4::jsonb
          and member.word_sum=$5) exact_member
      from public.canonical_teaching_dictionary_lexical_base_families f
      join public.canonical_teaching_dictionary_lexical_base_family_members member
        on member.family_key=f.family_key and member.revision=f.revision
        and member.canonical_word_id=$1
      left join public.adle_base_word_lexical_family_authorizations a
        on a.family_key=f.family_key and a.revision=f.revision
        and a.semantic_fingerprint=f.semantic_fingerprint
      where f.family_key=$2 order by f.revision desc limit 1`,
    [row.canonicalWordId, familyKey, JSON.stringify(facts.morphology_parts),
      JSON.stringify(facts.morphology_joins), facts.word_sum]);
    assert.equal(family.rows.length, 1, `FAMILY_MISSING:${word}`);
    assert.equal(family.rows[0].review_status, "approved");
    assert.equal(family.rows[0].base_kind, "free_base");
    assert.equal(family.rows[0].authorized, true);
    assert.equal(family.rows[0].exact_member, true);
    const pair = await db.query(`select count(*)::int n from public.adle_reviewed_word_skill_pairs p
      join public.adle_reviewed_word_skill_releases r on r.id=p.release_id
      where p.canonical_word_id=$1 and p.micro_skill_key=$2 and p.relationship_role='demonstrates'
        and r.environment_key='production' and not exists (
          select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=r.id)`,
    [row.canonicalWordId, skill]);
    assert.equal(pair.rows[0].n, 1, `REVIEWED_SKILL_PAIR_MISSING:${word}`);
    const previous = await db.query(`select count(*)::int n from public.teaching_dictionary_route_content_versions v
      join public.teaching_dictionary_route_content_reviews review on review.content_version_id=v.id
      where v.canonical_word_id=$1 and v.route_id='base_word_lab' and v.micro_skill_key=$2
        and review.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(v.canonical_word_id)`,
    [row.canonicalWordId, skill]);
    assert.equal(previous.rows[0].n, 0, `CURRENT_REVIEWED_ROUTE_ALREADY_EXISTS:${word}`);
    const route = routeContentsForSelectedSkills(row.payload).find((item) =>
      item.routeId === "base_word_lab" && item.microSkillKey === skill);
    assert(route);
    route.content.familyKey = familyKey;
    assert.deepEqual(routeBlockers(route, row.payload), [], `ROUTE_BLOCKED:${word}`);
    const payload = { ...row.payload, routeContents: [route] };
    const draft = await db.query(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'csv',$4,$5) returning id`,
    [row.canonicalWordId, word, JSON.stringify(payload),
      `Reviewed 14-word CSV pilot SHA ${hash}; Base Word family ${familyKey}; source row ${row.sourceRowHash}`,
      facts.created_by]);
    await db.query("select public.review_teaching_dictionary_overview($1,$2)",
      [draft.rows[0].id, facts.created_by]);
    const staged = await db.query("select public.stage_teaching_dictionary_route_draft($1,$2) ids",
      [draft.rows[0].id, facts.created_by]);
    assert.equal(staged.rows[0].ids.length, 1, `STAGE_FAILED:${word}`);
    const versionId = staged.rows[0].ids[0] as string;
    await db.query("select public.review_teaching_dictionary_route_content($1,$2)",
      [versionId, facts.created_by]);
    versions.push({ word, versionId, familyKey });
  }
  const after = await protectedState();
  assert.deepEqual(after, before, "LEARNER_STATE_CHANGED");
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ mode: apply ? "staged_reviewed" : "rollback_proof",
    reviewedRoutes: versions.length, words: versions.map((item) => item.word), learnerState: before }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  throw error;
} finally {
  await db.end();
}
