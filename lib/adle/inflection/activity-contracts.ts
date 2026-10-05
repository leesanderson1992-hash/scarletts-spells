import { hasDegreeQuestionShape, hasPairedSentenceShape, hasTransformationShape } from "./contracts";
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
export function sentenceSuffixPayloadValid(x: unknown): boolean {
  if (!record(x) || !record(x.sentence) || !Array.isArray(x.forms)) return false;
  return typeof x.baseWord === "string" && /^[a-z]+$/.test(x.baseWord)
    && typeof x.sentence.id === "string" && !!x.sentence.id
    && (x.sentence.degree === "comparative" || x.sentence.degree === "superlative")
    && typeof x.sentence.before === "string" && !!x.sentence.before && typeof x.sentence.after === "string"
    && x.forms.length === 2 && x.forms.every(f => record(f) && typeof f.word === "string" && /^[a-z]+$/.test(f.word)
      && typeof f.canonicalWordId === "string" && !!f.canonicalWordId && ["comparative", "superlative"].includes(String(f.degree)))
    && new Set(x.forms.map(f => f.degree)).size === 2
    && new Set(x.forms.map(f => f.canonicalWordId)).size === 2 && new Set(x.forms.map(f => f.word)).size === 2
    && (x.transformations === undefined || (Array.isArray(x.transformations) && x.transformations.length === 2
      && x.transformations.every(t => hasTransformationShape(t) && t.base === x.baseWord)
      && x.forms.every(f => (x.transformations as unknown[]).some(t => hasTransformationShape(t) && t.result === f.word && t.ending === (f.degree === "comparative" ? "er" : "est")))));
}
export function transformTargetPayloadValid(x: unknown): boolean {
  return record(x) && hasTransformationShape(x.transformation) && hasDegreeQuestionShape(x.question);
}
export function pairedWordGapsPayloadValid(x: unknown): boolean {
  return record(x) && hasPairedSentenceShape(x.sentence) && Array.isArray(x.audioOrder)
    && x.audioOrder.length === 2 && new Set(x.audioOrder).size === 2 && x.audioOrder.every(i => i === 0 || i === 1);
}
