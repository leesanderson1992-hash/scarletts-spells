import { WEAK_VOWEL_MICRO_SKILLS } from "@/lib/adle/word-lab/weak-vowel-dinner";
import type { WeakVowelRouteFactsV1 } from "./weak-vowel-authoring";
import { resolveSchwaSyllables } from "./schwa-syllables";
import { parseSyllableBreakdown } from "./authoring";
export const SCHWA_WORKBOOK_FIELDS = ["weak_vowel_target", "weak_vowel_occurrence", "weak_vowel_sound", "activity_syllables", "family_exploration", "age_band", "frequency_band", "complexity_band", "has_schwa"] as const;
export const SCHWA_SYLLABLE_FIELDS = ["written_syllable_breakdown", "activity_cut_source"] as const;
export type SchwaWorkbookFacts = Record<typeof SCHWA_WORKBOOK_FIELDS[number], string> & { lesson_family_key?: string; written_syllable_breakdown?: string; activity_cut_source?: string; syllable_review_epoch?: string };
export const isSchwaWorkbookSkill = (value: unknown): value is typeof WEAK_VOWEL_MICRO_SKILLS[number] =>
  typeof value === "string" && (WEAK_VOWEL_MICRO_SKILLS as readonly string[]).includes(value);
export function schwaWorkbookFacts(word: string, facts?: Partial<WeakVowelRouteFactsV1>): SchwaWorkbookFacts {
  const target = facts?.target;
  const before = target ? word.slice(0, target.start) : "";
  return { activity_cut_source: facts?.syllableSource === "dictionary" ? "Use dictionary" : facts?.syllableSource === "reviewed_alternative" ? "Reviewed alternative" : "", weak_vowel_target: target?.text ?? "", weak_vowel_occurrence: target ? String(before.split(target.text).length) : "",
    weak_vowel_sound: target?.soundType === "schwa" ? "Schwa" : target?.soundType === "other_unstressed" ? "Other unstressed vowel" : "",
    activity_syllables: facts?.acceptedCutSets?.length ? facts.acceptedCutSets.map(cuts => { const edges = [0, ...cuts, word.length]; return edges.slice(0, -1).map((start, i) => word.slice(start, edges[i + 1])).join("·"); }).join(" | ") : "",
    family_exploration: facts?.familyDecision === "approve" ? "Use approved family" : "Not used", age_band: "", frequency_band: "", complexity_band: "", has_schwa: "" };
}
/** Human-readable annotations become exact spans; an ambiguous vowel is never guessed. */
export function parseSchwaWorkbookFacts(word: string, fields: SchwaWorkbookFacts) {
  const resolved = fields.written_syllable_breakdown !== undefined
    ? resolveSchwaSyllables(word, fields.written_syllable_breakdown, fields.activity_syllables, fields.activity_cut_source) : null;
  const errors: string[] = [...resolved?.errors ?? []];
  const target = fields.weak_vowel_target.trim();
  const occurrence = Number(fields.weak_vowel_occurrence || "1");
  const starts = [...word.matchAll(/./gu)].map(m => m.index!).filter(index => target && word.startsWith(target, index));
  const start = Number.isSafeInteger(occurrence) && occurrence > 0 ? starts[occurrence - 1] : undefined;
  if (start === undefined) errors.push("Choose a target letter or ending and its occurrence in the word.");
  const vowels = [...target.matchAll(/[aeiouy]/gi)];
  if (vowels.length !== 1) errors.push("The target must contain exactly one written vowel; select a smaller target.");
  const soundType = fields.weak_vowel_sound === "Schwa" ? "schwa" : fields.weak_vowel_sound === "Other unstressed vowel" ? "other_unstressed" : "";
  if (!soundType) errors.push("Choose Schwa or Other unstressed vowel.");
  const parsedVariants = (resolved?.effective ?? fields.activity_syllables).trim().split("|").map(variant => parseSyllableBreakdown(word, variant));
  if (parsedVariants.some(segments => segments === null))
    errors.push("Enter spoken activity divisions that join to the word, separated by middle dots, for example a·bout. Keep spelling hyphens, as in re-·en·ter. Separate accepted alternatives with |.");
  const variants = parsedVariants.map(segments => segments ?? []);
  if (!["Not used", "Use approved family"].includes(fields.family_exploration)) errors.push("Choose whether to use approved family exploration.");
  const cutSets = variants.map(segments => { const cuts: number[] = []; let offset = 0;
    for (const segment of segments.slice(0, -1)) { offset += segment.length; cuts.push(offset); } return cuts;
  });
  const cuts = cutSets[0];
  const end = (start ?? 0) + target.length;
  const syllableIndex = cuts.filter(cut => cut <= (start ?? 0)).length + 1;
  return { errors, annotation: { acceptedCutSets: cutSets, target: { text: target, start: start ?? 0, end, syllableIndex, soundType },
    selectionTarget: { text: vowels[0]?.[0] ?? "", start: (start ?? 0) + (vowels[0]?.index ?? 0), end: (start ?? 0) + (vowels[0]?.index ?? 0) + 1 },
    detectiveVowelIndex: (start ?? 0) + (vowels[0]?.index ?? 0) } };
}
