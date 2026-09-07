import type { LearnerWordEvidenceEvent } from "../../adle/proficiency/evidence/contracts";

export const WHOLE_WRITING_SHADOW_PROJECTION_VERSION =
  "WHOLE_WRITING_PHASE_C_SHADOW_V1" as const;

export type WholeWritingCompatibilityReceipt = {
  receiptId: string;
  learnerId: string;
  canonicalWordId: string | null;
  occurredAt: string;
  performanceLineageKey: string;
};

export type ExactCompatibilityDecision = {
  receiptId: string;
  status: "NO_EXACT_LINEAGE" | "EXACT_MATCH" | "EXACT_LINEAGE_CONFLICT";
  eventId: string | null;
  sourceKind: LearnerWordEvidenceEvent["sourceKind"] | null;
};

/**
 * Reconciles only an explicitly shared performance-lineage key. Submission,
 * word, date, or text similarity is deliberately insufficient.
 */
export function reconcileExactCompatibilityLineage(
  receipts: readonly WholeWritingCompatibilityReceipt[],
  existingEvents: readonly LearnerWordEvidenceEvent[],
): ExactCompatibilityDecision[] {
  const byLineage = new Map<string, LearnerWordEvidenceEvent[]>();
  for (const event of existingEvents) {
    const key = event.provenance.performanceLineageKey;
    byLineage.set(key, [...(byLineage.get(key) ?? []), event]);
  }
  return receipts.map((receipt) => {
    const matches = byLineage.get(receipt.performanceLineageKey) ?? [];
    if (matches.length === 0) {
      return { receiptId: receipt.receiptId, status: "NO_EXACT_LINEAGE", eventId: null, sourceKind: null };
    }
    const exact = matches.find((event) =>
      event.learnerId === receipt.learnerId
      && event.canonicalWordId === receipt.canonicalWordId
      && event.occurredAt === receipt.occurredAt);
    if (!exact || matches.some((event) =>
      event.learnerId !== receipt.learnerId
      || event.canonicalWordId !== receipt.canonicalWordId
      || event.occurredAt !== receipt.occurredAt)) {
      return { receiptId: receipt.receiptId, status: "EXACT_LINEAGE_CONFLICT", eventId: null, sourceKind: null };
    }
    return { receiptId: receipt.receiptId, status: "EXACT_MATCH", eventId: exact.eventId, sourceKind: exact.sourceKind };
  });
}
