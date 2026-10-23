import type { LessonWordSlot } from "../composer-word-selection";
import { prepareDinnerForComposerSlots } from "../word-lab/weak-vowel-dinner";
import { prepareDetectiveForComposerSlots } from "../word-lab/weak-vowel-detective";
import type { DinnerSelectionWord } from "../word-lab/call-it-to-dinner";
import type { CurrentDetectiveFamilyAuthority, DetectiveSelectionWord } from "../word-lab/family-tree-detective";
import { validateWeakVowelLesson, weakVowelTeaching, type WeakVowelLessonV1, type WeakVowelMicroSkill } from "./lesson";
import { WEAK_VOWEL_MAX_WORDS, WEAK_VOWEL_MIN_WORDS } from "./selection";

export interface WeakVowelSentenceAuthority {
  canonicalWordId: string;
  microSkillKey: string;
  sourceFingerprint: string;
  sentence: string;
  targetStart: number;
  targetEnd: number;
  recording: { src: string; sha256: string; reviewStatus: "approved" };
}

export interface WeakVowelContentBlocker { canonicalWordId: string; reason: string }
export interface WeakVowelDefinitionAuthority {
  canonicalWordId: string;
  spelling: string;
  wordSense: string | null;
  text: string;
  sourceFingerprint: string;
  reviewStatus: "approved";
}

/** Called after the existing composer has selected the skill and ordered four to six slots.
 * This function never fills a gap with a different word. */
export function prepareWeakVowelLesson(input: {
  assignmentKey: string;
  contentVersion: string;
  microSkillKey: WeakVowelMicroSkill;
  slots: readonly LessonWordSlot[];
  currentDinnerAssignments: readonly DinnerSelectionWord[];
  currentDetectiveAssignments: readonly DetectiveSelectionWord[];
  publishedDinnerAnnotations: readonly unknown[];
  publishedDetectiveAnnotations: readonly unknown[];
  currentFamilyAuthorities: readonly CurrentDetectiveFamilyAuthority[];
  publishedSentences: readonly WeakVowelSentenceAuthority[];
  currentDefinitions: readonly WeakVowelDefinitionAuthority[];
  publishedContentHashes?: ReadonlyMap<string, string>;
}): { lesson: WeakVowelLessonV1 | null; blockers: WeakVowelContentBlocker[] } {
  const blockers: WeakVowelContentBlocker[] = [];
  if (input.slots.length < WEAK_VOWEL_MIN_WORDS || input.slots.length > WEAK_VOWEL_MAX_WORDS ||
    new Set(input.slots.map((slot) => slot.canonicalWordId)).size !== input.slots.length) {
    return { lesson: null, blockers: [{ canonicalWordId: "*", reason: "four_to_six_distinct_composer_words_required" }] };
  }
  const dinner = prepareDinnerForComposerSlots({ microSkillKey: input.microSkillKey, slots: input.slots,
    currentAssignments: input.currentDinnerAssignments, publishedAnnotations: input.publishedDinnerAnnotations });
  const detective = prepareDetectiveForComposerSlots({ microSkillKey: input.microSkillKey, slots: input.slots,
    currentAssignments: input.currentDetectiveAssignments, publishedAnnotations: input.publishedDetectiveAnnotations,
    currentFamilyAuthorities: input.currentFamilyAuthorities });
  blockers.push(...dinner.blockers, ...detective.blockers);
  const dinnerById = new Map(dinner.config?.rounds.map((round) => [round.canonicalWordId, round]) ?? []);
  const detectiveById = new Map(detective.config?.rounds.map((round) => [round.canonicalWordId, round]) ?? []);
  const words = input.slots.flatMap((slot) => {
    const id = slot.canonicalWordId;
    const dinnerRound = dinnerById.get(id);
    const detectiveRound = detectiveById.get(id);
    const sentences = input.publishedSentences.filter((row) => row.canonicalWordId === id && row.microSkillKey === input.microSkillKey);
    const definitions = input.currentDefinitions.filter((row) => row.canonicalWordId === id && row.spelling === dinnerRound?.spelling && row.wordSense === dinnerRound?.wordSense);
    if (definitions.length !== 1) blockers.push({ canonicalWordId: id, reason: definitions.length ? "ambiguous_word_definition" : "word_definition_not_approved" });
    const definition = definitions[0];
    if (sentences.length !== 1) blockers.push({ canonicalWordId: id, reason: sentences.length ? "ambiguous_dictation_content" : "dictation_content_not_approved" });
    const sentence = sentences[0];
    if (sentence && dinnerRound && (sentence.sourceFingerprint !== dinnerRound.sourceFingerprint ||
      sentence.recording.reviewStatus !== "approved")) blockers.push({ canonicalWordId: id, reason: "dictation_source_changed" });
    return dinnerRound && detectiveRound && sentence && definition ? [{ canonicalWordId: id, spelling: dinnerRound.spelling,
      // Stretch words are transfer practice here. This route creates no learning-item
      // intake, so the composer's provisional item key must not become persisted lineage.
      provenance: slot.provenance, learningItemId: slot.provenance === "stretch" ? null : slot.learningItemId,
      dinner: dinnerRound, detective: detectiveRound,
      definition: { text: definition.text, sourceFingerprint: definition.sourceFingerprint, reviewStatus: definition.reviewStatus },
      ...(input.publishedContentHashes?.get(id) ? { routeContentSha256: input.publishedContentHashes.get(id)! } : {}),
      dictation: { sentence: sentence.sentence, targetStart: sentence.targetStart, targetEnd: sentence.targetEnd, recording: sentence.recording } }] : [];
  });
  if (blockers.length) return { lesson: null, blockers };
  const lesson: WeakVowelLessonV1 = {
    schemaVersion: 1, routeKey: "weak_vowel_word_lab", contentVersion: input.contentVersion,
    assignmentKey: input.assignmentKey, authority: "governed_release", microSkillKey: input.microSkillKey,
    words, teaching: weakVowelTeaching(input.microSkillKey, words),
    reflectionPrompt: "Which quiet vowel spelling or verified family clue will help you remember these words?",
  };
  return validateWeakVowelLesson(lesson) ? { lesson: JSON.parse(JSON.stringify(lesson)) as WeakVowelLessonV1, blockers: [] }
    : { lesson: null, blockers: [{ canonicalWordId: "*", reason: "weak_vowel_snapshot_invalid" }] };
}
