/* Reviewed package schemas are guarded by their owning regressions/importers. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";

import {
  selectDynamicAffixWordLab,
  type DynamicAffixProfile,
  type DynamicAffixSelection,
  type DynamicAffixWord,
} from "../../lib/adle/morphology/affix-word-lab";

function parts(value: any[]) {
  return value.map((part) => ({
    id: part.id,
    role: part.kind,
    text: part.surfaceText,
    sourceText: part.sourceText,
    gloss: part.gloss,
    start: part.displayRange.start,
    end: part.displayRange.end,
  }));
}

function joins(value: any[]) {
  return value.map((join) => ({
    afterPartId: join.afterPartId,
    beforePartId: join.beforePartId,
    joinType: join.joinType,
  }));
}

export function loadReviewedAffixPackageFixture(
  packagePath: string,
  authenticWordIndex = 0,
): { profile: DynamicAffixProfile; words: DynamicAffixWord[]; selection: DynamicAffixSelection } {
  const reviewed = JSON.parse(readFileSync(packagePath, "utf8"));
  const words: DynamicAffixWord[] = reviewed.words.map((word: any) => {
    const teachingParts = parts(word.teaching.parts);
    const suffixPart = teachingParts.find((part) => part.role === "suffix")!;
    return {
      canonicalWordId: word.word,
      displayWord: word.word,
      audioText: word.dictation.audioText,
      semanticBaseText: word.semanticBaseText,
      semanticBaseKind: word.semanticBaseKind,
      teachingBaseText: teachingParts.filter((part) => part.role !== "suffix").map((part) => part.text).join(""),
      baseMeaning: word.baseMeaning,
      derivedMeaning: word.newWordMeaning,
      effect: word.meaningBinKey,
      affixVariant: word.suffixVariant,
      affixMeaning: suffixPart.gloss,
      parts: teachingParts,
      joins: joins(word.teaching.joins),
      splitPoints: [suffixPart.start],
      dictationSentence: word.dictation.sentence,
      dictationTargetTokenIndex: word.dictation.targetTokenIndex,
      trueMorphology: {
        parts: parts(word.trueMorphology.parts),
        joins: joins(word.trueMorphology.joins),
        transformations: word.trueMorphology.transformations,
        notes: word.trueMorphology.notes,
        provenance: word.trueMorphology.provenance,
      },
      approvedTransfer: true,
    };
  });
  const profile: DynamicAffixProfile = {
    microSkillKey: reviewed.profile.microSkillKey,
    position: "after",
    productionEnabled: true,
    affixLabel: reviewed.profile.suffixLabel,
    affixText: reviewed.profile.suffixText,
    affixMeaning: reviewed.profile.suffixMeaning,
    meaningBins: reviewed.profile.meaningBins,
    includeMeaningSort: reviewed.profile.includeMeaningSort,
    wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])),
    transferCanonicalWordIds: words.map((word) => word.canonicalWordId),
    choices: reviewed.profile.suffixChoices,
    reflection: reviewed.profile.reflection,
    introduction: reviewed.profile.introContent,
  };
  const authenticWord = words[authenticWordIndex];
  if (!authenticWord) throw new Error(`No authentic fixture word at index ${authenticWordIndex}: ${packagePath}`);
  const selection = selectDynamicAffixWordLab({
    profiles: [profile],
    learningItems: [{
      learningItemId: `shared-fixture:${profile.microSkillKey}:${authenticWord.canonicalWordId}`,
      childId: "shared-affix-fixture-child",
      canonicalWordId: authenticWord.canonicalWordId,
      microSkillKey: profile.microSkillKey,
      itemStatus: "pending",
      sourceKind: "verified_misspelling",
      sourceRef: "shared-affix-reviewed-fixture",
      sourceAttemptText: null,
      reteachPriority: false,
      ejectedOn: null,
      intakeOn: "2026-08-01",
      rowStatus: "active",
    }],
  });
  if (!selection) throw new Error(`Reviewed affix package did not select: ${packagePath}`);
  return { profile, words, selection };
}
