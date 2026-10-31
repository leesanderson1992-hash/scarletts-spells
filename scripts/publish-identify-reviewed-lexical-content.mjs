#!/usr/bin/env node
/** Publish owner-reviewed exact lexical authorizations and route-content reviews.
 * Defaults to a serializable rollback proof. This does not activate a lesson. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

const SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const CLUSTER = [SKILL, "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX", "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX"];
const REPORT = "docs/implementation/qa/identify-base-word-next-family-release-review-2026-10-31.md";
const REPORT_SHA = "e66a5e8af1d6c6732e5a8dea7eed73fab3ae9c96a363c1601a40ff3663f77718";
const actor = (process.env.ADMIN_USER_IDS ?? "").split(",")[0];
const url = process.env.SUPABASE_PRODUCTION_DB_URL_POOLER_SHARED;
const apply = process.argv.includes("--apply");
if (!url || !new URL(url).username.includes("wwohrqtunajrbwxyssjf") ||
    !new URL(url).hostname.endsWith("pooler.supabase.com") || !actor)
  throw new Error("PRODUCTION_TARGET_OR_ACTOR_MISMATCH");
const source = readFileSync(REPORT, "utf8");
const sha = (value) => createHash("sha256").update(value).digest("hex");
assert.equal(sha(source), REPORT_SHA, "Owner-approved report changed");

function section(start, end) {
  const fragment = source.split(`## ${start}\n`)[1]?.split(`## ${end}\n`)[0];
  if (!fragment) throw new Error(`Missing report section: ${start}`);
  return fragment.split("\n").filter((line) => line.startsWith("|")).slice(2)
    .map((line) => line.split("|").slice(1, -1).map((value) => value.trim().replaceAll("\\|", "|")));
}
const familyRows = section("Exact approved lexical family revisions", "Complete latest-revision family membership")
  .map(([key, revision, authorization, fingerprint, baseMeaning]) => ({
    key, revision: Number(revision), authorization, fingerprint: fingerprint.replaceAll("`", ""), baseMeaning,
  }));
const memberRows = section("Complete latest-revision family membership", "Exact word content to review")
  .map(([familyKey, word, role, wordSum, intendedMeaning]) => ({ familyKey, word, role, wordSum, intendedMeaning }));
const targetRows = section("Exact word content to review", "Act and govern exception")
  .map(([word, familyKey, wordSum, intendedMeaning, baseMeaning, authorization]) => ({
    word, familyKey, wordSum, intendedMeaning, baseMeaning, authorization,
  }));
assert.equal(familyRows.length, 29);
assert.equal(memberRows.length, 104);
assert.equal(targetRows.length, 61);
assert.equal(new Set(familyRows.map((row) => row.key)).size, 29);
assert.equal(new Set(targetRows.map((row) => row.word)).size, 61);

const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  await db.query("begin transaction isolation level serializable");
  await db.query("set local lock_timeout='5s'");
  const keys = familyRows.map((row) => row.key);
  const latest = (await db.query(`select distinct on (family_key) * from public.canonical_teaching_dictionary_lexical_base_families
    where family_key=any($1::text[]) and review_status='approved' order by family_key,revision desc`, [keys])).rows;
  assert.equal(latest.length, 29);
  const familyByKey = new Map(latest.map((row) => [row.family_key, row]));
  const auth = (await db.query(`select family_key,revision,semantic_fingerprint,withdrawn_at
    from public.adle_base_word_lexical_family_authorizations where family_key=any($1::text[])`, [keys])).rows;
  const activeAuth = new Set(auth.filter((row) => !row.withdrawn_at)
    .map((row) => `${row.family_key}:${row.revision}:${row.semantic_fingerprint}`));
  const currentMembers = (await db.query(`select m.*,w.normalised_word,w.display_word,w.row_status word_status,
      w.review_status word_review,d.id dictation_id,d.dictation_sentence,
      d.dictation_target_token_index,d.audio_text,
      exists(select 1 from public.canonical_teaching_dictionary_word_morphology current_morphology
        where current_morphology.id=m.canonical_morphology_id
          and current_morphology.canonical_word_id=m.canonical_word_id
          and current_morphology.row_status='active'
          and current_morphology.review_status='approved_for_first_exposure'
          and current_morphology.analysis_status='approved'
          and current_morphology.word_sum=m.word_sum
          and current_morphology.morphology_parts=m.morphology_parts
          and current_morphology.morphology_joins=m.morphology_joins
          and current_morphology.morphology_transformations=m.morphology_transformations) exact_morphology
    from public.canonical_teaching_dictionary_lexical_base_family_members m
    join public.canonical_teaching_dictionary_words w on w.id=m.canonical_word_id
    left join public.canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id
      and d.row_status='active' and d.review_status='approved_for_first_exposure'
    where m.family_key=any($1::text[])`, [keys])).rows.filter((row) => row.revision === familyByKey.get(row.family_key)?.revision);
  const memberByKey = new Map(currentMembers.map((row) => [`${row.family_key}:${row.normalised_word}`, row]));
  assert.equal(memberByKey.size, 104, "Latest family membership drifted");
  for (const row of familyRows) {
    const sourceFamily = familyByKey.get(row.key);
    assert(sourceFamily && sourceFamily.base_kind === "free_base" && sourceFamily.canonical_base_word_id);
    assert.equal(sourceFamily.revision, row.revision);
    assert.equal(sourceFamily.semantic_fingerprint, row.fingerprint);
    assert.equal(sourceFamily.base_meaning, row.baseMeaning);
  }
  for (const row of memberRows) {
    const sourceMember = memberByKey.get(`${row.familyKey}:${row.word}`);
    assert(sourceMember, `Missing reviewed member ${row.familyKey}:${row.word}`);
    assert.equal(sourceMember.word_sum, row.wordSum);
    assert.equal(sourceMember.intended_meaning, row.intendedMeaning);
    const family = familyByKey.get(row.familyKey);
    const role = sourceMember.canonical_word_id === family.canonical_base_word_id ? "base"
      : targetRows.some((target) => target.familyKey === row.familyKey && target.word === row.word)
        ? "pending Identify target" : "other approved relative";
    assert.equal(role, row.role);
  }
  const targetMembers = targetRows.map((row) => {
    const member = memberByKey.get(`${row.familyKey}:${row.word}`);
    const family = familyByKey.get(row.familyKey);
    assert(member && family);
    assert.equal(member.word_sum, row.wordSum);
    assert.equal(member.intended_meaning, row.intendedMeaning);
    assert.equal(family.base_meaning, row.baseMeaning);
    assert.notEqual(member.canonical_word_id, family.canonical_base_word_id);
    assert(member.exact_morphology && member.word_status === "active" &&
      member.word_review === "approved_for_first_exposure" && member.dictation_id,
      `Dictionary or morphology drifted for ${row.word}`);
    assert(["derived", "regular_inflection"].includes(member.relationship_kind));
    assert(!/[’']/u.test(row.word) && Array.isArray(member.morphology_parts) &&
      member.morphology_parts.filter((part) => part.kind === "base").length === 1 &&
      member.morphology_parts.some((part) => part.kind === "prefix" || part.kind === "suffix"));
    assert(!member.morphology_transformations.some((transform) => transform.kind === "irregular_form"));
    return { ...row, member, family };
  });
  const ids = targetMembers.map(({ member }) => member.canonical_word_id);
  assert.equal(new Set(ids).size, 61);
  const published = (await db.query(`select count(distinct pair.canonical_word_id)::int n
    from public.adle_reviewed_word_skill_pairs pair
    join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
    where release.environment_key='production' and pair.micro_skill_key=$1
      and pair.relationship_role='demonstrates' and pair.canonical_word_id=any($2::uuid[])
      and not exists(select 1 from public.adle_reviewed_word_skill_withdrawals x where x.release_id=release.id)`,
  [SKILL, ids])).rows[0].n;
  assert.equal(published, 61, "A target relationship is not published");
  const vetoes = (await db.query(`select canonical_word_id,micro_skill_key from public.teaching_dictionary_pair_latest_decisions
    where environment_key='production' and action='deassign' and micro_skill_key=any($1::text[])
      and canonical_word_id=any($2::uuid[])`, [CLUSTER, ids])).rows;
  assert.equal(vetoes.length, 0, "An approved release target has a governed veto");
  const reference = `owner-approved-identify-family-review-2026-10-31:sha256:${REPORT_SHA}`;
  let newAuthorizations = 0;
  for (const row of familyRows) {
    const key = `${row.key}:${row.revision}:${row.fingerprint}`;
    if (activeAuth.has(key)) continue;
    const prior = auth.find((entry) => entry.family_key === row.key && entry.revision === row.revision);
    assert(!prior, `Existing exact revision is withdrawn or mismatched: ${row.key}`);
    await db.query(`insert into public.adle_base_word_lexical_family_authorizations
      (family_key,revision,semantic_fingerprint,authorization_reference,authorized_by)
      values($1,$2,$3,$4,$5)`, [row.key,row.revision,row.fingerprint,reference,actor]);
    newAuthorizations += 1;
  }
  let newContent = 0;
  for (const { member, family } of targetMembers) {
    const content = {
      routeId: "base_word_lab", routeVersion: "v2", microSkillKey: SKILL,
      wordSum: member.word_sum, wordMeaning: member.intended_meaning,
      content: {
        familyKey: family.family_key, baseWord: family.base_lemma,
        baseMeaning: family.base_meaning, sourceRefs: [reference,
          `lexical-family:${family.family_key}:${family.revision}:${family.semantic_fingerprint}`],
        morphologyParts: member.morphology_parts.map((part, index) => ({
          id: `part_${index + 1}`, kind: part.kind, teachingRole: part.kind,
          sourceText: part.sourceText, text: part.surfaceText,
          meaning: part.kind === "base" ? family.base_meaning : "",
        })),
      },
    };
    const previous = (await db.query(`select v.content=$3::jsonb same_content,r.content_version_id is not null reviewed
      from public.teaching_dictionary_route_content_versions v
      left join public.teaching_dictionary_route_content_reviews r on r.content_version_id=v.id
      where v.canonical_word_id=$1 and v.route_id='base_word_lab' and v.route_version='v2'
        and v.micro_skill_key=$2 order by v.published_at desc,v.id desc limit 1`,
      [member.canonical_word_id, SKILL, JSON.stringify(content)])).rows[0];
    if (previous?.reviewed && previous.same_content) continue;
    const draft = (await db.query(`insert into public.teaching_dictionary_manager_drafts
      (canonical_word_id,normalised_word,dialect_code,payload,source_kind,source_reference,created_by)
      values($1,$2,'en-GB',$3::jsonb,'approved_submission',$4,$5) returning id`,
      [member.canonical_word_id,member.normalised_word,JSON.stringify({
        displayWord: member.display_word, definition: member.intended_meaning,
        dictationSentence: member.dictation_sentence, skillKeys: [SKILL],
        canonicalMorphology: { wordSum: member.word_sum, parts: member.morphology_parts,
          joins: member.morphology_joins, transformations: member.morphology_transformations },
        routeContents: [content],
      }),reference,actor])).rows[0];
    const version = (await db.query(`insert into public.teaching_dictionary_route_content_versions
      (canonical_word_id,route_id,route_version,micro_skill_key,content,draft_id)
      values($1,'base_word_lab','v2',$2,$3::jsonb,$4) returning id`,
      [member.canonical_word_id,SKILL,JSON.stringify(content),draft.id])).rows[0];
    await db.query(`insert into public.teaching_dictionary_route_content_reviews
      (content_version_id,content_sha256,dictionary_fingerprint,reviewed_by)
      values($1,encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex'),
        public.teaching_dictionary_route_dictionary_fingerprint($3),$4)`,
      [version.id,JSON.stringify(content),member.canonical_word_id,actor]);
    newContent += 1;
  }
  const reviewed = (await db.query(`select count(distinct v.canonical_word_id)::int n
    from public.teaching_dictionary_route_content_versions v
    join public.teaching_dictionary_route_content_reviews r on r.content_version_id=v.id
    where v.canonical_word_id=any($1::uuid[]) and v.route_id='base_word_lab'
      and v.route_version='v2' and v.micro_skill_key=$2
      and r.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(v.canonical_word_id)
      and r.content_sha256=encode(extensions.digest(convert_to(v.content::text,'UTF8'),'sha256'),'hex')
      and not exists(select 1 from public.teaching_dictionary_route_content_versions newer
        where newer.canonical_word_id=v.canonical_word_id and newer.route_id=v.route_id
          and newer.route_version=v.route_version and newer.micro_skill_key=v.micro_skill_key
          and (newer.published_at,newer.id)>(v.published_at,v.id))`, [ids,SKILL])).rows[0].n;
  assert.equal(reviewed, 61, "Exact latest route content review incomplete");
  const authReadback = (await db.query(`select count(*)::int n from public.adle_base_word_lexical_family_authorizations
    where withdrawn_at is null and (family_key,revision,semantic_fingerprint) in
      (select family_key,revision,semantic_fingerprint
        from public.canonical_teaching_dictionary_lexical_base_families
        where family_key=any($1::text[]) and review_status='approved')`, [keys])).rows[0].n;
  assert(authReadback >= 29);
  await db.query(apply ? "commit" : "rollback");
  console.log(JSON.stringify({ mode: apply ? "applied" : "rollback_proof", approvedReportSha256: REPORT_SHA,
    families: 29, newAuthorizations, targetWords: 61, newContent, reviewedContent: reviewed,
    publishedRelationships: published, governedVetoes: vetoes.length }));
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally { await db.end(); }
