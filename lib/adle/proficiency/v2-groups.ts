import { createHash } from "node:crypto";

export interface V2GroupWord {
  id: string;
  normalisedWord: string;
}

export interface V2FamilyMember {
  canonical_word_id: string;
  base_word_family_id: string;
  row_status: string;
  review_status: string;
}

export interface V2CanonicalFamily {
  id: string;
  decision_status: string;
  canonical_base_word_id?: string | null;
}

export interface V2CanonicalMember {
  canonical_family_id: string;
  canonical_word_id: string;
  source_family_keys: string[];
}

export interface V2LegacyFamily {
  base_family_key: string;
  micro_skill_key: string;
  row_status: string;
  review_status: string;
}

export interface V2CompoundFact {
  canonical_word_id: string;
  micro_skill_key: string;
  first_word: string;
  second_word: string;
  assignment_eligible: boolean;
  row_status: string;
  review_status: string;
}

export interface V2Morphology {
  canonical_word_id: string;
  morphology_parts: unknown;
  analysis_status: string;
  row_status: string;
  review_status: string;
}

export interface V2WordGroup {
  key: string;
  source: "released_base_family" | "reviewed_morphology" | "exact_word" | "unresolved";
  resolved: boolean;
}

const APPROVED = new Set(["approved", "human_approved", "approved_for_guided_review", "approved_for_first_exposure"]);

/** Use released membership first. Reviewed base/root parts are the only generic
 * morphology fallback; an unreviewed derivative cannot add root breadth. */
export function deriveV2WordGroups(input: {
  words: readonly V2GroupWord[];
  members?: readonly V2FamilyMember[];
  canonicalFamilies?: readonly V2CanonicalFamily[];
  canonicalMembers?: readonly V2CanonicalMember[];
  legacyFamilies?: readonly V2LegacyFamily[];
  compoundFacts?: readonly V2CompoundFact[];
  morphology: readonly V2Morphology[];
}): { byWordId: Map<string, V2WordGroup>; forSkill: (wordId: string, skillKey: string, relatedWordIds?: ReadonlySet<string>) => V2WordGroup | undefined; fingerprint: string } {
  const byWordId = new Map<string, V2WordGroup>();
  const memberGroups = new Map<string, Set<string>>();
  for (const member of input.members ?? []) {
    if (member.row_status !== "active" || !APPROVED.has(member.review_status)) continue;
    const set = memberGroups.get(member.canonical_word_id) ?? new Set<string>();
    set.add(member.base_word_family_id);
    memberGroups.set(member.canonical_word_id, set);
  }
  const reviewedCanonical = new Set((input.canonicalFamilies ?? [])
    .filter((family) => family.decision_status === "owner_reviewed").map((family) => family.id));
  const baseWordByFamily = new Map((input.canonicalFamilies ?? [])
    .map((family) => [family.id, family.canonical_base_word_id ?? null] as const));
  const canonicalByWord = new Map<string, V2CanonicalMember[]>();
  for (const member of input.canonicalMembers ?? []) {
    const rows = canonicalByWord.get(member.canonical_word_id) ?? [];
    rows.push(member);
    canonicalByWord.set(member.canonical_word_id, rows);
  }
  const activeKeysBySkill = new Map<string, Set<string>>();
  for (const family of input.legacyFamilies ?? []) {
    if (family.row_status !== "active" || !APPROVED.has(family.review_status)) continue;
    const keys = activeKeysBySkill.get(family.micro_skill_key) ?? new Set<string>();
    keys.add(family.base_family_key);
    activeKeysBySkill.set(family.micro_skill_key, keys);
  }
  const compoundBySkillWord = new Map<string, string>();
  for (const fact of input.compoundFacts ?? []) {
    if (fact.row_status !== "active" || !APPROVED.has(fact.review_status) || !fact.assignment_eligible) continue;
    const first = fact.first_word.trim().toLowerCase();
    const second = fact.second_word.trim().toLowerCase();
    if (!first || !second) continue;
    compoundBySkillWord.set(`${fact.micro_skill_key}\u0000${fact.canonical_word_id}`, `compound:${first}|${second}`);
  }
  const morphologyRoots = new Map<string, Set<string>>();
  for (const row of input.morphology) {
    if (row.row_status !== "active" || row.analysis_status !== "approved" || !APPROVED.has(row.review_status)) continue;
    const roots = new Set<string>();
    for (const part of Array.isArray(row.morphology_parts) ? row.morphology_parts : []) {
      if (!part || typeof part !== "object") continue;
      const value = part as Record<string, unknown>;
      const type = String(value.type ?? "").toLowerCase();
      const root = String(value.text ?? "").trim().toLowerCase();
      if ((type === "base" || type === "root") && root) roots.add(root);
    }
    if (roots.size) morphologyRoots.set(row.canonical_word_id, roots);
  }
  const dictionaryForms = new Set(input.words.map((word) => word.normalisedWord));
  const inferredBase = (word: string): string | null => {
    const candidates = new Set<string>();
    for (const suffix of ["ing", "ed", "es", "s", "er", "est", "ly", "ness", "ful", "less", "ment", "able", "ible", "tion"]) {
      if (!word.endsWith(suffix) || word.length <= suffix.length + 2) continue;
      const stem = word.slice(0, -suffix.length);
      for (const candidate of [stem, `${stem}e`, `${stem}y`, stem.endsWith("i") ? `${stem.slice(0, -1)}y` : "",
        stem.length > 2 && stem.at(-1) === stem.at(-2) ? stem.slice(0, -1) : ""]) {
        if (candidate && dictionaryForms.has(candidate)) candidates.add(candidate);
      }
    }
    return candidates.size === 1 ? [...candidates][0] : null;
  };
  for (const word of input.words) {
    const members = memberGroups.get(word.id);
    const roots = morphologyRoots.get(word.id);
    if (members?.size === 1) byWordId.set(word.id, { key: `family:${[...members][0]}`, source: "released_base_family", resolved: true });
    else if (members && members.size > 1) byWordId.set(word.id, { key: "unresolved:family", source: "unresolved", resolved: false });
    else if (roots?.size === 1) byWordId.set(word.id, { key: `root:${[...roots][0]}`, source: "reviewed_morphology", resolved: true });
    else if (roots && roots.size > 1) byWordId.set(word.id, { key: "unresolved:root", source: "unresolved", resolved: false });
    else {
      const base = inferredBase(word.normalisedWord);
      byWordId.set(word.id, { key: `word:${base ?? word.normalisedWord}`, source: "exact_word", resolved: !base });
    }
  }
  const idByForm = new Map(input.words.map((word) => [word.normalisedWord, word.id]));
  for (const word of input.words) {
    const group = byWordId.get(word.id);
    if (!group || group.source === "released_base_family") continue;
    const baseForm = group.key.startsWith("root:") ? group.key.slice(5) :
      group.key.startsWith("word:") ? group.key.slice(5) : "";
    if (!baseForm || baseForm === word.normalisedWord) continue;
    const baseId = idByForm.get(baseForm);
    const baseGroup = baseId ? byWordId.get(baseId) : null;
    if (baseGroup?.resolved) byWordId.set(word.id, { key: baseGroup.key,
      source: baseGroup.source, resolved: true });
  }
  const fallbackByWordId = new Map(byWordId);
  for (const word of input.words) {
    const canonical = canonicalByWord.get(word.id) ?? [];
    if (canonical.length === 1 && reviewedCanonical.has(canonical[0].canonical_family_id)) {
      byWordId.set(word.id, { key: `family:${canonical[0].canonical_family_id}`, source: "released_base_family", resolved: true });
    } else if (canonical.length > 1) {
      byWordId.set(word.id, { key: "unresolved:family", source: "unresolved", resolved: false });
    }
  }
  const forSkill = (wordId: string, skillKey: string, relatedWordIds?: ReadonlySet<string>): V2WordGroup | undefined => {
    if (skillKey.startsWith("D4_MOR_COMPOUND_WORDS_")) {
      const compound = compoundBySkillWord.get(`${skillKey}\u0000${wordId}`);
      return compound ? { key: compound, source: "reviewed_morphology", resolved: true }
        : { key: "unresolved:compound_fact", source: "unresolved", resolved: false };
    }
    const canonical = canonicalByWord.get(wordId) ?? [];
    if (!canonical.length && relatedWordIds) {
      const roots = morphologyRoots.get(wordId);
      if (roots && roots.size > 1) {
        const applicableRoots = [...roots].filter((root) => {
          const baseId = idByForm.get(root);
          return baseId && relatedWordIds.has(baseId);
        });
        if (applicableRoots.length === 1) {
          const baseGroup = byWordId.get(idByForm.get(applicableRoots[0])!);
          if (baseGroup?.resolved) return baseGroup;
        }
      }
    }
    const activeKeys = activeKeysBySkill.get(skillKey);
    const applicable = activeKeys ? canonical.filter((member) =>
      member.source_family_keys.some((key) => activeKeys.has(key))) : [];
    const ids = [...new Set(applicable.map((member) => member.canonical_family_id))];
    if (ids.length > 1) return { key: "unresolved:family", source: "unresolved", resolved: false };
    if (ids.length === 1) return reviewedCanonical.has(ids[0])
      ? { key: `family:${ids[0]}`, source: "released_base_family", resolved: true }
      : { key: "unresolved:family_review", source: "unresolved", resolved: false };
    if (canonical.length > 1 && relatedWordIds) {
      const matchingBases = [...new Set(canonical.filter((member) => {
        const baseId = baseWordByFamily.get(member.canonical_family_id);
        return baseId && relatedWordIds.has(baseId);
      }).map((member) => member.canonical_family_id))];
      if (matchingBases.length === 1 && reviewedCanonical.has(matchingBases[0]))
        return { key: `family:${matchingBases[0]}`, source: "released_base_family", resolved: true };
    }
    // A pending Base Word Lab merger does not erase independently reviewed
    // morphology or exact-word evidence for an unrelated spelling skill.
    return canonical.length === 1 ? byWordId.get(wordId) : fallbackByWordId.get(wordId);
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({
    groups: [...byWordId].sort(([a], [b]) => a.localeCompare(b)),
    canonical: (input.canonicalMembers ?? []).map((row) => [row.canonical_word_id, row.canonical_family_id,
      [...row.source_family_keys].sort()]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    decisions: (input.canonicalFamilies ?? []).map((row) => [row.id, row.decision_status, row.canonical_base_word_id ?? null])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    activeFamilies: [...activeKeysBySkill].map(([key, values]) => ({ key, values: [...values].sort() }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    compoundFacts: [...compoundBySkillWord].sort(([a], [b]) => a.localeCompare(b)),
  })).digest("hex");
  return { byWordId, forSkill, fingerprint };
}
