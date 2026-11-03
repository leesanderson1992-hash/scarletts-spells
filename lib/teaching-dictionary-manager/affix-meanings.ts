import { getSharedAffixProfileMapping } from "@/lib/adle/morphology/shared-affix-profile-registry";

type PrefixProfile = { prefix_choices: unknown };
type SuffixProfile = { micro_skill_key: string; meaning_bins: unknown };
type ReviewedAffixMeaning = { part_kind: string; source_text: string; gloss: string };

/** The same reviewed choices drive the editor and the approval check. */
export function reviewedAffixMeanings(
  prefixProfiles: readonly PrefixProfile[], suffixProfiles: readonly SuffixProfile[],
  dictionaryMeanings: readonly ReviewedAffixMeaning[] = [],
): Record<string, string[]> {
  const meanings: Record<string, string[]> = {};
  const dictionaryForms = new Set<string>();
  const add = (form: string, meaning: string) => {
    if (!form || !meaning) return;
    const choices = meanings[form] ??= [];
    if (!choices.includes(meaning)) choices.push(meaning);
  };
  for (const row of dictionaryMeanings) {
    if (row.part_kind !== "prefix" && row.part_kind !== "suffix") continue;
    add(row.source_text, row.gloss);
    dictionaryForms.add(row.source_text);
  }
  for (const profile of prefixProfiles)
    for (const raw of Array.isArray(profile.prefix_choices) ? profile.prefix_choices : []) {
      const choice = raw as { text?: unknown; meaning?: unknown };
      if (typeof choice?.text === "string" && typeof choice?.meaning === "string")
        if (!dictionaryForms.has(choice.text)) add(choice.text, choice.meaning);
    }
  for (const profile of suffixProfiles)
    for (const form of getSharedAffixProfileMapping(profile.micro_skill_key)?.forms ?? [])
      for (const raw of Array.isArray(profile.meaning_bins) ? profile.meaning_bins : []) {
        const bin = raw as { label?: unknown; description?: unknown };
        const meaning = typeof bin?.description === "string" && bin.description ? bin.description : bin?.label;
        if (typeof meaning === "string" && typeof bin?.label === "string" && !dictionaryForms.has(form)) add(form, meaning);
      }
  return meanings;
}

/** A known affix form must use one of the currently reviewed meanings. */
export function unreviewedAffixMeaningParts(parts: readonly unknown[], choices: Record<string, string[]>): number[] {
  const invalid: number[] = [];
  parts.forEach((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
    const part = raw as Record<string, unknown>;
    const kind = String(part.kind ?? part.role ?? part.type ?? part.partType ?? "");
    if (kind !== "prefix" && kind !== "suffix") return;
    const form = String(part.sourceText || part.surfaceText || part.text || "");
    const reviewed = choices[form];
    if (reviewed?.length && !reviewed.includes(String(part.gloss ?? part.meaning ?? ""))) invalid.push(index + 1);
  });
  return invalid;
}
