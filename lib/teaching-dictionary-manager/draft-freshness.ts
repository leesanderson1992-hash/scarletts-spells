/** A historical draft must not replace dictionary facts approved after it was saved. */
export function approvedFactsSupersedeDraft(
  draftCreatedAt: string | null | undefined,
  approvedFactDates: readonly (string | null | undefined)[],
): boolean {
  const draftTime = Date.parse(draftCreatedAt ?? "");
  return Number.isFinite(draftTime) && approvedFactDates.some((date) => {
    const factTime = Date.parse(date ?? "");
    return Number.isFinite(factTime) && factTime > draftTime;
  });
}

/** Identify only unpublished content whose source draft may need a freshness check. */
export function unpublishedDraftWordIds(
  rows: readonly Record<string, unknown>[],
  published: ReadonlySet<string>,
  rolledBack: ReadonlySet<string>,
  scopedWordId?: string,
): string[] {
  return [...new Set(rows.filter((row) =>
    !published.has(String(row.id)) && !rolledBack.has(String(row.id)) &&
    (!scopedWordId || row.canonical_word_id === scopedWordId),
  ).map((row) => String(row.canonical_word_id)))];
}
