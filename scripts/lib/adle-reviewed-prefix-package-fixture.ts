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
const UN_RELEASE = "docs/implementation/seed-data/teaching-dictionary/releases/2026-08-02-dynamic-prefix-un-profile-v1/manifest.json";

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
  const migratedFixtures = Object.entries(reviewed.profiles).map(([microSkillKey, rawProfile]: [string, any]) => {
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
  const unRelease = JSON.parse(readFileSync(UN_RELEASE, "utf8"));
  const dictations = new Map<string, { sentence: string; targetTokenIndex: number }>([
    ["unhappy", { sentence: "The lost child felt unhappy and began to cry.", targetTokenIndex: 4 }],
    ["unfair", { sentence: "It was unfair when one child had three turns and another had none.", targetTokenIndex: 2 }],
    ["unkind", { sentence: "It is unkind to leave someone out.", targetTokenIndex: 2 }],
    ["unlock", { sentence: "Please unlock the door with the silver key.", targetTokenIndex: 1 }],
    ["untidy", { sentence: "The untidy desk needed sorting.", targetTokenIndex: 1 }],
    ["unnatural", { sentence: "A building is unnatural.", targetTokenIndex: 3 }],
    ["unnecessary", { sentence: "Having a tantrum is unnecessary.", targetTokenIndex: 4 }],
  ]);
  const unWords: DynamicPrefixWord[] = unRelease.members.map((member: any) => {
    const dictation = dictations.get(member.displayWord);
    if (!dictation) throw new Error(`Missing approved un- dictation fixture: ${member.displayWord}`);
    return {
      canonicalWordId: member.wordKey,
      displayWord: member.displayWord,
      audioText: dictation.sentence,
      baseWord: member.baseWord,
      teachingBuildText: member.baseWord,
      baseMeaning: member.baseMeaning,
      derivedMeaning: member.childFriendlyMeaning,
      effect: member.meaningBinKey,
      parts: [
        { id: "prefix", text: "un", sourceText: "un", role: "prefix", gloss: member.meaningBinKey === "reverse" ? "reverse" : "not", start: 0, end: 2 },
        { id: "base", text: member.baseWord, sourceText: member.baseWord, role: "base", start: 2, end: member.displayWord.length },
      ],
      joins: [{ afterPartId: "prefix", beforePartId: "base", joinType: "none" }],
      splitPoints: [2],
      dictationSentence: dictation.sentence,
      dictationTargetTokenIndex: dictation.targetTokenIndex,
      prefixText: "un",
      prefixLabel: "un-",
      prefixMeaning: member.meaningBinKey === "reverse" ? "reverse" : "not",
      approvedTransfer: true,
    };
  });
  const unProfile: DynamicPrefixProfile = {
    microSkillKey: unRelease.profile.microSkillKey,
    productionEnabled: true,
    prefixLabel: unRelease.profile.prefixLabel,
    prefixText: unRelease.profile.prefixText,
    prefixMeaning: unRelease.profile.prefixMeaning,
    meaningBins: unRelease.profile.meaningBins,
    wordsByCanonicalId: new Map(unWords.map((word) => [word.canonicalWordId, word])),
    transferCanonicalWordIds: unWords.map((word) => word.canonicalWordId),
    prefixChoices: unRelease.profile.prefixChoices,
    reflection: {
      promptKey: unRelease.profile.reflectionPromptKey,
      promptText: unRelease.profile.reflectionPromptText,
    },
  };
  return [{ profile: unProfile, words: unWords }, ...migratedFixtures];
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
