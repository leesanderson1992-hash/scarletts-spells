import type { LearningItemFact } from "./learning-items";

export interface SharedWordRouteFact {
  learningItemId: string;
  microSkillKey: string;
  attachedOn: string;
  attachmentOrdinal: number;
  requiresSentenceContext: boolean;
  rowStatus: "active" | "superseded";
}

export interface SharedWordReviewPolicy {
  microSkillKeys: string[];
  learningItemIds: string[];
  activationMicroSkillKey: string;
  requiresSentenceContext: boolean;
}

/** Explicit route links are mandatory once more than one word+skill item exists. */
export function resolveSharedWordReviewPolicy(params: {
  learningItems: readonly LearningItemFact[];
  explicitRoutes: readonly SharedWordRouteFact[];
}): SharedWordReviewPolicy | null {
  const activeItems = params.learningItems
    .filter(
      (item) => item.rowStatus === "active" && item.itemStatus !== "resolved",
    )
    .sort((a, b) => a.learningItemId.localeCompare(b.learningItemId));
  const activeRoutes = params.explicitRoutes
    .filter((route) => route.rowStatus === "active")
    .sort((a, b) =>
      a.attachmentOrdinal !== b.attachmentOrdinal
        ? a.attachmentOrdinal - b.attachmentOrdinal
        : a.learningItemId.localeCompare(b.learningItemId),
    );

  if (activeItems.length > 1 && activeRoutes.length === 0) return null;
  if (activeRoutes.length > 0) {
    const itemIds = new Set(activeItems.map((item) => item.learningItemId));
    if (activeRoutes.some((route) => !itemIds.has(route.learningItemId)))
      return null;
    const newest = activeRoutes[activeRoutes.length - 1];
    return {
      microSkillKeys: [
        ...new Set(activeRoutes.map((route) => route.microSkillKey)),
      ].sort(),
      learningItemIds: [
        ...new Set(activeRoutes.map((route) => route.learningItemId)),
      ].sort(),
      activationMicroSkillKey: newest.microSkillKey,
      requiresSentenceContext: activeRoutes.some(
        (route) => route.requiresSentenceContext,
      ),
    };
  }
  const only = activeItems[0];
  return only
    ? {
        microSkillKeys: [only.microSkillKey],
        learningItemIds: [only.learningItemId],
        activationMicroSkillKey: only.microSkillKey,
        requiresSentenceContext: false,
      }
    : null;
}
