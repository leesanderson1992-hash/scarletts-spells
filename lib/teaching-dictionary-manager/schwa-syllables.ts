import { normaliseWrittenSyllableBreakdown, parseSyllableBreakdown } from "./authoring";
import type { WeakVowelRouteFactsV1 } from "./weak-vowel-authoring";

export const CUT_SOURCES = ["Use dictionary", "Reviewed alternative", "Review conflict"] as const;
/** Written letter divisions are canonical. A spoken syllable count is not a division. */
export function resolveSchwaSyllables(word: string, dictionary: string, activity = "", source = "") {
  const canonical = normaliseWrittenSyllableBreakdown(dictionary, word);
  const parts = canonical ? parseSyllableBreakdown(word, canonical) : null;
  const alternatives = activity.trim() ? activity.split("|").map(value => normaliseWrittenSyllableBreakdown(value, word)) : [];
  const conflict = alternatives.some(value => value !== canonical);
  const errors: string[] = [];
  if (source && !(CUT_SOURCES as readonly string[]).includes(source)) errors.push("Choose a listed activity cut source.");
  if (!parts) errors.push("Review the Dictionary written syllable divisions; they must join to the word.");
  if (source === "Review conflict" || conflict && !["Use dictionary", "Reviewed alternative"].includes(source))
    errors.push("Activity cuts conflict with Dictionary divisions. Choose Use dictionary or review an alternative.");
  if (source === "Reviewed alternative" && !alternatives.length) errors.push("Enter the reviewed alternative activity divisions.");
  const effective = source === "Reviewed alternative" ? alternatives.join(" | ") : canonical;
  return { canonical, effective, errors, conflict, source: source === "Reviewed alternative" ? "reviewed_alternative" as const : "dictionary" as const };
}
export function cutsToDivisions(word: string, sets?: number[][]) {
  return sets?.map(cuts => { const edges = [0, ...cuts, word.length]; return edges.slice(0, -1).map((start, i) => word.slice(start, edges[i + 1])).join("·"); }).join(" | ") ?? "";
}
/** Projection for a new lesson only; immutable publications and existing snapshots are preserved. */
export function projectSchwaSyllables(word: string, dictionary: string, facts: WeakVowelRouteFactsV1) {
  const resolved = resolveSchwaSyllables(word, dictionary, cutsToDivisions(word, facts.acceptedCutSets),
    facts.syllableSource === "dictionary" ? "Use dictionary" : facts.syllableSource === "reviewed_alternative" ? "Reviewed alternative" : "");
  const parts = parseSyllableBreakdown(word, resolved.effective.split("|")[0].trim());
  if (resolved.errors.length || !parts || resolved.source === "reviewed_alternative") return { facts, errors: resolved.errors };
  let at = 0;
  const cuts = parts.slice(0, -1).map(part => at += part.length);
  return { facts: { ...facts, acceptedCutSets: [cuts], target: { ...facts.target,
    syllableIndex: cuts.filter(cut => cut <= facts.target.start).length + 1 } }, errors: [] };
}
