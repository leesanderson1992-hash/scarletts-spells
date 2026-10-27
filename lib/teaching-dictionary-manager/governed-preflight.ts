/* eslint-disable @typescript-eslint/no-explicit-any -- native release projections are validated by their route compilers */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LearningItemFact } from "@/lib/adle/learning-items";
import {
  selectIngWords,
  compileIngLesson,
  validateIngLesson,
} from "@/lib/adle/ing/lesson";
import {
  ingWordBlockers,
  type IngDictionaryWordV1,
  type IngMicroSkill,
} from "@/lib/adle/ing/contracts";
import { selectDegreeFamilies } from "@/lib/adle/inflection/selection";
import {
  compileComparativeLesson,
  validateComparativeLesson,
} from "@/lib/adle/inflection/lesson";
import type {
  AdjectiveFamilyV1,
  ComparativeMicroSkill,
} from "@/lib/adle/inflection/contracts";
import { selectHomophonePassageVariant } from "@/lib/adle/homophone/passage-variants";
import {
  compileHomophoneLessonSnapshot,
  validateHomophoneLessonSnapshot,
} from "@/lib/adle/homophone/lesson";
import { compileHomophoneSnapshotV3 } from "@/lib/adle/homophone/snapshot";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { loadCompoundWordV2Authority } from "@/lib/adle/morphology/compound-word-v2-loader";
import { recipeFromTeachingAuthority } from "@/lib/adle/morphology/compound-word-release-loader";
import { compileCompoundWordLessonV2 } from "@/lib/adle/morphology/compound-word-lesson-v2";
import type { CompoundWordMicroSkillKey } from "@/lib/adle/morphology/compound-word-structure-v2";
import type { ActivatedBaseWordReleaseAuthority } from "@/lib/adle/curriculum-release-activation";
import { validateCompoundWordStructureV2 } from "@/lib/adle/morphology/compound-word-structure-v2";
import { dictationVariantBlockers } from "./authoring";
import { applyIngDictationVariants } from "@/lib/adle/ing/reviewed-dictation";
import { selectBaseWordFamilyLesson } from "@/lib/adle/base-word-family-selection";
import {
  baseWordFamilyMemberAuthenticTargetEligible,
  baseWordFamilyMemberSelectionRole,
} from "@/lib/adle/curriculum-release-activation";
import {
  indexedEligibleBaseFamilyCounts,
  shortlistBaseFamilyPairs,
  unpairableBaseFamilyBlockers,
} from "@/lib/adle/base-word-family-counts";
import { loadBaseWordFamilyLessonReadModel } from "@/lib/adle/loaders/base-word-family-lesson-read-model";
import { compileBaseWordFamilyLessonSnapshot } from "@/lib/adle/morphology/base-word-family-payload";
import { compilerCoverage } from "./compiler-coverage";
import { compileConvergenceAssignment, validateFrozenConvergenceAssignment } from "@/lib/adle/homophone/convergence-assignment";
import { validateContextualChoiceContent, type ContextualChoiceContent } from "@/lib/adle/homophone/contextual-choice-contract";
import { weakVowelTeaching, type WeakVowelMicroSkill } from "@/lib/adle/weak-vowel/lesson";

export const PREFLIGHT_CHILD = "00000000-0000-4000-8000-000000000001";
type BasePreflightMember = {
  canonicalWordId: string;
  memberRole: string;
  assignmentEligible: boolean;
  lessonContentEligible: boolean;
  authenticSelectionEligible: boolean;
};

/** Historical v1 base/transfer roles supply teaching context but are not
 * promises that the word can independently trigger a lesson. */
export function requiredBaseWordPreflightTargets(
  schemaVersion: 1 | 2,
  members: readonly BasePreflightMember[],
): string[] {
  return [...new Set(members.filter((member) =>
    member.assignmentEligible && member.lessonContentEligible &&
    member.authenticSelectionEligible &&
    (schemaVersion === 2 || member.memberRole === "authentic_target"),
  ).map((member) => member.canonicalWordId))];
}

export function preflightItems(
  skill: string,
  ids: readonly string[],
): LearningItemFact[] {
  return ids.map((id, index) => ({
    learningItemId: `preflight:${id}`,
    childId: PREFLIGHT_CHILD,
    canonicalWordId: id,
    microSkillKey: skill,
    itemStatus: "pending",
    sourceKind: "verified_misspelling",
    sourceRef: `preflight:${id}`,
    sourceAttemptText: null,
    reteachPriority: false,
    ejectedOn: null,
    intakeOn: `2026-01-${String(index + 1).padStart(2, "0")}`,
    rowStatus: "active",
  }));
}
export type GovernedPreflight = {
  ready: boolean;
  blockers: string[];
  preview: unknown;
  witnesses: Record<string, string[]>;
};
async function preflightGovernedReleaseCore(input: {
  db: SupabaseClient;
  routeId: string;
  skill: string;
  release: any;
  revision: any;
  authorities: {
    id: string;
    authority_type: string;
    semantic_projection: any;
    semantic_fingerprint?: string;
    source_bindings?: any[];
  }[];
  environment: "local" | "staging" | "production" | null;
  currentContextualContent?: ContextualChoiceContent | null;
  currentContextualBlocker?: string;
}): Promise<GovernedPreflight> {
  const { db, routeId, skill, authorities } = input;
  const projection = (kind: string) =>
    authorities.find((a) => a.authority_type === kind)?.semantic_projection;
  const bad = (message: string): GovernedPreflight => ({
    ready: false,
    blockers: [message],
    preview: null,
    witnesses: {},
  });
  try {
    if (routeId === "homophone_contextual_choice") {
      const authority = authorities.filter((item) => item.authority_type === "homophone_contextual_content");
      if (authority.length !== 1) return bad("Reviewed contextual homophone authority is missing or ambiguous");
      const projection = authority[0].semantic_projection as {
        schemaVersion?: number; microSkillKey?: string; content?: ContextualChoiceContent;
      };
      if (projection.schemaVersion !== 1 || projection.microSkillKey !== skill ||
        !projection.content || projection.content.microSkillKey !== skill ||
        fingerprintSnapshotValue(projection) !== authority[0].semantic_fingerprint)
        return bad("Reviewed contextual homophone release content has changed");
      if (input.currentContextualContent === null)
        return bad(input.currentContextualBlocker ?? "Current approved contextual contrast set is unavailable");
      if (input.currentContextualContent &&
        fingerprintSnapshotValue(input.currentContextualContent) !== fingerprintSnapshotValue(projection.content))
        return bad("Current approved contextual contrast set differs from the release");
      validateContextualChoiceContent(projection.content);
      const witnesses: Record<string, string[]> = {};
      let preview: unknown = null;
      for (const set of projection.content.sets) {
        const selected = compileConvergenceAssignment({
          content: projection.content,
          queuedItems: [{ canonicalWordId: set.memberWordIds[0], intakeOn: "2026-01-01", status: "pending" }],
          masteredWordIds: new Set(), rotationIndex: 0,
        });
        if (!selected || !validateFrozenConvergenceAssignment(selected) ||
          !selected.selectedSetKeys.includes(set.setKey))
          return bad(`Reviewed contextual set ${set.setKey} cannot compile`);
        const ids = selected.contextCheck.selectedSets.flatMap((item) => item.members.map((member) => member.canonicalWordId));
        for (const id of ids) witnesses[id] = ids;
        preview ??= selected;
      }
      return { ready: true, blockers: [], preview, witnesses };
    }
    if (routeId === "weak_vowel_word_lab") {
      const authority = authorities.filter((item) => item.authority_type === "weak_vowel_lesson_content");
      if (authority.length !== 1) return bad("Reviewed weak-vowel teaching authority is missing or ambiguous");
      const projection = authority[0].semantic_projection as {
        schemaVersion?: number; microSkillKey?: string; teachingTemplate?: unknown; teachingTemplateSha256?: string;
      };
      const expected = weakVowelTeaching(skill as WeakVowelMicroSkill, []);
      const expectedHash = fingerprintSnapshotValue(expected);
      if (projection.schemaVersion !== 1 || projection.microSkillKey !== skill ||
        projection.teachingTemplateSha256 !== expectedHash ||
        fingerprintSnapshotValue(projection.teachingTemplate) !== expectedHash ||
        fingerprintSnapshotValue(projection) !== authority[0].semantic_fingerprint)
        return bad("Reviewed weak-vowel teaching template has changed");
      // Word publications and family evidence are checked for the child's
      // selected words by the native weak-vowel readiness loader.
      return { ready: true, blockers: [], preview: null, witnesses: {} };
    }
    if (routeId === "ing_endings_word_lab") {
      const words = projection("ing_word_members")?.words as
        IngDictionaryWordV1[] | undefined;
      if (!words?.length || words.some((word) => ingWordBlockers(word).length))
        return bad("Reviewed -ing members are missing or invalid");
      const member = projection("ing_word_members");
      const closure = projection("teaching_dictionary_closure");
      const teaching = projection("teaching_content");
      if (
        closure?.capability !== "single_ing_word_audio" ||
        fingerprintSnapshotValue(closure.words) !==
          fingerprintSnapshotValue(
            words.map((w) => ({
              canonicalWordId: w.canonicalWordId,
              word: w.word,
              sentence: w.dictationSentence,
              audioText: w.audioText,
            })),
          )
      )
        return bad("The -ing audio closure disagrees with the reviewed words");
      const varied = applyIngDictationVariants(
        words,
        member.dictationSets,
        `preflight:${skill}`,
        authorities.find((a) => a.authority_type === "ing_word_members")!
          .semantic_fingerprint!,
      );
      const coverage = compilerCoverage(
        words.map((w) => w.canonicalWordId),
        6,
        (set) => {
          const selected = selectIngWords(
            PREFLIGHT_CHILD,
            skill as IngMicroSkill,
            varied,
            preflightItems(skill, set),
          );
          if (!selected.ok) return null;
          const lesson = compileIngLesson(selected, `preflight:${skill}`);
          if (
            !teaching?.sharedPage ||
            !teaching.rulePage ||
            !teaching.reflectionPrompt
          )
            return null;
          lesson.teaching.pages = [teaching.sharedPage, teaching.rulePage];
          lesson.reflectionPrompt = teaching.reflectionPrompt;
          return validateIngLesson(lesson) &&
            set.every((id) =>
              lesson.words.some((word) => word.canonicalWordId === id),
            )
            ? lesson
            : null;
        },
      );
      return {
        ready: coverage.complete,
        blockers: coverage.complete
          ? []
          : [
              "Not every -ing member participates in a compiling six-word lesson",
            ],
        preview: coverage.previews[0] ?? null,
        witnesses: coverage.witnesses,
      };
    }
    if (routeId === "comparative_superlative_word_lab") {
      const families = projection("adjective_degree_families")?.families as
        AdjectiveFamilyV1[] | undefined;
      if (!families?.length)
        return bad("Reviewed adjective families are missing");
      const closure = projection("teaching_dictionary_closure");
      const teaching = projection("teaching_content");
      if (
        closure?.capability !== "paired_degree_word_audio" ||
        fingerprintSnapshotValue(closure.words) !==
          fingerprintSnapshotValue(families.flatMap((f) => f.words)) ||
        fingerprintSnapshotValue(closure.pairedSentences) !==
          fingerprintSnapshotValue(
            families.map((f) => f.content.pairedSentence),
          )
      )
        return bad(
          "The paired audio closure disagrees with the adjective families",
        );
      if (
        !teaching?.sharedPage ||
        !teaching.rulePage ||
        !teaching.reflectionPrompt
      )
        return bad("Reviewed adjective teaching content is missing");
      const witnesses: Record<string, string[]> = {};
      let preview: unknown = null;
      for (let a = 0; a < families.length; a++)
        for (let b = a + 1; b < families.length; b++) {
          const ids = [
            families[a].words[1].canonicalWordId,
            families[b].words[1].canonicalWordId,
          ];
          const selection = selectDegreeFamilies(
            PREFLIGHT_CHILD,
            skill as ComparativeMicroSkill,
            families,
            preflightItems(skill, ids),
          );
          if (!selection.ok) continue;
          const lesson = compileComparativeLesson(
            selection,
            `preflight:${skill}`,
          );
          lesson.teaching.pages = [
            teaching.sharedPage,
            {
              ...teaching.rulePage,
              examples: lesson.families.map((f) => ({
                text: f.words.map((w) => w.word).join(" → "),
                explanation: f.meaning,
              })),
            },
          ];
          lesson.reflectionPrompt = teaching.reflectionPrompt;
          if (!validateComparativeLesson(lesson)) continue;
          const selected = lesson.words.map((word) => word.canonicalWordId);
          selected.forEach((id) => (witnesses[id] = selected));
          preview ??= lesson;
        }
      const ready = families
        .flatMap((f) => f.words)
        .every((word) => witnesses[word.canonicalWordId]);
      return {
        ready,
        blockers: ready
          ? []
          : ["Each adjective family needs a compiling partner family"],
        preview,
        witnesses,
      };
    }
    if (routeId === "homophone_word_lab") {
      const content = projection("homophone_lesson_content");
      if (!content?.canonicalWords?.length)
        return bad("Reviewed homophone group is missing");
      let lesson = compileHomophoneLessonSnapshot(skill);
      if (
        validateHomophoneLessonSnapshot(lesson).length ||
        fingerprintSnapshotValue(lesson.lesson) !==
          fingerprintSnapshotValue(content.lesson)
      )
        return bad(
          "Homophone content differs from its reviewed runtime recipe",
        );
      lesson = selectHomophonePassageVariant(
        lesson,
        content.dictationPassageVariants,
        `preflight:${skill}`,
        authorities[0].semantic_fingerprint!,
      );
      const ids = content.canonicalWords.map((word: any) =>
        String(word.canonicalWordId),
      );
      const compiled = compileHomophoneSnapshotV3({
        lesson,
        bindings: content.canonicalWords.map((word: any, index: number) => ({
          ...word,
          learningItemId:
            index === 0 ? `preflight:${word.canonicalWordId}` : null,
        })),
        childId: PREFLIGHT_CHILD,
        parentUserId: PREFLIGHT_CHILD,
        date: "2026-01-01",
        release: {
          activationRevisionId: input.revision.id,
          releaseManifestId: input.release.id,
          releaseKey: input.release.release_key,
          releaseManifestSha256: input.release.release_manifest_sha256,
          dependencyFingerprint: input.release.dependency_fingerprint,
        },
        contentAuthorities: [
          {
            authorityType: "release_manifest",
            authorityId: input.release.id,
            version: "2",
            sourceHash: input.release.release_manifest_sha256,
          },
          {
            authorityType: "activation_revision",
            authorityId: input.revision.id,
            version: "2",
            sourceHash: fingerprintSnapshotValue(input.revision),
          },
          {
            authorityType: "dependency_set",
            authorityId: input.release.id,
            version: "2",
            sourceHash: input.release.dependency_fingerprint,
          },
          {
            authorityType: "teaching_content",
            authorityId: authorities[0].id,
            version: "1",
            sourceHash: authorities[0].semantic_fingerprint!,
          },
        ],
      });
      return {
        ready: true,
        blockers: [],
        preview: compiled.snapshot,
        witnesses: Object.fromEntries(ids.map((id: string) => [id, ids])),
      };
    }
    if (routeId === "compound_word_lab") {
      const structure = authorities.find(
        (a) => a.authority_type === "compound_structure",
      );
      const closure = authorities.find(
        (a) => a.authority_type === "teaching_dictionary_closure",
      );
      const recipe = recipeFromTeachingAuthority(
        skill as CompoundWordMicroSkillKey,
        projection("teaching_content"),
      );
      if (!structure || !closure || !recipe)
        return bad(
          "Compound structure, teaching content or dictionary closure is missing",
        );
      const content =
        structure.source_bindings || closure.source_bindings
          ? structuralCompoundProjection(structure, closure, skill)
          : await loadCompoundWordV2Authority(
              db,
              PREFLIGHT_CHILD,
              skill as CompoundWordMicroSkillKey,
              {
                structureAuthorityId: structure.id,
                dictionaryClosureAuthorityId: closure.id,
                reviewedAt: input.release.published_at,
              },
            );
      const ids = content.structures.map(
        (word: any) => word.wholeCanonicalWordId,
      );
      const coverage = compilerCoverage(ids, 4, (set) => {
        const lesson = compileCompoundWordLessonV2({
          recipe,
          structures: content.structures,
          dictationByCanonicalId: content.dictationByCanonicalId,
          learningItems: preflightItems(skill, set),
          selectionSeed: `preflight:${skill}`,
        });
        return lesson &&
          set.every((id) =>
            lesson.words.lesson.some(
              (word) => word.structure.wholeCanonicalWordId === id,
            ),
          )
          ? lesson
          : null;
      });
      return {
        ready: coverage.complete,
        blockers: coverage.complete
          ? []
          : [
              "Compound members or dictation do not make a complete four-word lesson",
            ],
        preview: coverage.previews[0] ?? null,
        witnesses: coverage.witnesses,
      };
    }
    if (routeId === "base_word_lab") {
      if (!input.environment) return bad("Route environment is not configured");
      const authority = await structuralBaseProjection(input);
      if (!authority)
        return bad(
          "Current Base Word family, teaching content and closure do not resolve together",
        );
      const familyCounts = indexedEligibleBaseFamilyCounts(authority);
      const familyPairs = shortlistBaseFamilyPairs(familyCounts);
      const families = authority.family.families.map((f) => ({
        baseFamilyKey: f.baseFamilyKey,
        microSkillKey: skill,
        rowStatus: "active" as const,
        reviewStatus: "approved_for_first_exposure" as const,
      }));
      const closure = new Set(
        authority.dictionaryWords.map((word) => word.canonicalWordId),
      );
      const members = authority.family.families.flatMap((f) =>
        f.members.map((member) => ({
          baseFamilyKey: f.baseFamilyKey,
          canonicalWordId: member.canonicalWordId,
          memberRole: baseWordFamilyMemberSelectionRole(
            authority.family,
            member,
          ),
          applicableMicroSkillKeys:
            authority.family.schemaVersion === 2 &&
            "applicableMicroSkillKeys" in member
              ? member.applicableMicroSkillKeys
              : [skill],
          authenticSelectionEligible: baseWordFamilyMemberAuthenticTargetEligible(
            authority.family,
            member,
            skill,
          ),
          lessonContentEligible: closure.has(member.canonicalWordId),
          assignmentEligible: member.assignmentEligible,
          complexityLevel: member.complexityLevel,
          rowStatus: "active" as const,
          reviewStatus: "approved_for_first_exposure" as const,
        })),
      );
      const witnesses: Record<string, string[]> = {};
      let preview: unknown = null;
      for (const target of members.filter(
        (m) => m.authenticSelectionEligible && m.assignmentEligible,
      ))
        for (const partner of members.filter(
          (m) =>
            m.baseFamilyKey !== target.baseFamilyKey &&
            m.authenticSelectionEligible &&
            m.assignmentEligible,
        )) {
          const items = preflightItems(skill, [
            target.canonicalWordId,
            partner.canonicalWordId,
          ]);
          const selected = selectBaseWordFamilyLesson(PREFLIGHT_CHILD, skill, {
            familyAuthoritySchemaVersion: authority.family.schemaVersion,
            learningItems: items,
            families,
            members,
            eligibleFamilyPairs: familyPairs,
          });
          if (selected.skipReasons.length) continue;
          const authenticTargets = selected.slots
            .filter((s) => s.assignmentRole === "primary_authentic_target")
            .map((slot) => ({
              canonicalWordId: slot.canonicalWordId,
              learningItemId: slot.learningItemId!,
              sourceRef: `preflight:${slot.canonicalWordId}`,
            }));
          const read = await loadBaseWordFamilyLessonReadModel(db, {
            microSkillKey: skill,
            contentVersion: authority.teachingContent.contentVersion,
            releaseAuthority: authority,
            authenticTargets,
            sections: selected.guidedFamilySections.map((s) => ({
              baseFamilyKey: s.baseFamilyKey,
              authenticTargetWordIds: [...s.authenticTargetWordIds],
              guidedWordIds: [...s.guidedWordIds],
            })),
            independentSlots: [...selected.slots],
            pilotLessonNumber: 1,
          });
          if (!read) continue;
          const payload = compileBaseWordFamilyLessonSnapshot(read);
          const ids = [
            ...new Set([
              ...payload.independentWords.map((word) => word.canonicalWordId),
              ...payload.familySections.flatMap((section) =>
                section.guidedWords.map((word) => word.canonicalWordId),
              ),
            ]),
          ];
          ids.forEach((id) => (witnesses[id] = ids));
          preview ??= payload;
          if (witnesses[target.canonicalWordId]) break;
        }
      // A v1 family can retain base and transfer members that are not
      // authentic targets. They remain reviewed teaching material, but a
      // singleton base or an unselected transfer must not veto an otherwise
      // compiling released route. V2 permits every applicable member to be
      // an authentic target, so it still requires full member coverage.
      const requiredTargets = requiredBaseWordPreflightTargets(authority.family.schemaVersion, members);
      const ready = requiredTargets.length >= 2 &&
        requiredTargets.every((id) => witnesses[id]);
      const unpairableFamilyBlockers = unpairableBaseFamilyBlockers(familyCounts, familyPairs);
      return {
        ready,
        blockers: ready
          ? []
          : [
              "Every eligible Base Word target needs a complete reviewed family selection",
              ...unpairableFamilyBlockers,
            ],
        preview,
        witnesses,
      };
    }
    return bad("No governed compiler adapter is registered");
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Native lesson preflight failed",
    );
  }
}

function structuralCompoundProjection(
  structure: any,
  closure: any,
  skill: string,
) {
  const structures = structure.semantic_projection.structures
    .filter((s: any) => s.microSkillKey === skill)
    .map((s: any) => {
      const parsed = validateCompoundWordStructureV2({
        ...s,
        schemaVersion: 2,
        wholeWord: s.displayForm,
        joins: s.joins.map((kind: any, index: number) =>
          typeof kind === "string" ? { ordinal: index + 1, kind } : kind,
        ),
        review: {
          status: "approved_for_first_exposure",
          reviewedBy: "reviewed-native-package",
          reviewedAt: "2026-01-01T00:00:00Z",
        },
        source: {
          artifact: "reviewed-native-package",
          sourceRowHash: fingerprintSnapshotValue(s),
          sheet: null,
          row: null,
        },
      });
      if (!parsed.ok)
        throw new Error(`Compound structure: ${parsed.blockers.join(", ")}`);
      return parsed.structure;
    });
  const dictationByCanonicalId = new Map<string, any>();
  for (const word of closure.semantic_projection.words) {
    const id = closure.source_bindings.find(
      (b: any) => b.wordKey === word.wordKey,
    )?.canonicalWordId;
    if (!word.dictation) continue;
    if (
      word.dictationVariants &&
      dictationVariantBlockers(word.displayWord, word.dictationVariants).length
    )
      throw new Error("Compound dictation variants invalid");
    dictationByCanonicalId.set(id, {
      canonicalWordId: id,
      sentence: word.dictation.sentence,
      audioText: word.dictation.audioText,
      targetSpan: {
        schemaVersion: 2,
        startTokenIndex: word.dictation.targetStart,
        endTokenIndexExclusive: word.dictation.targetEndExclusive,
        exactAnswer: word.dictation.exactGovernedAnswer,
      },
      review: {
        status: "approved_for_first_exposure",
        reviewedBy: "reviewed-native-package",
        reviewedAt: "2026-01-01T00:00:00Z",
      },
      source: {
        artifact: "reviewed-native-package",
        sourceRowHash: fingerprintSnapshotValue(word),
      },
    });
  }
  return { structures, dictationByCanonicalId };
}
async function structuralBaseProjection(
  input: Parameters<typeof preflightGovernedReleaseCore>[0],
): Promise<ActivatedBaseWordReleaseAuthority | null> {
  const family = input.authorities.find(
    (a) => a.authority_type === "family_membership",
  );
  const teaching = input.authorities.find(
    (a) => a.authority_type === "teaching_content",
  );
  const closure = input.authorities.find(
    (a) => a.authority_type === "teaching_dictionary_closure",
  );
  if (!family || !teaching || !closure) return null;
  let bindings = closure.source_bindings;
  if (!bindings) {
    const result = await input.db
      .from("adle_teaching_dictionary_closure_words")
      .select("canonical_word_id,word_key")
      .eq("authority_id", closure.id);
    if (result.error) throw new Error(result.error.message);
    bindings = (result.data ?? []).map((row) => ({
      canonicalWordId: row.canonical_word_id,
      wordKey: row.word_key,
    }));
  }
  const dictionaryWords = closure.semantic_projection.words.map((word: any) => {
    if (
      word.dictationVariants &&
      dictationVariantBlockers(word.displayWord, word.dictationVariants).length
    )
      throw new Error("Base Word dictation variants invalid");
    const canonicalWordId = bindings!.find(
      (b: any) => b.wordKey === word.wordKey,
    )?.canonicalWordId;
    if (!canonicalWordId) throw new Error("Base Word closure identity missing");
    return { ...word, canonicalWordId };
  });
  return {
    activationRevisionId: input.revision.id,
    environmentKey: input.environment!,
    microSkillKey: input.skill,
    releaseManifestId: input.release.id,
    releaseKey: input.release.release_key,
    releaseManifestSha256: input.release.release_manifest_sha256,
    dependencyFingerprint: input.release.dependency_fingerprint,
    familyAuthorityId: family.id,
    familyAuthorityFingerprint: family.semantic_fingerprint!,
    family: family.semantic_projection,
    teachingContentAuthorityId: teaching.id,
    teachingContentAuthorityFingerprint: teaching.semantic_fingerprint!,
    teachingContent: teaching.semantic_projection,
    dictionaryClosureAuthorityId: closure.id,
    dictionaryClosureAuthorityFingerprint: closure.semantic_fingerprint!,
    dictionaryWords,
  };
}

export async function preflightGovernedRelease(
  input: Parameters<typeof preflightGovernedReleaseCore>[0],
): Promise<GovernedPreflight> {
  const first = await preflightGovernedReleaseCore(input);
  if (!first.ready) return first;
  const checks: {
    kind: string;
    wordIndex: number;
    id: string;
    variant: any;
  }[] = [];
  const closure = input.authorities.find(
    (a) => a.authority_type === "teaching_dictionary_closure",
  );
  const ing = input.authorities.find(
    (a) => a.authority_type === "ing_word_members",
  );
  if (ing)
    for (const [id, variants] of Object.entries(
      ing.semantic_projection.dictationSets ?? {},
    ))
      for (const variant of variants as any[])
        checks.push({ kind: "ing", wordIndex: 0, id, variant });
  if (
    ["base_word_lab", "compound_word_lab"].includes(input.routeId) &&
    closure
  ) {
    if (!closure.source_bindings) {
      const rows = await input.db
        .from("adle_teaching_dictionary_closure_words")
        .select("canonical_word_id,word_key")
        .eq("authority_id", closure.id);
      if (rows.error)
        return { ...first, ready: false, blockers: [rows.error.message] };
      closure.source_bindings = (rows.data ?? []).map((row) => ({
        canonicalWordId: row.canonical_word_id,
        wordKey: row.word_key,
      }));
    }
    closure.semantic_projection.words.forEach(
      (word: any, wordIndex: number) => {
        for (const variant of word.dictationVariants ?? [])
          checks.push({
            kind: "closure",
            wordIndex,
            id: word.wordKey,
            variant,
          });
      },
    );
  }
  for (const check of checks) {
    const authorities = structuredClone(input.authorities);
    if (check.kind === "ing")
      authorities.find(
        (a) => a.authority_type === "ing_word_members",
      )!.semantic_projection.dictationSets[check.id] = [check.variant];
    else {
      const word = authorities.find(
        (a) => a.authority_type === "teaching_dictionary_closure",
      )!.semantic_projection.words[check.wordIndex];
      word.dictationVariants = [check.variant];
      if (input.routeId === "base_word_lab")
        Object.assign(word, {
          dictationSentence: check.variant.sentence,
          audioText: check.variant.audioText,
          dictationTargetTokenIndex: check.variant.targetTokenIndex,
        });
      else
        Object.assign(word.dictation, {
          sentence: check.variant.sentence,
          audioText: check.variant.audioText,
          targetStart: check.variant.targetTokenIndex,
          targetEndExclusive:
            check.variant.targetTokenIndex +
            word.displayWord.split(/\s+/u).length,
        });
    }
    const next = await preflightGovernedReleaseCore({ ...input, authorities });
    if (!next.ready)
      return {
        ...first,
        ready: false,
        blockers: [
          `Dictation variant ${check.variant.id} for ${check.id} fails the lesson compiler`,
          ...next.blockers,
        ],
      };
  }
  return first;
}
