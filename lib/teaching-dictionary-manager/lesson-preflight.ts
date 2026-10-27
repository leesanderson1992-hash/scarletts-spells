import "server-only";
/* eslint-disable @typescript-eslint/no-explicit-any -- new release tables are ahead of generated database types */

import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAdleReadPage, withAdleReadMetrics } from "@/lib/adle/observability/read-metrics";
import {
  ADLE_CURRICULUM_ROUTE_REGISTRY,
  type CurriculumRouteDefinition,
} from "@/lib/adle/curriculum-readiness/route-registry";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { loadDynamicSuffixProfiles } from "@/lib/adle/morphology/dynamic-suffix-profile-loader";
import { isDynamicPrefixRouteEnabled } from "@/lib/adle/morphology/dynamic-prefix-route-gate";
import { isDynamicSuffixRouteEnabled } from "@/lib/adle/morphology/dynamic-suffix-route-gate";
import {
  selectDynamicPrefixWordLab,
} from "@/lib/adle/morphology/dynamic-prefix-word-lab";
import {
  selectDynamicAffixWordLab,
} from "@/lib/adle/morphology/affix-word-lab";
import { compileDynamicPrefixWordLabDecision } from "@/lib/adle/morphology/dynamic-prefix-compiler-rollout";
import { compileDynamicAffixWordLabDecision } from "@/lib/adle/morphology/dynamic-affix-compiler-rollout";
import type { LearningItemFact } from "@/lib/adle/learning-items";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import {
  routeBlockers,
  publicationBlockers,
  isStructurallyUsableWordDraftPayload,
  type RouteContentDraft,
  type WordDraftPayload,
} from "@/lib/teaching-dictionary-manager/contracts";
import { runtimeBlockerTarget } from "./readiness";
import { hasCurrentEditorialReview } from "@/lib/teaching-dictionary-manager/editorial-review";
import { buildGovernedPackage, type NativePackage } from "./governed-package";
import { buildStructuralPackage } from "./structural-package";
import { bindNativePackageFingerprints } from "./package-fingerprint";
import { preflightGovernedRelease } from "./governed-preflight";
import { dictationVariants } from "./authoring";
import { compilerCoverage } from "./compiler-coverage";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";

const ZERO_CHILD = "00000000-0000-4000-8000-000000000001";
type Row = Record<string, any>; // Database release tables are ahead of generated Supabase types.
type WordEntry = {
  id: string;
  word: string;
  role: string;
  requiredForRelease?: boolean;
  reviewedDraftId?: string | null;
  editorialApproved?: boolean;
  ready: boolean;
  blockers: string[];
  /** Native draft validation before editorial sign-off is added. Absence
   * means this loader has not isolated validation from other gates. */
  validationBlockers?: string[];
  editHref: string;
  contentPreview: unknown;
};

export type LessonReadinessRow = {
  routeId: string;
  routeVersion: string;
  microSkillKey: string;
  title: string;
  route: CurriculumRouteDefinition;
  status:
    "released" | "ready_to_launch" | "needs_review" | "blocked" | "policy";
  compilerReady: boolean;
  released: boolean;
  activationEnabled: boolean;
  releaseId: string | null;
  profileSourceHash: string | null;
  activationRevisionId: string | null;
  releasePackage?: NativePackage;
  rollbackContentId: string | null;
  releasedBy: string | null;
  releasedAt: string | null;
  blockers: string[];
  activationBlockers: string[];
  words: WordEntry[];
  releaseContentPreview: unknown[];
  reviewedCandidateIds: string[];
  compilerWitnesses: Record<string, string[]>;
  compiledPreview: unknown;
  preflightFingerprint: string;
  issues: {
    code: string;
    message: string;
    category: "word" | "lesson" | "activation";
    wordId?: string;
    editHref: string;
  }[];
};

async function selectRows(
  db: SupabaseClient,
  table: string,
  columns: string,
  filter?: (query: any) => any,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const query = (
      filter
        ? filter(db.from(table).select(columns))
        : db.from(table).select(columns)
    ).range(offset, offset + 499);
    const started = performance.now();
    const { data, error } = await query;
    recordAdleReadPage(table, data ?? [], performance.now() - started);
    if (error) throw new Error(`ADLE_LESSON_READ_${table}: ${error.message}`);
    out.push(...(data ?? []));
    if ((data ?? []).length < 500) return out;
  }
}

function fakeItems(profileKey: string, ids: string[]): LearningItemFact[] {
  return ids.map((id, index) => ({
    learningItemId: `preview-${index}`,
    childId: ZERO_CHILD,
    canonicalWordId: id,
    microSkillKey: profileKey,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: `lesson-preflight:${id}`,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: "2026-01-01",
    rowStatus: "active",
  }));
}

export function collectWordFacts(
  value: unknown,
  found: Map<string, unknown>,
  depth = 0,
  microSkillKey?: string,
): void {
  if (depth > 12 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value)
      collectWordFacts(entry, found, depth + 1, microSkillKey);
    return;
  }
  const row = value as Record<string, unknown>;
  if (
    microSkillKey &&
    Array.isArray(row.applicableMicroSkillKeys) &&
    !row.applicableMicroSkillKeys.includes(microSkillKey)
  )
    return;
  if (
    microSkillKey &&
    row.wholeCanonicalWordId &&
    row.microSkillKey &&
    row.microSkillKey !== microSkillKey
  )
    return;
  const id =
    row.canonicalWordId ?? row.canonical_word_id ?? row.wholeCanonicalWordId;
  if (typeof id === "string" && !found.has(id)) found.set(id, row);
  for (const [key, part] of Object.entries(row))
    if (!(row.wholeCanonicalWordId && key === "components"))
      collectWordFacts(part, found, depth + 1, microSkillKey);
}

/** Existing enabled suffix profiles can use their validated subset. A new
 * reviewed addition must still pass before that proposed release is ready. */
export function suffixProfileReadiness(input: {
  productionEnabled: boolean;
  coverageComplete: boolean;
  validatedMemberIds: ReadonlySet<string>;
  existingMemberIds: readonly string[];
  reviewedCandidateIds: readonly string[];
  minimumLessonWords: number;
}): { compilerReady: boolean; wordErrorsBlockRoute: boolean } {
  const validCount = input.validatedMemberIds.size;
  const invalidExisting = input.existingMemberIds.some((id) => !input.validatedMemberIds.has(id));
  const invalidCandidate = input.reviewedCandidateIds.some((id) => !input.validatedMemberIds.has(id));
  const enough = validCount >= input.minimumLessonWords;
  return {
    compilerReady: input.coverageComplete && enough && !invalidCandidate &&
      (input.productionEnabled || !invalidExisting),
    wordErrorsBlockRoute: !enough || invalidCandidate ||
      (!input.productionEnabled && invalidExisting),
  };
}

export async function loadLessonReadiness(
  scope: { wordId?: string; routeId?: string; microSkillKey?: string; approvedSkillKeys?: readonly string[] } = {},
): Promise<LessonReadinessRow[]> {
  return withAdleReadMetrics("lesson_preflight", () => loadLessonReadinessUnmeasured(scope));
}

async function loadLessonReadinessUnmeasured(
  scope: { wordId?: string; routeId?: string; microSkillKey?: string; approvedSkillKeys?: readonly string[] } = {},
): Promise<LessonReadinessRow[]> {
  const db = createServiceRoleClient();
  const environment = resolveAdleRouteActivationEnvironment();
  const scoped = (query: any, column: string, value?: string) => value ? query.eq(column, value) : query;
  const [
    prefixRows,
    suffixRows,
    contentRows,
    activationHeads,
    releaseRows,
  ] = await Promise.all([
    scope.routeId && scope.routeId !== "dynamic_prefix_word_lab" ? Promise.resolve([]) : selectRows(
      db,
      "canonical_teaching_dictionary_prefix_profiles",
      "id,micro_skill_key,production_enabled,row_status,review_status,source_row_hash,source_metadata,reviewed_by,reviewed_at",
      (q) => scoped(q.eq("row_status", "active"), "micro_skill_key", scope.microSkillKey),
    ),
    scope.routeId && scope.routeId !== "dynamic_affix_word_lab" ? Promise.resolve([]) : selectRows(
      db,
      "canonical_teaching_dictionary_suffix_profiles",
      "id,micro_skill_key,production_enabled,row_status,review_status,source_row_hash,source_metadata,reviewed_by,reviewed_at",
      (q) => scoped(q.eq("row_status", "active"), "micro_skill_key", scope.microSkillKey),
    ),
    selectRows(
      db,
      "teaching_dictionary_route_content_versions",
      "id,draft_id,canonical_word_id,route_id,route_version,micro_skill_key,published_at,content",
      (q) => scoped(scoped(q, "route_id", scope.routeId), "micro_skill_key", scope.microSkillKey),
    ),
    environment
      ? selectRows(
          db,
          "adle_route_activation_heads",
          "environment_key,route_id,route_version,micro_skill_key,current_revision_id",
          (q) => scoped(scoped(q.eq("environment_key", environment), "route_id", scope.routeId), "micro_skill_key", scope.microSkillKey),
        )
      : Promise.resolve([]),
    selectRows(
      db,
      "adle_curriculum_release_manifests",
      "id,manifest_payload,release_key,release_manifest_sha256,dependency_fingerprint,route_id,route_version,published_by,published_at",
      (q) => scoped(q, "route_id", scope.routeId),
    ),
  ]);
  const contentIds = [...new Set(contentRows.map((row) => String(row.id)))];
  const draftIds = [...new Set(contentRows.map((row) => String(row.draft_id)))];
  const selectForIds = async (table: string, columns: string, key: string, ids: string[]) => {
    if (ids.length === 0) return [] as Row[];
    const batches = Array.from({ length: Math.ceil(ids.length / 100) }, (_, index) => ids.slice(index * 100, (index + 1) * 100));
    return (await Promise.all(batches.map(batch => selectRows(db, table, columns, q => q.in(key, batch))))).flat();
  };
  const [prefixMembers, suffixMembers, reviewRows, publicationRows, rollbackRows, activationRevisions, overviewRows, managerPublications] = await Promise.all([
    selectForIds("canonical_teaching_dictionary_prefix_members",
      "id,prefix_profile_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,base_word,base_meaning,child_friendly_meaning,meaning_bin_key,prefix_variant,teaching_split_parts,teaching_split_joins",
      "prefix_profile_id", prefixRows.map((row) => String(row.id))),
    selectForIds("canonical_teaching_dictionary_suffix_members",
      "id,suffix_profile_id,canonical_word_id,member_role,assignment_eligible,row_status,review_status,suffix_variant,semantic_base_text,semantic_base_kind,base_meaning,new_word_meaning,meaning_bin_key,teaching_split_parts,teaching_split_joins,true_morphology_parts,true_morphology_joins,true_morphology_transformations,transformation_notes,true_morphology_provenance",
      "suffix_profile_id", suffixRows.map((row) => String(row.id))),
    selectForIds("teaching_dictionary_route_content_reviews", "content_version_id,dictionary_fingerprint,reviewed_by", "content_version_id", contentIds),
    selectForIds("teaching_dictionary_route_content_publications", "content_version_id,route_profile_id", "content_version_id", contentIds),
    selectForIds("teaching_dictionary_route_content_rollbacks", "content_version_id", "content_version_id", contentIds),
    selectForIds("adle_route_activation_revisions", "id,activation_status,readiness_report,release_manifest_id,release_manifest_sha256,dependency_fingerprint", "id", activationHeads.map((row) => String(row.current_revision_id))),
    selectForIds("teaching_dictionary_overview_reviews", "draft_id,content_fingerprint,base_dictionary_fingerprint", "draft_id", draftIds),
    selectForIds("teaching_dictionary_manager_publications", "draft_id", "draft_id", draftIds),
  ]);
  const revisionById = new Map(
    activationRevisions.map((row) => [row.id as string, row]),
  );
  const releaseById = new Map(
    releaseRows.map((row) => [row.id as string, row]),
  );
  const dependencies: Row[] = [];
  const releaseIds = [...new Set(releaseRows.map((row) => String(row.id)))];
  for (let at = 0; at < releaseIds.length; at += 100) {
    dependencies.push(
      ...(await selectRows(
        db,
        "adle_curriculum_release_dependencies",
        "release_manifest_id,micro_skill_key,authority_id,authority_type",
        (q) => q.in("release_manifest_id", releaseIds.slice(at, at + 100)),
      )),
    );
  }
  const authorityIds = [
    ...new Set(dependencies.map((row) => String(row.authority_id))),
  ];
  const authorities: Row[] = [];
  for (let at = 0; at < authorityIds.length; at += 100) {
    const result = await db
      .from("adle_curriculum_dependency_authorities")
      .select(
        "id,authority_key,schema_version,semantic_projection,semantic_fingerprint,authority_type",
      )
      .in("id", authorityIds.slice(at, at + 100));
    if (result.error)
      throw new Error(`ADLE_LESSON_AUTHORITY_READ: ${result.error.message}`);
    authorities.push(...(result.data ?? []));
  }
  const authorityById = new Map(
    authorities.map((row) => [row.id as string, row]),
  );
  const matchesScope = (route: CurriculumRouteDefinition, skill: string): boolean => {
        if (scope.routeId && scope.routeId !== route.routeId) return false;
        if (scope.microSkillKey && scope.microSkillKey !== skill) return false;
        if (!scope.wordId) return true;
        // A reviewed relationship with no route content is itself a readiness
        // gap, so the word workspace must still receive that route's report.
        if (scope.approvedSkillKeys?.includes(skill)) return true;
        if (
          contentRows.some(
            (row) =>
              row.canonical_word_id === scope.wordId &&
              row.route_id === route.routeId &&
              row.micro_skill_key === skill,
          )
        )
          return true;
        if (
          prefixRows.some(
            (profile) =>
              profile.micro_skill_key === skill &&
              route.routeId === "dynamic_prefix_word_lab" &&
              prefixMembers.some(
                (member) =>
                  member.prefix_profile_id === profile.id &&
                  member.canonical_word_id === scope.wordId &&
                  member.row_status === "active",
              ),
          )
        )
          return true;
        if (
          suffixRows.some(
            (profile) =>
              profile.micro_skill_key === skill &&
              route.routeId === "dynamic_affix_word_lab" &&
              suffixMembers.some(
                (member) =>
                  member.suffix_profile_id === profile.id &&
                  member.canonical_word_id === scope.wordId &&
                  member.row_status === "active",
              ),
          )
        )
          return true;
        const head = activationHeads.find(
          (head) =>
            head.route_id === route.routeId && head.micro_skill_key === skill,
        );
        const releaseId = head
          ? revisionById.get(head.current_revision_id)?.release_manifest_id
          : null;
        const found = new Map<string, unknown>();
        for (const dependency of dependencies.filter(
          (dep) =>
            dep.micro_skill_key === skill &&
            dep.release_manifest_id === releaseId,
        )) {
          const a = authorityById.get(dependency.authority_id);
          if (a) collectWordFacts(a.semantic_projection, found, 0, skill);
        }
        return found.has(scope.wordId);
  };
  const relevant = new Set(ADLE_CURRICULUM_ROUTE_REGISTRY.flatMap(route =>
    (route.compatibilityScope.kind === "generic_composer_fallback" ? ["generic_composer_fallback"] : route.supportedMicroSkillKeys)
      .filter(skill => matchesScope(route, skill)).map(skill => `${route.routeId}:${skill}`)));
  const prefixKeys = prefixRows.filter(row => relevant.has(`dynamic_prefix_word_lab:${row.micro_skill_key}`)).map(row => String(row.micro_skill_key));
  const suffixKeys = suffixRows.filter(row => relevant.has(`dynamic_affix_word_lab:${row.micro_skill_key}`)).map(row => String(row.micro_skill_key));
  // The scope narrows groups, never members within a proposed group.
  prefixRows.splice(0, prefixRows.length, ...prefixRows.filter(row => prefixKeys.includes(row.micro_skill_key)));
  suffixRows.splice(0, suffixRows.length, ...suffixRows.filter(row => suffixKeys.includes(row.micro_skill_key)));
  contentRows.splice(0, contentRows.length, ...contentRows.filter(row => relevant.has(`${row.route_id}:${row.micro_skill_key}`)));
  const scopedWordIds = new Set<string>(contentRows.map(row => String(row.canonical_word_id)));
  for (const row of prefixMembers) if (prefixRows.some(profile => profile.id === row.prefix_profile_id)) scopedWordIds.add(String(row.canonical_word_id));
  for (const row of suffixMembers) if (suffixRows.some(profile => profile.id === row.suffix_profile_id)) scopedWordIds.add(String(row.canonical_word_id));
  for (const dep of dependencies) {
    const release = releaseById.get(dep.release_manifest_id);
    if (!release || !relevant.has(`${release.route_id}:${dep.micro_skill_key}`)) continue;
    const facts = new Map<string, unknown>();
    collectWordFacts(authorityById.get(dep.authority_id)?.semantic_projection, facts, 0, dep.micro_skill_key);
    for (const id of facts.keys()) scopedWordIds.add(id);
  }
  const wordIds = [...scopedWordIds];
  const readWordFacts = async (table: string, columns: string, key: string, active = false) => {
    if (!scope.wordId && !scope.routeId && !scope.microSkillKey) return selectRows(db, table, columns, active ? q => q.eq("row_status", "active") : undefined);
    const batches = Array.from({ length: Math.ceil(wordIds.length / 100) }, (_, index) => wordIds.slice(index * 100, (index + 1) * 100));
    return (await Promise.all(batches.map(ids => selectRows(db, table, columns, q => {
      const filtered = q.in(key, ids);
      return active ? filtered.eq("row_status", "active") : filtered;
    })))).flat();
  };
  const [wordRows, metadataRows, dictationRows] = await Promise.all([
    readWordFacts("canonical_teaching_dictionary_words", "id,display_word,row_status,review_status", "id"),
    readWordFacts("canonical_teaching_dictionary_word_metadata", "canonical_word_id,syllables,phoneme_hint,stress_pattern,has_schwa,morphemes,morphology_notes,row_status,review_status", "canonical_word_id", true),
    readWordFacts("canonical_teaching_dictionary_dictation_sentences", "canonical_word_id,dictation_sentence,audio_text,dictation_target_token_index,row_status,review_status", "canonical_word_id", true),
  ]);
  const words = new Map(wordRows.map((word) => [word.id as string, word]));
  const activePrefixIds = new Set(prefixRows.map((profile) => profile.id));
  const activeSuffixIds = new Set(suffixRows.map((profile) => profile.id));
  const affixWordIds = [
    ...new Set(
      [
        ...prefixMembers.filter((member) =>
          activePrefixIds.has(member.prefix_profile_id),
        ),
        ...suffixMembers.filter((member) =>
          activeSuffixIds.has(member.suffix_profile_id),
        ),
      ].map((member) => String(member.canonical_word_id)),
    ),
  ];
  const newestDraftByWord = new Map<string, string>();
  for (let at = 0; at < affixWordIds.length; at += 100) {
    const drafts = await selectRows(
      db,
      "teaching_dictionary_manager_drafts",
      "id,canonical_word_id,created_at",
      (q) =>
        q
          .in("canonical_word_id", affixWordIds.slice(at, at + 100))
          .order("created_at", { ascending: false }),
    );
    for (const draft of drafts)
      if (!newestDraftByWord.has(draft.canonical_word_id))
        newestDraftByWord.set(draft.canonical_word_id, draft.id);
  }
  const metadataByWord = new Map(
    metadataRows.map((row) => [row.canonical_word_id as string, row]),
  );
  const dictationByWord = new Map(
    dictationRows.map((row) => [row.canonical_word_id as string, row]),
  );
  const reviewByContentId = new Map(
    reviewRows.map((row) => [row.content_version_id as string, row]),
  );
  const draftById = new Map<string, WordDraftPayload>();
  const invalidDraftIds = new Set<string>();
  for (let at = 0; at < draftIds.length; at += 100) {
    const result = await db
      .from("teaching_dictionary_manager_drafts")
      .select("id,payload")
      .in("id", draftIds.slice(at, at + 100));
    if (result.error)
      throw new Error(`ADLE_LESSON_DRAFT_READ: ${result.error.message}`);
    for (const draft of result.data ?? []) {
      if (isStructurallyUsableWordDraftPayload(draft.payload)) draftById.set(draft.id, draft.payload);
      else invalidDraftIds.add(draft.id);
    }
  }
  const draftBlocker = (id: string) => invalidDraftIds.has(id)
    ? "Source draft payload is malformed" : "Source draft unavailable";
  const published = new Set(
    publicationRows.map((row) => row.content_version_id),
  );
  const rolledBack = new Set(rollbackRows.map((row) => row.content_version_id));
  const latestContent = new Map<string, Row>();
  for (const row of contentRows
    .filter((row) => !rolledBack.has(row.id))
    .sort(
      (a, b) =>
        String(b.published_at).localeCompare(String(a.published_at)) ||
        String(b.id).localeCompare(String(a.id)),
    )) {
    const key = `${row.route_id}:${row.micro_skill_key}:${row.canonical_word_id}`;
    if (!latestContent.has(key)) latestContent.set(key, row);
  }
  const currentFingerprints = new Map<string, string>();
  const reviewedWords = [
    ...new Set(
      [...latestContent.values()]
        .filter((row) => reviewByContentId.has(row.id))
        .map((row) => String(row.canonical_word_id)),
    ),
  ];
  await Promise.all(
    reviewedWords.map(async (wordId) => {
      const result = await db.rpc(
        "teaching_dictionary_route_dictionary_fingerprint",
        { p_word: wordId },
      );
      if (result.error)
        throw new Error(
          `ADLE_LESSON_REVIEW_FINGERPRINT: ${result.error.message}`,
        );
      currentFingerprints.set(wordId, String(result.data ?? ""));
    }),
  );
  const reviews = new Set(
    [...latestContent.values()]
      .filter((row) =>
        hasCurrentEditorialReview(
          reviewByContentId.get(row.id),
          currentFingerprints.get(String(row.canonical_word_id)),
        ),
      )
      .map((row) => row.id),
  );
  const reviewedCandidates = [...latestContent.values()].filter(
    (row) =>
      reviews.has(row.id) && !published.has(row.id) && !rolledBack.has(row.id),
  );
  const candidateMembers = reviewedCandidates
    .filter((row) =>
      ["dynamic_prefix_word_lab", "dynamic_affix_word_lab"].includes(
        row.route_id,
      ),
    )
    .map((row) => ({
      microSkillKey: String(row.micro_skill_key),
      canonicalWordId: String(row.canonical_word_id),
      content: row.content?.content as Record<string, unknown>,
      wordMeaning: String(row.content?.wordMeaning ?? ""),
      dictionary: draftById.get(String(row.draft_id)),
    }));
  const prefixCandidateMembers = candidateMembers.filter((row) =>
    reviewedCandidates.some(
      (candidate) =>
        candidate.route_id === "dynamic_prefix_word_lab" &&
        candidate.canonical_word_id === row.canonicalWordId &&
        candidate.micro_skill_key === row.microSkillKey,
    ),
  );
  const [loadedPrefix, loadedSuffix, candidatePrefixRead, candidateSuffix] =
    await Promise.all([
      loadDynamicPrefixProfiles(db, ZERO_CHILD, { microSkillKeys: prefixKeys }),
      loadDynamicSuffixProfiles(db, ZERO_CHILD, { microSkillKeys: suffixKeys }),
      prefixCandidateMembers.length
        ? loadDynamicPrefixProfiles(db, ZERO_CHILD, {
            microSkillKeys: prefixKeys,
            allowStagingProfiles: true,
            candidateMembers: prefixCandidateMembers,
          })
        : Promise.resolve(null),
      loadDynamicSuffixProfiles(db, ZERO_CHILD, {
        microSkillKeys: suffixKeys,
        allowStagingProfiles: true,
        candidateMembers: candidateMembers.filter((row) =>
          reviewedCandidates.some(
            (candidate) =>
              candidate.route_id === "dynamic_affix_word_lab" &&
              candidate.canonical_word_id === row.canonicalWordId &&
              candidate.micro_skill_key === row.microSkillKey,
          ),
        ),
      }),
    ]);
  // With no proposed member overlay, the candidate loader differs only in
  // productionEnabled. Reuse its already validated profile and read results.
  const candidatePrefix = candidatePrefixRead ?? {
    ...loadedPrefix,
    profiles: loadedPrefix.profiles.map((profile) => ({
      ...profile,
      productionEnabled: true,
    })),
  };
  const currentRevisionIds = new Set<string>();
  await Promise.all(
    activationHeads.filter(head => relevant.has(`${head.route_id}:${head.micro_skill_key}`)).map(async (head) => {
      const revision = revisionById.get(head.current_revision_id);
      const release = revision
        ? releaseById.get(revision.release_manifest_id)
        : null;
      if (!revision || !release) return;
      const result = await db.rpc(
        "adle_route_activation_revision_is_current_v2",
        {
          p_activation_revision_id: revision.id,
          p_release_manifest_id: release.id,
          p_release_manifest_sha256: release.release_manifest_sha256,
          p_dependency_fingerprint: release.dependency_fingerprint,
        },
      );
      if (result.error)
        throw new Error(`ADLE_LESSON_ACTIVATION_READ: ${result.error.message}`);
      if (result.data === true) currentRevisionIds.add(String(revision.id));
    }),
  );
  const output = await Promise.all(
    ADLE_CURRICULUM_ROUTE_REGISTRY.flatMap((route) => {
      const skills =
        route.compatibilityScope.kind === "generic_composer_fallback"
          ? ["generic_composer_fallback"]
          : route.supportedMicroSkillKeys;
      const relevantSkills = skills.filter((skill) => relevant.has(`${route.routeId}:${skill}`));
      return relevantSkills.map(async (skill): Promise<LessonReadinessRow> => {
        const prefix = prefixRows.find(
          (row) =>
            route.routeId === "dynamic_prefix_word_lab" &&
            row.micro_skill_key === skill,
        );
        const suffix = suffixRows.find(
          (row) =>
            route.routeId === "dynamic_affix_word_lab" &&
            row.micro_skill_key === skill,
        );
        const profile = prefix ?? suffix;
        const members = prefix
          ? prefixMembers.filter(
              (row) =>
                row.prefix_profile_id === prefix.id &&
                row.row_status === "active" &&
                row.assignment_eligible,
            )
          : suffix
            ? suffixMembers.filter(
                (row) =>
                  row.suffix_profile_id === suffix.id &&
                  row.row_status === "active" &&
                  row.assignment_eligible,
              )
            : [];
        const candidates = [...latestContent.values()].filter(
          (row) =>
            row.route_id === route.routeId &&
            row.micro_skill_key === skill &&
            reviews.has(row.id) &&
            !published.has(row.id) &&
            !rolledBack.has(row.id),
        );
        const unreviewed = [...latestContent.values()].filter(
          (row) =>
            row.route_id === route.routeId &&
            row.micro_skill_key === skill &&
            !reviews.has(row.id) &&
            !published.has(row.id),
        );
        const currentProfile = prefix
          ? loadedPrefix.profiles.find((row) => row.microSkillKey === skill)
          : suffix
            ? loadedSuffix.profiles.find((row) => row.microSkillKey === skill)
            : null;
        const targetProfile = prefix
          ? candidatePrefix.profiles.find((row) => row.microSkillKey === skill)
          : suffix
            ? candidateSuffix.profiles.find(
                (row) => row.microSkillKey === skill,
              )
            : null;
        const validIds = new Set(
          targetProfile ? [...targetProfile.wordsByCanonicalId.keys()] : [],
        );
        const proposedMembers = profile
          ? [
              ...members,
              ...candidates
                .filter(
                  (candidate) =>
                    !members.some(
                      (member) =>
                        member.canonical_word_id ===
                        candidate.canonical_word_id,
                    ),
                )
                .map((candidate) => ({
                  canonical_word_id: candidate.canonical_word_id,
                  member_role: "authentic_target",
                  review_status: "approved_for_first_exposure",
                  assignment_eligible: true,
                })),
            ]
          : [];
        const entries: WordEntry[] = proposedMembers.map((member) => {
          const dictionary = words.get(member.canonical_word_id);
          const candidate = candidates.find(
            (row) => row.canonical_word_id === member.canonical_word_id,
          );
          const facts = candidate?.content?.content ?? member;
          const field = (draftName: string, releasedName: string) =>
            candidate ? facts[draftName] : facts[releasedName];
          const present = (value: unknown) =>
            typeof value === "string"
              ? value.trim().length > 0
              : Array.isArray(value)
                ? value.length > 0
                : value !== null && value !== undefined;
          const proposed = candidate
            ? draftById.get(String(candidate.draft_id))
            : null;
          const metadata = proposed
            ? {
                ...proposed.metadata,
                review_status: "approved_for_first_exposure",
              }
            : metadataByWord.get(member.canonical_word_id);
          const dictation = proposed
            ? {
                dictation_sentence: proposed.dictationSentence,
                audio_text: proposed.dictationSentence,
                dictation_target_token_index:
                  proposed.dictationTargetTokenIndex,
                review_status: "approved_for_first_exposure",
              }
            : dictationByWord.get(member.canonical_word_id);
          const blockers: string[] = [];
          if (candidate && !proposed) blockers.push(draftBlocker(String(candidate.draft_id)));
          if (proposed)
            blockers.push(
              ...publicationBlockers(
                proposed,
                proposed.displayWord.toLowerCase(),
              ),
              ...routeBlockers(
                candidate!.content as RouteContentDraft,
                proposed,
              ),
            );
          if (member.review_status !== "approved_for_first_exposure")
            blockers.push("Member review pending");
          if (!member.assignment_eligible)
            blockers.push("Member excluded from assignment");
          if (
            !dictionary ||
            dictionary.row_status !== "active" ||
            dictionary.review_status !== "approved_for_first_exposure"
          )
            blockers.push("Dictionary word not approved");
          if (
            !dictation ||
            dictation.review_status !== "approved_for_first_exposure" ||
            !dictation.dictation_sentence ||
            dictation.audio_text !== dictation.dictation_sentence ||
            !Number.isInteger(dictation.dictation_target_token_index)
          )
            blockers.push("Approved dictation missing or inconsistent");
          if (
            !metadata ||
            metadata.review_status !== "approved_for_first_exposure" ||
            !metadata.syllables ||
            !metadata.phoneme_hint ||
            !metadata.stress_pattern ||
            typeof metadata.has_schwa !== "boolean"
          )
            blockers.push("Pronunciation metadata incomplete");
          if (
            prefix &&
            (!metadata?.morphemes || metadata?.morphology_notes == null)
          )
            blockers.push("Prefix morphology metadata incomplete");
          if (!present(field("teachingSplitParts", "teaching_split_parts")))
            blockers.push("Teaching parts missing");
          if (!present(field("teachingSplitJoins", "teaching_split_joins")))
            blockers.push("Teaching joins missing");
          if (prefix) {
            if (
              !present(field("baseWord", "base_word")) ||
              !present(field("baseMeaning", "base_meaning"))
            )
              blockers.push("Base and meaning missing");
            if (
              !present(field("prefixVariant", "prefix_variant")) ||
              !present(field("meaningBinKey", "meaning_bin_key"))
            )
              blockers.push("Prefix form or meaning group missing");
          }
          if (suffix) {
            if (!present(field("trueMorphologyParts", "true_morphology_parts")))
              blockers.push("True morphology parts missing");
            if (!present(field("trueMorphologyJoins", "true_morphology_joins")))
              blockers.push("True morphology joins missing");
            const provenance = field(
              "trueMorphologyProvenance",
              "true_morphology_provenance",
            );
            if (
              !provenance ||
              typeof provenance !== "object" ||
              (candidate
                ? (provenance as Row).status !== "reviewed"
                : (provenance as Row).status ===
                    "draft_requires_editorial_review" ||
                  Object.keys(provenance).length === 0)
            )
              blockers.push("True morphology editorial review pending");
            if (
              !present(field("semanticBaseText", "semantic_base_text")) ||
              !present(field("baseMeaning", "base_meaning"))
            )
              blockers.push("Semantic base or meaning missing");
            if (
              !present(field("suffixVariant", "suffix_variant")) ||
              !present(field("meaningBinKey", "meaning_bin_key"))
            )
              blockers.push("Suffix form or meaning group missing");
          }
          if (!validIds.has(member.canonical_word_id))
            blockers.push("Runtime loader rejects this word or its structure");
          const editTarget = blockers.some((blocker) =>
            blocker.includes("True morphology editorial"),
          )
            ? `td-route-${skill}-trueMorphologyProvenance`
            : blockers.some((blocker) => blocker.includes("dictation"))
              ? "td-dictation"
              : blockers.some((blocker) => blocker.includes("Pronunciation"))
                ? "td-has-schwa"
                : blockers.some((blocker) => blocker.includes("Semantic base"))
                  ? `td-route-${skill}-semanticBaseText`
                  : `td-route-${skill}-teachingSplitParts`;
          const draftId = newestDraftByWord.get(member.canonical_word_id);
          return {
            id: member.canonical_word_id,
            word: dictionary?.display_word ?? member.canonical_word_id,
            role: member.member_role,
            reviewedDraftId: candidate?.draft_id ?? null,
            editorialApproved: member.review_status === "approved_for_first_exposure",
            ready: blockers.length === 0,
            blockers,
            contentPreview: {
              routeContent: candidate?.content ?? member,
              dictionaryWord: dictionary,
              pronunciation: metadata,
              dictation,
            },
            editHref: `/admin/teaching-dictionary/${member.canonical_word_id}${draftId ? `?draft=${draftId}` : ""}#${editTarget}`,
          };
        });
        if (profile)
          for (const content of unreviewed) {
            const draft = draftById.get(content.draft_id);
            const dictionary = words.get(content.canonical_word_id);
            const validationBlockers = draft
              ? [
                  ...publicationBlockers(
                    draft,
                    draft.displayWord.toLowerCase(),
                  ),
                  ...routeBlockers(content.content as RouteContentDraft, draft),
                ]
              : [draftBlocker(String(content.draft_id))];
            const missing = [...validationBlockers, "Editorial sign-off missing or stale"];
            entries.unshift({
              id: content.canonical_word_id,
              word: dictionary?.display_word ?? content.canonical_word_id,
              role: "unreleased draft",
              requiredForRelease: false,
              reviewedDraftId: null,
              editorialApproved: false,
              ready: false,
              blockers: missing,
              validationBlockers,
              contentPreview: { routeContent: content.content },
              editHref: `/admin/teaching-dictionary/${content.canonical_word_id}?draft=${content.draft_id}#td-route-${skill}`,
            });
          }
        if (!profile && route.routeId !== "generic_composer") {
          for (const content of [...latestContent.values()].filter(
            (row) =>
              row.route_id === route.routeId &&
              row.micro_skill_key === skill &&
              !published.has(row.id),
          )) {
            const dictionary = words.get(content.canonical_word_id);
            const draft = draftById.get(content.draft_id);
            const validationBlockers = draft
              ? [
                  ...publicationBlockers(
                    draft,
                    draft.displayWord.toLowerCase(),
                  ),
                  ...routeBlockers(content.content as RouteContentDraft, draft),
                ]
              : [draftBlocker(String(content.draft_id))];
            const missing = [...validationBlockers];
            if (!reviews.has(content.id))
              missing.push("Editorial sign-off missing or stale");
            entries.push({
              id: content.canonical_word_id,
              word: dictionary?.display_word ?? content.canonical_word_id,
              role: "route content candidate",
              requiredForRelease: reviews.has(content.id),
              reviewedDraftId: reviews.has(content.id)
                ? content.draft_id
                : null,
              editorialApproved: reviews.has(content.id),
              ready: missing.length === 0,
              blockers: missing,
              validationBlockers,
              contentPreview: {
                routeContent: content.content,
                dictionaryWord: dictionary,
                pronunciation: metadataByWord.get(content.canonical_word_id),
                dictation: dictationByWord.get(content.canonical_word_id),
              },
              editHref: `/admin/teaching-dictionary/${content.canonical_word_id}?draft=${content.draft_id}#td-route-${skill}`,
            });
          }
        }
        const routeHead = activationHeads.find(
          (row) =>
            row.route_id === route.routeId &&
            row.route_version === route.routeVersion &&
            row.micro_skill_key === skill,
        );
        const revision = routeHead
          ? revisionById.get(routeHead.current_revision_id)
          : null;
        const release = revision
          ? releaseById.get(revision.release_manifest_id)
          : null;
        const contentRelease =
          release ??
          releaseRows
            .filter(
              (row) =>
                row.route_id === route.routeId &&
                row.route_version === route.routeVersion &&
                dependencies.some(
                  (dependency) =>
                    dependency.release_manifest_id === row.id &&
                    dependency.micro_skill_key === skill,
                ),
            )
            .sort((a, b) =>
              String(b.published_at).localeCompare(String(a.published_at)),
            )[0];
        const releaseContentPreview: unknown[] = targetProfile
          ? [
              {
                profile: {
                  ...targetProfile,
                  wordsByCanonicalId: [
                    ...targetProfile.wordsByCanonicalId.values(),
                  ],
                },
              },
            ]
          : [];
        if (contentRelease)
          releaseContentPreview.push(
            ...dependencies
              .filter(
                (row) =>
                  row.release_manifest_id === contentRelease.id &&
                  row.micro_skill_key === skill,
              )
              .map((row) => ({
                authorityType: row.authority_type,
                content:
                  authorityById.get(row.authority_id)?.semantic_projection ??
                  null,
              })),
          );
        if (!profile && contentRelease) {
          const facts = new Map<string, unknown>();
          for (const dependency of dependencies.filter(
            (row) =>
              row.release_manifest_id === contentRelease.id &&
              row.micro_skill_key === skill,
          )) {
            const authority = authorityById.get(dependency.authority_id);
            if (authority)
              collectWordFacts(authority.semantic_projection, facts, 0, skill);
          }
          for (const [id, fact] of facts) {
            const dictionary = words.get(id);
            const blockers =
              !dictionary ||
              dictionary.row_status !== "active" ||
              dictionary.review_status !== "approved_for_first_exposure"
                ? ["Dictionary word not approved"]
                : [];
            entries.push({
              id,
              word: dictionary?.display_word ?? id,
              role: "released lesson word",
              editorialApproved: true,
              ready: blockers.length === 0,
              blockers,
              contentPreview: fact,
              editHref: `/admin/teaching-dictionary/${id}#td-canonical-parts`,
            });
          }
        }
        const routeEnvironmentEnabled = prefix
          ? isDynamicPrefixRouteEnabled()
          : suffix
            ? isDynamicSuffixRouteEnabled()
            : true;
        const activationEnabled = profile
          ? profile.production_enabled === true && routeEnvironmentEnabled
          : revision?.activation_status === "enabled" &&
            release?.release_manifest_sha256 ===
              revision.release_manifest_sha256 &&
            release?.dependency_fingerprint ===
              revision.dependency_fingerprint &&
            release?.route_id === route.routeId &&
            release?.route_version === route.routeVersion &&
            currentRevisionIds.has(String(revision.id));
        const activationBlockers =
          route.activationAuthority === "generic_composer_policy"
            ? []
            : route.activationAuthority === "database_route_activation"
              ? activationEnabled
                ? []
                : ["Route activation is off or its release revision is missing"]
              : activationEnabled
                ? []
                : [
                    profile?.production_enabled
                      ? "Environment gate is off"
                      : "Profile gate is off",
                  ];
        if (
          activationEnabled &&
          revision?.readiness_report?.scope?.kind === "child_allowlist"
        )
          activationBlockers.push(
            "Active route has a limited release scope; global availability requires all_eligible scope",
          );
        const blockers: string[] = [];
        if (profile && profile.review_status !== "approved_for_first_exposure")
          blockers.push("Profile needs review");
        if (
          profile &&
          entries.filter((entry) => entry.requiredForRelease !== false).length <
            route.wordCounts.lesson[0]
        )
          blockers.push(
            `Need at least ${route.wordCounts.lesson[0]} lesson words; found ${entries.length}`,
          );
        if (suffix
          ? suffixProfileReadiness({
              productionEnabled: suffix.production_enabled === true,
              coverageComplete: true,
              validatedMemberIds: validIds,
              existingMemberIds: members.map((member) => member.canonical_word_id),
              reviewedCandidateIds: candidates.map((candidate) => candidate.canonical_word_id),
              minimumLessonWords: route.wordCounts.lesson[0],
            }).wordErrorsBlockRoute ||
            entries.some((entry) => Boolean(entry.reviewedDraftId) && !entry.ready)
          : entries.some(
              (entry) => entry.requiredForRelease !== false && !entry.ready,
            ))
          blockers.push("One or more words fail runtime validation");
        if (profile && !targetProfile)
          blockers.push(
            "The runtime loader rejects this profile or its word coverage",
          );
        for (const candidate of candidates) {
          if (
            !managerPublications.some(
              (pub) => pub.draft_id === candidate.draft_id,
            )
          ) {
            const dependencies = [
              ...prefixMembers
                .filter(
                  (m) =>
                    m.canonical_word_id === candidate.canonical_word_id &&
                    m.row_status === "active" &&
                    m.prefix_profile_id !== profile?.id,
                )
                .flatMap((m) => {
                  const p = prefixRows.find(
                    (p) => p.id === m.prefix_profile_id,
                  );
                  return p ? [p.micro_skill_key] : [];
                }),
              ...suffixMembers
                .filter(
                  (m) =>
                    m.canonical_word_id === candidate.canonical_word_id &&
                    m.row_status === "active" &&
                    m.suffix_profile_id !== profile?.id,
                )
                .flatMap((m) => {
                  const p = suffixRows.find(
                    (p) => p.id === m.suffix_profile_id,
                  );
                  return p ? [p.micro_skill_key] : [];
                }),
            ];
            for (const dependency of new Set(dependencies))
              blockers.push(
                `Protected shared changes also require the active ${dependency} profile to be released together`,
              );
          }
          const draft = draftById.get(String(candidate.draft_id));
          if (draft) {
            const {
              skillKeys: _skills,
              routeContents: _routes,
              ...overview
            } = draft;
            void _skills;
            void _routes;
            const review = overviewRows.find(
              (row) => row.draft_id === candidate.draft_id,
            );
            if (
              !review ||
              review.content_fingerprint !==
                fingerprintSnapshotValue(
                  JSON.parse(JSON.stringify(overview)),
                ) ||
              (review.base_dictionary_fingerprint !==
                currentFingerprints.get(String(candidate.canonical_word_id)) &&
                !managerPublications.some(
                  (pub) => pub.draft_id === candidate.draft_id,
                ))
            )
              blockers.push(
                "Overview approval is missing or stale; save and approve Overview first",
              );
          }
          const expectedId = candidate.content?.content?.expectedProfileId;
          const expectedHash =
            candidate.content?.content?.expectedSourceRowHash;
          if (
            profile &&
            (!expectedId ||
              !expectedHash ||
              expectedId !== profile.id ||
              expectedHash !== profile.source_row_hash)
          )
            blockers.push(
              "Profile changed since this draft; restage and review current facts",
            );
        }
        let compilerReady = false;
        let compilerWitnesses: Record<string, string[]> = {};
        let compiledPreview: unknown = null;
        let releasePackage: NativePackage | undefined;
        if (targetProfile && "wordsByCanonicalId" in targetProfile) {
          const ids = [...targetProfile.wordsByCanonicalId.keys()];
          const compile = (
            profile: NonNullable<typeof targetProfile>,
            set: string[],
          ) => {
            const items = fakeItems(skill, set);
            const selection = prefix
              ? selectDynamicPrefixWordLab({
                  profiles: [profile as (typeof loadedPrefix.profiles)[number]],
                  learningItems: items,
                })
              : selectDynamicAffixWordLab({
                  profiles: [profile as (typeof loadedSuffix.profiles)[number]],
                  learningItems: items,
                });
            const decision = prefix
              ? selection &&
                compileDynamicPrefixWordLabDecision(
                  selection as NonNullable<
                    ReturnType<typeof selectDynamicPrefixWordLab>
                  >,
                )
              : selection &&
                compileDynamicAffixWordLabDecision(
                  selection as NonNullable<
                    ReturnType<typeof selectDynamicAffixWordLab>
                  >,
                );
            const payload = decision && decision.ok ? decision.payload : null;
            return payload &&
              set.every((id) =>
                payload.words.lesson.some(
                  (word) => word.canonicalWordId === id,
                ),
              )
              ? payload
              : null;
          };
          const coverage = compilerCoverage(
            ids,
            route.wordCounts.lesson[0],
            (set) => compile(targetProfile, set),
          );
          for (const candidate of candidates) {
            const proposed = draftById.get(String(candidate.draft_id));
            const current = targetProfile.wordsByCanonicalId.get(
              candidate.canonical_word_id,
            );
            if (!proposed || !current) continue;
            for (const variant of dictationVariants(proposed)) {
              const proposedProfile = {
                ...targetProfile,
                wordsByCanonicalId: new Map(
                  targetProfile.wordsByCanonicalId as Map<string, any>,
                ),
              };
              proposedProfile.wordsByCanonicalId.set(
                candidate.canonical_word_id,
                {
                  ...current,
                  audioText: variant.audioText,
                  dictationSentence: variant.sentence,
                  dictationTargetTokenIndex: variant.targetTokenIndex,
                },
              );
              if (
                !compilerCoverage(ids, route.wordCounts.lesson[0], (set) =>
                  compile(proposedProfile, set),
                ).complete
              )
                blockers.push(
                  `Dictation variant ${variant.id} for ${words.get(candidate.canonical_word_id)?.display_word ?? candidate.canonical_word_id} fails the lesson compiler`,
                );
            }
          }
          compilerWitnesses = coverage.witnesses;
          compiledPreview = coverage.previews[0] ?? null;
          compilerReady = suffix
            ? suffixProfileReadiness({
                productionEnabled: suffix.production_enabled === true,
                coverageComplete: coverage.complete,
                validatedMemberIds: validIds,
                existingMemberIds: members.map((member) => member.canonical_word_id),
                reviewedCandidateIds: candidates.map((candidate) => candidate.canonical_word_id),
                minimumLessonWords: route.wordCounts.lesson[0],
              }).compilerReady
            : coverage.complete && proposedMembers.every((member) =>
                validIds.has(member.canonical_word_id));
          if (!compilerReady)
            blockers.push(
              suffix
                ? "The valid word pool cannot compile a four-word selection"
                : "Not every lesson word participates in a compiling four-word selection",
            );
        }
        if (!profile && contentRelease && revision) {
          const fullAuthorities = dependencies
            .filter((dep) => dep.release_manifest_id === contentRelease.id)
            .flatMap((dep) => {
              const authority = authorityById.get(dep.authority_id);
              return authority ? [authority] : [];
            });
          const packageInput = {
            db,
            skill,
            environment,
            routeId: route.routeId,
            manifest: contentRelease.manifest_payload,
            authorities: [
              ...new Map(fullAuthorities.map((a) => [a.id, a])).values(),
            ],
            candidates: candidates.flatMap((candidate) => {
              const dictionary = draftById.get(String(candidate.draft_id));
              return dictionary
                ? [
                    {
                      id: String(candidate.id),
                      canonicalWordId: String(candidate.canonical_word_id),
                      route: candidate.content as RouteContentDraft,
                      dictionary,
                      reviewedBy: String(
                        reviewByContentId.get(candidate.id)?.reviewed_by ?? "",
                      ),
                    },
                  ]
                : [];
            }),
          };
          const packageResult = ["base_word_lab", "compound_word_lab"].includes(
            route.routeId,
          )
            ? await buildStructuralPackage(packageInput)
            : buildGovernedPackage(packageInput);
          releasePackage = packageResult.package
            ? await bindNativePackageFingerprints(db, packageResult.package)
            : undefined;
          blockers.push(...packageResult.blockers);
          const boundAuthorities = releasePackage
            ? releasePackage.authorities
                .filter((a) =>
                  releasePackage!.manifest.microSkills
                    .find((s: any) => s.microSkillKey === skill)
                    ?.dependencies.some(
                      (d: any) =>
                        d.authorityKey === a.authorityKey &&
                        d.authorityType === a.authorityType,
                    ),
                )
                .map((a) => ({
                  id: a.authorityKey,
                  authority_type: a.authorityType,
                  semantic_projection: a.semanticProjection,
                  semantic_fingerprint: a.semanticFingerprint,
                  source_bindings: a.sourceBindings,
                }))
            : fullAuthorities.filter((a) =>
                dependencies.some(
                  (dep) =>
                    dep.release_manifest_id === contentRelease.id &&
                    dep.micro_skill_key === skill &&
                    dep.authority_id === a.id,
                ),
              );
          const governed = await preflightGovernedRelease({
            db,
            routeId: route.routeId,
            skill,
            release: contentRelease,
            revision,
            authorities: boundAuthorities as Parameters<
              typeof preflightGovernedRelease
            >[0]["authorities"],
            environment,
          });
          compilerReady = governed.ready;
          compiledPreview = governed.preview;
          compilerWitnesses = governed.witnesses;
          blockers.push(...governed.blockers);
          if (route.routeId === "base_word_lab" && !governed.ready) {
            for (const entry of entries) {
              const fact = entry.contentPreview as Record<
                string,
                unknown
              > | null;
              if (
                entry.requiredForRelease !== false &&
                fact?.assignmentEligible !== false &&
                !governed.witnesses[entry.id]
              ) {
                entry.ready = false;
                entry.blockers.push(
                  "Reviewed base family has no complete compiler-valid selection for this word",
                );
              }
            }
          }
        }
        if (route.routeId === "generic_composer") {
          return {
            routeId: route.routeId,
            routeVersion: route.routeVersion,
            microSkillKey: skill,
            title: "Generic composer fallback",
            route,
            status: "policy",
            compilerReady: false,
            released: false,
            activationEnabled: true,
            releaseId: null,
            profileSourceHash: null,
            activationRevisionId: null,
            releasedBy: null,
            releasedAt: null,
            rollbackContentId: null,
            blockers: [],
            activationBlockers: [],
            words: [],
            releaseContentPreview: [],
            reviewedCandidateIds: [],
            compilerWitnesses: {},
            compiledPreview: null,
            preflightFingerprint: "",
            issues: [],
          };
        }
        const released = profile
          ? Boolean(currentProfile)
          : Boolean(contentRelease);
        if (!profile && !released)
          blockers.push("No active reviewed lesson release is available");
        const launchable = Boolean(
          (profile || releasePackage) &&
          candidates.length &&
          blockers.length === 0 &&
          compilerReady,
        );
        const status: LessonReadinessRow["status"] = launchable
          ? "ready_to_launch"
          : unreviewed.length && !released
            ? "needs_review"
            : released && blockers.length === 0
              ? "released"
              : "blocked";
        return {
          routeId: route.routeId,
          routeVersion: route.routeVersion,
          microSkillKey: skill,
          title: skill.replaceAll("_", " "),
          route,
          status,
          compilerReady,
          released,
          activationEnabled: Boolean(activationEnabled),
          releaseId: profile?.id ?? contentRelease?.id ?? null,
          profileSourceHash:
            profile?.source_row_hash ??
            contentRelease?.release_manifest_sha256 ??
            null,
          activationRevisionId: revision?.id ?? null,
          releasePackage,
          rollbackContentId:
            typeof profile?.source_metadata?.contentVersionId === "string"
              ? profile.source_metadata.contentVersionId
              : (publicationRows.find(
                  (pub) =>
                    pub.route_profile_id === contentRelease?.id &&
                    !rolledBack.has(pub.content_version_id),
                )?.content_version_id ?? null),
          releasedBy:
            contentRelease?.published_by ?? profile?.reviewed_by ?? null,
          releasedAt:
            contentRelease?.published_at ?? profile?.reviewed_at ?? null,
          blockers,
          activationBlockers,
          words: entries,
          releaseContentPreview,
          reviewedCandidateIds: candidates.map((row) => row.id),
          compilerWitnesses,
          compiledPreview,
          preflightFingerprint: fingerprintSnapshotValue({
            route: route.routeId,
            skill,
            profile: profile?.id ?? contentRelease?.id ?? null,
            candidates: candidates.map((row) => ({
              id: row.id,
              content: row.content,
              dictionary: currentFingerprints.get(
                String(row.canonical_word_id),
              ),
            })),
            activation: revision?.id ?? Boolean(activationEnabled),
            package: releasePackage?.packageSha256 ?? null,
            witnesses: compilerWitnesses,
          }),
          issues: [
            ...entries.flatMap((entry) =>
              entry.blockers.map((message) => ({
                code: message.includes("compiler-valid selection")
                  ? "COMPILER_MEMBER_UNREACHABLE"
                  : "WORD_FACTS_INVALID",
                message,
                category: "word" as const,
                wordId: entry.id,
                editHref: `${entry.editHref.split("#")[0]}#${runtimeBlockerTarget(message, skill)}`,
              })),
            ),
            ...blockers.map((message) => ({
              code: "LESSON_PREFLIGHT_BLOCKED",
              message,
              category: "lesson" as const,
              editHref: `/admin/adle-lesson-readiness?route=${route.routeId}&skill=${skill}`,
            })),
            ...activationBlockers.map((message) => ({
              code: "ROUTE_ACTIVATION_REQUIRED",
              message,
              category: "activation" as const,
              editHref: "/admin/teaching-dictionary/routes",
            })),
          ],
        };
      });
    }),
  );
  return output;
}
