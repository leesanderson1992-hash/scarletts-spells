/** Pure selection for a contextual-choice assignment. The caller persists this result in its immutable snapshot. */
export type ReviewedContrastSet = {
  setId: string;
  setKey: string;
  memberWordIds: readonly string[];
  reviewStatus: "approved";
};

export type QueuedContrastItem = {
  canonicalWordId: string;
  intakeOn: string;
  status: "pending" | "pending_reteach";
};

export type FrozenContrastSelection = {
  setId: string;
  setKey: string;
  memberWordIds: string[];
};

/** Select no more than three complete reviewed sets. Never split a pair or triad. */
export function selectContrastSets(input: {
  sets: readonly ReviewedContrastSet[];
  queuedItems: readonly QueuedContrastItem[];
  masteredWordIds: ReadonlySet<string>;
  rotationIndex: number;
  maximumSets?: number;
}): FrozenContrastSelection[] {
  const maximum = Math.min(3, Math.max(1, Math.trunc(input.maximumSets ?? 3)));
  if (!Number.isSafeInteger(input.rotationIndex) || input.rotationIndex < 0) {
    throw new Error("contrast_rotation_index_invalid");
  }
  const seen = new Set<string>();
  const reviewed = input.sets.map(set => {
    if (set.reviewStatus !== "approved" || !set.setId || !set.setKey || seen.has(set.setId)
      || set.memberWordIds.length < 2 || set.memberWordIds.length > 3
      || new Set(set.memberWordIds).size !== set.memberWordIds.length) {
      throw new Error("contrast_set_invalid");
    }
    seen.add(set.setId);
    return set;
  });
  const queueDate = new Map<string, string>();
  for (const item of input.queuedItems) {
    if ((item.status !== "pending" && item.status !== "pending_reteach")
      || input.masteredWordIds.has(item.canonicalWordId)) continue;
    const previous = queueDate.get(item.canonicalWordId);
    if (!previous || item.intakeOn < previous) queueDate.set(item.canonicalWordId, item.intakeOn);
  }
  const queued = reviewed.flatMap(set => {
    const first = set.memberWordIds.map(id => queueDate.get(id)).filter((date): date is string => Boolean(date)).sort()[0];
    return first ? [{ set, first }] : [];
  }).sort((a, b) => a.first.localeCompare(b.first) || a.set.setKey.localeCompare(b.set.setKey));
  const selected = queued.slice(0, maximum).map(entry => entry.set);
  const selectedIds = new Set(selected.map(set => set.setId));
  const remaining = reviewed.filter(set => !selectedIds.has(set.setId)
    && set.memberWordIds.every(wordId => !input.masteredWordIds.has(wordId)))
    .sort((a, b) => a.setKey.localeCompare(b.setKey));
  if (remaining.length) {
    const offset = input.rotationIndex % remaining.length;
    const rotated = remaining.slice(offset).concat(remaining.slice(0, offset));
    selected.push(...rotated.slice(0, maximum - selected.length));
  }
  return selected.map(set => ({ setId: set.setId, setKey: set.setKey,
    memberWordIds: [...set.memberWordIds] }));
}
