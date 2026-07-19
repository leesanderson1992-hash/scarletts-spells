import {
  compileBaseWordFamilyLessonSnapshot,
  type BaseWordFamilyLessonReadModel,
  type BaseWordFamilySnapshotWord,
} from "./base-word-family-payload";

function word(
  canonicalWordId: string,
  displayWord: string,
  wordSum: string,
  sentence: string,
  tokenIndex: number,
): BaseWordFamilySnapshotWord {
  const parts = wordSum.split(" → ")[0].split(" + ").map((surfaceText, index) => ({
    id: `${canonicalWordId}:part:${index + 1}`,
    kind: surfaceText === "play" || surfaceText === "govern" ? "base" : index === 0 ? "prefix" : "suffix",
    sourceText: surfaceText,
    surfaceText,
  }));
  return {
    canonicalWordId,
    displayWord,
    wordSum,
    parts,
    joins: parts.slice(1).map((part, index) => ({ afterPartId: parts[index].id, beforePartId: part.id, joinType: "none" })),
    transformationNotes: `Keep the familiar base spelling when building ${displayWord}.`,
    childFriendlyMeaning: displayWord === "play" ? "to have fun in a game" : displayWord === "replay" ? "to play again" : displayWord === "replayed" ? "played again" : displayWord === "playing" ? "having fun in a game now" : displayWord === "plays" ? "has fun in a game" : displayWord === "govern" ? "to lead or rule" : displayWord === "governor" ? "a person who governs" : "the group that rules a country",
    dictationSentence: sentence,
    dictationTargetTokenIndex: tokenIndex,
    audioText: sentence,
  };
}

/** Reviewed-content-shaped fixture only. It is never imported or assigned. */
export const BASE_WORD_FAMILY_PREVIEW_READ_MODEL: BaseWordFamilyLessonReadModel = {
  microSkillKey: "D4_MOR_BASE_WORDS_PRESERVE_BASE",
  contentVersion: "base-word-two-family-interactive-preview-v2",
  authenticTargets: [
    { canonicalWordId: "replayed_en_gb", learningItemId: "preview-authentic-replayed", sourceRef: "preview:authentic-writing:replayed" },
    { canonicalWordId: "government_en_gb", learningItemId: "preview-authentic-government", sourceRef: "preview:authentic-writing:government" },
  ],
  familySections: [
    {
      baseFamilyKey: "play_base_family",
      baseWord: word("play_en_gb", "play", "play", "We play outside.", 1),
      baseMeaning: "to take part in a game or have fun",
      etymologyRoute: { relation_type: "free_base", child_facing_meaning: "to take part in a game or have fun" },
      authenticTargetWordIds: ["replayed_en_gb"],
      guidedWords: [
        word("play_en_gb", "play", "play", "We play outside.", 1),
        word("replay_en_gb", "replay", "re + play → replay", "Can we replay that song?", 2),
        word("replayed_en_gb", "replayed", "re + play + ed → replayed", "We replayed the song.", 1),
        word("playing_en_gb", "playing", "play + ing → playing", "They are playing well.", 2),
        word("plays_en_gb", "plays", "play + s → plays", "Sam plays at lunch.", 1),
      ],
    },
    {
      baseFamilyKey: "govern_base_family",
      baseWord: word("govern_en_gb", "govern", "govern", "Leaders govern fairly.", 1),
      baseMeaning: "to lead or rule a country",
      etymologyRoute: { relation_type: "etymological_root", child_facing_meaning: "to lead or rule a country" },
      authenticTargetWordIds: ["government_en_gb"],
      guidedWords: [
        word("govern_en_gb", "govern", "govern", "Leaders govern fairly.", 1),
        word("governor_en_gb", "governor", "govern + or → governor", "I am going to vote for our new governor.", 8),
        word("government_en_gb", "government", "govern + ment → government", "The government made a plan.", 1),
      ],
    },
  ],
  independentSlots: [
    { canonicalWordId: "replayed_en_gb", provenance: "authentic_target", baseFamilyKey: "play_base_family", learningItemId: "preview-authentic-replayed" },
    { canonicalWordId: "government_en_gb", provenance: "authentic_target", baseFamilyKey: "govern_base_family", learningItemId: "preview-authentic-government" },
    { canonicalWordId: "play_en_gb", provenance: "transfer", baseFamilyKey: "play_base_family", learningItemId: null },
    { canonicalWordId: "replay_en_gb", provenance: "transfer", baseFamilyKey: "play_base_family", learningItemId: null },
    { canonicalWordId: "govern_en_gb", provenance: "transfer", baseFamilyKey: "govern_base_family", learningItemId: null },
    { canonicalWordId: "governor_en_gb", provenance: "transfer", baseFamilyKey: "govern_base_family", learningItemId: null },
  ],
  pilotLessonNumber: 1,
};

export const BASE_WORD_FAMILY_PREVIEW_PAYLOAD = compileBaseWordFamilyLessonSnapshot(
  BASE_WORD_FAMILY_PREVIEW_READ_MODEL,
);
