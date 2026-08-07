const PRACTICE_TIME_ZONE = "Europe/London";

/** The programme's current authoritative local practice day. */
export function getLondonPracticeDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: PRACTICE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));
  const year = partByType.get("year");
  const month = partByType.get("month");
  const day = partByType.get("day");

  if (!year || !month || !day) {
    throw new Error("Unable to compute Europe/London practice date.");
  }

  return `${year}-${month}-${day}`;
}
