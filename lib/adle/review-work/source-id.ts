export function buildAdleReviewWorkSourceId(input: {
  dailyAssignmentId: string;
  reviewSessionId: string;
}) {
  return `${input.dailyAssignmentId}:${input.reviewSessionId}`;
}

export function parseAdleReviewWorkSourceId(sourceId: string): {
  dailyAssignmentId: string;
  reviewSessionId: string;
} | null {
  let decodedSourceId: string;
  try {
    decodedSourceId = decodeURIComponent(sourceId);
  } catch {
    return null;
  }
  const [dailyAssignmentId, reviewSessionId, extra] = decodedSourceId.split(":");
  if (extra || !dailyAssignmentId || !reviewSessionId) return null;
  return { dailyAssignmentId, reviewSessionId };
}
