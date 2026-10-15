export function hasCurrentEditorialReview(
  review: { dictionary_fingerprint?: unknown } | undefined,
  currentFingerprint: string | undefined,
): boolean {
  return (
    typeof review?.dictionary_fingerprint === "string" &&
    typeof currentFingerprint === "string" &&
    review.dictionary_fingerprint === currentFingerprint
  );
}

/** A draft cannot borrow the released word's approval or another word's witness. */
export function reviewedWordCanLaunch(
  word:
    | {
        id: string;
        ready: boolean;
        requiredForRelease?: boolean;
        reviewedDraftId?: string | null;
      }
    | undefined,
  draftId: string | null | undefined,
  witnesses: Record<string, string[]>,
): boolean {
  return Boolean(
    word?.ready &&
      word.requiredForRelease !== false &&
      witnesses[word.id]?.includes(word.id) &&
      (!draftId || word.reviewedDraftId === draftId),
  );
}
