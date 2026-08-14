"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";

export interface OrderedBuildTarget {
  id: string;
  expectedPieceIds: readonly string[];
  acceptedPieceIdsBySlot?: readonly (readonly string[])[];
  isCorrect?: (placements: readonly (string | null)[]) => boolean;
}

export interface OrderedBuildSnapshot {
  placements: Record<string, Array<string | null>>;
  completedTargetIds: string[];
}

interface OrderedBuildState extends OrderedBuildSnapshot {
  selectedPieceId: string | null;
}

type OrderedBuildAction =
  | { type: "select"; pieceId: string | null }
  | { type: "place"; pieceId: string; targetId: string; slot: number }
  | { type: "lift"; targetId: string; slot: number }
  | { type: "complete"; targetId: string }
  | { type: "reset"; targetId: string };

export type OrderedBuildSnapshotAction = Exclude<OrderedBuildAction, { type: "select" }>;

function emptyPlacements(targets: readonly OrderedBuildTarget[]): OrderedBuildSnapshot["placements"] {
  return Object.fromEntries(
    targets.map((target) => [
      target.id,
      Array.from({ length: target.expectedPieceIds.length }, () => null),
    ]),
  );
}

export function orderedBuildTargetIsCorrect(
  target: OrderedBuildTarget,
  placements: readonly (string | null)[],
): boolean {
  if (placements.length !== target.expectedPieceIds.length) return false;
  if (target.isCorrect) return target.isCorrect(placements);
  return placements.length === target.expectedPieceIds.length
    && placements.every((pieceId, index) => pieceId === target.expectedPieceIds[index]
      || Boolean(pieceId && target.acceptedPieceIdsBySlot?.[index]?.includes(pieceId)));
}

export function normaliseOrderedBuildSnapshot(
  targets: readonly OrderedBuildTarget[],
  pieceIds: readonly string[],
  value?: Partial<OrderedBuildSnapshot> | null,
): OrderedBuildSnapshot {
  const placements = emptyPlacements(targets);
  const knownPieces = new Set(pieceIds);
  const usedPieces = new Set<string>();
  for (const target of targets) {
    const candidate = value?.placements?.[target.id];
    if (!Array.isArray(candidate) || candidate.length !== target.expectedPieceIds.length) continue;
    placements[target.id] = candidate.map((pieceId) => {
      if (pieceId === null || !knownPieces.has(pieceId) || usedPieces.has(pieceId)) return null;
      usedPieces.add(pieceId);
      return pieceId;
    });
  }
  const completedTargetIds = (value?.completedTargetIds ?? []).filter((targetId, index, all) => {
    const target = targets.find((candidate) => candidate.id === targetId);
    return Boolean(
      target
      && all.indexOf(targetId) === index
      && orderedBuildTargetIsCorrect(target, placements[targetId] ?? []),
    );
  });
  return { placements, completedTargetIds };
}

export function deterministicOrderedBuildOrder<T>(
  values: readonly T[],
  seed: string,
): T[] {
  let state = Array.from(seed).reduce(
    (total, character) => (Math.imul(total, 31) + character.charCodeAt(0)) >>> 0,
    1,
  );
  const ordered = [...values];
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
  }
  return ordered;
}

function reducer(state: OrderedBuildState, action: OrderedBuildAction): OrderedBuildState {
  if (action.type === "select") {
    return { ...state, selectedPieceId: action.pieceId };
  }
  if (action.type === "complete") {
    return state.completedTargetIds.includes(action.targetId)
      ? state
      : { ...state, selectedPieceId: null, completedTargetIds: [...state.completedTargetIds, action.targetId] };
  }
  if (action.type === "reset") {
    if (state.completedTargetIds.includes(action.targetId)) return state;
    return {
      ...state,
      selectedPieceId: null,
      placements: {
        ...state.placements,
        [action.targetId]: state.placements[action.targetId].map(() => null),
      },
    };
  }
  if (action.type === "lift") {
    if (state.completedTargetIds.includes(action.targetId)) return state;
    const pieceId = state.placements[action.targetId]?.[action.slot];
    if (!pieceId) return state;
    return {
      ...state,
      selectedPieceId: pieceId,
      placements: {
        ...state.placements,
        [action.targetId]: state.placements[action.targetId].map((value, index) => index === action.slot ? null : value),
      },
    };
  }
  if (state.completedTargetIds.includes(action.targetId)) return state;
  const destination = state.placements[action.targetId];
  if (!destination || action.slot < 0 || action.slot >= destination.length) return state;
  let displacedPieceId = destination[action.slot];
  const placements = Object.fromEntries(
    Object.entries(state.placements).map(([targetId, pieces]) => [
      targetId,
      pieces.map((pieceId, index) => {
        if (targetId === action.targetId && index === action.slot) return action.pieceId;
        if (pieceId === action.pieceId) return null;
        return pieceId;
      }),
    ]),
  );
  if (displacedPieceId === action.pieceId) displacedPieceId = null;
  return { ...state, placements, selectedPieceId: displacedPieceId };
}

export function transitionOrderedBuildSnapshot(
  snapshot: OrderedBuildSnapshot,
  action: OrderedBuildSnapshotAction,
): OrderedBuildSnapshot {
  const next = reducer({ ...snapshot, selectedPieceId: null }, action);
  return { placements: next.placements, completedTargetIds: next.completedTargetIds };
}

export function useOrderedBuildEngine(input: {
  targets: readonly OrderedBuildTarget[];
  pieceIds: readonly string[];
  initialSnapshot?: Partial<OrderedBuildSnapshot> | null;
  onProgress?: (snapshot: OrderedBuildSnapshot) => void;
}) {
  const initialState = useMemo<OrderedBuildState>(() => ({
    ...normaliseOrderedBuildSnapshot(input.targets, input.pieceIds, input.initialSnapshot),
    selectedPieceId: null,
  }), [input.initialSnapshot, input.pieceIds, input.targets]);
  const [state, dispatch] = useReducer(reducer, initialState);
  const onProgress = useRef(input.onProgress);
  useEffect(() => { onProgress.current = input.onProgress; }, [input.onProgress]);
  useEffect(() => {
    onProgress.current?.({
      placements: state.placements,
      completedTargetIds: state.completedTargetIds,
    });
  }, [state.completedTargetIds, state.placements]);
  const placedPieceIds = useMemo(
    () => new Set(Object.values(state.placements).flatMap((pieces) => pieces.filter((pieceId): pieceId is string => pieceId !== null))),
    [state.placements],
  );
  const availablePieceIds = useMemo(
    () => input.pieceIds.filter((pieceId) => !placedPieceIds.has(pieceId)),
    [input.pieceIds, placedPieceIds],
  );
  return {
    snapshot: { placements: state.placements, completedTargetIds: state.completedTargetIds },
    selectedPieceId: state.selectedPieceId,
    availablePieceIds,
    selectPiece: (pieceId: string | null) => dispatch({ type: "select", pieceId }),
    placePiece: (pieceId: string, targetId: string, slot: number) => dispatch({ type: "place", pieceId, targetId, slot }),
    placeSelected: (targetId: string, slot: number) => {
      if (state.selectedPieceId) dispatch({ type: "place", pieceId: state.selectedPieceId, targetId, slot });
    },
    liftPiece: (targetId: string, slot: number) => dispatch({ type: "lift", targetId, slot }),
    completeTarget: (targetId: string) => dispatch({ type: "complete", targetId }),
    resetTarget: (targetId: string) => dispatch({ type: "reset", targetId }),
  };
}
