/** A display label only. Never use this in place of a family key or sense ID. */
export function familyDisplayName(family: {
  base: string; meaning?: string | null; partOfSpeech?: string | null; kind?: string | null;
}): string {
  const base = family.base.trim();
  const role = family.kind === "bound_root" ? "root"
    : family.partOfSpeech?.trim().replaceAll("_", " ") || "base";
  const meaning = family.meaning?.trim().replace(/[.!]$/u, "");
  return `${base} (${role})${meaning ? ` — ${meaning}` : ""}`;
}

export function lexicalFamilyDisplayName(family: {
  base_lemma: string; base_meaning?: string | null; base_part_of_speech?: string | null; base_kind?: string | null;
}): string {
  return familyDisplayName({ base: family.base_lemma, meaning: family.base_meaning,
    partOfSpeech: family.base_part_of_speech, kind: family.base_kind });
}

/** Only for historical records without a recorded base lemma. New labels use facts. */
export function legacyFamilyBase(key: string): string {
  return key.split(/_(?:noun|verb|adjective|adverb|preposition|pronoun|conjunction|determiner|function_word|bound_root|root|base_family)(?:_|$)/u)[0]
    .replaceAll("_", " ");
}
