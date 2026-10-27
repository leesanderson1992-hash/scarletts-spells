/* eslint-disable @typescript-eslint/no-explicit-any -- exact native manifest projections are checked by route compilers and publishers */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildReviewedBaseFamilyProjection } from "@/lib/adle/base-word-reviewed-family-release";
import { appendReviewedLexicalFamilies } from "@/lib/adle/lexical-base-family-release";
import { loadReviewedLexicalFamilies } from "@/lib/adle/lexical-base-family-loader";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { dictationVariants } from "./authoring";
import type { GovernedCandidate, NativePackage } from "./governed-package";

/** Whole words and their component identities belong to the frozen closure. */
export function compoundDictionaryWordIds(structures: readonly any[]): string[] {
  return [...new Set<string>(structures.flatMap(structure => [structure.wholeCanonicalWordId,
    ...(structure.components ?? []).map((component: any) => component.canonicalWordId)]))];
}

export async function buildStructuralPackage(input: {
  db: SupabaseClient;
  routeId: string;
  skill: string;
  environment: string | null;
  manifest: any;
  authorities: any[];
  candidates: GovernedCandidate[];
}): Promise<{ package: NativePackage | null; blockers: string[] }> {
  if (
    !["base_word_lab", "compound_word_lab"].includes(input.routeId) ||
    !input.candidates.length
  )
    return { package: null, blockers: [] };
  const read = async (query: PromiseLike<any>) => {
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
  };
  try {
    const manifest = structuredClone(input.manifest);
    // Release only this complete governed micro-skill group, preserving other route heads.
    manifest.microSkills = manifest.microSkills.filter(
      (entry: any) => entry.microSkillKey === input.skill,
    );
    const dependencies = manifest.microSkills[0]?.dependencies ?? [];
    const authorities: any[] = input.authorities
      .filter((authority) =>
        dependencies.some(
          (dep: any) =>
            dep.authorityType === authority.authority_type &&
            dep.authorityKey === authority.authority_key,
        ),
      )
      .map((authority) => ({
        id: authority.id,
        authorityType: authority.authority_type,
        authorityKey: authority.authority_key,
        schemaVersion: authority.schema_version,
        semanticProjection: structuredClone(authority.semantic_projection),
        semanticFingerprint: authority.semantic_fingerprint,
        parentAuthorityId: authority.id,
        changed: authority.authority_type !== "teaching_content",
      }));
    const closure = authorities.find(
      (a) => a.authorityType === "teaching_dictionary_closure",
    );
    const structure = authorities.find(
      (a) =>
        a.authorityType ===
        (input.routeId === "base_word_lab"
          ? "family_membership"
          : "compound_structure"),
    );
    if (!closure || !structure || authorities.length !== 3)
      throw new Error(
        "Complete parent family/structure, teaching content and closure required",
      );
    if (input.routeId === "base_word_lab") {
      const [reviews, withdrawn, skillWithdrawn, definitions, legacy, levels] =
        await Promise.all([
          read(
            input.db
              .from("teaching_dictionary_base_family_member_reviews")
              .select("*")
              .eq("micro_skill_key", input.skill)
              .eq("environment_key", input.environment),
          ),
          read(
            input.db
              .from("teaching_dictionary_base_family_member_withdrawals")
              .select("review_id"),
          ),
          read(
            input.db
              .from("adle_reviewed_word_skill_withdrawals")
              .select("release_id"),
          ),
          read(
            input.db
              .from("teaching_dictionary_base_family_definitions")
              .select("*"),
          ),
          read(
            input.db
              .from("canonical_teaching_dictionary_base_word_families")
              .select("*")
              .eq("row_status", "active")
              .eq("review_status", "approved_for_first_exposure"),
          ),
          read(
            input.db
              .from("canonical_teaching_dictionary_word_banding")
              .select(
                "canonical_word_id,complexity_level,canonical_teaching_dictionary_banding_versions!inner(is_active)",
              )
              .eq("row_status", "active")
              .eq(
                "canonical_teaching_dictionary_banding_versions.is_active",
                true,
              ),
          ),
        ]);
      const source = (row: any) => ({
        id: row.id,
        familyKey: row.family_key ?? row.base_family_key,
        baseWordId: row.base_word_id,
        baseMeaning: row.base_meaning,
        etymologyRoute: row.etymology_route,
        sourceFingerprint: row.source_fingerprint ?? row.source_row_hash,
      });
      structure.semanticProjection = buildReviewedBaseFamilyProjection({
        parent: structure.semanticProjection,
        microSkillKey: input.skill,
        definitions: definitions.map(source),
        legacyFamilies: legacy.map(source),
        reviews: reviews.map((row: any) => ({
          id: row.id,
          definitionId: row.definition_id,
          legacyFamilyId: row.legacy_family_id,
          canonicalWordId: row.canonical_word_id,
          baseWordId: row.base_word_id,
          microSkillKey: row.micro_skill_key,
          wordSum: row.word_sum,
          morphologyParts: row.morphology_parts,
          morphologyJoins: row.morphology_joins,
          morphologyTransformations: row.morphology_transformations,
          transformationNotes: row.transformation_notes ?? "",
          childFriendlyMeaning: row.child_friendly_meaning,
          complexityLevel:
            levels.find(
              (level: any) => level.canonical_word_id === row.canonical_word_id,
            )?.complexity_level ?? null,
          sourceFingerprint: row.source_fingerprint,
          reviewedAt: row.reviewed_at,
          withdrawn: withdrawn.some((w: any) => w.review_id === row.id),
          skillReleaseWithdrawn: skillWithdrawn.some(
            (w: any) => w.release_id === row.word_skill_release_id,
          ),
        })),
      });
      if (input.environment && ["local", "staging", "production"].includes(input.environment)) {
        const lexical = await loadReviewedLexicalFamilies({
          db: input.db, candidateWordIds: input.candidates.map((candidate) => candidate.canonicalWordId),
          microSkillKey: input.skill, environment: input.environment as "local" | "staging" | "production",
        });
        structure.semanticProjection = appendReviewedLexicalFamilies({
          parent: structure.semanticProjection, microSkillKey: input.skill,
          environment: input.environment as "local" | "staging" | "production", families: lexical,
        });
      }
      for (const candidate of input.candidates) {
        const member = structure.semanticProjection.families
          .flatMap((family: any) => family.members)
          .find(
            (word: any) => word.canonicalWordId === candidate.canonicalWordId,
          );
        if (!member)
          throw new Error(
            `${candidate.dictionary.displayWord}: join and review a Base Word family first`,
          );
        if (
          fingerprintSnapshotValue(member.morphologyParts) !==
            fingerprintSnapshotValue(
              candidate.dictionary.canonicalMorphology.parts,
            ) ||
          member.wordSum !== candidate.dictionary.canonicalMorphology.wordSum
        )
          throw new Error(
            `${candidate.dictionary.displayWord}: refresh the family review to match the saved word parts`,
          );
      }
    } else {
      for (const candidate of input.candidates) {
        const facts = candidate.route.content;
        const prior = structure.semanticProjection.structures.find(
          (word: any) =>
            word.wholeCanonicalWordId === candidate.canonicalWordId,
        );
        const next = {
          ...prior,
          ...facts,
          wholeCanonicalWordId: candidate.canonicalWordId,
          wholeWordKey: prior?.wholeWordKey,
          displayForm: candidate.dictionary.displayWord,
          microSkillKey: input.skill,
          childFriendlyMeaning: candidate.route.wordMeaning,
          assignmentEligible: true,
          transferEligible: prior?.transferEligible ?? true,
          approvalRef: `admin-review:${candidate.id}`,
        };
        if (!next.wholeWordKey) {
          const rows = await read(
            input.db
              .from("canonical_teaching_dictionary_words")
              .select("word_key")
              .eq("id", candidate.canonicalWordId),
          );
          next.wholeWordKey = rows[0]?.word_key;
        }
        structure.semanticProjection.structures = [
          ...structure.semanticProjection.structures.filter(
            (word: any) =>
              word.wholeCanonicalWordId !== candidate.canonicalWordId,
          ),
          next,
        ];
      }
    }
    const ids: string[] =
      input.routeId === "base_word_lab"
        ? [
            ...new Set<string>(
              structure.semanticProjection.families.flatMap((family: any) =>
                family.members
                  .filter((word: any) => word.assignmentEligible)
                  .map((word: any) => word.canonicalWordId),
              ),
            ),
          ]
        : compoundDictionaryWordIds(structure.semanticProjection.structures);
    const rows = await read(
      input.db
        .from("canonical_teaching_dictionary_words")
        .select("id,word_key,normalised_word,display_word,dialect_code")
        .in("id", ids),
    );
    const oldRows = await read(
      input.db
        .from("adle_teaching_dictionary_closure_words")
        .select("canonical_word_id,word_key")
        .eq("authority_id", closure.id),
    );
    const idByKey = new Map(
      oldRows.map((row: any) => [row.word_key, row.canonical_word_id]),
    );
    const wordById = new Map<string, any>(
      rows.map((row: any) => [row.id, row]),
    );
    const oldById = new Map<string, any>(
      closure.semanticProjection.words.map((word: any) => [
        idByKey.get(word.wordKey),
        word,
      ]),
    );
    const candidates = new Map(
      input.candidates.map((candidate) => [
        candidate.canonicalWordId,
        candidate,
      ]),
    );
    const supportIds = ids.filter((id) => !candidates.has(id) && !oldById.has(id));
    const supportRows = supportIds.length ? await read(input.db
      .from("canonical_teaching_dictionary_dictation_sentences")
      .select("canonical_word_id,dictation_sentence,dictation_target_token_index,audio_text,dictation_variants")
      .in("canonical_word_id", supportIds).eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure")) : [];
    const supportById = new Map<string, any>(supportRows.map((row: any) => [row.canonical_word_id, row]));
    if (supportIds.some((id) => !supportById.has(id)))
      throw new Error("A structural base needs approved dictionary dictation before release");
    closure.sourceBindings = ids.map((canonicalWordId) => ({
      canonicalWordId,
      wordKey: wordById.get(canonicalWordId)?.word_key,
    }));
    closure.semanticProjection.words = ids
      .map((id) => {
        const prior = oldById.get(id);
        const candidate = candidates.get(id);
        const row = wordById.get(id);
        if (!row)
          throw new Error("A lesson word has no canonical dictionary identity");
        if (!candidate && !prior) {
          const support = supportById.get(id);
          const variants = Array.isArray(support.dictation_variants) && support.dictation_variants.length
            ? support.dictation_variants : [{ id: "primary", sentence: support.dictation_sentence,
              targetTokenIndex: support.dictation_target_token_index,
              audioText: support.audio_text || support.dictation_sentence }];
          const identity = { wordKey: row.word_key, normalisedWord: row.normalised_word,
            displayWord: row.display_word, dialectCode: row.dialect_code };
          const pool = { dictationVariants: variants, dictationSetFingerprint: fingerprintSnapshotValue(variants) };
          return closure.schemaVersion === 1
            ? { ...identity, dictationSentence: support.dictation_sentence,
              dictationTargetTokenIndex: support.dictation_target_token_index,
              audioText: support.audio_text || support.dictation_sentence, ...pool }
            : { ...identity, dictation: { sentence: support.dictation_sentence,
              audioText: support.audio_text || support.dictation_sentence,
              targetStart: support.dictation_target_token_index,
              targetEndExclusive: support.dictation_target_token_index + row.display_word.trim().split(/\s+/u).length,
              exactGovernedAnswer: row.display_word }, ...pool };
        }
        if (!candidate) return prior;
        const variants = dictationVariants(candidate.dictionary);
        const identity = {
          wordKey: row.word_key,
          normalisedWord: row.normalised_word,
          displayWord: candidate.dictionary.displayWord,
          dialectCode: row.dialect_code,
        };
        const pool = {
          dictationVariants: variants,
          dictationSetFingerprint: fingerprintSnapshotValue(variants),
        };
        return closure.schemaVersion === 1
          ? {
              ...identity,
              dictationSentence: candidate.dictionary.dictationSentence,
              dictationTargetTokenIndex:
                candidate.dictionary.dictationTargetTokenIndex,
              audioText: candidate.dictionary.dictationSentence,
              ...pool,
            }
          : {
              ...identity,
              dictation: {
                sentence: candidate.dictionary.dictationSentence,
                audioText: candidate.dictionary.dictationSentence,
                targetStart: candidate.dictionary.dictationTargetTokenIndex,
                targetEndExclusive:
                  candidate.dictionary.dictationTargetTokenIndex +
                  candidate.dictionary.displayWord.trim().split(/\s+/u).length,
                exactGovernedAnswer: candidate.dictionary.displayWord,
              },
              ...pool,
            };
      })
      .sort((a: any, b: any) => a.wordKey.localeCompare(b.wordKey));
    const suffix = fingerprintSnapshotValue({
      candidates: input.candidates.map((c) => c.id),
      authorities: authorities.map((a) => a.semanticProjection),
    }).slice(0, 16);
    const approvalRefs = [
      ...new Set<string>([
        ...(manifest.approvalRefs ?? []),
        ...input.candidates.map((candidate) => `admin-review:${candidate.id}`),
      ]),
    ].sort();
    for (const authority of authorities) {
      const dep = dependencies.find(
        (d: any) =>
          d.authorityType === authority.authorityType &&
          d.authorityKey === authority.authorityKey,
      );
      if (!dep) throw new Error("Lesson dependency missing");
      if (authority.changed) {
        authority.authorityKey = `${authority.authorityKey}:admin:${suffix}`;
        authority.semanticFingerprint = fingerprintSnapshotValue(
          authority.semanticProjection,
        );
      }
      dep.authorityKey = authority.authorityKey;
      dep.semanticFingerprint = authority.semanticFingerprint;
      authority.manifest = {
        ...authority.semanticProjection,
        authorityKey: authority.authorityKey,
        approvalRefs,
      };
    }
    manifest.releaseKey = `${manifest.releaseKey}:admin:${suffix}`;
    manifest.approvalRefs = approvalRefs;
    const value = {
      schemaVersion: 1 as const,
      activation: "inactive" as const,
      manifest,
      authorities,
    };
    return {
      package: { ...value, packageSha256: fingerprintSnapshotValue(value) },
      blockers: [],
    };
  } catch (error) {
    return {
      package: null,
      blockers: [
        error instanceof Error
          ? error.message
          : "Structural group package is incomplete",
      ],
    };
  }
}
