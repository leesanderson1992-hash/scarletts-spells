import type { CompoundWordJoinKind } from "./compound-word-structure-v2";

export interface CompoundJigsawPieceTarget {
  canonicalWordId: string;
  word: string;
  components: readonly string[];
  joins: readonly CompoundWordJoinKind[];
}

export type CompoundJigsawPieceKind = "component" | "space" | "hyphen";

export interface CompoundJigsawPiece {
  id: string;
  targetId: string;
  ordinal: number;
  componentOrdinal: number | null;
  kind: CompoundJigsawPieceKind;
  text: string;
}

export type CompoundJigsawEdge = "flat" | "socket" | "tab";

export interface CompoundJigsawEdges {
  left: CompoundJigsawEdge;
  right: CompoundJigsawEdge;
}

export function deriveCompoundJigsawPieces(
  target: CompoundJigsawPieceTarget,
): CompoundJigsawPiece[] {
  const pieces: CompoundJigsawPiece[] = [];
  let pieceOrdinal = 0;
  target.components.forEach((text, componentOrdinal) => {
    pieces.push({
      id: `${target.canonicalWordId}:${componentOrdinal}`,
      targetId: target.canonicalWordId,
      ordinal: pieceOrdinal,
      componentOrdinal,
      kind: "component",
      text,
    });
    pieceOrdinal += 1;
    const join = target.joins[componentOrdinal];
    if (join === "space" || join === "hyphen") {
      pieces.push({
        id: `${target.canonicalWordId}:join:${componentOrdinal}`,
        targetId: target.canonicalWordId,
        ordinal: pieceOrdinal,
        componentOrdinal: null,
        kind: join,
        text: join === "space" ? "SPACE" : "-",
      });
      pieceOrdinal += 1;
    }
  });
  return pieces;
}

export function compoundJigsawExpectedPieceIds(
  target: CompoundJigsawPieceTarget,
): string[] {
  return deriveCompoundJigsawPieces(target).map((piece) => piece.id);
}

export function compoundJigsawSlotEdges(
  ordinal: number,
  pieceCount: number,
): CompoundJigsawEdges {
  return {
    left: ordinal === 0 ? "flat" : "socket",
    right: ordinal === pieceCount - 1 ? "flat" : "tab",
  };
}

export function compoundJigsawPieceEdges(
  piece: CompoundJigsawPiece,
  sourcePieceCount: number,
): CompoundJigsawEdges {
  return compoundJigsawSlotEdges(piece.ordinal, sourcePieceCount);
}

function placementMatchesTarget(
  target: CompoundJigsawPieceTarget,
  placements: readonly (string | null)[],
  piecesById: ReadonlyMap<string, CompoundJigsawPiece>,
): boolean {
  const expected = deriveCompoundJigsawPieces(target);
  return placements.length === expected.length && placements.every((pieceId, index) => {
    if (!pieceId) return false;
    const actualPiece = piecesById.get(pieceId);
    const expectedPiece = expected[index];
    if (!actualPiece) return false;
    return expectedPiece.kind === "component"
      ? actualPiece.id === expectedPiece.id
      : actualPiece.kind === expectedPiece.kind;
  });
}

/**
 * Identifies the governed word represented by a complete anonymous row.
 * Component identity establishes the word; connector pieces are intentionally
 * interchangeable when their governed kind matches.
 */
export function compoundJigsawPlacementTargetId(
  targets: readonly CompoundJigsawPieceTarget[],
  placements: readonly (string | null)[],
  excludedTargetIds: ReadonlySet<string> = new Set(),
  pieceIndex?: ReadonlyMap<string, CompoundJigsawPiece>,
): string | null {
  const piecesById = pieceIndex ?? new Map(
    targets.flatMap((target) => deriveCompoundJigsawPieces(target)).map((piece) => [piece.id, piece]),
  );
  const match = targets.find((target) =>
    !excludedTargetIds.has(target.canonicalWordId)
    && placementMatchesTarget(target, placements, piecesById));
  return match?.canonicalWordId ?? null;
}

/**
 * Returns the only target represented by the component pieces in a row. A
 * mixed-word assembly deliberately returns null so a miss is not attributed
 * to learner evidence for an unrelated governed target.
 */
export function compoundJigsawPlacementIntentTargetId(
  targets: readonly CompoundJigsawPieceTarget[],
  placements: readonly (string | null)[],
  pieceIndex?: ReadonlyMap<string, CompoundJigsawPiece>,
): string | null {
  const piecesById = pieceIndex ?? new Map(
    targets.flatMap((target) => deriveCompoundJigsawPieces(target)).map((piece) => [piece.id, piece]),
  );
  const componentTargetIds = new Set(placements.flatMap((pieceId) => {
    const piece = pieceId ? piecesById.get(pieceId) : undefined;
    return piece?.kind === "component" ? [piece.targetId] : [];
  }));
  return componentTargetIds.size === 1 ? [...componentTargetIds][0] : null;
}

function componentSlotIndexes(target: CompoundJigsawPieceTarget): number[] {
  return deriveCompoundJigsawPieces(target)
    .map((piece, index) => piece.kind === "component" ? index : -1)
    .filter((index) => index >= 0);
}

/**
 * Expands legacy component-only placement rows into the current interleaved
 * presentation shape. Canonical payloads and persisted resume envelopes stay
 * unchanged; connector slots are intentionally empty until the learner places
 * the new derived pieces.
 */
export function normaliseCompoundJigsawPlacements(
  targets: readonly CompoundJigsawPieceTarget[],
  placements: Readonly<Record<string, readonly (string | null)[]>> | undefined,
): Record<string, Array<string | null>> {
  return Object.fromEntries(targets.map((target) => {
    const expected = compoundJigsawExpectedPieceIds(target);
    const candidate = placements?.[target.canonicalWordId];
    if (!candidate) return [target.canonicalWordId, expected.map(() => null)];
    if (candidate.length === expected.length) {
      return [target.canonicalWordId, [...candidate]];
    }
    if (candidate.length === target.components.length) {
      const expanded = expected.map(() => null as string | null);
      componentSlotIndexes(target).forEach((slot, componentOrdinal) => {
        expanded[slot] = candidate[componentOrdinal] ?? null;
      });
      return [target.canonicalWordId, expanded];
    }
    return [target.canonicalWordId, expected.map(() => null)];
  }));
}

/**
 * Keeps persisted placement keys as stable row identities while deriving the
 * canonical word owned by each checked row from its content. This accepts the
 * historical target-specific layout, including locked targets whose canonical
 * placements were never persisted, without exposing target ownership in the UI.
 */
export function normaliseAnonymousCompoundJigsawSnapshot(
  targets: readonly CompoundJigsawPieceTarget[],
  placements: Readonly<Record<string, readonly (string | null)[]>> | undefined,
  lockedTargetIds: readonly string[],
): { placements: Record<string, Array<string | null>>; completedRowIds: string[] } {
  const normalised = normaliseCompoundJigsawPlacements(targets, placements);
  const locked = new Set(lockedTargetIds);
  const claimedTargets = new Set<string>();
  const completedRowIds: string[] = [];

  for (const row of targets) {
    const targetId = compoundJigsawPlacementTargetId(targets, normalised[row.canonicalWordId] ?? []);
    if (targetId && locked.has(targetId) && !claimedTargets.has(targetId)) {
      claimedTargets.add(targetId);
      completedRowIds.push(row.canonicalWordId);
    }
  }

  for (const targetId of lockedTargetIds) {
    if (claimedTargets.has(targetId)) continue;
    const target = targets.find((candidate) => candidate.canonicalWordId === targetId);
    if (!target) continue;
    const expected = compoundJigsawExpectedPieceIds(target);
    const availableRows = targets.filter((row) =>
      !completedRowIds.includes(row.canonicalWordId)
      && compoundJigsawExpectedPieceIds(row).length === expected.length);
    const row = availableRows.find((candidate) =>
      candidate.canonicalWordId === targetId
      && normalised[candidate.canonicalWordId]?.every((pieceId) => pieceId === null))
      ?? availableRows.find((candidate) => normalised[candidate.canonicalWordId]?.every((pieceId) => pieceId === null))
      ?? availableRows.find((candidate) => candidate.canonicalWordId === targetId);
    if (!row) continue;
    for (const rowId of Object.keys(normalised)) {
      if (rowId === row.canonicalWordId) continue;
      normalised[rowId] = normalised[rowId].map((pieceId) =>
        pieceId && expected.includes(pieceId) ? null : pieceId);
    }
    normalised[row.canonicalWordId] = expected;
    claimedTargets.add(targetId);
    completedRowIds.push(row.canonicalWordId);
  }

  return { placements: normalised, completedRowIds };
}

export function compoundJigsawTargetColumnSpan(pieceCount: number): "one" | "full" {
  if (pieceCount > 5) return "full";
  return "one";
}

export function compoundJigsawAutoScrollDelta(
  clientY: number,
  viewportHeight: number,
  edgeSize = 72,
): number {
  if (clientY < edgeSize) return -18;
  if (clientY > viewportHeight - edgeSize) return 18;
  return 0;
}
