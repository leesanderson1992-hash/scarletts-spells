import type { IngDictionaryWordV1 } from "@/lib/adle/ing/contracts";
import type { WordRouteStatus } from "./word-route-status";

type IngReviewCandidate = {
  wordId: string;
  displayWord: string;
  status: Pick<WordRouteStatus, "blockerDetails">;
  familyMeaningReview?: string;
  overviewCandidate?: { issues: { message: string }[] };
  generatedIng?: { issues: { message: string }[] };
};

export const ING_REVIEW_BATCH_SIZE = 100;

export function ingReviewExportRows(update: {
  current: IngDictionaryWordV1[];
  reviewWords: IngReviewCandidate[];
}) {
  const activeById = new Map(update.current.map(word => [word.canonicalWordId, word]));
  return update.reviewWords.flatMap(candidate => {
    const active = activeById.get(candidate.wordId);
    const wordIssues = candidate.status.blockerDetails.filter(({ code }) =>
      code === "DICTIONARY_NOT_APPROVED" || code === "RELATIONSHIP_NOT_APPROVED" || code === "WORD_PREFLIGHT_BLOCKED");
    // Older released words may have no Overview sense approval yet. Missing modern
    // facts alone do not invalidate their released content.
    if (active && !active.senseId && !active.pronunciationId && !candidate.familyMeaningReview && !wordIssues.length) return [];
    const facts = [
      ...(candidate.familyMeaningReview
        ? [`The family meaning for “${candidate.familyMeaningReview}” changed. Confirm which family meaning this word should use.`] : []),
      ...wordIssues.map(issue => issue.message),
      ...candidate.overviewCandidate?.issues.map(issue => issue.message) ?? [],
      ...candidate.generatedIng?.issues.map(issue => issue.message) ?? [],
    ];
    const reason = [...new Set(facts)].join(" ") || "Recheck the approval for the meaning this lesson should teach.";
    return [{
      wordId: candidate.wordId, displayWord: candidate.displayWord, active,
      note: active ? `Active in the live lesson pool. ${reason}` : reason,
    }];
  }).sort((a, b) => a.displayWord.localeCompare(b.displayWord, "en-GB") || a.wordId.localeCompare(b.wordId));
}
