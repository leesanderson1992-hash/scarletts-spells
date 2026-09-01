import { CURRENT_REVIEW_POLICY_V1_EXECUTOR } from "./current-v1";
import {
  CURRENT_PER_WORD_STATE_SHAPE_VERSION,
  CURRENT_REVIEW_POLICY_VERSION,
  LEGACY_BUNDLE_STATE_SHAPE_VERSION,
  TARGET_PER_WORD_STATE_SHAPE_VERSION,
  TARGET_REVIEW_POLICY_VERSION,
  type PureReviewStateShapeVersion,
} from "./contracts";
import { reduceTargetReviewTransition } from "./target-regression-v1";

export const TARGET_REVIEW_POLICY_V1_EXECUTOR = {
  kind: "TARGET_REVIEW_REGRESSION_V1" as const,
  schedulePolicyVersion: TARGET_REVIEW_POLICY_VERSION,
  reduce: reduceTargetReviewTransition,
};

export type SupportedPureReviewPolicyExecutor =
  | typeof CURRENT_REVIEW_POLICY_V1_EXECUTOR
  | typeof TARGET_REVIEW_POLICY_V1_EXECUTOR;

export type PurePolicyDispatchResult =
  | { disposition: "SUPPORTED"; executor: SupportedPureReviewPolicyExecutor }
  | {
      disposition: "REJECTED";
      reason: "UNKNOWN_POLICY_VERSION" | "POLICY_STATE_SHAPE_MISMATCH";
      policyVersion: string;
      stateShapeVersion: string;
    };

/**
 * Execution is selected only from the schedule word's immutable policy pin
 * plus deployed reducer support. Legacy registry `is_active` and future
 * `is_default_for_new_schedules` are intentionally not inputs: neither may
 * reinterpret or disable an already-pinned word.
 */
export function resolvePureReviewPolicyExecutor(
  policyVersion: string,
  stateShapeVersion: PureReviewStateShapeVersion | string,
): PurePolicyDispatchResult {
  if (policyVersion === CURRENT_REVIEW_POLICY_VERSION) {
    if (stateShapeVersion !== CURRENT_PER_WORD_STATE_SHAPE_VERSION
      && stateShapeVersion !== LEGACY_BUNDLE_STATE_SHAPE_VERSION) {
      return { disposition: "REJECTED", reason: "POLICY_STATE_SHAPE_MISMATCH", policyVersion, stateShapeVersion };
    }
    return { disposition: "SUPPORTED", executor: CURRENT_REVIEW_POLICY_V1_EXECUTOR };
  }
  if (policyVersion === TARGET_REVIEW_POLICY_VERSION) {
    if (stateShapeVersion !== TARGET_PER_WORD_STATE_SHAPE_VERSION) {
      return { disposition: "REJECTED", reason: "POLICY_STATE_SHAPE_MISMATCH", policyVersion, stateShapeVersion };
    }
    return { disposition: "SUPPORTED", executor: TARGET_REVIEW_POLICY_V1_EXECUTOR };
  }
  return { disposition: "REJECTED", reason: "UNKNOWN_POLICY_VERSION", policyVersion, stateShapeVersion };
}
