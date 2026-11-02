import { canonicalStructureBlockers } from "./authoring";
import { auditCanonicalMorphology } from "./canonical-morphology";
import { unreviewedAffixMeaningParts } from "./affix-meanings";
import type { WordDraftPayload } from "./contracts";

/** Explain the exact repairs needed without changing historical evidence. */
export function morphologyReviewGuidance(
  morphology: WordDraftPayload["canonicalMorphology"], displayWord: string,
  affixMeanings: Record<string, string[]>, linkedToFamily: boolean,
): string[] {
  const issues: string[] = [];
  const parts = morphology.parts as Record<string, unknown>[];
  if (parts.some((part) => part && typeof part === "object" &&
    ["text", "type", "role", "partType", "meaning", "start", "end"].some((key) => key in part)))
    issues.push("Older duplicate part fields need review. Editing a part or selecting Apply reviewed parts replaces them with the current format.");
  parts.forEach((part, index) => {
    if (!part || typeof part !== "object") return;
    if (!String(part.sourceText ?? "").trim())
      issues.push(`Part ${index + 1} needs its underlying form.`);
    if (!String(part.gloss ?? part.meaning ?? "").trim())
      issues.push(`Part ${index + 1} needs a reviewed meaning.`);
  });
  for (const index of unreviewedAffixMeaningParts(parts, affixMeanings))
    issues.push(`Part ${index} has an older affix meaning. Choose a reviewed meaning from its dropdown.`);
  for (const blocker of canonicalStructureBlockers(morphology, displayWord)) {
    if (blocker.startsWith("Canonical morphology transformation missing or inconsistent"))
      issues.push(blocker.replace("Canonical morphology transformation missing or inconsistent for", "Add a transformation for"));
    else if (blocker.startsWith("Transformation ") || blocker.includes("joins must") || blocker.includes("parts and joins must"))
      issues.push(blocker);
  }
  const format = auditCanonicalMorphology({ parts, joins: morphology.joins, displayWord, linkedToFamily });
  if (format.reason === "surface_spelling")
    issues.push(`The visible parts and joins must spell ${displayWord}.`);
  else if (format.reason === "duplicate_part_id")
    issues.push("The parts have duplicate identities. Rebuild the repeated part in the visual editor.");
  else if (!issues.length && format.status !== "canonical")
    issues.push("Check the visible letters and joins, then select Apply reviewed parts to confirm their display positions.");
  return [...new Set(issues)];
}
