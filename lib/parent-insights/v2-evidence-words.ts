import { isV2ScoredEvent, type V2Evidence } from "@/lib/adle/proficiency/v2";

export interface ParentV2EvidenceWord {
  id: string;
  word: string;
  groupKey: string;
  attempts: number;
  dates: number;
  independent: boolean;
  transfer: boolean;
}

/** Only positive events surviving V2 context-miss precedence are displayed. */
export function contributingV2Words(evidence: readonly V2Evidence[], familyKey: string, asOf: string,
  wordName: (id: string) => string): ParentV2EvidenceWord[] {
  const scored = evidence.filter((event) => event.occurredOn <= asOf && isV2ScoredEvent(event, familyKey));
  const missed = new Set(scored.filter((event) => event.polarity === "negative")
    .map((event) => `${event.groupKey}\u0000${event.occurredOn}`));
  const byWord = new Map<string, { groupKey: string; events: Set<string>; dates: Set<string>; independent: boolean; transfer: boolean }>();
  for (const event of scored) {
    if (event.polarity !== "positive" || missed.has(`${event.groupKey}\u0000${event.occurredOn}`)) continue;
    const entry = byWord.get(event.wordId) ?? { groupKey: event.groupKey, events: new Set<string>(),
      dates: new Set<string>(), independent: false, transfer: false };
    entry.events.add(event.eventId);
    entry.dates.add(event.occurredOn);
    entry.independent ||= event.environment !== "CONTROLLED_LESSON";
    entry.transfer ||= !!event.challengeKey;
    byWord.set(event.wordId, entry);
  }
  return [...byWord].map(([id, entry]) => ({ id, word: wordName(id), groupKey: entry.groupKey,
    attempts: entry.events.size, dates: entry.dates.size, independent: entry.independent,
    transfer: entry.transfer })).sort((a, b) => a.word.localeCompare(b.word));
}
