export type ManualReviewSampleStatus =
  | { label: "Needs review"; tone: string }
  | { label: "Waiting for completion"; tone: string }
  | { label: "Completed"; tone: string };

export function getManualReviewSampleStatus(input: {
  reviewCompletedAt: string | null;
  unresolvedMisspellingCount: number;
}): ManualReviewSampleStatus {
  if (input.reviewCompletedAt) {
    return {
      label: "Completed",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (input.unresolvedMisspellingCount > 0) {
    return {
      label: "Needs review",
      tone: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Waiting for completion",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  };
}
