export function hasCurrentEditorialReview(
  review: { dictionary_fingerprint?: unknown } | undefined,
  currentFingerprint: string | undefined,
): boolean {
  return typeof review?.dictionary_fingerprint === "string"
    && typeof currentFingerprint === "string"
    && review.dictionary_fingerprint === currentFingerprint;
}
