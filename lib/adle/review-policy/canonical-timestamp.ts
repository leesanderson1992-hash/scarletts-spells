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

/**
 * Exact instant key for immutable scheduler-state comparison only.
 *
 * Unlike the persistence/fingerprint boundary above, this deliberately keeps
 * up to nanosecond fractional precision. It accepts the two governed text
 * forms emitted by PostgreSQL and Supabase (` ` or `T`, `+00` or `+00:00`),
 * normalizes their timezone offset, and does not make different instants in
 * the same millisecond compare equal.
 */
export function canonicalUtcTimestampExactComparison(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(value);
  if (!match) throw new Error("adle_canonical_timestamp_exact_invalid");
  const [, yearText, monthText, dayText, hourText, minuteText, secondText,
    fractionText = "", zone, sign, offsetHourText = "00", offsetMinuteText = "00"] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = Number(offsetHourText);
  const offsetMinute = Number(offsetMinuteText);
  if (offsetHour > 23 || offsetMinute > 59) {
    throw new Error("adle_canonical_timestamp_exact_invalid");
  }
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  if (
    local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
    || local.getUTCSeconds() !== second
  ) throw new Error("adle_canonical_timestamp_exact_invalid");
  const offsetDirection = zone === "Z" ? 0 : sign === "+" ? 1 : -1;
  const offsetSeconds = offsetDirection * ((offsetHour * 60 + offsetMinute) * 60);
  const epochSeconds = BigInt(Math.trunc(local.getTime() / 1000) - offsetSeconds);
  return `${epochSeconds}:${fractionText.padEnd(9, "0")}`;
}
