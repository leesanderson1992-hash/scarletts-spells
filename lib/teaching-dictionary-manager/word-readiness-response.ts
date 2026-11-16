import type { RouteContentDraft } from "./contracts";
import type { LessonReadinessRow } from "./lesson-preflight";
import type { WordRouteStatus } from "./word-route-status";

export function summarizeWordPreflight(row: LessonReadinessRow, wordId: string) {
  const word = row.words.find(entry => entry.id === wordId);
  return {
    routeId: row.routeId,
    microSkillKey: row.microSkillKey,
    status: row.status,
    compilerReady: row.compilerReady,
    activationEnabled: row.activationEnabled,
    preflightFingerprint: row.preflightFingerprint,
    compilerWitnesses: row.compilerWitnesses[wordId] ? { [wordId]: row.compilerWitnesses[wordId] } : {},
    word: word && { id: word.id, ready: word.ready, requiredForRelease: word.requiredForRelease,
      reviewedDraftId: word.reviewedDraftId },
    issues: row.issues.filter(issue => !issue.wordId || issue.wordId === wordId),
  };
}

export type WordPreflightSummary = ReturnType<typeof summarizeWordPreflight>;
export type WordReadinessResponse = {
  preflights: WordPreflightSummary[];
  routeContents: RouteContentDraft[];
  assignedSkillKeys: string[];
  wordRouteStatuses: WordRouteStatus[];
};
export type WordLessonPreview = Pick<LessonReadinessRow, "compiledPreview" | "releaseContentPreview">;
