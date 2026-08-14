"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  deterministicOrderedBuildOrder,
  useOrderedBuildEngine,
  type OrderedBuildSnapshot,
  type OrderedBuildTarget,
} from "@/components/adle/activities/shared/ordered-build-engine";
import { INTERACTION_MOTION, useReducedMotion } from "@/components/adle/activities/shared/motion";
import { playInteractionSound } from "@/components/adle/activities/shared/sound";
import {
  compoundJigsawAutoScrollDelta,
  compoundJigsawExpectedPieceIds,
  compoundJigsawPieceEdges,
  compoundJigsawPlacementIntentTargetId,
  compoundJigsawPlacementTargetId,
  compoundJigsawSlotEdges,
  compoundJigsawTargetColumnSpan,
  deriveCompoundJigsawPieces,
  normaliseAnonymousCompoundJigsawSnapshot,
  type CompoundJigsawEdges,
  type CompoundJigsawPiece,
  type CompoundJigsawPieceTarget,
} from "@/lib/adle/morphology/compound-jigsaw-pieces";
import {
  compoundWordJoinSeparator,
  type CompoundWordJoinKind,
} from "@/lib/adle/morphology/compound-word-structure-v2";

export interface CompoundJigsawTarget extends CompoundJigsawPieceTarget {
  joins: readonly CompoundWordJoinKind[];
}

export interface CompoundJigsawProgress {
  locked: string[];
  misses: Record<string, number>;
  placements: OrderedBuildSnapshot["placements"];
}

type NormalTarget = CompoundJigsawTarget;
type DragState = {
  pieceId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
};

function normaliseTarget(target: CompoundJigsawTarget): NormalTarget | null {
  const components = [...target.components];
  const joins = [...target.joins];
  if (
    components.length < 2
    || components.some((part) => !part)
    || joins.length !== components.length - 1
  ) return null;
  const reconstructed = components.reduce((word, component, index) =>
    index === 0 ? component : `${word}${compoundWordJoinSeparator(joins[index - 1])}${component}`, "");
  return reconstructed === target.word
    ? { canonicalWordId: target.canonicalWordId, word: target.word, components, joins }
    : null;
}

export function reconstructCompoundJigsawTarget(
  target: CompoundJigsawTarget,
): string | null {
  return normaliseTarget(target)?.word ?? null;
}

function pieceLabel(piece: CompoundJigsawPiece): string {
  if (piece.kind === "space") return "space connector";
  if (piece.kind === "hyphen") return "hyphen connector";
  return `${piece.text} word part`;
}

const JIGSAW_HEIGHT = 80;
const JIGSAW_COMPONENT_WIDTH = 120;
const JIGSAW_CONNECTOR_WIDTH = 80;
const JIGSAW_TAB_DEPTH_PX = 14;

export function compoundJigsawPiecePath(
  edges: CompoundJigsawEdges,
  width: number,
): string {
  const tabDepth = 20;
  const rightBase = width - (edges.right === "tab" ? tabDepth : 0);
  const rightTip = rightBase + tabDepth;
  const leftBase = 0;
  const leftTip = leftBase + tabDepth;
  const rightEdge = edges.right === "tab"
    ? `V25C${rightBase + 9} 17 ${rightTip} 22 ${rightTip} 40C${rightTip} 58 ${rightBase + 9} 63 ${rightBase} 55V76`
    : "V76";
  const leftEdge = edges.left === "socket"
    ? `V55C${leftBase + 9} 63 ${leftTip} 58 ${leftTip} 40C${leftTip} 22 ${leftBase + 9} 17 ${leftBase} 25V4`
    : "V4";
  return `M${leftBase} 4H${rightBase}${rightEdge}H${leftBase}${leftEdge}Z`;
}

function JigsawPiece(props: {
  piece: CompoundJigsawPiece;
  edges: CompoundJigsawEdges;
  selected: boolean;
  completed?: boolean;
  disabled?: boolean;
  drag: DragState | null;
  onActivate: () => void;
  onPointerStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerEnd: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  layer?: number;
}) {
  const reducedMotion = useReducedMotion();
  const activeDrag = props.drag?.pieceId === props.piece.id ? props.drag : null;
  const dragging = activeDrag !== null;
  const offset = activeDrag
    ? { x: activeDrag.x - activeDrag.startX, y: activeDrag.y - activeDrag.startY }
    : { x: 0, y: 0 };
  const connector = props.piece.kind !== "component";
  const displayText = props.completed && props.piece.kind === "space" ? "" : props.piece.text;
  const fill = props.piece.kind === "space"
    ? "#e0f2fe"
    : props.piece.kind === "hyphen"
      ? "#fef3c7"
      : props.edges.left === "flat"
        ? "#cffafe"
        : props.edges.right === "flat"
          ? "#fef3c7"
          : "#dcfce7";

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    props.onActivate();
  }

  return <button
    type="button"
    disabled={props.disabled}
    data-jigsaw-piece={props.piece.id}
    data-jigsaw-piece-kind={props.piece.kind}
    data-jigsaw-left-edge={props.edges.left}
    data-jigsaw-right-edge={props.edges.right}
    data-jigsaw-space-label-hidden={props.completed && props.piece.kind === "space" ? "true" : undefined}
    aria-label={pieceLabel(props.piece)}
    aria-pressed={props.selected}
    onPointerDown={props.onPointerStart}
    onPointerMove={props.onPointerMove}
    onPointerUp={props.onPointerEnd}
    onPointerCancel={props.onPointerCancel}
    onKeyDown={keyDown}
    style={{
      transform: dragging
        ? `translate3d(${offset.x}px,${offset.y}px,0) scale(${!reducedMotion ? 1.04 : 1})`
        : undefined,
      transition: dragging || reducedMotion ? "none" : `transform ${INTERACTION_MOTION.snapMs}ms ease`,
      touchAction: "none",
      zIndex: dragging ? 50 : props.layer ?? 10,
    }}
    className={`relative h-14 shrink-0 overflow-visible outline-none focus-visible:z-30 focus-visible:ring-4 focus-visible:ring-cyan-300/70 disabled:opacity-100 ${connector ? "w-14" : "w-[5.25rem]"} ${dragging ? "drop-shadow-2xl" : ""}`}
  >
    <svg viewBox={`0 0 ${connector ? JIGSAW_CONNECTOR_WIDTH : JIGSAW_COMPONENT_WIDTH} ${JIGSAW_HEIGHT}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_6px_9px_rgba(8,47,73,.32)]">
      <path d={compoundJigsawPiecePath(props.edges, connector ? JIGSAW_CONNECTOR_WIDTH : JIGSAW_COMPONENT_WIDTH)} fill={fill} stroke={props.selected ? "#22d3ee" : props.completed ? "#6ee7b7" : "#f59e0b"} strokeWidth="3" />
    </svg>
    <span className={`relative grid h-full place-items-center font-black text-slate-950 ${connector ? "px-2 text-xs" : "px-4 text-base"}`}>
      {displayText || <span className="sr-only">Space</span>}
    </span>
  </button>;
}

function EmptyJigsawSlot(props: {
  label: string;
  edges: CompoundJigsawEdges;
  onClick: () => void;
}) {
  return <button
    type="button"
    aria-label={props.label}
    onClick={props.onClick}
    data-jigsaw-left-edge={props.edges.left}
    data-jigsaw-right-edge={props.edges.right}
    className="relative h-14 w-[5.25rem] shrink-0 outline-none focus-visible:z-30 focus-visible:ring-4 focus-visible:ring-cyan-300/70"
  >
    <svg viewBox={`0 0 ${JIGSAW_COMPONENT_WIDTH} ${JIGSAW_HEIGHT}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible">
      <path d={compoundJigsawPiecePath(props.edges, JIGSAW_COMPONENT_WIDTH)} fill="rgba(207,250,254,.04)" stroke="rgba(103,232,249,.58)" strokeDasharray="7 5" strokeWidth="3" />
    </svg>
    <span className="relative grid h-full place-items-center px-2 text-[10px] font-black uppercase tracking-wide text-cyan-100">Place</span>
  </button>;
}

export function CompoundJigsawActivity(props: {
  targets: readonly CompoundJigsawTarget[];
  muted?: boolean;
  initialLocked?: readonly string[];
  initialMisses?: Readonly<Record<string, number>>;
  initialPlacements?: OrderedBuildSnapshot["placements"];
  onProgress?: (progress: CompoundJigsawProgress) => void;
  onComplete: (progress: CompoundJigsawProgress) => void;
}) {
  const targets = useMemo(
    () => props.targets.map(normaliseTarget).filter((target): target is NormalTarget => target !== null),
    [props.targets],
  );
  const piecesByTarget = useMemo(
    () => new Map(targets.map((target) => [target.canonicalWordId, deriveCompoundJigsawPieces(target)])),
    [targets],
  );
  const pieces = useMemo(() => deterministicOrderedBuildOrder(
    targets.flatMap((target) => piecesByTarget.get(target.canonicalWordId) ?? []),
    targets.map((target) => `${target.canonicalWordId}:${target.word}`).join("|"),
  ), [piecesByTarget, targets]);
  const pieceMap = useMemo(() => new Map(pieces.map((piece) => [piece.id, piece])), [pieces]);
  const noExcludedTargetIds = useMemo(() => new Set<string>(), []);
  const sourcePieceCounts = useMemo(() => new Map(targets.map((target) => [
    target.canonicalWordId,
    compoundJigsawExpectedPieceIds(target).length,
  ])), [targets]);
  const buildTargets = useMemo<OrderedBuildTarget[]>(() => targets.map((target) => ({
    id: target.canonicalWordId,
    expectedPieceIds: compoundJigsawExpectedPieceIds(target),
    isCorrect: (placements) => compoundJigsawPlacementTargetId(targets, placements, noExcludedTargetIds, pieceMap) !== null,
  })), [noExcludedTargetIds, pieceMap, targets]);
  const initialSnapshot = useMemo(() => {
    const normalised = normaliseAnonymousCompoundJigsawSnapshot(
      targets,
      props.initialPlacements,
      props.initialLocked ?? [],
    );
    return {
      placements: normalised.placements,
      completedTargetIds: normalised.completedRowIds,
    };
  }, [props.initialLocked, props.initialPlacements, targets]);
  const engine = useOrderedBuildEngine({
    targets: buildTargets,
    pieceIds: pieces.map((piece) => piece.id),
    initialSnapshot,
  });
  const [misses, setMisses] = useState<Record<string, number>>(() => ({ ...(props.initialMisses ?? {}) }));
  const [feedback, setFeedback] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const onProgress = useRef(props.onProgress);
  useEffect(() => { onProgress.current = props.onProgress; }, [props.onProgress]);
  const lockedTargetByRow = useMemo(() => {
    const claimed = new Set<string>();
    return new Map(engine.snapshot.completedTargetIds.flatMap((rowId) => {
      const targetId = compoundJigsawPlacementTargetId(
        targets,
        engine.snapshot.placements[rowId] ?? [],
        claimed,
        pieceMap,
      );
      if (!targetId) return [];
      claimed.add(targetId);
      return [[rowId, targetId] as const];
    }));
  }, [engine.snapshot.completedTargetIds, engine.snapshot.placements, pieceMap, targets]);
  const lockedTargetIds = useMemo(() => {
    const locked = new Set(lockedTargetByRow.values());
    return targets.flatMap((target) => locked.has(target.canonicalWordId) ? [target.canonicalWordId] : []);
  }, [lockedTargetByRow, targets]);
  useEffect(() => {
    onProgress.current?.({
      locked: lockedTargetIds,
      misses,
      placements: engine.snapshot.placements,
    });
  }, [engine.snapshot.placements, lockedTargetIds, misses]);
  const complete = lockedTargetIds.length === targets.length
    && targets.length === props.targets.length;

  function pieceById(pieceId: string | null) {
    return pieceId ? pieceMap.get(pieceId) : undefined;
  }

  function nearestDestination(point: { x: number; y: number }) {
    return Object.entries(slotRefs.current)
      .flatMap(([key, node]) => {
        if (!node) return [];
        const [targetId] = key.split("::");
        if (engine.snapshot.completedTargetIds.includes(targetId)) return [];
        const rect = node.getBoundingClientRect();
        const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
        const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
        return [{ key, distance: Math.hypot(dx, dy) }];
      })
      .filter((candidate) => candidate.distance <= INTERACTION_MOTION.snapDistancePx + 24)
      .sort((left, right) => left.distance - right.distance)[0];
  }

  function placeAtPoint(pieceId: string, point: { x: number; y: number }) {
    const destination = nearestDestination(point);
    if (!destination) {
      setFeedback("That piece did not reach a puzzle space. Try again or tap a piece, then tap a space.");
      playInteractionSound("resist", props.muted);
      return;
    }
    const [targetId, slotText] = destination.key.split("::");
    engine.placePiece(pieceId, targetId, Number(slotText));
    setFeedback(`${pieceById(pieceId)?.text ?? "Piece"} placed. You can move or swap it before checking.`);
    playInteractionSound("snap", props.muted);
  }

  function pointerStart(pieceId: string, event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = {
      pieceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    dragRef.current = next;
    setDrag(next);
  }

  function pointerMove(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const next = {
      ...current,
      x: event.clientX,
      y: event.clientY,
      moved: current.moved
        || Math.abs(event.clientX - current.startX) > 4
        || Math.abs(event.clientY - current.startY) > 4,
    };
    dragRef.current = next;
    setDrag(next);
    const scrollDelta = window.innerWidth < 768
      ? compoundJigsawAutoScrollDelta(event.clientY, window.innerHeight)
      : 0;
    if (scrollDelta) window.scrollBy({ top: scrollDelta, behavior: "auto" });
  }

  function finishPointer(
    piece: CompoundJigsawPiece,
    event: PointerEvent<HTMLButtonElement>,
    activate: () => void,
    cancelled = false,
  ) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId || current.pieceId !== piece.id) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDrag(null);
    if (cancelled) {
      setFeedback(`${piece.text} returned to its previous place.`);
      return;
    }
    if (current.moved) placeAtPoint(piece.id, { x: event.clientX, y: event.clientY });
    else activate();
  }

  function activateBankPiece(piece: CompoundJigsawPiece) {
    engine.selectPiece(piece.id);
    setFeedback(`${piece.text} selected. Choose a puzzle space.`);
  }

  function activatePlacedPiece(targetId: string, slot: number, piece: CompoundJigsawPiece) {
    engine.liftPiece(targetId, slot);
    setFeedback(`${piece.text} lifted. Choose a different space.`);
  }

  function checkBuilds() {
    const fullRows = buildTargets.filter((row) =>
      !engine.snapshot.completedTargetIds.includes(row.id)
      && engine.snapshot.placements[row.id].every((pieceId) => pieceId !== null));
    if (!fullRows.length) {
      setFeedback("Fill every space in at least one puzzle row before checking.");
      return;
    }
    const claimedTargetIds = new Set(lockedTargetIds);
    const correct = fullRows.flatMap((row) => {
      const targetId = compoundJigsawPlacementTargetId(
        targets,
        engine.snapshot.placements[row.id],
        claimedTargetIds,
        pieceMap,
      );
      if (!targetId) return [];
      claimedTargetIds.add(targetId);
      return [{ rowId: row.id, targetId }];
    });
    const correctRowIds = new Set(correct.map((entry) => entry.rowId));
    const incorrect = fullRows.filter((row) => !correctRowIds.has(row.id));
    correct.forEach(({ rowId }) => engine.completeTarget(rowId));
    if (incorrect.length) {
      const missedTargetIds = new Set(incorrect.flatMap((row) => {
        const targetId = compoundJigsawPlacementIntentTargetId(targets, engine.snapshot.placements[row.id], pieceMap);
        return targetId && !claimedTargetIds.has(targetId) ? [targetId] : [];
      }));
      if (missedTargetIds.size) {
        setMisses((current) => ({
          ...current,
          ...Object.fromEntries([...missedTargetIds].map((targetId) => [targetId, (current[targetId] ?? 0) + 1])),
        }));
      }
      setFeedback(missedTargetIds.size
        ? "Some pieces are in the wrong order. Move them and check again."
        : "That row mixes pieces from different words. Rearrange the pieces and check again.");
      playInteractionSound("resist", props.muted);
    } else {
      setFeedback(correct.length === 1 ? "That word clicks together." : `${correct.length} words click together.`);
      playInteractionSound("fusion", props.muted);
    }
  }

  const progress = (): CompoundJigsawProgress => ({
    locked: lockedTargetIds,
    misses,
    placements: engine.snapshot.placements,
  });

  return <section className="grid min-w-0 gap-5 text-cyan-50" aria-labelledby="compound-jigsaw-title" data-jigsaw-board>
    <div className="text-center">
      <p className="text-xs font-black uppercase tracking-[.2em] text-cyan-200">Jigsaw build</p>
      <h2 id="compound-jigsaw-title" className="mt-2 text-3xl font-black text-white">Build all the words</h2>
      <p className="mt-2 font-semibold text-cyan-100">Fit each word into any puzzle row with the right number of pieces. Spaces and hyphens are pieces too. Rearrange them until each word is right, then check.</p>
    </div>

    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2" aria-label="Anonymous jigsaw rows">
      {buildTargets.map((row, rowIndex) => {
        const placements = engine.snapshot.placements[row.id];
        const locked = engine.snapshot.completedTargetIds.includes(row.id);
        const lockedTargetId = lockedTargetByRow.get(row.id);
        const lockedTarget = targets.find((target) => target.canonicalWordId === lockedTargetId);
        const span = compoundJigsawTargetColumnSpan(row.expectedPieceIds.length);
        const spanClass = span === "full" ? "md:col-span-2" : "";
        return <section
          key={row.id}
          data-jigsaw-row={rowIndex + 1}
          data-jigsaw-row-id={row.id}
          data-jigsaw-piece-count={row.expectedPieceIds.length}
          className={`min-w-0 rounded-2xl border p-3 ${spanClass} ${locked ? "border-emerald-300/50 bg-emerald-100/10" : "border-cyan-300/30 bg-slate-950/35"}`}
          aria-label={`Puzzle row ${rowIndex + 1}, ${row.expectedPieceIds.length} pieces`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-200">Puzzle row · {row.expectedPieceIds.length} pieces</p>
            {locked ? <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-black text-emerald-950">Built</span> : null}
          </div>
          <div className="mt-2 flex min-w-0 items-center justify-center overflow-visible px-2" data-jigsaw-slot-row>
            {placements.map((pieceId, slot) => {
              const piece = pieceById(pieceId);
              const edges = piece
                ? compoundJigsawPieceEdges(piece, sourcePieceCounts.get(piece.targetId) ?? 1)
                : compoundJigsawSlotEdges(slot, placements.length);
              return <div
                key={`${row.id}:${slot}`}
                ref={(node) => { slotRefs.current[`${row.id}::${slot}`] = node; }}
                data-jigsaw-slot={`${row.id}:${slot}`}
                className="relative shrink-0"
                style={{ marginLeft: slot > 0 ? -JIGSAW_TAB_DEPTH_PX : undefined, zIndex: placements.length - slot }}
              >
                {piece ? <JigsawPiece
                  piece={piece}
                  edges={edges}
                  selected={engine.selectedPieceId === piece.id}
                  completed={locked}
                  disabled={locked}
                  drag={drag}
                  layer={placements.length - slot}
                  onActivate={() => activatePlacedPiece(row.id, slot, piece)}
                  onPointerStart={(event) => pointerStart(piece.id, event)}
                  onPointerMove={pointerMove}
                  onPointerEnd={(event) => finishPointer(piece, event, () => activatePlacedPiece(row.id, slot, piece))}
                  onPointerCancel={(event) => finishPointer(piece, event, () => undefined, true)}
                /> : <EmptyJigsawSlot
                  label={engine.selectedPieceId
                    ? `Place ${pieceLabel(pieceById(engine.selectedPieceId)!)} in puzzle row ${rowIndex + 1}, position ${slot + 1}`
                    : `Empty position ${slot + 1} in puzzle row ${rowIndex + 1}`}
                  edges={edges}
                  onClick={() => {
                    if (engine.selectedPieceId) {
                      engine.placeSelected(row.id, slot);
                      setFeedback("Piece placed. You can move it again before checking.");
                      playInteractionSound("snap", props.muted);
                    } else setFeedback("Choose a jigsaw piece from the mixed bank first.");
                  }}
                />}
              </div>;
            })}
          </div>
          {lockedTarget ? <p className="mt-2 text-center text-sm font-black text-emerald-50">{lockedTarget.word}</p> : null}
        </section>;
      })}
    </div>

    <section className="rounded-3xl border border-cyan-300/30 bg-slate-950/45 p-4 sm:p-5" aria-label="Mixed jigsaw piece bank">
      <p className="mb-3 text-center text-xs font-black uppercase tracking-[.16em] text-cyan-200">Mixed piece bank</p>
      <div className="flex min-w-0 flex-wrap justify-center gap-x-3 gap-y-3">
        {pieces.filter((piece) => engine.availablePieceIds.includes(piece.id)).map((piece) => <JigsawPiece
            key={piece.id}
            piece={piece}
            edges={compoundJigsawPieceEdges(piece, sourcePieceCounts.get(piece.targetId) ?? 1)}
            selected={engine.selectedPieceId === piece.id}
            drag={drag}
            onActivate={() => activateBankPiece(piece)}
            onPointerStart={(event) => pointerStart(piece.id, event)}
            onPointerMove={pointerMove}
            onPointerEnd={(event) => finishPointer(piece, event, () => activateBankPiece(piece))}
            onPointerCancel={(event) => finishPointer(piece, event, () => undefined, true)}
          />)}
        {engine.availablePieceIds.length === 0 ? <p className="py-3 text-sm font-semibold text-cyan-100">Every piece is in a puzzle tray. Check the order or lift a piece to move it.</p> : null}
      </div>
    </section>

    {!complete ? <button type="button" onClick={checkBuilds} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Check my builds</button> : <button type="button" onClick={() => props.onComplete(progress())} className="mx-auto min-h-12 rounded-full bg-cyan-300 px-7 font-black text-slate-950">Connect the meanings</button>}
    <p aria-live="polite" className="min-h-6 text-center text-sm font-semibold text-cyan-100">{feedback}</p>
  </section>;
}
