/* Reviewed package schemas are guarded by their owning proof regression. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";

import {
  selectDynamicPrefixWordLab,
  type DynamicPrefixProfile,
  type DynamicPrefixSelection,
  type DynamicPrefixWord,
} from "../../lib/adle/morphology/dynamic-prefix-word-lab";

const ROOT = "docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-22-d4-dynamic-prefix-staging-enrichment";

function correction(name: string) {
  return JSON.parse(readFileSync(`${ROOT}/${name}`, "utf8")).profile;
}

export function loadReviewedPrefixPackageFixtures(): Array<{
  profile: DynamicPrefixProfile;
  words: DynamicPrefixWord[];
}> {
  const reviewed = JSON.parse(readFileSync(`${ROOT}/reviewed-staging-package.json`, "utf8"));
  const corrections = new Map<string, any>([
    ["D4_MOR_PREFIXES_RE_PRE", correction("re-pre-staging-correction-package.json")],
    ["D4_MOR_PREFIXES_SUB_INTER_SUPER", correction("sub-inter-super-child-feedback-correction-package.json")],
  ]);
  return Object.entries(reviewed.profiles).map(([microSkillKey, rawProfile]: [string, any]) => {
    const words: DynamicPrefixWord[] = reviewed.words
      .filter((word: any) => word.microSkillKey === microSkillKey)
      .map((word: any) => ({
        canonicalWordId: word.wordKey,
        displayWord: word.word,
        audioText: word.dictation.audioText,
        baseWord: word.teaching.baseOrRoot,
        teachingBuildText: word.teaching.splitParts.filter((part: any) => part.kind !== "prefix").map((part: any) => part.surfaceText).join(""),
        baseMeaning: word.teaching.baseMeaning,
        derivedMeaning: word.teaching.childFriendlyMeaning,
        effect: word.teaching.meaningBin,
        parts: word.teaching.splitParts.map((part: any) => ({ id: part.id, text: part.surfaceText, sourceText: part.sourceText, role: part.kind, gloss: part.gloss || undefined, start: part.displayRange.start, end: part.displayRange.end })),
        joins: word.teaching.splitJoins.map((join: any) => ({ afterPartId: join.afterPartId, beforePartId: join.beforePartId, joinType: join.joinType })),
        splitPoints: [word.teaching.cleaverBoundary],
        dictationSentence: word.dictation.sentence,
        dictationTargetTokenIndex: word.dictation.targetTokenIndex,
        prefixText: word.teaching.prefixVariant,
        prefixLabel: `${word.teaching.prefixVariant}-`,
        prefixMeaning: word.teaching.splitParts.find((part: any) => part.kind === "prefix")?.gloss,
        approvedTransfer: true,
      }));
    const reviewedCorrection = corrections.get(microSkillKey);
    const profile: DynamicPrefixProfile = {
      microSkillKey,
      productionEnabled: true,
      prefixLabel: rawProfile.label,
      prefixText: rawProfile.text,
      prefixMeaning: rawProfile.meaning,
      meaningBins: reviewedCorrection?.meaningBins ?? rawProfile.bins.map(([id, label, description]: string[]) => ({ id, label, description })),
      wordsByCanonicalId: new Map(words.map((word) => [word.canonicalWordId, word])),
      transferCanonicalWordIds: words.map((word) => word.canonicalWordId),
      prefixChoices: [...rawProfile.choices, ""].map((text: string) => ({ text, label: text ? `${text}-` : "no prefix", outcome: null, meaning: null, status: "target" as const })),
      reflection: { promptKey: `shared-fixture:${microSkillKey}`, promptText: rawProfile.reflection },
      introduction: reviewedCorrection?.introContent,
    };
    return { profile, words };
  });
}

export function selectReviewedPrefixFixture(
  profile: DynamicPrefixProfile,
  word: DynamicPrefixWord,
): DynamicPrefixSelection {
  const selection = selectDynamicPrefixWordLab({
    profiles: [profile],
    learningItems: [{
      learningItemId: `shared-fixture:${profile.microSkillKey}:${word.canonicalWordId}`,
      childId: "shared-affix-fixture-child",
      canonicalWordId: word.canonicalWordId,
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
  if (!selection) throw new Error(`Reviewed Prefix fixture did not select: ${profile.microSkillKey}:${word.canonicalWordId}`);
  return selection;
}
