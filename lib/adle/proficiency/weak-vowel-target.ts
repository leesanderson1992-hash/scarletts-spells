import { extractCanonicalSentenceTarget } from "../sentence-dictation-contract";
import { isExactGovernedFormCorrect } from "../session-correctness";

type DictationAttempt = {
  canonical_word_id: string | null;
  section_key: string;
  attempt_kind: string;
  attempt_text: string | null;
  is_correct: boolean | null;
  source_ref: string;
};

/** Keep the original sentence immutable; diagnose only its frozen target word. */
export function weakVowelDictationTarget(attempt: DictationAttempt, assignment: {
  status: string;
  compiled_lesson_snapshot: unknown;
} | null | undefined): string | null {
  if (!assignment || assignment.status !== "completed" || !attempt.canonical_word_id
    || attempt.section_key !== "lesson_dictation" || attempt.attempt_kind !== "lesson_dictation"
    || typeof attempt.attempt_text !== "string" || attempt.is_correct === null
    || !attempt.source_ref.endsWith(`:dictation:${attempt.canonical_word_id}`)) return null;
  const snapshot = assignment.compiled_lesson_snapshot as {
    route?: { routeId?: string };
    payload?: { resolvedLesson?: { words?: Array<{ canonicalWordId: string; spelling: string;
      dictation: { sentence: string; targetStart: number } }> } };
  };
  if (snapshot?.route?.routeId !== "weak_vowel_word_lab") return null;
  const word = snapshot.payload?.resolvedLesson?.words?.find(row => row.canonicalWordId === attempt.canonical_word_id);
  if (!word || typeof word.spelling !== "string" || typeof word.dictation?.sentence !== "string"
    || !Number.isInteger(word.dictation.targetStart) || word.dictation.targetStart < 0
    || !word.dictation.sentence.slice(word.dictation.targetStart).toLocaleLowerCase("en-GB")
      .startsWith(word.spelling.toLocaleLowerCase("en-GB"))) return null;
  const index = (word.dictation.sentence.slice(0, word.dictation.targetStart)
    .match(/[\p{L}]+(?:['’ʼ-][\p{L}]+)*/gu) ?? []).length;
  const target = extractCanonicalSentenceTarget(attempt.attempt_text, { kind: "token", tokenIndex: index });
  return isExactGovernedFormCorrect(target, word.spelling) === attempt.is_correct ? target : null;
}
