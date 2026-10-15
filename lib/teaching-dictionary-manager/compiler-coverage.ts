/** Find one real compiler witness for every member, without sampling or an arbitrary cutoff. */
export function compilerCoverage<T>(
  ids: readonly string[],
  lessonSize: number,
  compile: (ids: string[]) => T | null,
): {
  complete: boolean;
  witnesses: Record<string, string[]>;
  previews: T[];
} {
  const members = [...new Set(ids)].sort();
  const witnesses: Record<string, string[]> = {};
  const previews: T[] = [];
  const tried = new Set<string>();
  function* choose(
    pool: string[],
    count: number,
    start = 0,
    selected: string[] = [],
  ): Generator<string[]> {
    if (selected.length === count) {
      yield selected;
      return;
    }
    for (let i = start; i <= pool.length - (count - selected.length); i++)
      yield* choose(pool, count, i + 1, [...selected, pool[i]!]);
  }
  if (members.length < lessonSize)
    return { complete: false, witnesses, previews };
  for (const target of members) {
    if (witnesses[target]) continue;
    for (const others of choose(
      members.filter((id) => id !== target),
      lessonSize - 1,
    )) {
      const selection = [target, ...others].sort();
      const key = selection.join(":");
      if (tried.has(key)) continue;
      tried.add(key);
      const payload = compile(selection);
      if (!payload) continue;
      for (const id of selection) witnesses[id] = selection;
      previews.push(payload);
      break;
    }
  }
  return {
    complete: members.every((id) => Boolean(witnesses[id])),
    witnesses,
    previews,
  };
}
