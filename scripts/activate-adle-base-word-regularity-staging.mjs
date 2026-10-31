#!/usr/bin/env node
/* Compare-and-swap staging activation of the owner-reviewed regularity release.
 * Dry-run by default; --apply commits the activation revision. */
import assert from "node:assert/strict";
import pg from "pg";

const SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const RELEASE = "adle_base_word_regularity_owner_approved_staging_2026_10_31";
const MADE = "b51835ff-37ec-5446-a4f3-f6eab2d34895";
const url = process.env.SUPABASE_STAGING_DB_URL;
if (!url) throw new Error("SUPABASE_STAGING_DB_URL is required");
const db = new pg.Client({ connectionString: url });
try {
  await db.connect();
  await db.query("begin");
  const release = (await db.query(`select manifest.id,manifest.release_manifest_sha256,
    authority.semantic_projection,closure.authority_id closure_id
    from public.adle_curriculum_release_manifests manifest
    join public.adle_curriculum_release_dependencies family on family.release_manifest_id=manifest.id
      and family.micro_skill_key=$2 and family.authority_type='family_membership'
    join public.adle_curriculum_dependency_authorities authority on authority.id=family.authority_id
    join public.adle_curriculum_release_dependencies closure on closure.release_manifest_id=manifest.id
      and closure.micro_skill_key=$2 and closure.authority_type='teaching_dictionary_closure'
    where manifest.release_key=$1`, [RELEASE, SKILL])).rows;
  assert.equal(release.length, 1);
  const authority = release[0].semantic_projection;
  assert.equal(authority.selectionPolicyVersion, "base_word_regularity_v1");
  const members = authority.families.flatMap((family) => family.members.map((member) => ({ ...member, familyKey: family.baseFamilyKey })));
  assert.equal(members.length, 214);
  assert.equal(members.filter((member) => member.lessonRegularity.status === "needs_review").length, 0);
  assert.equal(members.filter((member) => member.lessonRegularity.status === "irregular").length, 1);
  assert.equal(members.find((member) => member.canonicalWordId === MADE)?.lessonRegularity.status, "irregular");
  const eligible = authority.families.map((family) => ({ familyKey: family.baseFamilyKey,
    wordIds: [...new Set(family.members.filter((member) => member.assignmentEligible && member.lessonRegularity.status === "regular")
      .map((member) => member.canonicalWordId))] }));
  let eligiblePairs = 0;
  for (let left = 0; left < eligible.length; left += 1)
    for (let right = left + 1; right < eligible.length; right += 1)
      if (eligible[left].wordIds.length > 1 && eligible[right].wordIds.length > 1 &&
        new Set([...eligible[left].wordIds, ...eligible[right].wordIds]).size >= 6) eligiblePairs += 1;
  assert(eligiblePairs > 0);
  const wordIds = [...new Set(members.filter((member) => member.assignmentEligible && member.lessonRegularity.status === "regular")
    .map((member) => member.canonicalWordId))];
  const closure = (await db.query(`select count(distinct canonical_word_id) count from public.adle_teaching_dictionary_closure_words
    where authority_id=$1 and canonical_word_id=any($2::uuid[])`, [release[0].closure_id, wordIds])).rows[0];
  assert.equal(Number(closure.count), wordIds.length, "closure must cover every regular member");
  const current = (await db.query(`select head.current_revision_id,revision.release_manifest_id
    from public.adle_route_activation_heads head join public.adle_route_activation_revisions revision
      on revision.id=head.current_revision_id
    where head.environment_key='staging' and head.route_id='base_word_lab' and head.route_version='v2'
      and head.micro_skill_key=$1 for update of head`, [SKILL])).rows[0];
  assert(current, "Identify staging activation head is missing");
  const report = { ownerReview: "Katie Sanderson, 2026-10-31", regularMembers: 213,
    irregularMembers: 1, needsReviewMembers: 0, eligibleFamilyPairs: eligiblePairs,
    excludedWord: "made", policy: "base_word_regularity_v1" };
  const revision = (await db.query(`select public.set_adle_route_activation_revision_v2($1,$2,'staging','enabled',
    'allow_existing',$3::jsonb,$4,$5,$6) id`, [release[0].release_manifest_sha256, SKILL,
    JSON.stringify(report), current.current_revision_id, "Katie Sanderson / Codex",
    "Activate reviewed Base Word regularity policy; made excluded; pinned lessons remain available"])).rows[0];
  assert(revision?.id);
  const head = (await db.query(`select current_revision_id from public.adle_route_activation_heads where environment_key='staging'
    and route_id='base_word_lab' and route_version='v2' and micro_skill_key=$1`, [SKILL])).rows[0];
  assert.equal(head.current_revision_id, revision.id);
  const applied = process.argv.includes("--apply");
  await db.query(applied ? "commit" : "rollback");
  process.stdout.write(`${JSON.stringify({ applied, releaseId: release[0].id, revisionId: revision.id,
    previousReleaseId: current.release_manifest_id, eligibleFamilies: eligible.filter((family) => family.wordIds.length > 1).length,
    eligiblePairs, regularMembers: 213, irregularMembers: 1, needsReviewMembers: 0 })}\n`);
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await db.end().catch(() => undefined);
}
