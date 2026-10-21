import type { LessonReflectionContextRecap, NormalizedLessonReflectionMistake, NormalizedLessonReflectionSentenceComparison } from "../lesson-reflection";
import type { WeakVowelLessonV1 } from "./lesson";
import type { WeakVowelProgressV1 } from "./progress";
import { correctVowelTile } from "../word-lab/family-tree-detective";
import { dinnerAnswerTarget } from "../word-lab/call-it-to-dinner";

type GuidedRow = { canonicalWordId: string; [key: string]: unknown };

function guidedRows(response: Record<string, unknown> | null): Map<string, GuidedRow> {
  const rows = response?.words;
  if (!Array.isArray(rows)) return new Map();
  return new Map(rows.filter((row): row is GuidedRow => Boolean(row) && typeof row === "object" && typeof row.canonicalWordId === "string")
    .map((row) => [row.canonicalWordId, row]));
}

function sameSentence(left: string, right: string): boolean {
  return left.trim().replace(/\s+/g, " ") === right.trim().replace(/\s+/g, " ");
}

/** Presentation only. No review item is projected as independent spelling evidence. */
export function weakVowelReflectionReview(lesson: WeakVowelLessonV1, progress: WeakVowelProgressV1): {
  mistakes: NormalizedLessonReflectionMistake[];
  sentenceComparisons: NormalizedLessonReflectionSentenceComparison[];
  contextRecap: LessonReflectionContextRecap | undefined;
} {
  const dinner = guidedRows(progress.dinnerResponse);
  const detective = guidedRows(progress.detectiveResponse);
  const mistakes: NormalizedLessonReflectionMistake[] = [];
  const sentenceComparisons: NormalizedLessonReflectionSentenceComparison[] = [];
  const items: { id: string; text: string }[] = [];

  for (const word of lesson.words) {
    const id = word.canonicalWordId;
    const coverAttempt = progress.coverAttempts[id];
    if (coverAttempt !== undefined && coverAttempt.trim().toLocaleLowerCase("en-GB") !== word.spelling.toLocaleLowerCase("en-GB")) {
      mistakes.push({ id: `cover:${id}`, attempt: coverAttempt, correctSpelling: word.spelling });
    }
    const sentenceAttempt = progress.dictationAttempts[id];
    if (sentenceAttempt !== undefined && !sameSentence(sentenceAttempt, word.dictation.sentence)) {
      sentenceComparisons.push({ id: `dictation:${id}`, attempt: sentenceAttempt, correct: word.dictation.sentence });
    }

    const dinnerResult = dinner.get(id);
    if (dinnerResult) {
      const cutMisses = typeof dinnerResult.cutMisses === "number" ? dinnerResult.cutMisses : 0;
      const targetMisses = typeof dinnerResult.targetMisses === "number" ? dinnerResult.targetMisses : 0;
      const revealed = dinnerResult.answerRevealed === true;
      if (cutMisses > 0 || targetMisses > 0 || revealed) {
        const reminders = [cutMisses > 0 ? "syllable cuts" : null, targetMisses > 0 || revealed ? `quiet spelling ${dinnerAnswerTarget(word.dinner).text}` : null].filter(Boolean).join(" and ");
        items.push({ id: `dinner:${id}`, text: `Call It to Dinner · ${word.spelling}: revisit the ${reminders}.${revealed ? " The answer was shown during the activity." : ""}` });
      }
    }

    const detectiveResult = detective.get(id);
    if (detectiveResult && (detectiveResult.initialCorrect === false || detectiveResult.finalCorrect === false)) {
      const first = detectiveResult.initialCorrect === false ? `first choice ${String(detectiveResult.initialChoice ?? "none")}` : null;
      const final = detectiveResult.finalCorrect === false ? `later choice ${String(detectiveResult.finalChoice ?? "none")}` : null;
      items.push({ id: `detective:${id}`, text: `Vowel Detective · ${word.spelling}: revisit ${[first, final].filter(Boolean).join(" and ")}. The reviewed missing vowel letter is ${correctVowelTile(word.detective)}.` });
    }
  }

  return {
    mistakes,
    sentenceComparisons,
    contextRecap: items.length ? {
      heading: "Guided discoveries to revisit",
      introduction: "These clues help you practise. They are separate from Memory Lock and Dictation spelling attempts.",
      items,
    } : undefined,
  };
}
