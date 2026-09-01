/**
 * Canonical timestamp token used at TypeScript/PostgreSQL fingerprint
 * boundaries. JavaScript dates carry millisecond precision, so governed
 * instants must be reduced to that precision before any envelope is built.
 */
export function canonicalUtcTimestampMilliseconds(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error("adle_canonical_timestamp_invalid");
  }
  const iso = instant.toISOString();
  return iso.endsWith(".000Z")
    ? `${iso.slice(0, -5)}+00:00`
    : `${iso.slice(0, -1)}+00:00`;
}
