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
