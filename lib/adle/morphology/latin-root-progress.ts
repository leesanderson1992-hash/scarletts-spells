import type { OrderedBuildSnapshot } from "@/components/adle/activities/shared/ordered-build-engine";
import type { ShutterState } from "@/components/adle/activities/shared/cover-shutter";
import type { LatinRootLessonContent } from "./latin-root-lesson";
import { latinRootTreeBuildModel } from "./latin-root-tree-build";
import { semanticJson } from "../inflection/semantic-json";

export const LATIN_ROOT_STAGES = ["learn", "tree", "spell", "cover", "dictation", "reflect"] as const;
export type LatinRootStage = typeof LATIN_ROOT_STAGES[number];
export interface LatinRootSpellDraft {
  phase: "choose" | "match" | "craft" | "cast"; familyId: string; ending: string;
  bonusOpen: boolean; bonusRoot: string | null;
}
export interface LatinRootProgressV1 {
  schemaVersion: 1; contentId: string; stage: LatinRootStage; introSlide: number;
  familyIndex: number; familyProgress: Record<string, OrderedBuildSnapshot>;
  spellComplete: boolean; spellDraft?: LatinRootSpellDraft | null; index: number;
  coverStates: Record<string, { state: ShutterState; attempt: string }>;
  coverAttempts: Record<string, string>; sentenceValues: Record<string, string>;
  sentenceAttempts: Record<string, string>; reflection: string; finished: boolean;
}
export function initialLatinRootProgress(content: LatinRootLessonContent): LatinRootProgressV1 {
  return { schemaVersion: 1, contentId: content.id, stage: "learn", introSlide: 0, familyIndex: 0,
    familyProgress: {}, spellComplete: false, spellDraft: null, index: 0, coverStates: {}, coverAttempts: {},
    sentenceValues: {}, sentenceAttempts: {}, reflection: "", finished: false };
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
export function latinRootTreesComplete(progress: LatinRootProgressV1, content: LatinRootLessonContent): boolean {
  return content.families.every(family => {
    const snapshot = progress.familyProgress[family.id];
    if (!snapshot || !record(snapshot.placements) || !Array.isArray(snapshot.completedTargetIds)) return false;
    const { targets, pieces } = latinRootTreeBuildModel(family);
    const used = new Set<string>();
    return snapshot.completedTargetIds.length === targets.length && new Set(snapshot.completedTargetIds).size === targets.length && targets.every(target => {
      const placements = snapshot.placements[target.id];
      return snapshot.completedTargetIds.includes(target.id) && Array.isArray(placements) && placements.length === target.expectedPieceIds.length && placements.every((pieceId, index) => {
        if (!pieceId || used.has(pieceId) || !pieces.some(piece => piece.id === pieceId) || !target.acceptedPieceIdsBySlot?.[index]?.includes(pieceId)) return false;
        used.add(pieceId); return true;
      });
    });
  });
}
export function latinRootProgressValid(value: unknown, content: LatinRootLessonContent): value is LatinRootProgressV1 {
  if (!record(value)) return false;
  const p = value as unknown as LatinRootProgressV1;
  const ids = new Set(content.families.flatMap(f => f.words.map(w => w.id)));
  const answers = (candidate: unknown, max: number) => record(candidate) && Object.entries(candidate).every(([id, answer]) => ids.has(id) && typeof answer === "string" && answer.length <= max);
  if (p.schemaVersion !== 1 || p.contentId !== content.id || !LATIN_ROOT_STAGES.includes(p.stage) ||
    !Number.isInteger(p.introSlide) || p.introSlide < 0 || p.introSlide > 5 ||
    !Number.isInteger(p.familyIndex) || p.familyIndex < 0 || p.familyIndex >= content.families.length ||
    !Number.isInteger(p.index) || p.index < 0 || p.index >= ids.size || !record(p.familyProgress) ||
    Object.keys(p.familyProgress).some(id => !content.families.some(f => f.id === id)) ||
    !record(p.coverStates) || Object.entries(p.coverStates).some(([id, state]) => !ids.has(id) || !record(state) ||
      !["look", "cover", "write", "check"].includes(state.state) || typeof state.attempt !== "string" || state.attempt.length > 200) ||
    !answers(p.coverAttempts, 200) || !answers(p.sentenceValues, 1000) || !answers(p.sentenceAttempts, 1000) ||
    typeof p.spellComplete !== "boolean" || typeof p.finished !== "boolean" || typeof p.reflection !== "string" || p.reflection.length > 1000) return false;
  if (Object.entries(p.familyProgress).some(([id, snapshot]) => {
    const family = content.families.find(f => f.id === id)!;
    const model = latinRootTreeBuildModel(family);
    return !record(snapshot) || !record(snapshot.placements) || !Array.isArray(snapshot.completedTargetIds) ||
      snapshot.completedTargetIds.some(wordId => !family.words.some(word => word.id === wordId)) ||
      new Set(snapshot.completedTargetIds).size !== snapshot.completedTargetIds.length ||
      Object.entries(snapshot.placements).some(([wordId, placements]) => {
        const target = model.targets.find(t => t.id === wordId);
        return !target || !Array.isArray(placements) || placements.length !== target.expectedPieceIds.length ||
          placements.some(piece => piece !== null && (typeof piece !== "string" || !model.pieces.some(candidate => candidate.id === piece)));
      });
  })) return false;
  if (p.spellDraft != null && (!record(p.spellDraft) || !["choose", "match", "craft", "cast"].includes(p.spellDraft.phase) ||
    !content.families.some(family => family.id === p.spellDraft!.familyId) || !["o", "os", "is", "um"].includes(p.spellDraft.ending) ||
    typeof p.spellDraft.bonusOpen !== "boolean" || (p.spellDraft.bonusRoot !== null && (typeof p.spellDraft.bonusRoot !== "string" || p.spellDraft.bonusRoot.length > 40)))) return false;
  const step = LATIN_ROOT_STAGES.indexOf(p.stage);
  if (step >= 2 && !latinRootTreesComplete(p, content)) return false;
  if (step >= 3 && !p.spellComplete) return false;
  if (step >= 4 && [...ids].some(id => !Object.hasOwn(p.coverAttempts, id))) return false;
  if (step >= 5 && [...ids].some(id => !Object.hasOwn(p.sentenceAttempts, id))) return false;
  return !p.finished || latinRootReadyToFinish(p, content);
}
export function latinRootReadyToFinish(p: LatinRootProgressV1, content: LatinRootLessonContent): boolean {
  return p.stage === "reflect" && latinRootTreesComplete(p, content) && p.spellComplete && Boolean(p.reflection.trim()) &&
    content.families.flatMap(f => f.words).every(word => Object.hasOwn(p.coverAttempts, word.id) && Object.hasOwn(p.sentenceAttempts, word.id));
}
export function latinRootProgressTransitionValid(previous: unknown, next: unknown, content: LatinRootLessonContent): boolean {
  if (!latinRootProgressValid(next, content) || next.finished) return false;
  if (previous == null) return true;
  if (!latinRootProgressValid(previous, content) || previous.finished) return false;
  if (previous.spellComplete && !next.spellComplete) return false;
  for (const key of ["coverAttempts", "sentenceAttempts"] as const)
    for (const [id, attempt] of Object.entries(previous[key])) if (next[key][id] !== attempt) return false;
  for (const [familyId, snapshot] of Object.entries(previous.familyProgress)) {
    if (!Array.isArray(snapshot?.completedTargetIds)) return false;
    for (const wordId of snapshot.completedTargetIds) {
      if (!next.familyProgress[familyId]?.completedTargetIds?.includes(wordId) ||
        semanticJson(snapshot.placements[wordId]) !== semanticJson(next.familyProgress[familyId].placements[wordId])) return false;
    }
  }
  return true;
}
