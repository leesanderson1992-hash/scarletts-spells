import type { ReviewChallengeType } from "./contracts";

export interface ReviewPromptSelectionFact {
  promptVersionId: string;
  stablePromptKey: string;
  challengeType: ReviewChallengeType;
  lastCompletedAt: string | null;
}

/**
 * Reflection is reusable. Pick the least-recently-used prompt, excluding the
 * immediately previous key when another candidate exists. No elapsed-time or
 * cooldown rule participates in selection.
 */
export function selectLeastRecentlyUsedReflectionPrompt<T extends ReviewPromptSelectionFact>(
  candidates: readonly T[],
  mostRecentlyCompletedPromptKey: string | null,
): T | null {
  const reflection = candidates.filter(
    (candidate) => candidate.challengeType === "reflection",
  );
  if (reflection.length === 0) return null;

  const withoutImmediateRepeat = mostRecentlyCompletedPromptKey !== null
    ? reflection.filter(
        (candidate) => candidate.stablePromptKey !== mostRecentlyCompletedPromptKey,
      )
    : reflection;
  const eligible = withoutImmediateRepeat.length > 0
    ? withoutImmediateRepeat
    : reflection;

  return [...eligible].sort((left, right) => {
    const leftCompleted = left.lastCompletedAt ?? "";
    const rightCompleted = right.lastCompletedAt ?? "";
    return leftCompleted.localeCompare(rightCompleted) ||
      left.stablePromptKey.localeCompare(right.stablePromptKey) ||
      left.promptVersionId.localeCompare(right.promptVersionId);
  })[0] ?? null;
}
