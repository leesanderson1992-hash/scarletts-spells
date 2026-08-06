import type { CompletionWordPolicy } from "../composer-completions";
import {
  validateDynamicAffixWordLabPayload,
  type DynamicAffixLessonPayloadV3,
} from "./affix-word-lab";

export interface DynamicAffixCompletionItem {
  canonicalWordId: string | null;
  adleLearningItemRef: string | null;
  promptData: Record<string, unknown>;
}

export type DynamicAffixCompletionPolicyResult =
  | {
      ok: true;
      payload: DynamicAffixLessonPayloadV3;
      scheduledCanonicalWordIds: string[];
      wordPolicies: CompletionWordPolicy[];
    }
  | { ok: false; blockerCode: "completion_role_mismatch" };

function emitBlocker(profileKey: string | null): void {
  console.warn(JSON.stringify({
    event: "adle_dynamic_affix_completion_policy_blocker",
    routeId: "dynamic_affix_word_lab",
    routeVersion: "v3",
    blockerCode: "completion_role_mismatch",
    profileKey,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  }));
}

/** Fail closed before completion writes when persisted V3 roles and items disagree. */
export function deriveDynamicAffixCompletionPolicy(params: {
  allItems: readonly { promptData: Record<string, unknown> }[];
  productionItems: readonly DynamicAffixCompletionItem[];
}): DynamicAffixCompletionPolicyResult {
  const root = params.allItems.find((item) => item.promptData.dynamicAffixActivityId === "intro-root");
  const candidate = root?.promptData.dynamicAffixLesson;
  if (!validateDynamicAffixWordLabPayload(candidate)) {
    emitBlocker(null);
    return { ok: false, blockerCode: "completion_role_mismatch" };
  }
  const payload = candidate;
  const lessonIds = payload.words.lesson.map((word) => word.canonicalWordId);
  const authenticIds = payload.words.lesson
    .filter((word) => word.source === "authentic")
    .map((word) => word.canonicalWordId);
  const transferIds = payload.words.lesson
    .filter((word) => word.source === "transfer")
    .map((word) => word.canonicalWordId);
  const persistedIds = params.productionItems.map((item) => item.canonicalWordId);
  const sourceById = new Map(payload.words.lesson.map((word) => [word.canonicalWordId, word.source]));
  const exact = (
    left: readonly (string | null)[],
    right: readonly string[],
  ) => left.length === right.length && left.every((value, index) => value === right[index]);
  const refsAgree = params.productionItems.every((item) => {
    if (!item.canonicalWordId) return false;
    const source = sourceById.get(item.canonicalWordId);
    return source === "authentic"
      ? item.adleLearningItemRef !== null
      : source === "transfer" && item.adleLearningItemRef === null;
  });
  if (
    !exact(payload.authenticCanonicalWordIds, authenticIds)
    || !exact(persistedIds, lessonIds)
    || [...authenticIds, ...transferIds].length !== lessonIds.length
    || new Set(lessonIds).size !== lessonIds.length
    || !refsAgree
  ) {
    emitBlocker(payload.microSkillId);
    return { ok: false, blockerCode: "completion_role_mismatch" };
  }
  const authentic = new Set(authenticIds);
  return {
    ok: true,
    payload,
    scheduledCanonicalWordIds: authenticIds,
    wordPolicies: lessonIds.map((canonicalWordId) => ({
      canonicalWordId,
      evidenceEligible: true,
      scheduleEligible: authentic.has(canonicalWordId),
      learningItemTransitionEligible: authentic.has(canonicalWordId),
      rewardEligible: true,
    })),
  };
}
