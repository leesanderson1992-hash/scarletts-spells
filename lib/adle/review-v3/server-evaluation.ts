import "server-only";

import { findResolverVisibleTokenSafeCanonicalMappings } from "@/lib/writing-engine/persistence/spelling-canonical-mappings";

import type { ReviewTargetSnapshotV3 } from "./contracts";
import {
  evaluateSubmittedReviewWriting,
  type ReviewWritingEvaluation,
} from "./r3-evaluation";
import { tokenizeReviewWriting } from "./target-word-matcher";

/**
 * The authoritative R3 evaluator. The canonical resolver remains the only
 * authority allowed to turn a non-exact writing token into a Review failure.
 */
export async function evaluateSubmittedReviewWritingServer(input: {
  writing: string;
  targets: readonly ReviewTargetSnapshotV3[];
}): Promise<ReviewWritingEvaluation[]> {
  const observedNormalizedTokens = tokenizeReviewWriting(input.writing)
    .map((token) => token.normalized)
    .filter((token) => /^[a-z]+$/.test(token));
  const governedMappings = await findResolverVisibleTokenSafeCanonicalMappings({
    observedNormalizedTokens,
    dialectCode: "en-GB",
    normalizationVersion: "spelling_normalize_v1",
  });
  return evaluateSubmittedReviewWriting({
    writing: input.writing,
    targets: input.targets,
    governedMappings,
  });
}
