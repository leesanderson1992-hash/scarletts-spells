import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- new release tables are ahead of generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ADLE_CURRICULUM_ROUTE_REGISTRY, type CurriculumRouteDefinition } from "@/lib/adle/curriculum-readiness/route-registry";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { loadDynamicSuffixProfiles } from "@/lib/adle/morphology/dynamic-suffix-profile-loader";
import { isDynamicPrefixRouteEnabled } from "@/lib/adle/morphology/dynamic-prefix-route-gate";
import { isDynamicSuffixRouteEnabled } from "@/lib/adle/morphology/dynamic-suffix-route-gate";
import { selectDynamicPrefixWordLab, compileDynamicPrefixWordLabPayload } from "@/lib/adle/morphology/dynamic-prefix-word-lab";
import { selectDynamicAffixWordLab, compileDynamicAffixWordLabPayload } from "@/lib/adle/morphology/affix-word-lab";
import type { LearningItemFact } from "@/lib/adle/learning-items";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { routeBlockers, type RouteContentDraft, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { hasCurrentEditorialReview } from "@/lib/teaching-dictionary-manager/editorial-review";
import { homophoneRouteSelectedForChild, prepareHomophoneAssignment } from "@/lib/adle/homophone/readiness-loader";
import { prepareIngAssignment } from "@/lib/adle/ing/readiness-loader";
import { prepareComparativeAssignment } from "@/lib/adle/inflection/readiness-loader";
import { loadBaseWordFamilyPilotReadiness } from "@/lib/adle/loaders/base-word-family-pilot-loader";
import { loadCompoundWordAssignmentReadiness } from "@/lib/adle/loaders/compound-word-assignment-loader";
import { loadDailyPlanFacts } from "@/lib/adle/loaders/composer-facts-loader";
import { selectPartTwoSkill } from "@/lib/adle/composer-skill-selection";
import { composeDailyPlan } from "@/lib/adle/daily-assignment-composer";
import { authorCompleteGenericSnapshotV3 } from "@/lib/adle/composable-lesson/generic-snapshot-v3-forward-authoring";
import type { IsoDate } from "@/lib/adle/review-scheduler";

const ZERO_CHILD = "00000000-0000-0000-0000-000000000000";
type Row = Record<string, any>; // Database release tables are ahead of generated Supabase types.
type WordEntry = { id: string; word: string; role: string; ready: boolean; blockers: string[]; editHref: string; contentPreview: unknown };

export type LessonReadinessRow = {
  routeId: string;
  routeVersion: string;
  microSkillKey: string;
  title: string;
  route: CurriculumRouteDefinition;
  status: "released" | "ready_to_launch" | "needs_review" | "blocked" | "policy";
  compilerReady: boolean;
  released: boolean;
  activationEnabled: boolean;
  releaseId: string | null;
  rollbackContentId: string | null;
  releasedBy: string | null;
  releasedAt: string | null;
  blockers: string[];
  activationBlockers: string[];
  words: WordEntry[];
  releaseContentPreview: unknown[];
  reviewedCandidateIds: string[];
  childPreview: "ready" | "blocked" | "not_selected" | null;
  childPreviewReason: string | null;
};

async function selectRows(db: SupabaseClient, table: string, columns: string, filter?: (query: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const query = (filter ? filter(db.from(table).select(columns)) : db.from(table).select(columns)).range(offset, offset + 499);
    const { data, error } = await query;
    if (error) throw new Error(`ADLE_LESSON_READ_${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 500) return out;
  }
}

function fakeItems(profileKey: string, ids: string[]): LearningItemFact[] {
  return ids.map((id, index) => ({
    learningItemId: `preview-${index}`, childId: ZERO_CHILD, canonicalWordId: id,
    microSkillKey: profileKey, itemStatus: "pending", sourceKind: "verified_misspelling",
    sourceRef: `lesson-preflight:${id}`, sourceAttemptText: null, reteachPriority: false,
    ejectedOn: null, intakeOn: "2026-01-01", rowStatus: "active",
  }));
}

function combinations(ids: string[], count: number): string[][] {
  const result: string[][] = [];
  function visit(start: number, chosen: string[]) {
    if (result.length >= 120) return;
    if (chosen.length === count) { result.push(chosen); return; }
    for (let at = start; at < ids.length; at++) visit(at + 1, [...chosen, ids[at]!]);
  }
  visit(0, []);
  return result;
}

function collectWordFacts(value: unknown, found: Map<string, unknown>, depth = 0): void {
  if (depth > 12 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) { for (const part of value) collectWordFacts(part, found, depth + 1); return; }
  const row = value as Record<string, unknown>;
  const id = row.canonicalWordId ?? row.canonical_word_id;
  if (typeof id === "string" && !found.has(id)) found.set(id, row);
  for (const part of Object.values(row)) collectWordFacts(part, found, depth + 1);
}

export async function loadLessonReadiness(childId: string | null): Promise<LessonReadinessRow[]> {
  const db = createServiceRoleClient();
  const environment = resolveAdleRouteActivationEnvironment();
  const [prefixRows, suffixRows, prefixMembers, suffixMembers, wordRows, metadataRows, dictationRows, contentRows, reviewRows,
    publicationRows, rollbackRows, activationHeads, activationRevisions, releaseRows, childItems] = await Promise.all([
    selectRows(db, "canonical_teaching_dictionary_prefix_profiles", "id,micro_skill_key,production_enabled,row_status,review_status,source_row_hash,source_metadata,reviewed_by,reviewed_at", (q) => q.eq("row_status", "active")),
    selectRows(db, "canonical_teaching_dictionary_suffix_profiles", "id,micro_skill_key,production_enabled,row_status,review_status,source_row_hash,source_metadata,reviewed_by,reviewed_at", (q) => q.eq("row_status", "active")),
    selectRows(db, "canonical_teaching_dictionary_prefix_members", "id,prefix_profile_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,base_word,base_meaning,child_friendly_meaning,meaning_bin_key,prefix_variant,teaching_split_parts,teaching_split_joins"),
    selectRows(db, "canonical_teaching_dictionary_suffix_members", "id,suffix_profile_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,suffix_variant,semantic_base_text,semantic_base_kind,base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_provenance"),
    selectRows(db, "canonical_teaching_dictionary_words", "id,display_word,row_status,review_status"),
    selectRows(db, "canonical_teaching_dictionary_word_metadata", "canonical_word_id,syllables,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes,row_status,review_status", (q) => q.eq("row_status", "active")),
    selectRows(db, "canonical_teaching_dictionary_dictation_sentences", "canonical_word_id,dictation_sentence,audio_text,dictation_target_token_index,row_status,review_status", (q) => q.eq("row_status", "active")),
    selectRows(db, "teaching_dictionary_route_content_versions", "id,draft_id,canonical_word_id,route_id,route_version,micro_skill_key,published_at,content"),
    selectRows(db, "teaching_dictionary_route_content_reviews", "content_version_id,dictionary_fingerprint"),
    selectRows(db, "teaching_dictionary_route_content_publications", "content_version_id,route_profile_id"),
    selectRows(db, "teaching_dictionary_route_content_rollbacks", "content_version_id"),
    environment ? selectRows(db, "adle_route_activation_heads", "environment_key,route_id,route_version,micro_skill_key,current_revision_id", (q) => q.eq("environment_key", environment)) : Promise.resolve([]),
    environment ? selectRows(db, "adle_route_activation_revisions", "id,activation_status,release_manifest_id,release_manifest_sha256,dependency_fingerprint") : Promise.resolve([]),
    environment ? selectRows(db, "adle_curriculum_release_manifests", "id,release_manifest_sha256,dependency_fingerprint,route_id,route_version,published_by,published_at") : Promise.resolve([]),
    childId ? selectRows(db, "adle_learning_items", "id,child_id,canonical_word_id,micro_skill_key,item_status,source_kind,source_ref,source_attempt_text,reteach_priority,ejected_on,intake_on,row_status", (q) => q.eq("child_id", childId).eq("row_status", "active")) : Promise.resolve([]),
  ]);
  const words = new Map(wordRows.map((word) => [word.id as string, word]));
  const activePrefixIds = new Set(prefixRows.map((profile) => profile.id));
  const activeSuffixIds = new Set(suffixRows.map((profile) => profile.id));
  const affixWordIds = [...new Set([
    ...prefixMembers.filter((member) => activePrefixIds.has(member.prefix_profile_id)),
    ...suffixMembers.filter((member) => activeSuffixIds.has(member.suffix_profile_id)),
  ].map((member) => String(member.canonical_word_id)))];
  const newestDraftByWord = new Map<string, string>();
  for (let at = 0; at < affixWordIds.length; at += 100) {
    const drafts = await selectRows(db, "teaching_dictionary_manager_drafts", "id,canonical_word_id,created_at",
      (q) => q.in("canonical_word_id", affixWordIds.slice(at, at + 100)).order("created_at", { ascending: false }));
    for (const draft of drafts) if (!newestDraftByWord.has(draft.canonical_word_id))
      newestDraftByWord.set(draft.canonical_word_id, draft.id);
  }
  const metadataByWord = new Map(metadataRows.map((row) => [row.canonical_word_id as string, row]));
  const dictationByWord = new Map(dictationRows.map((row) => [row.canonical_word_id as string, row]));
  const reviewByContentId = new Map(reviewRows.map((row) => [row.content_version_id as string, row]));
  const draftById = new Map<string, WordDraftPayload>();
  const draftIds = [...new Set(contentRows.map((row) => String(row.draft_id)))];
  for (let at = 0; at < draftIds.length; at += 100) {
    const result = await db.from("teaching_dictionary_manager_drafts").select("id,payload").in("id", draftIds.slice(at, at + 100));
    if (result.error) throw new Error(`ADLE_LESSON_DRAFT_READ: ${result.error.message}`);
    for (const draft of result.data ?? []) draftById.set(draft.id, draft.payload as WordDraftPayload);
  }
  const published = new Set(publicationRows.map((row) => row.content_version_id));
  const rolledBack = new Set(rollbackRows.map((row) => row.content_version_id));
  const revisionById = new Map(activationRevisions.map((row) => [row.id as string, row]));
  const latestContent = new Map<string, Row>();
  for (const row of contentRows.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)) || String(b.id).localeCompare(String(a.id)))) {
    const key = `${row.route_id}:${row.micro_skill_key}:${row.canonical_word_id}`;
    if (!latestContent.has(key)) latestContent.set(key, row);
  }
  const currentFingerprints = new Map<string, string>();
  const reviewedWords = [...new Set([...latestContent.values()].filter((row) => reviewByContentId.has(row.id)).map((row) => String(row.canonical_word_id)))];
  await Promise.all(reviewedWords.map(async (wordId) => {
    const result = await db.rpc("teaching_dictionary_route_dictionary_fingerprint", { p_word: wordId });
    if (result.error) throw new Error(`ADLE_LESSON_REVIEW_FINGERPRINT: ${result.error.message}`);
    currentFingerprints.set(wordId, String(result.data ?? ""));
  }));
  const reviews = new Set([...latestContent.values()].filter((row) =>
    hasCurrentEditorialReview(reviewByContentId.get(row.id), currentFingerprints.get(String(row.canonical_word_id)))).map((row) => row.id));
  const reviewedCandidates = [...latestContent.values()].filter((row) => reviews.has(row.id)
    && !published.has(row.id) && !rolledBack.has(row.id));
  const candidateMembers = reviewedCandidates.filter((row) => ["dynamic_prefix_word_lab", "dynamic_affix_word_lab"].includes(row.route_id))
    .map((row) => ({ microSkillKey: String(row.micro_skill_key), canonicalWordId: String(row.canonical_word_id),
      content: row.content?.content as Record<string, unknown>, wordMeaning: String(row.content?.wordMeaning ?? "") }));
  const [loadedPrefix, loadedSuffix, candidatePrefix, candidateSuffix] = await Promise.all([
    loadDynamicPrefixProfiles(db, childId ?? ZERO_CHILD),
    loadDynamicSuffixProfiles(db, childId ?? ZERO_CHILD),
    loadDynamicPrefixProfiles(db, childId ?? ZERO_CHILD, { allowStagingProfiles: true, candidateMembers: candidateMembers.filter((row) =>
      reviewedCandidates.some((candidate) => candidate.route_id === "dynamic_prefix_word_lab" && candidate.canonical_word_id === row.canonicalWordId && candidate.micro_skill_key === row.microSkillKey)) }),
    loadDynamicSuffixProfiles(db, childId ?? ZERO_CHILD, { allowStagingProfiles: true, candidateMembers: candidateMembers.filter((row) =>
      reviewedCandidates.some((candidate) => candidate.route_id === "dynamic_affix_word_lab" && candidate.canonical_word_id === row.canonicalWordId && candidate.micro_skill_key === row.microSkillKey)) }),
  ]);
  const releaseById = new Map(releaseRows.map((row) => [row.id as string, row]));
  const dependencies: Row[] = [];
  const releaseIds = [...new Set(releaseRows.map((row) => String(row.id)))];
  for (let at = 0; at < releaseIds.length; at += 100) {
    dependencies.push(...await selectRows(db, "adle_curriculum_release_dependencies",
      "release_manifest_id,micro_skill_key,authority_id,authority_type",
      (q) => q.in("release_manifest_id", releaseIds.slice(at, at + 100))));
  }
  const authorityIds = [...new Set(dependencies.map((row) => String(row.authority_id)))];
  const authorities: Row[] = [];
  for (let at = 0; at < authorityIds.length; at += 100) {
    const result = await db.from("adle_curriculum_dependency_authorities")
      .select("id,semantic_projection,authority_type").in("id", authorityIds.slice(at, at + 100));
    if (result.error) throw new Error(`ADLE_LESSON_AUTHORITY_READ: ${result.error.message}`);
    authorities.push(...(result.data ?? []));
  }
  const authorityById = new Map(authorities.map((row) => [row.id as string, row]));
  const currentRevisionIds = new Set<string>();
  await Promise.all(activationHeads.map(async (head) => {
    const revision = revisionById.get(head.current_revision_id);
    const release = revision ? releaseById.get(revision.release_manifest_id) : null;
    if (!revision || !release) return;
    const result = await db.rpc("adle_route_activation_revision_is_current_v2", {
      p_activation_revision_id: revision.id, p_release_manifest_id: release.id,
      p_release_manifest_sha256: release.release_manifest_sha256,
      p_dependency_fingerprint: release.dependency_fingerprint,
    });
    if (result.error) throw new Error(`ADLE_LESSON_ACTIVATION_READ: ${result.error.message}`);
    if (result.data === true) currentRevisionIds.add(String(revision.id));
  }));
  const specialistChildPreview = new Map<string, { ready: boolean; reason: string | null }>();
  if (childId) {
    try {
      const date = new Date().toISOString().slice(0, 10) as IsoDate;
      const { facts } = await loadDailyPlanFacts(db, { childId, today: date });
      const selection = selectPartTwoSkill({
        learningItems: facts.learningItems.filter((item) => item.childId === childId),
        skillFamilyKeyBySkill: facts.skillFamilyKeyBySkill,
        prerequisiteKeysBySkill: facts.prerequisiteKeysBySkill,
        notYetSecureSkillKeys: facts.notYetSecureSkillKeys,
        frequencyBandByWordId: facts.frequencyBandByWordId,
        previousLessonFamilyKey: facts.previousLessonFamilyKey,
        homophoneThresholdMetSkillKeys: facts.homophoneThresholdMetSkillKeys,
      });
      const specialist = selection.microSkillKey && ADLE_CURRICULUM_ROUTE_REGISTRY.some((route) =>
        route.routeId !== "generic_composer" && route.routeId !== "homophone_word_lab"
        && route.supportedMicroSkillKeys.includes(selection.microSkillKey!));
      const selectedHomophone = selection.microSkillKey && environment
        ? await homophoneRouteSelectedForChild({ client: db, childId,
          microSkillKey: selection.microSkillKey, environmentKey: environment }) : false;
      if (!selection.microSkillKey || specialist || selectedHomophone) {
        specialistChildPreview.set("generic_composer:generic_composer_fallback", {
          ready: false, reason: selection.skipReason ?? "Selected skill belongs to a specialist route",
        });
      } else {
        const authored = authorCompleteGenericSnapshotV3(facts, composeDailyPlan(facts, date));
        specialistChildPreview.set("generic_composer:generic_composer_fallback", {
          ready: authored.ok, reason: authored.ok ? null : authored.blockerCode,
        });
      }
    } catch (error) {
      specialistChildPreview.set("generic_composer:generic_composer_fallback", {
        ready: false, reason: error instanceof Error ? error.message : "Preview failed",
      });
    }
  }
  if (childId && environment) {
    const parentResult = await db.from("children").select("parent_user_id").eq("id", childId).single();
    if (parentResult.error || !parentResult.data?.parent_user_id) throw new Error("ADLE_LESSON_CHILD_READ_FAILED");
    const parentUserId = parentResult.data.parent_user_id;
    const date = new Date().toISOString().slice(0, 10);
    const learningItems: LearningItemFact[] = childItems.map((item) => ({
      learningItemId: item.id, childId: item.child_id, canonicalWordId: item.canonical_word_id,
      microSkillKey: item.micro_skill_key, itemStatus: item.item_status, sourceKind: item.source_kind,
      sourceRef: item.source_ref, sourceAttemptText: item.source_attempt_text,
      reteachPriority: item.reteach_priority, ejectedOn: item.ejected_on, intakeOn: item.intake_on,
      rowStatus: item.row_status,
    }));
    await Promise.all(ADLE_CURRICULUM_ROUTE_REGISTRY.filter((route) => route.activationAuthority === "database_route_activation")
      .flatMap((route) => route.supportedMicroSkillKeys.map(async (skill) => {
        const key = `${route.routeId}:${skill}`;
        try {
          let ready = false;
          let reason: string | null = null;
          if (route.routeId === "homophone_word_lab") {
            const result = await prepareHomophoneAssignment({ client: db, childId, parentUserId, date,
              microSkillKey: skill, learningItems, environmentKey: environment });
            ready = result.status === "ready"; reason = result.status === "blocked" ? result.reason : null;
          } else if (route.routeId === "ing_endings_word_lab") {
            const result = await prepareIngAssignment({ client: db, childId, parentUserId, date,
              microSkillKey: skill as Parameters<typeof prepareIngAssignment>[0]["microSkillKey"], learningItems, environmentKey: environment });
            ready = result.status === "ready"; reason = result.status === "blocked" ? result.reason : null;
          } else if (route.routeId === "comparative_superlative_word_lab") {
            const result = await prepareComparativeAssignment({ client: db, childId, parentUserId, date,
              microSkillKey: skill as Parameters<typeof prepareComparativeAssignment>[0]["microSkillKey"], learningItems, environmentKey: environment });
            ready = result.status === "ready"; reason = result.status === "blocked" ? result.reason : null;
          } else if (route.routeId === "base_word_lab") {
            const result = await loadBaseWordFamilyPilotReadiness({ client: db, childId, planDate: date, requiredMicroSkillKey: skill });
            ready = Boolean(result.payload); reason = result.readinessReason;
          } else if (route.routeId === "compound_word_lab") {
            const result = await loadCompoundWordAssignmentReadiness({ client: db, childId, planDate: date,
              microSkillKey: skill as Parameters<typeof loadCompoundWordAssignmentReadiness>[0]["microSkillKey"] });
            ready = Boolean(result.payload); reason = result.readinessReason;
          }
          specialistChildPreview.set(key, { ready, reason });
        } catch (error) {
          specialistChildPreview.set(key, { ready: false, reason: error instanceof Error ? error.message : "Preview failed" });
        }
      })));
  }
  return ADLE_CURRICULUM_ROUTE_REGISTRY.flatMap((route): LessonReadinessRow[] => {
    const skills = route.compatibilityScope.kind === "generic_composer_fallback" ? ["generic_composer_fallback"] : route.supportedMicroSkillKeys;
    return skills.map((skill): LessonReadinessRow => {
      const prefix = prefixRows.find((row) => route.routeId === "dynamic_prefix_word_lab" && row.micro_skill_key === skill);
      const suffix = suffixRows.find((row) => route.routeId === "dynamic_affix_word_lab" && row.micro_skill_key === skill);
      const profile = prefix ?? suffix;
      const members = prefix ? prefixMembers.filter((row) => row.prefix_profile_id === prefix.id && row.row_status === "active")
        : suffix ? suffixMembers.filter((row) => row.suffix_profile_id === suffix.id && row.row_status === "active") : [];
      const candidates = [...latestContent.values()].filter((row) => row.route_id === route.routeId && row.micro_skill_key === skill
        && reviews.has(row.id) && !published.has(row.id) && !rolledBack.has(row.id));
      const unreviewed = [...latestContent.values()].filter((row) => row.route_id === route.routeId && row.micro_skill_key === skill
        && !reviews.has(row.id) && !published.has(row.id));
      const currentProfile = prefix ? loadedPrefix.profiles.find((row) => row.microSkillKey === skill)
        : suffix ? loadedSuffix.profiles.find((row) => row.microSkillKey === skill) : null;
      const targetProfile = prefix ? candidatePrefix.profiles.find((row) => row.microSkillKey === skill)
        : suffix ? candidateSuffix.profiles.find((row) => row.microSkillKey === skill) : null;
      const validIds = new Set(targetProfile ? [...targetProfile.wordsByCanonicalId.keys()] : []);
      const proposedMembers = profile ? [...members, ...candidates.filter((candidate) => !members.some((member) => member.canonical_word_id === candidate.canonical_word_id))
        .map((candidate) => ({ canonical_word_id: candidate.canonical_word_id, member_role: "authentic_target",
          review_status: "approved_for_first_exposure", assignment_eligible: true }))] : [];
      const entries: WordEntry[] = proposedMembers.map((member) => {
        const dictionary = words.get(member.canonical_word_id);
        const candidate = candidates.find((row) => row.canonical_word_id === member.canonical_word_id);
        const facts = candidate?.content?.content ?? member;
        const field = (draftName: string, releasedName: string) => candidate ? facts[draftName] : facts[releasedName];
        const present = (value: unknown) => typeof value === "string" ? value.trim().length > 0
          : Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
        const metadata = metadataByWord.get(member.canonical_word_id);
        const dictation = dictationByWord.get(member.canonical_word_id);
        const blockers: string[] = [];
        if (member.review_status !== "approved_for_first_exposure") blockers.push("Member review pending");
        if (!member.assignment_eligible) blockers.push("Member excluded from assignment");
        if (!dictionary || dictionary.row_status !== "active" || dictionary.review_status !== "approved_for_first_exposure") blockers.push("Dictionary word not approved");
        if (!dictation || dictation.review_status !== "approved_for_first_exposure" || !dictation.dictation_sentence
          || dictation.audio_text !== dictation.dictation_sentence || !Number.isInteger(dictation.dictation_target_token_index)) blockers.push("Approved dictation missing or inconsistent");
        if (!metadata || metadata.review_status !== "approved_for_first_exposure" || !metadata.syllables
          || !metadata.phoneme_hint || !metadata.stress_pattern || typeof metadata.has_schwa !== "boolean") blockers.push("Pronunciation metadata incomplete");
        if (prefix && (!metadata?.morphemes || metadata?.morphology_notes == null)) blockers.push("Prefix morphology metadata incomplete");
        if (!present(field("teachingSplitParts", "teaching_split_parts"))) blockers.push("Teaching parts missing");
        if (!present(field("teachingSplitJoins", "teaching_split_joins"))) blockers.push("Teaching joins missing");
        if (prefix) {
          if (!present(field("baseWord", "base_word")) || !present(field("baseMeaning", "base_meaning"))) blockers.push("Base and meaning missing");
          if (!present(field("prefixVariant", "prefix_variant")) || !present(field("meaningBinKey", "meaning_bin_key"))) blockers.push("Prefix form or meaning group missing");
        }
        if (suffix) {
          if (!present(field("trueMorphologyParts", "true_morphology_parts"))) blockers.push("True morphology parts missing");
          if (!present(field("trueMorphologyJoins", "true_morphology_joins"))) blockers.push("True morphology joins missing");
          const provenance = field("trueMorphologyProvenance", "true_morphology_provenance");
          if (!provenance || typeof provenance !== "object" || (provenance as Row).status !== "reviewed") blockers.push("True morphology editorial review pending");
          if (!present(field("semanticBaseText", "semantic_base_text")) || !present(field("baseMeaning", "base_meaning"))) blockers.push("Semantic base or meaning missing");
          if (!present(field("suffixVariant", "suffix_variant")) || !present(field("meaningBinKey", "meaning_bin_key"))) blockers.push("Suffix form or meaning group missing");
        }
        if (!validIds.has(member.canonical_word_id)) blockers.push("Runtime loader rejects this word or its structure");
        const editTarget = blockers.some((blocker) => blocker.includes("True morphology editorial"))
          ? `td-route-${skill}-trueMorphologyProvenance`
          : blockers.some((blocker) => blocker.includes("dictation")) ? "td-dictation"
          : blockers.some((blocker) => blocker.includes("Pronunciation")) ? "td-has-schwa"
          : blockers.some((blocker) => blocker.includes("Semantic base")) ? `td-route-${skill}-semanticBaseText`
          : `td-route-${skill}-teachingSplitParts`;
        const draftId = newestDraftByWord.get(member.canonical_word_id);
        return { id: member.canonical_word_id, word: dictionary?.display_word ?? member.canonical_word_id,
          role: member.member_role, ready: blockers.length === 0, blockers,
          contentPreview: { routeContent: candidate?.content ?? member, dictionaryWord: dictionary,
            pronunciation: metadata, dictation },
          editHref: `/admin/teaching-dictionary/${member.canonical_word_id}${draftId ? `?draft=${draftId}` : ""}#${editTarget}` };
      });
      if (!profile && route.routeId !== "generic_composer") {
        for (const content of [...latestContent.values()].filter((row) => row.route_id === route.routeId && row.micro_skill_key === skill)) {
          const dictionary = words.get(content.canonical_word_id);
          const draft = draftById.get(content.draft_id);
          const missing = draft ? routeBlockers(content.content as RouteContentDraft, draft) : ["Source draft unavailable"];
          if (!reviews.has(content.id)) missing.push("Editorial sign-off missing or stale");
          entries.push({ id: content.canonical_word_id, word: dictionary?.display_word ?? content.canonical_word_id,
            role: "route content candidate", ready: missing.length === 0, blockers: missing,
            contentPreview: { routeContent: content.content, dictionaryWord: dictionary,
              pronunciation: metadataByWord.get(content.canonical_word_id), dictation: dictationByWord.get(content.canonical_word_id) },
            editHref: `/admin/teaching-dictionary/${content.canonical_word_id}?draft=${content.draft_id}#td-route-${skill}` });
        }
      }
      const routeHead = activationHeads.find((row) => row.route_id === route.routeId && row.route_version === route.routeVersion && row.micro_skill_key === skill);
      const revision = routeHead ? revisionById.get(routeHead.current_revision_id) : null;
      const release = revision ? releaseById.get(revision.release_manifest_id) : null;
      const releaseContentPreview: unknown[] = targetProfile
        ? [{ profile: { ...targetProfile, wordsByCanonicalId: [...targetProfile.wordsByCanonicalId.values()] } }] : [];
      if (release) releaseContentPreview.push(...dependencies
        .filter((row) => row.release_manifest_id === release.id && row.micro_skill_key === skill)
        .map((row) => ({ authorityType: row.authority_type,
          content: authorityById.get(row.authority_id)?.semantic_projection ?? null })));
      if (!profile && release) {
        const facts = new Map<string, unknown>();
        for (const dependency of dependencies.filter((row) => row.release_manifest_id === release.id && row.micro_skill_key === skill)) {
          const authority = authorityById.get(dependency.authority_id);
          if (authority) collectWordFacts(authority.semantic_projection, facts);
        }
        for (const [id, fact] of facts) {
          const dictionary = words.get(id);
          const blockers = !dictionary || dictionary.row_status !== "active" || dictionary.review_status !== "approved_for_first_exposure"
            ? ["Dictionary word not approved"] : [];
          entries.push({ id, word: dictionary?.display_word ?? id, role: "released lesson word",
            ready: blockers.length === 0, blockers, contentPreview: fact,
            editHref: `/admin/teaching-dictionary/${id}#td-canonical-parts` });
        }
      }
      const routeEnvironmentEnabled = prefix ? isDynamicPrefixRouteEnabled() : suffix ? isDynamicSuffixRouteEnabled() : true;
      const activationEnabled = profile ? profile.production_enabled === true && routeEnvironmentEnabled
        : revision?.activation_status === "enabled" && release?.release_manifest_sha256 === revision.release_manifest_sha256
          && release?.dependency_fingerprint === revision.dependency_fingerprint
          && release?.route_id === route.routeId && release?.route_version === route.routeVersion
          && currentRevisionIds.has(String(revision.id));
      const activationBlockers = route.activationAuthority === "generic_composer_policy" ? []
        : route.activationAuthority === "database_route_activation" ? activationEnabled ? [] : ["Route activation is off or its release revision is missing"]
          : activationEnabled ? [] : [profile?.production_enabled ? "Environment gate is off" : "Profile gate is off"];
      const blockers: string[] = [];
      if (profile && profile.review_status !== "approved_for_first_exposure") blockers.push("Profile needs review");
      if (profile && entries.length < route.wordCounts.lesson[0]) blockers.push(`Need at least ${route.wordCounts.lesson[0]} lesson words; found ${entries.length}`);
      if (profile && entries.some((entry) => !entry.ready)) blockers.push("One or more words fail runtime validation");
      if (profile && !targetProfile) blockers.push("The runtime loader rejects this profile or its word coverage");
      for (const candidate of candidates) {
        const expectedId = candidate.content?.content?.expectedProfileId;
        const expectedHash = candidate.content?.content?.expectedSourceRowHash;
        if (!expectedId || !expectedHash || expectedId !== profile?.id || expectedHash !== profile?.source_row_hash)
          blockers.push("Profile changed since this draft; restage and review current facts");
      }
      let compilerReady = false;
      if (targetProfile && "wordsByCanonicalId" in targetProfile) {
        const ids = [...targetProfile.wordsByCanonicalId.keys()];
        const compiledIds = new Set<string>();
        for (const set of combinations(ids, Math.min(4, ids.length))) {
          const items = fakeItems(skill, set);
          const selection = prefix
            ? selectDynamicPrefixWordLab({ profiles: [targetProfile as typeof loadedPrefix.profiles[number]], learningItems: items })
            : selectDynamicAffixWordLab({ profiles: [targetProfile as typeof loadedSuffix.profiles[number]], learningItems: items });
          const payload = prefix
            ? selection && compileDynamicPrefixWordLabPayload(selection as NonNullable<ReturnType<typeof selectDynamicPrefixWordLab>>)
            : selection && compileDynamicAffixWordLabPayload(selection as NonNullable<ReturnType<typeof selectDynamicAffixWordLab>>);
          if (payload) for (const id of set) compiledIds.add(id);
          if (compiledIds.size === ids.length) break;
        }
        compilerReady = ids.length >= route.wordCounts.lesson[0] && ids.every((id) => compiledIds.has(id));
        if (!compilerReady) blockers.push("Not every lesson word participates in a compiling four-word selection");
      }
      let childPreview: LessonReadinessRow["childPreview"] = childId ? "blocked" : null;
      let childPreviewReason: string | null = null;
      if (childId && currentProfile && activationEnabled) {
        const items = prefix ? loadedPrefix.learningItems : loadedSuffix.learningItems;
        const selection = prefix
          ? selectDynamicPrefixWordLab({ profiles: [currentProfile as typeof loadedPrefix.profiles[number]], learningItems: items })
          : selectDynamicAffixWordLab({ profiles: [currentProfile as typeof loadedSuffix.profiles[number]], learningItems: items });
        childPreview = selection && (prefix
          ? compileDynamicPrefixWordLabPayload(selection as NonNullable<ReturnType<typeof selectDynamicPrefixWordLab>>)
          : compileDynamicAffixWordLabPayload(selection as NonNullable<ReturnType<typeof selectDynamicAffixWordLab>>)) ? "ready" : "blocked";
      } else if (childId && !profile) {
        const specialist = specialistChildPreview.get(`${route.routeId}:${skill}`);
        childPreview = specialist?.ready ? "ready" : "blocked";
        childPreviewReason = specialist?.reason ?? (environment ? "No selectable lesson" : "Route environment is not configured");
      }
      if (route.routeId === "generic_composer") {
        return { routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: skill,
          title: "Generic composer fallback", route, status: "policy", compilerReady: false, released: false,
          activationEnabled: true, releaseId: null, releasedBy: null, releasedAt: null,
          rollbackContentId: null,
          blockers: [], activationBlockers: [], words: [], releaseContentPreview: [], reviewedCandidateIds: [], childPreview, childPreviewReason };
      }
      const released = profile ? Boolean(currentProfile)
        : Boolean(release && revision?.release_manifest_id && revision?.release_manifest_sha256 && revision?.dependency_fingerprint
          && currentRevisionIds.has(String(revision.id)));
      if (!profile && !released) blockers.push("No active reviewed lesson release is available");
      if (unreviewed.length) blockers.push(`${unreviewed.length} latest word version${unreviewed.length === 1 ? "" : "s"} need editorial sign-off`);
      const launchable = Boolean(profile && candidates.length && blockers.length === 0 && compilerReady);
      const status: LessonReadinessRow["status"] = launchable ? "ready_to_launch"
        : unreviewed.length ? "needs_review" : released && blockers.length === 0 ? "released" : "blocked";
      return { routeId: route.routeId, routeVersion: route.routeVersion, microSkillKey: skill,
        title: skill.replaceAll("_", " "), route, status, compilerReady, released,
        activationEnabled: Boolean(activationEnabled), releaseId: release?.id ?? profile?.id ?? null,
        rollbackContentId: typeof profile?.source_metadata?.contentVersionId === "string"
          ? profile.source_metadata.contentVersionId : null,
        releasedBy: release?.published_by ?? profile?.reviewed_by ?? null,
        releasedAt: release?.published_at ?? profile?.reviewed_at ?? null,
        blockers, activationBlockers, words: entries, releaseContentPreview,
        reviewedCandidateIds: candidates.map((row) => row.id), childPreview, childPreviewReason };
    });
  });
}
