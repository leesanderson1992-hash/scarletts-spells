import { hasReviewedBaseExtension } from "./spelling-family-connection";
import { auditCanonicalMorphology, type CanonicalPart } from '@/lib/teaching-dictionary-manager/canonical-morphology';
import { generatedWordSum } from '@/lib/teaching-dictionary-manager/authoring';
import { standardiseTransformations } from '@/lib/teaching-dictionary-manager/transformations';
import type { ReviewedTransformation } from '@/lib/teaching-dictionary-manager/authoring';
import { reviewedBaseWordRegularity } from './base-word-regularity';

/** Current reviewed dictionary facts may correct an older released split.
 * Keep the released word/family identities and regularity exclusions, while
 * requiring an exact canonical reconstruction and the approved base link. */
export function canonicalBaseWordAnalysis(input: {
  displayWord: string; parts: unknown[]; joins: unknown[]; transformations: unknown[]; wordSum: string;
  componentPartId: string; baseSource: string; relationshipKind: string;
}): boolean {
  if (auditCanonicalMorphology({ parts: input.parts, joins: input.joins, displayWord: input.displayWord, linkedToFamily: true }).status !== 'canonical') return false;
  const parts = input.parts as CanonicalPart[];
  const bases = parts.filter(part => part.kind === 'base');
  const teachingBase = bases.find(part => part.id === input.componentPartId);
  if (!teachingBase || teachingBase.sourceText.toLowerCase() !== input.baseSource.toLowerCase()) return false;
  if (input.wordSum !== generatedWordSum(parts, input.displayWord)) return false;
  if (input.relationshipKind === 'free_base' ? parts.length !== 1 : parts.length < 2 && !hasReviewedBaseExtension(parts, input.transformations)) return false;
  try {
    const changes = standardiseTransformations(parts, input.transformations as ReviewedTransformation[]);
    // A suggestion is not a saved approval. Every actual change must already
    // be present and refer to these exact reviewed part forms.
    if (changes.length !== input.transformations.length || changes.some(change => !parts.some(part =>
      part.id === change.sourcePartId && part.sourceText === change.sourceText && part.surfaceText === change.surfaceText))) return false;
    return reviewedBaseWordRegularity({ relationshipKind: input.relationshipKind, transformations: changes, parts, reviewed: true }).status === 'regular';
  } catch { return false; }
}

/** Shared by Bulk review and the selectable ADLE projection. Multiple family
 * keys are acceptable only when the anchor identifies the same approved sense. */
export function canonicalBaseWordFamilyMembership(input: {
  displayWord: string; parts: CanonicalPart[]; joins: unknown[]; transformations: unknown[]; wordSum: string;
  anchor: { familyKey: string; equivalentFamilyKeys?: string[]; parts: CanonicalPart[] };
  links: readonly { familyKey: string; componentPartId: string; relationshipKind: string }[];
}) {
  const keys = new Set([input.anchor.familyKey, ...input.anchor.equivalentFamilyKeys ?? []]);
  const links = input.links.filter(link => keys.has(link.familyKey) &&
    input.parts.some(part => part.id === link.componentPartId && part.kind === 'base'));
  if (!links.length || new Set(links.map(link => link.componentPartId)).size !== 1) return null;
  const link = links[0];
  return canonicalBaseWordAnalysis({ ...input, componentPartId: link.componentPartId,
    baseSource: input.anchor.parts[0].sourceText, relationshipKind: link.relationshipKind }) ? link : null;
}
