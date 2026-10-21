import "server-only";

import release from "@/content/secret-life-of-vowels/dictation-approved.json";
import { publishedDinnerRounds } from "../word-lab/dinner-published-content";
import { publishedDetectiveRounds } from "../word-lab/detective-published-content";
import { prepareWeakVowelLesson, type WeakVowelSentenceAuthority } from "./prepare";

export function publishedWeakVowelSentences(): WeakVowelSentenceAuthority[] {
  if (release.schemaVersion !== "weak_vowel_dictation_release_v1") throw new Error("Invalid weak-vowel dictation release");
  const sha = /^[a-f0-9]{64}$/;
  return (release.sentences as unknown[]).map((value) => {
    const row = value as WeakVowelSentenceAuthority;
    if (!row || typeof row !== "object" || !row.canonicalWordId || !row.microSkillKey ||
      !sha.test(row.sourceFingerprint) || !row.sentence || !Number.isInteger(row.targetStart) ||
      !Number.isInteger(row.targetEnd) || !row.recording?.src?.startsWith("/audio/") ||
      !sha.test(row.recording.sha256) || row.recording.reviewStatus !== "approved") {
      throw new Error("Weak-vowel dictation release contains an incomplete sentence");
    }
    return row;
  });
}

/** Assignment writers call this after the unchanged composer selects five slots. */
export function preparePublishedWeakVowelLesson(
  input: Omit<Parameters<typeof prepareWeakVowelLesson>[0], "publishedDinnerAnnotations" | "publishedDetectiveAnnotations" | "publishedSentences">,
) {
  return prepareWeakVowelLesson({ ...input, publishedDinnerAnnotations: publishedDinnerRounds(),
    publishedDetectiveAnnotations: publishedDetectiveRounds(), publishedSentences: publishedWeakVowelSentences() });
}
