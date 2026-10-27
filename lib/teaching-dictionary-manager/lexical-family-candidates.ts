import { normaliseWord } from "./contracts";
import type { FamilyCandidateMorphology } from "./base-family-candidates";

type Morphology = FamilyCandidateMorphology & { joins?: unknown; transformations?: unknown };

/** Older approved dictionary rows use type/text, so they are discoverable for
 * review even though they cannot be used to approve a lexical revision. */
export function approvedLexicalBaseTexts(morphology: Morphology | null): string[] {
  if (morphology?.analysisStatus !== "approved" ||
      morphology.reviewStatus !== "approved_for_first_exposure" ||
      !Array.isArray(morphology.parts)) return [];
  return [...new Set(morphology.parts.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const part = raw as Record<string, unknown>;
    if (part.kind !== "base" && part.type !== "base" && part.partType !== "free_base") return [];
    const source = part.sourceText ?? part.text;
    return typeof source === "string" && source.trim() ? [normaliseWord(source)] : [];
  }))];
}

/** Matches the database's exact approved-morphology requirement. Do not infer
 * editorial approval by upgrading legacy part objects during a read. */
export function lexicalMorphologyReady(
  morphology: Morphology | null,
  displayWord: string,
  baseLemma: string,
): boolean {
  if (morphology?.analysisStatus !== "approved" ||
      morphology.reviewStatus !== "approved_for_first_exposure" ||
      !Array.isArray(morphology.parts) || !morphology.parts.length ||
      !Array.isArray(morphology.joins) || !Array.isArray(morphology.transformations) ||
      !morphology.wordSum?.trim()) return false;
  const parts = morphology.parts as Record<string, unknown>[];
  return parts.every((part) => part && typeof part === "object" && !Array.isArray(part) &&
      typeof part.surfaceText === "string" && typeof part.sourceText === "string" &&
      typeof part.kind === "string") &&
    parts.map((part) => part.surfaceText).join("") === displayWord &&
    parts.some((part) => part.kind === "base" && normaliseWord(String(part.sourceText)) === baseLemma);
}
