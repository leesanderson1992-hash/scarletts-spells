/* eslint-disable @typescript-eslint/no-explicit-any -- native package projections are validated before publication */
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import {
  ingWordBlockers,
  type IngDictionaryWordV1,
} from "@/lib/adle/ing/contracts";
import {
  adjectiveFamilyBlockers,
  type AdjectiveFamilyV1,
} from "@/lib/adle/inflection/contracts";
import {
  HOMOPHONE_LESSONS,
  validateHomophoneLesson,
  type HomophonePassage,
} from "@/lib/adle/homophone/lesson";
import type { WordDraftPayload, RouteContentDraft } from "./contracts";

export type GovernedCandidate = {
  id: string;
  canonicalWordId: string;
  route: RouteContentDraft;
  dictionary: WordDraftPayload;
  reviewedBy: string;
};
export type NativePackage = {
  schemaVersion: 1;
  activation: "inactive";
  manifest: any;
  authorities: any[];
  packageSha256: string;
};
export function buildGovernedPackage(input: {
  routeId: string;
  manifest: any;
  authorities: any[];
  candidates: GovernedCandidate[];
}): { package: NativePackage | null; blockers: string[] } {
  if (
    ![
      "ing_endings_word_lab",
      "comparative_superlative_word_lab",
      "homophone_word_lab",
    ].includes(input.routeId)
  )
    return { package: null, blockers: [] };
  if (!input.manifest || !input.authorities.length)
    return {
      package: null,
      blockers: ["The current complete route package is unavailable"],
    };
  const manifest = structuredClone(input.manifest);
  const authorities = input.authorities.map((authority) => ({
    authorityType: authority.authority_type,
    authorityKey: authority.authority_key,
    schemaVersion: authority.schema_version,
    semanticProjection: structuredClone(authority.semantic_projection),
    semanticFingerprint: authority.semantic_fingerprint,
  }));
  authorities.sort((a, b) =>
    input.routeId === "homophone_word_lab"
      ? HOMOPHONE_LESSONS.findIndex(
          (lesson) =>
            lesson.microSkillKey === a.semanticProjection.microSkillKey,
        ) -
        HOMOPHONE_LESSONS.findIndex(
          (lesson) =>
            lesson.microSkillKey === b.semanticProjection.microSkillKey,
        )
      : `${a.semanticProjection.microSkillKey}:${a.authorityType}`.localeCompare(
          `${b.semanticProjection.microSkillKey}:${b.authorityType}`,
        ),
  );
  const blockers: string[] = [];
  const groupEdits = new Map<string, string>();
  for (const candidate of input.candidates) {
    const facts = candidate.route.content;
    const authority = authorities.find(
      (a) =>
        a.semanticProjection.microSkillKey === candidate.route.microSkillKey &&
        a.authorityType ===
          (input.routeId === "ing_endings_word_lab"
            ? "ing_word_members"
            : input.routeId === "homophone_word_lab"
              ? "homophone_lesson_content"
              : "adjective_degree_families"),
    );
    if (!authority) {
      blockers.push("The edited micro-skill has no reviewed group authority");
      continue;
    }
    const source = authority.semanticProjection;
    const groupKey =
      input.routeId === "homophone_word_lab"
        ? candidate.route.microSkillKey
        : `${candidate.route.microSkillKey}:${facts.familyKey ?? ""}`;
    const edit =
      input.routeId === "homophone_word_lab"
        ? facts.dictationPassageVariants
        : input.routeId === "comparative_superlative_word_lab"
          ? facts.pairedSentenceVariants
          : undefined;
    if (edit) {
      const fingerprint = fingerprintSnapshotValue(edit);
      if (groupEdits.has(groupKey) && groupEdits.get(groupKey) !== fingerprint)
        blockers.push(
          "Conflicting paired passage edits: review one consistent group version",
        );
      groupEdits.set(groupKey, fingerprint);
    }

    if (input.routeId === "ing_endings_word_lab") {
      const previous = source.words.find(
        (word: any) => word.canonicalWordId === candidate.canonicalWordId,
      );
      const word: IngDictionaryWordV1 = {
        ...previous,
        ...facts,
        canonicalWordId: candidate.canonicalWordId,
        microSkillKey: candidate.route.microSkillKey,
        word: candidate.dictionary.displayWord,
        meaning: candidate.route.wordMeaning,
        dictationSentence: candidate.dictionary.dictationSentence,
        audioText: candidate.dictionary.dictationSentence,
        sourceRefs: Array.isArray(facts.sourceRefs)
          ? facts.sourceRefs
          : previous?.sourceRefs,
        rowStatus: "active",
        reviewStatus: "approved_for_first_exposure",
        reviewerRef: candidate.reviewedBy,
        approvalRef: candidate.id,
      };
      const errors = ingWordBlockers(word);
      if (errors.length) {
        blockers.push(...errors.map((error) => `${word.word}: ${error}`));
        continue;
      }
      source.words = [
        ...source.words.filter(
          (entry: any) => entry.canonicalWordId !== candidate.canonicalWordId,
        ),
        word,
      ];
      source.dictationSets = {
        ...source.dictationSets,
        [candidate.canonicalWordId]: candidate.dictionary.dictationVariants ?? [
          {
            id: "primary",
            sentence: word.dictationSentence,
            targetTokenIndex: candidate.dictionary.dictationTargetTokenIndex,
            audioText: word.audioText,
          },
        ],
      };
      const closure = authorities.find(
        (a) =>
          a.authorityType === "teaching_dictionary_closure" &&
          a.semanticProjection.microSkillKey === candidate.route.microSkillKey,
      );
      if (closure)
        closure.semanticProjection.words = source.words.map((entry: any) => ({
          canonicalWordId: entry.canonicalWordId,
          word: entry.word,
          sentence: entry.dictationSentence,
          audioText: entry.audioText,
        }));
    } else if (input.routeId === "comparative_superlative_word_lab") {
      const family = source.families.find(
        (entry: any) =>
          entry.familyKey === facts.familyKey ||
          entry.words.some(
            (word: any) => word.canonicalWordId === candidate.canonicalWordId,
          ),
      );
      if (!family) {
        blockers.push("This word needs a reviewed three-word adjective family");
        continue;
      }
      if (Array.isArray(facts.pairedSentenceVariants))
        family.content.pairedSentenceVariants = facts.pairedSentenceVariants;
      if (facts.groupFamily && typeof facts.groupFamily === "object")
        Object.assign(family, facts.groupFamily);
      const errors = adjectiveFamilyBlockers(family as AdjectiveFamilyV1);
      if (errors.length)
        blockers.push(
          ...errors.map((error) => `${family.familyKey}: ${error}`),
        );
      const closure = authorities.find(
        (a) =>
          a.authorityType === "teaching_dictionary_closure" &&
          a.semanticProjection.microSkillKey === candidate.route.microSkillKey,
      );
      if (closure) {
        closure.semanticProjection.words = source.families.flatMap(
          (entry: any) => entry.words,
        );
        closure.semanticProjection.pairedSentences = source.families.map(
          (entry: any) => entry.content.pairedSentence,
        );
      }
    } else {
      if (
        !source.canonicalWords.some(
          (word: any) => word.canonicalWordId === candidate.canonicalWordId,
        )
      ) {
        blockers.push("This word is outside the reviewed homophone group");
        continue;
      }
      if (Array.isArray(facts.dictationPassageVariants)) {
        const variants = facts.dictationPassageVariants as {
          id: string;
          passages: HomophonePassage[];
        }[];
        if (
          !variants.length ||
          new Set(variants.map((variant) => variant.id)).size !==
            variants.length
        )
          blockers.push("Paired passage sets need unique identities");
        for (const variant of variants)
          blockers.push(
            ...validateHomophoneLesson({
              ...source.lesson,
              dictationPassages: variant.passages,
            }).map((error) => `${variant.id}: ${error}`),
          );
        source.dictationPassageVariants = variants;
      }
    }
  }
  if (blockers.length) return { package: null, blockers };
  const suffix = fingerprintSnapshotValue({
    candidates: input.candidates.map((candidate) => candidate.id),
    authorities: authorities.map((a) => a.semanticProjection),
  }).slice(0, 16);
  const approvalRefs = [
    ...new Set([
      ...(manifest.approvalRefs ?? []),
      ...input.candidates.map((candidate) => `admin-review:${candidate.id}`),
    ]),
  ].sort();
  const oldKeys = new Map<string, string>();
  for (const authority of authorities) {
    const old = authority.authorityKey;
    authority.authorityKey = `${old}:admin:${suffix}`;
    oldKeys.set(`${authority.authorityType}:${old}`, authority.authorityKey);
    authority.semanticFingerprint = fingerprintSnapshotValue(
      authority.semanticProjection,
    );
  }
  for (const skill of manifest.microSkills ?? [])
    for (const dependency of skill.dependencies ?? []) {
      const key = oldKeys.get(
        `${dependency.authorityType}:${dependency.authorityKey}`,
      );
      const authority = authorities.find(
        (a) =>
          a.authorityKey === key &&
          a.authorityType === dependency.authorityType,
      );
      if (!authority) {
        blockers.push("The route package dependency set is incomplete");
        continue;
      }
      dependency.authorityKey = authority.authorityKey;
      dependency.semanticFingerprint = authority.semanticFingerprint;
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
    blockers,
  };
}
