/** ADLE cover checks remain word evidence; they cannot certify V2 pattern use. */
export function isAdleCoverCheckSource(
  representations: readonly { sourceKind: string; sourceEntityId: string }[],
  coverAttemptIds: ReadonlySet<string>,
): boolean {
  return representations.some((representation) =>
    representation.sourceKind === "adle_assignment_attempt_event"
      && coverAttemptIds.has(representation.sourceEntityId));
}
