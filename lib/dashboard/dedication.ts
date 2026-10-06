export type DedicationPeriod = "week" | "month" | "last-month" | "six-months";
export type CoinEvent = { child_id: string; event_type: string; amount: number; created_at: string };

export function londonDateKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function shiftDate(key: string, days: number) {
  const date = new Date(key + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dedicationBounds(period: DedicationPeriod, now = new Date()) {
  const today = londonDateKey(now);
  const date = new Date(today + "T12:00:00Z");
  const tomorrow = shiftDate(today, 1);
  if (period === "week") {
    const weekday = (date.getUTCDay() + 6) % 7;
    return { start: shiftDate(today, -weekday), end: tomorrow };
  }
  if (period === "month") return { start: today.slice(0, 7) + "-01", end: tomorrow };
  if (period === "last-month") {
    date.setUTCDate(1);
    const end = date.toISOString().slice(0, 10);
    date.setUTCMonth(date.getUTCMonth() - 1);
    return { start: date.toISOString().slice(0, 10), end };
  }
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 5);
  return { start: date.toISOString().slice(0, 10), end: tomorrow };
}

export function earnedCoinsByChild(events: CoinEvent[], period: DedicationPeriod, now = new Date()) {
  const { start, end } = dedicationBounds(period, now);
  const totals = new Map<string, number>();
  for (const event of events) {
    const day = londonDateKey(event.created_at);
    if (day < start || day >= end) continue;
    if (!event.event_type.startsWith("earned_") && event.event_type !== "converted_from_bar") continue;
    totals.set(event.child_id, (totals.get(event.child_id) ?? 0) + event.amount);
  }
  return totals;
}
