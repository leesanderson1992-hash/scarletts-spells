#!/usr/bin/env node
/* Build an exact, inactive Base Word release from immutable parent authority
 * and reviewed Teaching Dictionary family decisions. No route is activated. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { buildReviewedBaseFamilyProjection, type ReviewedFamilyDefinition, type ReviewedFamilyMember, type ReviewedLegacyFamily } from
  "../lib/adle/base-word-reviewed-family-release";
import { appendReviewedLexicalFamilies, type ApprovedLexicalFamily } from "../lib/adle/lexical-base-family-release";
import { regularityReviewedRelease } from "../lib/adle/base-word-regularity";
import type { BaseWordFamilyAuthorityProjectionV2 } from "../lib/adle/curriculum-release-activation";
import { fingerprintSnapshotValue } from "../lib/adle/composable-lesson/canonical-fingerprint";
import {
  fingerprintAdleCurriculumReleaseManifest, teachingDictionaryClosureSemanticProjection,
  validateAdleTeachingDictionaryClosureManifestV1, type AdleCurriculumReleaseManifestV2,
  type AdleTeachingDictionaryClosureManifestV1,
} from "../lib/adle/curriculum-release-authority";

const HISTORICAL_BASE_WORD_SKILLS = [
  "D4_MOR_BASE_WORDS_IDENTIFY_BASE",
  "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  "D4_MOR_BASE_WORDS_BASE_PLUS_PREFIX",
  "D4_MOR_BASE_WORDS_BASE_PLUS_SUFFIX",
] as const;

type Row = Record<string, unknown>;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function args() {
  const values = process.argv.slice(2);
  const get = (name: string) => values[values.indexOf(name) + 1];
  const parentRelease = get("--parent-release");
  const microSkillKey = get("--micro-skill");
  const releaseKey = get("--release-key");
  const approvalRef = get("--approval-ref");
  const environment = get("--environment");
  const output = get("--out");
  const lexicalFamilyKey = values.includes("--lexical-family-key") ? get("--lexical-family-key") : null;
  const parentFamilyAuthority = values.includes("--parent-family-authority") ? get("--parent-family-authority") : null;
  const reuseParentClosure = values.includes("--reuse-parent-closure");
  const regularityReview = values.includes("--regularity-review") ? get("--regularity-review") : null;
  if (!parentRelease || !microSkillKey || !releaseKey || !approvalRef || !output ||
    !["local", "staging", "production"].includes(environment) ||
    !HISTORICAL_BASE_WORD_SKILLS.some((skill) => skill === microSkillKey))
    throw new Error("Usage: --parent-release UUID --environment local|staging|production --micro-skill BASE_WORD_KEY --release-key KEY --approval-ref REVIEW_REF --out DIR [--publish]");
  return { parentRelease, parentFamilyAuthority, reuseParentClosure, regularityReview,
    environment, microSkillKey, releaseKey, approvalRef, output, lexicalFamilyKey,
    publish: values.includes("--publish"), verifyPublish: values.includes("--verify-publish") };
}

async function main() {
  const config = args();
  const url = process.env.TEACHING_DICTIONARY_RELEASE_DB_URL;
  if (!url) throw new Error("Set TEACHING_DICTIONARY_RELEASE_DB_URL for the intended environment");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("begin transaction isolation level repeatable read read only");
    const deps = (await db.query<Row>(`select d.authority_type,d.authority_id,d.authority_key,d.authority_schema_version,
        d.semantic_fingerprint,a.semantic_projection,a.approval_refs
      from public.adle_curriculum_release_dependencies d
      join public.adle_curriculum_dependency_authorities a on a.id=d.authority_id
      where d.release_manifest_id=$1 and d.micro_skill_key=$2`,
      [config.parentRelease, config.microSkillKey])).rows;
    const family = config.parentFamilyAuthority
      ? (await db.query<Row>(`select id authority_id,authority_key,schema_version authority_schema_version,
          semantic_fingerprint,semantic_projection,approval_refs
        from public.adle_curriculum_dependency_authorities
        where id=$1 and authority_type='family_membership'`, [config.parentFamilyAuthority])).rows[0]
      : deps.find((row) => row.authority_type === "family_membership");
    const teaching = deps.find((row) => row.authority_type === "teaching_content");
    const parentClosure = deps.find((row) => row.authority_type === "teaching_dictionary_closure");
    if (!family || !teaching || family.authority_schema_version !== 2 ||
      (family.semantic_projection as Row)?.schemaVersion !== 2)
      throw new Error("Parent release needs exact Base Word family-v2 and teaching-content authorities");
    const parent = family.semantic_projection as BaseWordFamilyAuthorityProjectionV2;
    const reviews = (await db.query<Row>(`select r.*,
        withdrawal.review_id is not null withdrawn,
        skill_withdrawal.release_id is not null skill_release_withdrawn
      from public.teaching_dictionary_base_family_member_reviews r
      left join public.teaching_dictionary_base_family_member_withdrawals withdrawal on withdrawal.review_id=r.id
      left join public.adle_reviewed_word_skill_withdrawals skill_withdrawal on skill_withdrawal.release_id=r.word_skill_release_id
      where r.micro_skill_key=$1 and r.environment_key=$2 order by r.reviewed_at,r.id`,
      [config.microSkillKey, config.environment])).rows;
    const definitions = (await db.query<Row>(`select * from public.teaching_dictionary_base_family_definitions
      where id in (select definition_id from public.teaching_dictionary_base_family_member_reviews where micro_skill_key=$1)`,
      [config.microSkillKey])).rows.map((row): ReviewedFamilyDefinition => ({
      id: String(row.id), familyKey: String(row.family_key), baseWordId: String(row.base_word_id),
      baseMeaning: String(row.base_meaning), etymologyRoute: row.etymology_route as Record<string, unknown>,
      sourceFingerprint: String(row.source_fingerprint),
    }));
    const legacyFamilies = (await db.query<Row>(`select id,base_family_key,base_word_id,base_meaning,etymology_route,source_row_hash
      from public.canonical_teaching_dictionary_base_word_families
      where id in (select legacy_family_id from public.teaching_dictionary_base_family_member_reviews
        where micro_skill_key=$1) and row_status='active' and review_status='approved_for_first_exposure'`,
      [config.microSkillKey])).rows.map((row): ReviewedLegacyFamily => ({
      id: String(row.id), familyKey: String(row.base_family_key), baseWordId: String(row.base_word_id),
      baseMeaning: String(row.base_meaning), etymologyRoute: row.etymology_route as Record<string, unknown>,
      sourceFingerprint: String(row.source_row_hash),
    }));
    const levelRows = (await db.query<Row>(`select band.canonical_word_id,band.complexity_level
      from public.canonical_teaching_dictionary_word_banding band
      join public.canonical_teaching_dictionary_banding_versions version
        on version.banding_version=band.banding_version and version.is_active
      where band.row_status='active'`)).rows;
    const levelByWord = new Map(levelRows.map((row) => [String(row.canonical_word_id), Number(row.complexity_level)]));
    const reviewedMembers: ReviewedFamilyMember[] = reviews.map((row) => ({
      id: String(row.id), definitionId: row.definition_id ? String(row.definition_id) : null,
      legacyFamilyId: row.legacy_family_id ? String(row.legacy_family_id) : null,
      canonicalWordId: String(row.canonical_word_id), baseWordId: String(row.base_word_id),
      microSkillKey: String(row.micro_skill_key), wordSum: String(row.word_sum),
      morphologyParts: row.morphology_parts as unknown[], morphologyJoins: row.morphology_joins as unknown[],
      morphologyTransformations: row.morphology_transformations as unknown[],
      transformationNotes: String(row.transformation_notes ?? ""),
      childFriendlyMeaning: String(row.child_friendly_meaning),
      complexityLevel: levelByWord.get(String(row.canonical_word_id)) ?? null,
      sourceFingerprint: String(row.source_fingerprint),
      reviewedAt: new Date(String(row.reviewed_at)).toISOString(),
      withdrawn: Boolean(row.withdrawn), skillReleaseWithdrawn: Boolean(row.skill_release_withdrawn),
    }));
    let projection = buildReviewedBaseFamilyProjection({ parent, microSkillKey: config.microSkillKey,
      definitions, legacyFamilies, reviews: reviewedMembers });
    let lexicalApprovalRef: string | null = null;
    if (config.lexicalFamilyKey) {
      const lexical = (await db.query<Row>(`select * from public.canonical_teaching_dictionary_lexical_base_families
        where family_key=$1 and review_status='approved' order by revision desc limit 1`,
        [config.lexicalFamilyKey])).rows[0];
      if (!lexical || lexical.base_kind !== "free_base" || !lexical.canonical_base_word_id)
        throw new Error("An approved free-base lexical family is required");
      const authorized = (await db.query<Row>(`select 1 from public.adle_base_word_lexical_family_authorizations
        where family_key=$1 and revision=$2 and semantic_fingerprint=$3 and withdrawn_at is null`,
        [config.lexicalFamilyKey, lexical.revision, lexical.semantic_fingerprint])).rows.length === 1;
      if (!authorized) throw new Error("This lexical family is not authorized as a Base Word lesson candidate source");
      const lexicalMembers = (await db.query<Row>(`select member.* from public.canonical_teaching_dictionary_lexical_base_family_members member
        join public.canonical_teaching_dictionary_word_morphology morphology
          on morphology.id=member.canonical_morphology_id and morphology.canonical_word_id=member.canonical_word_id
          and morphology.review_status='approved_for_first_exposure'
          and morphology.analysis_status='approved' and morphology.word_sum=member.word_sum
          and morphology.morphology_parts=member.morphology_parts and morphology.morphology_joins=member.morphology_joins
          and morphology.morphology_transformations=member.morphology_transformations
        where member.family_key=$1 and member.revision=$2
          and exists (select 1 from public.canonical_teaching_dictionary_word_morphology current_morphology
            where current_morphology.canonical_word_id=member.canonical_word_id
              and current_morphology.row_status='active'
              and current_morphology.review_status='approved_for_first_exposure'
              and current_morphology.analysis_status='approved'
              and current_morphology.word_sum=member.word_sum
              and current_morphology.morphology_parts=member.morphology_parts
              and current_morphology.morphology_joins=member.morphology_joins
              and current_morphology.morphology_transformations=member.morphology_transformations)`,
        [config.lexicalFamilyKey, lexical.revision])).rows;
      const total = (await db.query<{ count: string }>(`select count(*) from public.canonical_teaching_dictionary_lexical_base_family_members
        where family_key=$1 and revision=$2`, [config.lexicalFamilyKey, lexical.revision])).rows[0];
      if (lexicalMembers.length !== Number(total.count)) throw new Error("Approved lexical morphology changed");
      const targetIds = lexicalMembers.filter((row) => String(row.canonical_word_id) !== String(lexical.canonical_base_word_id))
        .map((row) => String(row.canonical_word_id));
      const pairs = targetIds.length ? (await db.query<Row>(`select distinct pair.canonical_word_id
        from public.adle_reviewed_word_skill_pairs pair
        join public.adle_reviewed_word_skill_releases release on release.id=pair.release_id
        where pair.canonical_word_id=any($1::uuid[]) and pair.micro_skill_key=$2
          and pair.relationship_role='demonstrates' and release.environment_key=$3
          and not exists (select 1 from public.adle_reviewed_word_skill_withdrawals withdrawal
            where withdrawal.release_id=release.id)`,
        [targetIds, config.microSkillKey, config.environment])).rows : [];
      const reviewed = targetIds.length ? (await db.query<Row>(`select distinct content.canonical_word_id
        from public.teaching_dictionary_route_content_versions content
        join public.teaching_dictionary_route_content_reviews review on review.content_version_id=content.id
        where content.canonical_word_id=any($1::uuid[]) and content.route_id='base_word_lab'
          and content.micro_skill_key=$2 and content.content->'content'->>'familyKey'=$3
          and review.dictionary_fingerprint=public.teaching_dictionary_route_dictionary_fingerprint(content.canonical_word_id)
          and review.content_sha256=encode(extensions.digest(convert_to(content.content::text,'UTF8'),'sha256'),'hex')
          and not exists (select 1 from public.teaching_dictionary_route_content_versions newer
            where newer.canonical_word_id=content.canonical_word_id and newer.route_id=content.route_id
              and newer.route_version=content.route_version and newer.micro_skill_key=content.micro_skill_key
              and (newer.published_at,newer.id)>(content.published_at,content.id))`,
        [targetIds, config.microSkillKey, config.lexicalFamilyKey])).rows : [];
      const pairIds = new Set(pairs.map((row) => String(row.canonical_word_id)));
      const reviewedIds = new Set(reviewed.map((row) => String(row.canonical_word_id)));
      const family: ApprovedLexicalFamily = {
        familyKey: String(lexical.family_key), revision: Number(lexical.revision),
        baseLemma: String(lexical.base_lemma), baseKind: "free_base",
        baseWordId: String(lexical.canonical_base_word_id), baseMeaning: String(lexical.base_meaning),
        semanticFingerprint: String(lexical.semantic_fingerprint),
        members: lexicalMembers.map((row) => ({
          canonicalWordId: String(row.canonical_word_id), wordPartOfSpeech: String(row.word_part_of_speech),
          relationshipKind: String(row.relationship_kind), canonicalMorphologyId: String(row.canonical_morphology_id),
          wordSum: String(row.word_sum), morphologyParts: row.morphology_parts as unknown[],
          morphologyJoins: row.morphology_joins as unknown[],
          morphologyTransformations: row.morphology_transformations as unknown[],
          intendedMeaning: String(row.intended_meaning),
          complexityLevel: levelByWord.get(String(row.canonical_word_id)) ?? null,
          demonstratesSkill: pairIds.has(String(row.canonical_word_id)),
          routeContentReviewed: reviewedIds.has(String(row.canonical_word_id)),
        })),
      };
      lexicalApprovalRef = String(lexical.approval_reference);
      projection = appendReviewedLexicalFamilies({ parent: projection, microSkillKey: config.microSkillKey,
        environment: config.environment as "local" | "staging" | "production", families: [family] });
      if (!projection.families.some((entry) => entry.baseFamilyKey === config.lexicalFamilyKey))
        throw new Error("Lexical family is not yet a reviewed lesson candidate");
    }
    const parentReviewIds = new Set(parent.families.flatMap((family) => family.members
      .filter((member) => "morphologySource" in member && member.morphologySource.sourceKind === "approved_manager_review")
      .map((member) => member.memberId)));
    const effectiveReviewIds = new Set(projection.families.flatMap((family) => family.members
      .filter((member) => "morphologySource" in member && member.morphologySource.sourceKind === "approved_manager_review")
      .map((member) => member.memberId)).filter((id) => !parentReviewIds.has(id)));
    if (effectiveReviewIds.size === 0 && !config.lexicalFamilyKey && parent.selectionPolicyVersion === "base_word_regularity_v1")
      throw new Error("No new reviewed relationships or regularity policy to release");
    projection = regularityReviewedRelease(projection);
    let regularityReviewHash: string | null = null;
    const ownerDecisionCounts = { regular: 0, irregular: 0 };
    const reviewDisplayByKey = new Map<string, string>();
    if (config.regularityReview) {
      const sourceText = readFileSync(resolve(config.regularityReview), "utf8");
      const review = JSON.parse(sourceText) as Row;
      if (review.schemaVersion !== 1 || !review.reviewedBy || !review.reviewReference ||
        !Array.isArray(review.decisions)) throw new Error("Regularity owner review artifact is invalid");
      regularityReviewHash = sha256(sourceText);
      const pending = new Set(projection.families.flatMap((family) => family.members
        .filter((member) => member.lessonRegularity?.status === "needs_review")
        .map((member) => `${family.baseFamilyKey}:${member.canonicalWordId}`)));
      const decisions = new Map<string, { status: "regular" | "irregular"; reason: string }>();
      for (const raw of review.decisions as Row[]) {
        const key = `${String(raw.familyKey)}:${String(raw.canonicalWordId)}`;
        if (!pending.has(key) || decisions.has(key) || !["regular", "irregular"].includes(String(raw.status)) ||
          !raw.reason || !raw.displayWord) throw new Error(`Invalid or duplicate owner regularity decision: ${key}`);
        decisions.set(key, { status: raw.status as "regular" | "irregular", reason: String(raw.reason) });
        reviewDisplayByKey.set(key, String(raw.displayWord));
        ownerDecisionCounts[raw.status as "regular" | "irregular"] += 1;
      }
      if (decisions.size !== pending.size) throw new Error(`Owner regularity review covers ${decisions.size} of ${pending.size} pending members`);
      projection = { ...projection, families: projection.families.map((family) => ({ ...family,
        members: family.members.map((member) => {
          const decision = decisions.get(`${family.baseFamilyKey}:${member.canonicalWordId}`);
          return decision ? { ...member, lessonRegularity: { ...decision,
            source: `owner_review:${String(review.reviewedBy)}:${regularityReviewHash}` } } : member;
        }),
      })) };
    }
    const approvalRefs = [...new Set([
      ...(Array.isArray(family.approval_refs) ? family.approval_refs as string[] : []),
      config.approvalRef, ...(lexicalApprovalRef ? [lexicalApprovalRef] : []),
      ...(regularityReviewHash ? [`regularity-owner-review-sha256:${regularityReviewHash}`] : []),
      ...[...effectiveReviewIds].map((id) => `manager-family-review:${id}`),
    ])].sort();
    const familyManifest = { ...projection,
      authorityKey: `base_word_family_membership:manager:${config.releaseKey}`,
      approvalRefs };
    const wordIds = [...new Set(projection.families.flatMap((entry) => entry.members
      .filter((member) => member.assignmentEligible).map((member) => member.canonicalWordId)))];
    const dictionary = (await db.query<Row>(`select w.id,w.word_key,w.normalised_word,w.display_word,w.dialect_code,
        d.id dictation_id,d.dictation_sentence,d.dictation_target_token_index,d.audio_text
      from public.canonical_teaching_dictionary_words w
      join public.canonical_teaching_dictionary_dictation_sentences d on d.canonical_word_id=w.id
        and d.row_status='active' and d.review_status='approved_for_first_exposure'
      where w.id=any($1::uuid[]) and w.row_status='active' and w.review_status='approved_for_first_exposure'
      order by w.word_key`, [wordIds])).rows;
    if (dictionary.length !== wordIds.length || new Set(dictionary.map((row) => row.id)).size !== wordIds.length)
      throw new Error("Each released family word needs one exact active dictionary and dictation row");
    if (reviewDisplayByKey.size) {
      const wordDisplay = new Map(dictionary.map((row) => [String(row.id), String(row.display_word)]));
      for (const [key, displayWord] of reviewDisplayByKey)
        if (wordDisplay.get(key.slice(key.indexOf(":") + 1)) !== displayWord)
          throw new Error(`Owner regularity review word identity drifted: ${key}`);
    }
    const closure: AdleTeachingDictionaryClosureManifestV1 = {
      schemaVersion: 1, authorityKey: `base_word_dictionary_closure:manager:${config.releaseKey}`,
      approvalRefs, capabilities: ["canonical_word_identity_display", "canonical_dictation"],
      words: dictionary.map((row) => ({ wordKey: String(row.word_key),
        normalisedWord: String(row.normalised_word), displayWord: String(row.display_word),
        dialectCode: String(row.dialect_code), dictationSentence: String(row.dictation_sentence),
        dictationTargetTokenIndex: Number(row.dictation_target_token_index), audioText: String(row.audio_text) })),
    };
    const closureValidation = validateAdleTeachingDictionaryClosureManifestV1(closure);
    if (!closureValidation.valid) throw new Error(`Closure invalid: ${closureValidation.errors.join(",")}`);
    const bindings = dictionary.map((row) => ({ wordKey: String(row.word_key),
      canonicalWordId: String(row.id), dictationSentenceId: String(row.dictation_id) }));
    if (config.reuseParentClosure) {
      if (!parentClosure) throw new Error("Parent release has no Teaching Dictionary closure");
      const covered = (await db.query<Row>(`select distinct canonical_word_id from public.adle_teaching_dictionary_closure_words
        where authority_id=$1 and canonical_word_id=any($2::uuid[])`, [parentClosure.authority_id, wordIds])).rows;
      if (covered.length !== wordIds.length) throw new Error("Parent closure does not cover every family word");
    }
    const release: AdleCurriculumReleaseManifestV2 = {
      schemaVersion: 2, releaseKey: config.releaseKey,
      route: { routeId: "base_word_lab", routeVersion: "v2",
        activationRouteKey: "base_word_family_v1", payloadVersion: 1 },
      approvalRefs, microSkills: [{ microSkillKey: config.microSkillKey, dependencies: [
        { authorityType: "family_membership", authorityKey: familyManifest.authorityKey,
          authoritySchemaVersion: 2, semanticFingerprint: fingerprintSnapshotValue(projection) },
        { authorityType: "teaching_content", authorityKey: String(teaching.authority_key),
          authoritySchemaVersion: Number(teaching.authority_schema_version) as 1,
          semanticFingerprint: String(teaching.semantic_fingerprint) },
        { authorityType: "teaching_dictionary_closure",
          authorityKey: config.reuseParentClosure ? String(parentClosure!.authority_key) : closure.authorityKey,
          authoritySchemaVersion: 1,
          semanticFingerprint: config.reuseParentClosure ? String(parentClosure!.semantic_fingerprint)
            : fingerprintSnapshotValue(teachingDictionaryClosureSemanticProjection(closure)) },
      ] }],
    };
    const fingerprints = fingerprintAdleCurriculumReleaseManifest(release);
    const displayById = new Map(dictionary.map((row) => [String(row.id), String(row.display_word)]));
    const regularityAudit = projection.families.flatMap((entry) => entry.members.map((member) => ({
      familyKey: entry.baseFamilyKey, canonicalWordId: member.canonicalWordId,
      displayWord: displayById.get(member.canonicalWordId) ?? null,
      assignmentEligible: member.assignmentEligible, ...member.lessonRegularity!,
    })));
    await db.query("rollback");
    const output = resolve(config.output);
    mkdirSync(output, { recursive: true });
    const files = [
      ["family-authority.json", familyManifest],
      ...(!config.reuseParentClosure ? [["dictionary-closure.json", closure], ["dictionary-source-bindings.json", bindings]] as const : []),
      ["route-release.json", release],
      ["regularity-audit.json", regularityAudit],
    ] as const;
    for (const [name, value] of files) writeFileSync(resolve(output, name), json(value));
    if (config.publish || config.verifyPublish) {
      await db.query("begin");
      await db.query(`select public.publish_teaching_dictionary_base_family_authority_v2($1,$2::jsonb,$3,$4)`,
        [family.authority_id, json(familyManifest), sha256(json(familyManifest)), config.approvalRef]);
      if (!config.reuseParentClosure) await db.query(`select public.publish_adle_teaching_dictionary_closure_v1($1::jsonb,$2,$3::jsonb,$4,$5)`,
        [json(closure), sha256(json(closure)), json(bindings), "composite_release_and_legacy_projection", config.approvalRef]);
      await db.query(`select public.publish_adle_curriculum_release_v2($1::jsonb,$2,$3)`,
        [json(release), sha256(json(release)), config.approvalRef]);
      await db.query(config.publish ? "commit" : "rollback");
    }
    const regularityCounts = { regular: 0, irregular: 0, needs_review: 0 };
    for (const member of projection.families.flatMap((entry) => entry.members))
      regularityCounts[member.lessonRegularity!.status] += 1;
    process.stdout.write(`${json({ output, published: config.publish, verifiedPublication: config.verifyPublish,
      familyCount: projection.families.length,
      reviewedMembers: effectiveReviewIds.size, ownerDecisionCounts, regularityCounts, ...fingerprints })}`);
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally { await db.end(); }
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
