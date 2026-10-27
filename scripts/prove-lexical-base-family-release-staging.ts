#!/usr/bin/env node
/** Disposable staging proof. Every fixture and authority is rolled back. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { appendReviewedLexicalFamilies, type ApprovedLexicalFamily } from "../lib/adle/lexical-base-family-release";
import type { BaseWordFamilyAuthorityProjectionV2 } from "../lib/adle/curriculum-release-activation";

const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url) throw new Error("Disposable staging database URL is required");
const db = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const skill = "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX";
const familyKey = "play_noun_base_family";
const playsId = "c1cc8238-9ce9-53bc-8516-0a41d106677a";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  await db.connect();
  await db.query("begin");
  try {
    const migration = readFileSync("supabase/migrations/20261027190000_lexical_base_family_release_bridge.sql", "utf8")
      .replace(/^begin;\s*/m, "").replace(/commit;\s*$/m, "");
    await db.query(migration);
    const actor = (await db.query<{ id: string }>("select id from auth.users order by created_at limit 1")).rows[0]?.id;
    assert.ok(actor, "staging fixture user exists");
    const morphologyId = (await db.query<{ id: string }>(`select id from public.canonical_teaching_dictionary_word_morphology
      where canonical_word_id=$1 and row_status='active' and analysis_status='approved'
        and review_status='approved_for_first_exposure' order by created_at desc limit 1`, [playsId])).rows[0]?.id;
    assert.ok(morphologyId, "plays has approved canonical morphology");
    // This old disposable fixture predates the structured morphology fields.
    // Normalize only inside the transaction; rollback restores the row.
    await db.query(`update public.canonical_teaching_dictionary_word_morphology
      set morphology_parts=$2::jsonb where id=$1`, [morphologyId, JSON.stringify([
      { kind: "base", sourceText: "play", surfaceText: "play" },
      { kind: "suffix", sourceText: "s", surfaceText: "s" },
    ])]);
    const revision = (await db.query<{ revision: number }>(`select max(revision)::integer revision
      from public.canonical_teaching_dictionary_lexical_base_families where family_key=$1`, [familyKey])).rows[0].revision;
    const added = (await db.query<{ revision: number }>(`select public.review_lexical_base_family_member_revision(
      $1,$2,$3,$4,'noun','regular_inflection','more than one play','staging lexical bridge proof',
      'staging proof','staging lexical bridge proof') revision`,
      [familyKey, revision, playsId, morphologyId])).rows[0].revision;
    const releaseId = randomUUID();
    await db.query(`insert into public.adle_reviewed_word_skill_releases
      (id,release_key,environment_key,candidate_manifest,reviewed_by,review_note)
      values ($1,$2,'staging','{}'::jsonb,$3,'staging lexical bridge proof')`,
      [releaseId, `staging-lexical-proof-${releaseId}`, actor]);
    await db.query(`insert into public.adle_reviewed_word_skill_pairs
      (release_id,canonical_word_id,micro_skill_key,relationship_role,source_reference,licence_reference)
      values ($1,$2,$3,'demonstrates','staging lexical bridge proof','internal_authored')`,
      [releaseId, playsId, skill]);
    const draftId = (await db.query<{ id: string }>(`select id from public.teaching_dictionary_manager_drafts limit 1`)).rows[0]?.id;
    assert.ok(draftId, "staging manager draft exists");
    const content = { routeId: "base_word_lab", routeVersion: "v2", microSkillKey: skill,
      content: { familyKey } };
    const contentId = randomUUID();
    await db.query(`insert into public.teaching_dictionary_route_content_versions
      (id,canonical_word_id,route_id,route_version,micro_skill_key,content,draft_id)
      values ($1,$2,'base_word_lab','v2',$3,$4::jsonb,$5)`,
      [contentId, playsId, skill, JSON.stringify(content), draftId]);
    await db.query(`insert into public.teaching_dictionary_route_content_reviews
      (content_version_id,content_sha256,dictionary_fingerprint,reviewed_by)
      values ($1,encode(extensions.digest(convert_to($2::jsonb::text,'UTF8'),'sha256'),'hex'),
        public.teaching_dictionary_route_dictionary_fingerprint($3),$4)`,
      [contentId, JSON.stringify(content), playsId, actor]);
    const family = (await db.query<Record<string, unknown>>(`select * from public.canonical_teaching_dictionary_lexical_base_families
      where family_key=$1 and revision=$2`, [familyKey, added])).rows[0];
    const members = (await db.query<Record<string, unknown>>(`select * from public.canonical_teaching_dictionary_lexical_base_family_members
      where family_key=$1 and revision=$2`, [familyKey, added])).rows;
    const lexical: ApprovedLexicalFamily = {
      familyKey, revision: added, baseLemma: String(family.base_lemma), baseKind: "free_base",
      baseWordId: String(family.canonical_base_word_id), baseMeaning: String(family.base_meaning),
      semanticFingerprint: String(family.semantic_fingerprint),
      members: members.map((member) => ({
        canonicalWordId: String(member.canonical_word_id), wordPartOfSpeech: String(member.word_part_of_speech),
        relationshipKind: String(member.relationship_kind), canonicalMorphologyId: String(member.canonical_morphology_id),
        wordSum: String(member.word_sum), morphologyParts: member.morphology_parts as unknown[],
        morphologyJoins: member.morphology_joins as unknown[],
        morphologyTransformations: member.morphology_transformations as unknown[],
        intendedMeaning: String(member.intended_meaning), complexityLevel: 2,
        demonstratesSkill: String(member.canonical_word_id) === playsId,
        routeContentReviewed: String(member.canonical_word_id) === playsId,
      })),
    };
    const parentRow = (await db.query<{ authority_id: string; semantic_projection: BaseWordFamilyAuthorityProjectionV2 }>(`
      select authority.id authority_id,authority.semantic_projection
      from public.adle_route_activation_heads head
      join public.adle_route_activation_revisions revision on revision.id=head.current_revision_id
      join public.adle_curriculum_release_dependencies dependency
        on dependency.release_manifest_id=revision.release_manifest_id and dependency.micro_skill_key=head.micro_skill_key
        and dependency.authority_type='family_membership'
      join public.adle_curriculum_dependency_authorities authority on authority.id=dependency.authority_id
      where head.environment_key='staging' and head.route_id='base_word_lab' and head.micro_skill_key=$1`,
      [skill])).rows[0];
    assert.ok(parentRow && parentRow.semantic_projection.schemaVersion === 2);
    const projected = appendReviewedLexicalFamilies({ parent: parentRow.semantic_projection,
      microSkillKey: skill, environment: "staging", families: [lexical] });
    assert.ok(projected.families.some((entry) => entry.baseFamilyKey === familyKey));
    const manifest = { ...projected, authorityKey: `staging-lexical-proof:${randomUUID()}`,
      approvalRefs: ["staging-lexical-bridge-proof"] };
    await db.query("savepoint unauthorized_case");
    await assert.rejects(db.query(`select public.publish_teaching_dictionary_base_family_authority_v2(
      $1,$2::jsonb,$3,$4)`, [parentRow.authority_id, JSON.stringify(manifest),
      sha(JSON.stringify(manifest)), "staging proof"]), /BASE_FAMILY_LEXICAL_SOURCE_NOT_AUTHORIZED/);
    await db.query("rollback to savepoint unauthorized_case");
    await db.query(`insert into public.adle_base_word_lexical_family_authorizations
      (family_key,revision,semantic_fingerprint,authorization_reference,authorized_by)
      values ($1,$2,$3,'staging lexical bridge proof',$4)`, [familyKey, added,
      lexical.semanticFingerprint, actor]);
    const positive = await db.query<{ id: string }>(`select public.publish_teaching_dictionary_base_family_authority_v2(
      $1,$2::jsonb,$3,$4) id`,
      [parentRow.authority_id, JSON.stringify(manifest), sha(JSON.stringify(manifest)), "staging proof"]);
    assert.ok(positive.rows[0].id, "exact approved lexical family publishes as an inactive authority");
    const replayManifest = { ...manifest, authorityKey: `staging-lexical-replay:${randomUUID()}` };
    const replay = await db.query<{ id: string }>(`select public.publish_teaching_dictionary_base_family_authority_v2(
      $1,$2::jsonb,$3,$4) id`, [positive.rows[0].id, JSON.stringify(replayManifest),
      sha(JSON.stringify(replayManifest)), "staging proof"]);
    assert.ok(replay.rows[0].id, "a later release can preserve the frozen lexical family");
    const base = projected.families.find((entry) => entry.baseFamilyKey === familyKey)!.members
      .find((member) => member.canonicalWordId === lexical.baseWordId)!;
    assert.equal("authenticTargetEligible" in base && base.authenticTargetEligible, false);
    await db.query("savepoint negative_case");
    const invalid = structuredClone(manifest);
    const invalidBase = invalid.families.find((entry) => entry.baseFamilyKey === familyKey)!.members
      .find((member) => member.canonicalWordId === lexical.baseWordId)!;
    if ("authenticTargetEligible" in invalidBase) invalidBase.authenticTargetEligible = true;
    invalid.authorityKey += ":invalid";
    await assert.rejects(db.query(`select public.publish_teaching_dictionary_base_family_authority_v2(
      $1,$2::jsonb,$3,$4)`, [parentRow.authority_id, JSON.stringify(invalid), sha(JSON.stringify(invalid)), "staging proof"]),
    /BASE_FAMILY_LEXICAL_BASE_CANNOT_DEMONSTRATE/);
    await db.query("rollback to savepoint negative_case");
    await db.query("savepoint withdrawn_case");
    await db.query(`insert into public.adle_reviewed_word_skill_withdrawals
      (release_id,reviewed_by,reason) values ($1,$2,'staging withdrawal proof')`, [releaseId, actor]);
    const withdrawnManifest = { ...manifest, authorityKey: `staging-lexical-withdrawn:${randomUUID()}` };
    await assert.rejects(db.query(`select public.publish_teaching_dictionary_base_family_authority_v2(
      $1,$2::jsonb,$3,$4)`, [parentRow.authority_id, JSON.stringify(withdrawnManifest),
      sha(JSON.stringify(withdrawnManifest)), "staging proof"]), /BASE_FAMILY_LEXICAL_TARGET_NOT_REVIEWED/);
    await db.query("rollback to savepoint withdrawn_case");
    console.log(JSON.stringify({ result: "passed", familyKey, memberCount: lexical.members.length,
      publishedInactiveAuthority: true, futureReleaseReplay: true,
      baseAuthenticTarget: false, unauthorizedSourceTest: "rejected",
      negativeBaseTest: "rejected", withdrawnPairTest: "rejected",
      persistedFixture: false }));
  } finally {
    await db.query("rollback").catch(() => undefined);
    await db.end();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
