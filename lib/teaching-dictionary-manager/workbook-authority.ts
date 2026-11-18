import { semanticJson } from "../adle/inflection/semantic-json";
import type { MultiSenseCsvBundle } from "./multi-sense-csv";

/** A reviewed workbook supersedes saved facts, while the RPC still guards concurrent writes. */
export function reviewedWorkbookAuthority(incoming: MultiSenseCsvBundle, current?: MultiSenseCsvBundle) {
  if (!current) return { bundle: incoming, replacedFields: [] as string[] };
  const replacedFields: string[] = [];
  if (semanticJson(incoming.senseSet.senses) !== semanticJson(current.senseSet.senses))
    replacedFields.push("meanings and dictation");
  if (semanticJson(incoming.senseSet.pronunciations) !== semanticJson(current.senseSet.pronunciations))
    replacedFields.push("pronunciation and syllables");
  const parts = (bundle: MultiSenseCsvBundle) => bundle.analyses.map(({ senseId, parts, joins, transformations }) =>
    ({ senseId, parts, joins, transformations }));
  if (semanticJson(parts(incoming)) !== semanticJson(parts(current))) replacedFields.push("word parts and spelling changes");
  const families = (bundle: MultiSenseCsvBundle) => bundle.analyses.map(({ senseId, familyKey, componentPartId, relationshipKind }) =>
    ({ senseId, familyKey, componentPartId, relationshipKind }));
  if (semanticJson(families(incoming)) !== semanticJson(families(current))) replacedFields.push("family links");
  return { bundle: { ...incoming, sourceSenseReviewedAt: current.sourceSenseReviewedAt }, replacedFields };
}
