import {
  REVIEW_POLICY_V1,
  createReviewBundle,
  resolveBundleReview,
  resolveCatchUpRetest,
  resolvePreRetirementCheck,
} from "../review-scheduler";
import { CURRENT_REVIEW_POLICY_VERSION } from "./contracts";

if (REVIEW_POLICY_V1.schedulePolicyVersion !== CURRENT_REVIEW_POLICY_VERSION) {
  throw new Error("current_review_policy_version_drift");
}

/**
 * Exact adapter over the released reducer. It adds no branch and changes no
 * current behaviour. C2B.1 uses it only through pure fixture dispatch; Review
 * runtime call sites remain untouched until the separately approved C2B.3.
 */
export const CURRENT_REVIEW_POLICY_V1_EXECUTOR = {
  kind: "CURRENT_REVIEW_POLICY_V1" as const,
  schedulePolicyVersion: CURRENT_REVIEW_POLICY_VERSION,
  policy: REVIEW_POLICY_V1,
  createReviewBundle,
  resolveBundleReview,
  resolveCatchUpRetest,
  resolvePreRetirementCheck,
};
