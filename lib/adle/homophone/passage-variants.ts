import { homophoneActivities, validateHomophoneLesson, type HomophonePassage, type HomophoneLessonSnapshotV1 } from "./lesson";
export type HomophonePassageVariant = { id: string; passages: HomophonePassage[] };
export function selectHomophonePassageVariant(snapshot: HomophoneLessonSnapshotV1, variants: readonly HomophonePassageVariant[] | undefined, seed: string, authorityFingerprint: string): HomophoneLessonSnapshotV1 {
  if (!variants?.length) return snapshot;
  if (new Set(variants.map(v=>v.id)).size!==variants.length || variants.some(variant=>!variant.id||validateHomophoneLesson({...snapshot.lesson,dictationPassages:variant.passages}).length)) throw new Error("homophone_paired_variants_invalid");
  let hash=2166136261;for(const char of seed)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  const selected=[...variants].sort((a,b)=>a.id.localeCompare(b.id))[hash%variants.length];
  const lesson={...snapshot.lesson,dictationPassages:structuredClone(selected.passages)};
  return {...snapshot,lesson,activities:homophoneActivities(lesson),dictationVariantSet:{...structuredClone(selected),authorityFingerprint}};
}
