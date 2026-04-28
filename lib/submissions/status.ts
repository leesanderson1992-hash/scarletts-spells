export type ParentReviewStatus = "pending" | "approved" | "returned" | null | undefined;

export function isSubmissionApproved(status: ParentReviewStatus) {
  return status === "approved";
}

export function isSubmissionActive(status: ParentReviewStatus) {
  return status === "approved" || status === "pending";
}

export function isSubmissionReturned(status: ParentReviewStatus) {
  return status === "returned";
}
