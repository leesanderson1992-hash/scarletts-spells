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
  members: readonly V2FamilyMember[];
  morphology: readonly V2Morphology[];
}): { byWordId: Map<string, V2WordGroup>; fingerprint: string } {
  const byWordId = new Map<string, V2WordGroup>();
  const memberGroups = new Map<string, Set<string>>();
  for (const member of input.members) {
    if (member.row_status !== "active" || !APPROVED.has(member.review_status)) continue;
    const set = memberGroups.get(member.canonical_word_id) ?? new Set<string>();
    set.add(member.base_word_family_id);
    memberGroups.set(member.canonical_word_id, set);
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
  const fingerprint = createHash("sha256").update(JSON.stringify([...byWordId].sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
  return { byWordId, fingerprint };
}
