import type { LessonWordSlot } from "../composer-word-selection";
import { fingerprintSnapshotValue } from "../composable-lesson/canonical-fingerprint";
import { DINNER_ROUND_VERSION, type DinnerSelectionWord } from "../word-lab/call-it-to-dinner";
import { DETECTIVE_ROUND_VERSION, type DetectiveSelectionWord, type CurrentDetectiveFamilyAuthority, type DetectiveFamilyV1 } from "../word-lab/family-tree-detective";
import { weakVowelRouteBlockers, type WeakVowelRouteFactsV1 } from "../../teaching-dictionary-manager/weak-vowel-authoring";
import { prepareWeakVowelLesson, type WeakVowelContentBlocker } from "./prepare";
import type { WeakVowelLessonV1, WeakVowelMicroSkill } from "./lesson";

/** A database publication joined to its immutable staged route version and
 * current shared facts. The caller must load current assignment authority for
 * the selected child separately; a publication never assigns a word. */
export interface PublishedWeakVowelWord {
  contentVersionId: string;
  canonicalWordId: string;
  microSkillKey: WeakVowelMicroSkill;
  spelling: string;
  sourceFingerprint: string;
  contentSha256AtPublication: string;
  dictionaryFingerprintAtReview: string;
  currentDictionaryFingerprint: string;
  wordAudioSha256AtPublication: string;
  sentenceAudioSha256AtPublication: string;
  definition: string;
  sentence: string;
  routeContent: {
    routeId: "weak_vowel_word_lab";
    routeVersion: "v1";
    microSkillKey: string;
    wordMeaning: string;
    content: { weakVowel: WeakVowelRouteFactsV1 };
  };
}

/** The content-pool gate, shared by intake, selection and admin projections.
 * Trigger membership and approved word–skill membership are separate gates. */
export function publishedWeakVowelWordBlockers(row: PublishedWeakVowelWord, skill: WeakVowelMicroSkill): string[] {
  const facts = row.routeContent.content.weakVowel;
  const blockers = weakVowelRouteBlockers(facts, { displayWord: row.spelling,
    dictationSentence: row.sentence, definition: row.definition, microSkillKey: skill });
  if (!row.contentVersionId || row.dictionaryFingerprintAtReview !== row.currentDictionaryFingerprint ||
    row.sourceFingerprint !== facts.sourceFingerprint || row.routeContent.routeId !== "weak_vowel_word_lab" ||
    !/^[a-f0-9]{64}$/.test(row.contentSha256AtPublication) ||
    row.routeContent.routeVersion !== "v1" || row.routeContent.microSkillKey !== skill ||
    row.wordAudioSha256AtPublication !== facts.wordRecording?.sha256 ||
    row.sentenceAudioSha256AtPublication !== facts.sentenceRecording?.sha256 ||
    row.routeContent.wordMeaning !== row.definition)
    blockers.push("published_content_or_dictionary_source_changed");
  return [...new Set(blockers)];
}

/** No fallback to a different word or an older content version is allowed. */
export function prepareLessonFromPublishedWeakVowelWords(input: {
  assignmentKey: string;
  microSkillKey: WeakVowelMicroSkill;
  slots: readonly LessonWordSlot[];
  currentAssignedPairs: readonly { canonicalWordId: string; microSkillKey: string; assignmentStatus: "assigned" | "deassigned" }[];
  published: readonly PublishedWeakVowelWord[];
  currentFamilyAuthorities: readonly CurrentDetectiveFamilyAuthority[];
  publishedFamilies?: readonly { canonicalWordId: string; family: DetectiveFamilyV1 }[];
}): { lesson: WeakVowelLessonV1 | null; blockers: WeakVowelContentBlocker[] } {
  const blockers: WeakVowelContentBlocker[] = [];
  const selected: PublishedWeakVowelWord[] = [];
  for (const slot of input.slots) {
    const id = slot.canonicalWordId;
    const pairs = input.currentAssignedPairs.filter((row) => row.canonicalWordId === id && row.microSkillKey === input.microSkillKey);
    if (pairs.length !== 1 || pairs[0].assignmentStatus !== "assigned") {
      blockers.push({ canonicalWordId: id, reason: "word_skill_pair_not_currently_assigned" });
      continue;
    }
    const versions = input.published.filter((row) => row.canonicalWordId === id && row.microSkillKey === input.microSkillKey);
    if (versions.length !== 1) {
      blockers.push({ canonicalWordId: id, reason: versions.length ? "published_content_version_ambiguous" : "required_route_content_unpublished" });
      continue;
    }
    const row = versions[0];
    const factBlockers = publishedWeakVowelWordBlockers(row, input.microSkillKey);
    if (factBlockers.length) {
      blockers.push(...factBlockers
        .map((reason) => ({ canonicalWordId: id, reason })));
      continue;
    }
    selected.push(row);
  }
  if (blockers.length) return { lesson: null, blockers };
  const contentVersion = `weak_vowel_selected_v1:${fingerprintSnapshotValue({
    microSkillKey: input.microSkillKey,
    selected: selected.map((row) => ({ contentVersionId: row.contentVersionId,
      sourceFingerprint: row.sourceFingerprint, contentSha256AtPublication: row.contentSha256AtPublication,
      definition: row.definition, sentence: row.sentence,
      routeContent: row.routeContent })),
  })}`;
  const currentAssignments: Array<DinnerSelectionWord & DetectiveSelectionWord> = selected.map((row) => ({
    canonicalWordId: row.canonicalWordId, spelling: row.spelling, microSkillKey: row.microSkillKey,
    wordSense: row.routeContent.content.weakVowel.wordSense, assignmentStatus: "assigned",
    sourceFingerprint: row.sourceFingerprint,
    pronunciationId: row.routeContent.content.weakVowel.pronunciationId,
    recordingSha256: row.routeContent.content.weakVowel.wordRecording.sha256,
  }));
  const dinner = selected.map((row) => {
    const facts = row.routeContent.content.weakVowel;
    return {
      schemaVersion: DINNER_ROUND_VERSION, contentVersion: row.contentVersionId, reviewStatus: "approved" as const,
      canonicalWordId: row.canonicalWordId, spelling: row.spelling, microSkillKey: row.microSkillKey,
      wordSense: facts.wordSense, pronunciationId: facts.pronunciationId,
      sourceFingerprint: row.sourceFingerprint, recording: { ...facts.wordRecording, reviewStatus: "approved" as const },
      spokenSyllableCount: facts.spokenSyllableCount, acceptedCutSets: facts.acceptedCutSets,
      target: facts.target,
      ...(["D4_SCHWA_FINAL_AR_FINAL", "D4_SCHWA_FINAL_ER_FINAL", "D4_SCHWA_FINAL_ET", "D4_SCHWA_FINAL_OR_FINAL"]
        .includes(row.microSkillKey) ? { selectionTarget: facts.selectionTarget } : {}),
    };
  });
  const detective = selected.map((row) => {
    const facts = row.routeContent.content.weakVowel;
    const matchingFamilies = input.publishedFamilies?.filter((entry) =>
      entry.canonicalWordId === row.canonicalWordId && entry.family.authorityId === facts.familyAuthorityId) ?? [];
    if (matchingFamilies.length > 1) blockers.push({ canonicalWordId: row.canonicalWordId, reason: "ambiguous_approved_family" });
    return {
      schemaVersion: DETECTIVE_ROUND_VERSION, contentVersion: row.contentVersionId, reviewStatus: "approved" as const,
      canonicalWordId: row.canonicalWordId, spelling: row.spelling, microSkillKey: row.microSkillKey,
      wordSense: facts.wordSense, pronunciationId: facts.pronunciationId,
      sourceFingerprint: row.sourceFingerprint, recording: { ...facts.wordRecording, reviewStatus: "approved" as const },
      target: { text: facts.target.text, start: facts.target.start, end: facts.target.end,
        soundType: facts.target.soundType }, reviewedVowelIndex: facts.detectiveVowelIndex,
      family: facts.familyDecision === "approve" && matchingFamilies.length === 1 ? matchingFamilies[0].family : null,
    };
  });
  if (blockers.length) return { lesson: null, blockers };
  return prepareWeakVowelLesson({
    assignmentKey: input.assignmentKey, contentVersion,
    microSkillKey: input.microSkillKey, slots: input.slots, currentDinnerAssignments: currentAssignments,
    currentDetectiveAssignments: currentAssignments, publishedDinnerAnnotations: dinner,
    publishedDetectiveAnnotations: detective, currentFamilyAuthorities: input.currentFamilyAuthorities,
    publishedSentences: selected.map((row) => {
      const facts = row.routeContent.content.weakVowel;
      return { canonicalWordId: row.canonicalWordId, microSkillKey: row.microSkillKey,
        sourceFingerprint: row.sourceFingerprint, sentence: row.sentence,
        targetStart: facts.sentenceTarget.start, targetEnd: facts.sentenceTarget.end,
        recording: { ...facts.sentenceRecording, reviewStatus: "approved" as const } };
    }),
    currentDefinitions: selected.map((row) => ({ canonicalWordId: row.canonicalWordId, spelling: row.spelling,
      wordSense: row.routeContent.content.weakVowel.wordSense, text: row.definition,
      sourceFingerprint: row.sourceFingerprint, reviewStatus: "approved" as const })),
    publishedContentHashes: new Map(selected.map((row) => [row.canonicalWordId, row.contentSha256AtPublication])),
  });
}
