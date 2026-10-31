#!/usr/bin/env node
/* Build the immutable base-led Identify authority from exact governed v1
 * source rows. Dry-run publication rolls back unless --publish is supplied. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

const SKILL = "D4_MOR_BASE_WORDS_IDENTIFY_BASE";
const OLD_KEY = "base_word_family_membership:identify-base:adle_base_word_family_meanings_v1_2026_08_09";
const NEW_KEY = "base_word_family_membership:identify-base:base_led_v2_2026_10_31";
const BATCH = "ddc8993b-26ca-57da-8383-1efec1be8ee1";
const SOURCE_KEY = "teaching_dictionary_import_batch:adle_base_word_family_meanings_v1_2026_08_09";
const url = process.env.TEACHING_DICTIONARY_RELEASE_DB_URL ?? process.env.SUPABASE_STAGING_DB_URL;
if (!url) throw new Error("Staging release database URL is required");
const db = new pg.Client({ connectionString: url });
const sha = (text) => createHash("sha256").update(text).digest("hex");
const outputIndex = process.argv.indexOf("--out");
const output = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : "/tmp/adle-base-word-identify-v2-2026-10-31");
const publish = process.argv.includes("--publish");

try {
  await db.connect();
  await db.query("begin transaction isolation level repeatable read");
  const old = (await db.query(`select authority_manifest,semantic_projection from public.adle_curriculum_dependency_authorities where authority_key=$1 and schema_version=1`, [OLD_KEY])).rows;
  assert.equal(old.length, 1);
  const families = old[0].semantic_projection.families;
  assert.equal(families.length, 85);
  const ids = families.map((family) => family.familyId);
  const memberIds = families.flatMap((family) => family.members.map((member) => member.memberId));
  assert.equal(memberIds.length, 217);
  const sourceFamilies = (await db.query(`select id,base_family_key,base_word_id,base_meaning,etymology_route,source_row_hash,import_batch_id,row_status,review_status
    from public.canonical_teaching_dictionary_base_word_families where id=any($1::uuid[])`, [ids])).rows;
  const sourceMembers = (await db.query(`select id,base_word_family_id,canonical_word_id,word_sum,morphology_parts,morphology_joins,morphology_transformations,
    transformation_notes,child_friendly_meaning,assignment_eligible,source_row_hash,import_batch_id,row_status,review_status
    from public.canonical_teaching_dictionary_base_word_family_members where id=any($1::uuid[])`, [memberIds])).rows;
  assert.equal(sourceFamilies.length, 85, "governed source families are incomplete");
  assert.equal(sourceMembers.length, 217, "governed source members are incomplete");
  const familyById = new Map(sourceFamilies.map((row) => [row.id, row]));
  const memberById = new Map(sourceMembers.map((row) => [row.id, row]));
  const batch = (await db.query(`select package_sha256,batch_status from public.canonical_teaching_dictionary_import_batches where id=$1`, [BATCH])).rows[0];
  assert(batch && batch.batch_status === "applied" && /^[a-f0-9]{64}$/.test(batch.package_sha256));
  const projected = families.map((family) => {
    const source = familyById.get(family.familyId);
    assert(source && source.import_batch_id === BATCH && source.row_status === "active" && source.review_status === "approved_for_first_exposure");
    assert.equal(source.base_family_key, family.baseFamilyKey);
    assert.equal(source.base_word_id, family.baseWordId);
    return {
      familyId: family.familyId, baseFamilyKey: family.baseFamilyKey, baseWordId: family.baseWordId,
      baseMeaning: family.baseMeaning, etymologyRoute: family.etymologyRoute, sourceFingerprint: source.source_row_hash,
      members: family.members.map((member) => {
        const row = memberById.get(member.memberId);
        assert(row && row.base_word_family_id === family.familyId && row.import_batch_id === BATCH);
        assert.equal(row.canonical_word_id, member.canonicalWordId);
        assert.equal(row.word_sum, member.wordSum);
        assert.equal(row.assignment_eligible, member.assignmentEligible);
        return {
          memberId: member.memberId, canonicalWordId: member.canonicalWordId,
          structuralRole: member.memberRole === "base" ? "base" : "family_member",
          applicableMicroSkillKeys: [SKILL], assignmentEligible: member.assignmentEligible,
          complexityLevel: member.complexityLevel, wordSum: member.wordSum,
          morphologyParts: member.morphologyParts, morphologyJoins: member.morphologyJoins,
          morphologyTransformations: member.morphologyTransformations,
          transformationNotes: member.transformationNotes, childFriendlyMeaning: member.childFriendlyMeaning,
          morphologySource: { sourceKind: "base_word_family_member", sourceId: member.memberId,
            sourceFingerprint: row.source_row_hash, sourceAuthorityKey: SOURCE_KEY },
        };
      }).sort((a, b) => a.canonicalWordId.localeCompare(b.canonicalWordId) || a.memberId.localeCompare(b.memberId)),
    };
  }).filter((family) => family.members.length >= 2)
    .sort((a, b) => a.baseFamilyKey.localeCompare(b.baseFamilyKey) || a.familyId.localeCompare(b.familyId));
  const manifest = {
    schemaVersion: 2, authorityKey: NEW_KEY, skillClusterKey: "D4_MOR_BASE_WORDS",
    sourceAuthorities: [{ authorityKey: SOURCE_KEY, sourceKind: "teaching_dictionary_import_batch",
      sourceId: BATCH, sourceFingerprint: batch.package_sha256 }],
    approvalRefs: [...new Set([...old[0].authority_manifest.approvalRefs,
      "user-approved-base-word-regularity-parent-2026-10-31"])].sort(),
    families: projected,
  };
  const file = `${JSON.stringify(manifest, null, 2)}\n`;
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, "family-authority-v2.json"), file);
  const result = await db.query(`select public.publish_adle_base_word_family_membership_authority_v2($1::jsonb,$2,$3,$4) id`,
    [file, sha(file), "release_ledger", "Codex / Katie Sanderson approved Base Word regularity parent"]);
  const id = result.rows[0].id;
  await db.query(publish ? "commit" : "rollback");
  process.stdout.write(`${JSON.stringify({ published: publish, authorityId: id, output,
    historicalFamilies: families.length, releasedFamilies: projected.length,
    excludedSingletonFamilies: families.filter((family) => family.members.length < 2).map((family) => family.baseFamilyKey),
    releasedMembers: projected.reduce((total, family) => total + family.members.length, 0), fileSha256: sha(file) })}\n`);
} catch (error) {
  await db.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await db.end().catch(() => undefined);
}
