/**
 * ADLE Slice 7a (7a-C): pure reconciliation core for the ADLE → Word Treasure
 * reward bridge. Zero imports so it is unit-testable DB-free by
 * adle:reward-bridge-regression, and so the cross-path no-double-count guarantee
 * is proven in isolation. The DB consumers live in adle-reward-bridge.ts.
 */

/** Event source_type for an ADLE-observed authentic use. */
export const ADLE_AUTHENTIC_USE_SOURCE_TYPE = "adle_authentic_use";

/** ADLE piece refs are `ws:{writing_sample_id}`; return the sample id, or null
 * for any other shape (fail closed — an unparseable ref is never credited). */
export function parseWritingSampleFromPieceRef(pieceRef: string): string | null {
  return pieceRef.startsWith("ws:") ? pieceRef.slice(3) || null : null;
}

/** The canonical cross-path key: one real use = one (treasure, writing sample). */
export function authenticUseDedupKey(treasureId: string, writingSampleId: string): string {
  return `${treasureId}::${writingSampleId}`;
}

export interface AuthenticUseCandidate {
  treasureId: string;
  writingSampleId: string;
}

/**
 * Split incoming uses into the ones to credit and the ones to skip, given the
 * set of already-counted keys (from BOTH the ADLE and free-writing paths).
 * Deduplicates within the batch too, so the same (treasure, sample) never
 * credits twice in one run.
 */
export function reconcileAuthenticUses<T extends AuthenticUseCandidate>(
  uses: readonly T[],
  alreadyCounted: ReadonlySet<string>,
): { credited: T[]; skipped: T[] } {
  const seen = new Set(alreadyCounted);
  const credited: T[] = [];
  const skipped: T[] = [];
  for (const use of uses) {
    const key = authenticUseDedupKey(use.treasureId, use.writingSampleId);
    if (seen.has(key)) {
      skipped.push(use);
      continue;
    }
    seen.add(key);
    credited.push(use);
  }
  return { credited, skipped };
}

/** Apply one or more new credited uses to a forged treasure; the Golden Bar is
 * awarded on the transition across the threshold (once), never re-awarded. */
export function applyForgeUses(
  currentUses: number,
  requiredUses: number,
  newCredits: number,
): { nextUses: number; awardsBar: boolean } {
  const nextUses = currentUses + newCredits;
  return { nextUses, awardsBar: currentUses < requiredUses && nextUses >= requiredUses };
}
