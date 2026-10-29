export type WeakVowelFamilyCandidate = {
  id: string;
  createdAt: string;
  baseFamilyKey: string;
  baseWordId: string;
  baseMeaning: string;
  memberIds: string[];
  eligibleMemberIds: string[];
  memberWords: string[];
};

export type WeakVowelFamilyChoice = {
  status: "ready" | "none" | "ambiguous";
  authorityId: string | null;
  members: string[];
};

/** The newest authority wins only when the reviewed family semantics agree. */
export function chooseWeakVowelFamily(candidates: readonly WeakVowelFamilyCandidate[]): WeakVowelFamilyChoice {
  if (!candidates.length) return { status: "none", authorityId: null, members: [] };
  const signatures = new Set(candidates.map((row) => JSON.stringify([
    row.baseFamilyKey, row.baseWordId, row.baseMeaning, [...row.memberIds].sort(),
    [...row.eligibleMemberIds].sort(),
  ])));
  if (signatures.size !== 1) return { status: "ambiguous", authorityId: null, members: [] };
  const newest = [...candidates].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  return { status: "ready", authorityId: newest.id, members: newest.memberWords };
}
