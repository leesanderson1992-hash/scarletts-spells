import type { WordDraftPayload } from "./contracts";
import type { DictionarySense } from "./senses";

/** A selection is not an approval. Never guess between meanings or replace an
 * explicit selection (including an invalid historical one that needs review). */
export function singleMeaningSelection(senses: readonly DictionarySense[], selected?: string): string {
  if (selected) return selected;
  return senses.length === 1 && senses[0].definition.trim() ? senses[0].id : "";
}

/** A component gloss defines the whole word only when it is exactly one free
 * base with no spelling change. Roots and derived words need their own meaning. */
export function wholeBaseMeaning(payload: Pick<WordDraftPayload, "displayWord" | "canonicalMorphology">): string {
  const morphology = payload.canonicalMorphology;
  if (morphology.parts.length !== 1 || morphology.joins.length || morphology.transformations?.length) return "";
  const value = morphology.parts[0];
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const part = value as Record<string, unknown>;
  if (part.kind !== "base" || typeof part.sourceText !== "string" ||
    typeof part.surfaceText !== "string" || typeof part.gloss !== "string") return "";
  // Older records may omit display offsets or repeat the same fact under an
  // alias. Reading their unambiguous gloss does not approve their parts format.
  if (["type", "role", "partType"].some(key => part[key] !== undefined && part[key] !== "base") ||
    part.meaning !== undefined && part.meaning !== part.gloss ||
    part.text !== undefined && part.text !== part.surfaceText) return "";
  const range = part.displayRange as { start?: unknown; end?: unknown } | undefined;
  const word = payload.displayWord.trim().toLocaleLowerCase("en-GB");
  if (!word || part.sourceText.trim().toLocaleLowerCase("en-GB") !== word ||
    part.surfaceText.trim().toLocaleLowerCase("en-GB") !== word ||
    range !== undefined && (range?.start !== 0 || range?.end !== payload.displayWord.trim().length)) return "";
  return part.gloss.trim();
}

export function prefillDictionaryMeanings(payload: WordDraftPayload): WordDraftPayload {
  const senses = payload.senseSet?.senses ?? [];
  // Existing meanings always win. Do not infer which sense an unscoped part belongs to.
  const gloss = senses.length <= 1 && !payload.definition.trim() && !senses[0]?.definition.trim()
    ? wholeBaseMeaning(payload) : "";
  const senseSet = gloss && payload.senseSet && senses.length === 1
    ? { ...payload.senseSet, senses: [{ ...senses[0], definition: gloss }] } : payload.senseSet;
  return { ...payload, definition: gloss || payload.definition, senseSet,
    skillSenseIds: { ...payload.skillSenseIds, ...Object.fromEntries(payload.skillKeys.map(key =>
      [key, singleMeaningSelection(senseSet?.senses ?? [], payload.skillSenseIds?.[key])])) } };
}
