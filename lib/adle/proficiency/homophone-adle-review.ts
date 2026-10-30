import { createHash } from "node:crypto";
import { extractAdleAuthenticWriting } from "@/lib/writing-engine/whole-writing/authentic-use-credit";
import { sentenceContext } from "@/lib/writing-engine/whole-writing/sentence-context";
import type { V2Evidence } from "./v2";
import { normalizeContextWord } from "./homophone-context";

type Word = { id: string; normalised_word: string };
type Member = { micro_skill_key: string; member_normalized: string };
type Pair = { micro_skill_key: string; member_a: string; member_b: string };
type Credit = { id: string; adle_review_id: string | null; adle_source_id: string | null;
  canonical_word_id: string | null; occurrence_ids: string[]; observed_word: string; supplied_spelling: boolean };
type Review = { id: string; review_session_id: string; source_id: string; source_hash: string };
type Source = { id: string; review_session_id: string; submitted_text: string; source_hash: string; submitted_at: string };
type Receipt = { review_session_id: string };
type Choice = { id: string; review_session_id: string; source_hash: string; start_utf16: number;
  end_utf16: number; observed_text: string; intended_word: string; decision: string };
type Finding = { id: string; source_id: string; source_hash: string; start_utf16: number;
  end_utf16: number; observed_text: string };
type Decision = { id: string; finding_id: string; source_id: string; action: string; intended_word: string | null };

/** ADLE Review writing has its own reviewed source and occurrence lineage. */
export function homophoneAdleReviewEvidence(input: { words: readonly Word[]; members: readonly Member[];
  pairs: readonly Pair[]; credits: readonly Credit[]; reviews: readonly Review[];
  sources: readonly Source[]; receipts: readonly Receipt[]; choices: readonly Choice[];
  findings: readonly Finding[]; decisions: readonly Decision[];
}): Map<string, V2Evidence[]> {
  const result = new Map<string, V2Evidence[]>();
  const words = new Map(input.words.map(row => [row.id, normalizeContextWord(row.normalised_word)]));
  const wordIds = new Map(input.words.map(row => [normalizeContextWord(row.normalised_word), row.id]));
  const members = new Set(input.members.map(row => `${row.micro_skill_key}\u0000${normalizeContextWord(row.member_normalized)}`));
  const pairs = new Set(input.pairs.flatMap(row => [
    `${row.micro_skill_key}\u0000${normalizeContextWord(row.member_a)}\u0000${normalizeContextWord(row.member_b)}`,
    `${row.micro_skill_key}\u0000${normalizeContextWord(row.member_b)}\u0000${normalizeContextWord(row.member_a)}`]));
  const sources = new Map(input.sources.map(row => [row.id, row]));
  const reviews = new Map(input.reviews.map(row => [row.id, row]));
  const receipts = new Set(input.receipts.map(row => row.review_session_id));
  const extracted = new Map<string, ReturnType<typeof extractAdleAuthenticWriting>["occurrences"]>();
  const validSource = (source: Source | undefined) => source && receipts.has(source.review_session_id)
    && createHash("sha256").update(source.submitted_text).digest("hex") === source.source_hash
    && /^\d{4}-\d{2}-\d{2}/.test(source.submitted_at);
  const occurrenceFor = (source: Source) => {
    if (!extracted.has(source.id)) extracted.set(source.id, extractAdleAuthenticWriting({
      sourceId: source.id, sourceHash: source.source_hash, text: source.submitted_text }).occurrences);
    return extracted.get(source.id)!;
  };
  const emit = (skill: string, event: V2Evidence) => result.set(skill, [...(result.get(skill) ?? []), event]);
  const negatives = new Set<string>();
  const markNegative = (source: Source | undefined, start: number, end: number, observedValue: string,
    intendedValue: string, eventId: string) => {
    if (!validSource(source) || !source) return;
    const observed = normalizeContextWord(observedValue), intended = normalizeContextWord(intendedValue);
    if (source.submitted_text.slice(start, end) !== observedValue || observed === intended) return;
    const wordId = wordIds.get(intended);
    if (!wordId) return;
    for (const pair of input.pairs) {
      const skill = pair.micro_skill_key;
      if (!members.has(`${skill}\u0000${intended}`)
        || !pairs.has(`${skill}\u0000${observed}\u0000${intended}`)) continue;
      const key = `${source.id}\u0000${start}\u0000${end}\u0000${skill}`;
      if (negatives.has(key)) continue;
      negatives.add(key);
      emit(skill, { eventId, wordId, groupKey: `role:${intended}`,
        occurredOn: source.submitted_at.slice(0, 10), polarity: "negative", environment: "AUTHENTIC_WRITING",
        challengeKey: null, sourceKind: "parent_confirmed_adle_review_context" });
    }
  };
  for (const choice of input.choices) {
    if (choice.decision !== "confirmed") continue;
    const source = input.sources.find(row => row.review_session_id === choice.review_session_id);
    if (source?.source_hash === choice.source_hash) markNegative(source, choice.start_utf16, choice.end_utf16,
      choice.observed_text, choice.intended_word, `homophone-adle-choice:${choice.id}`);
  }
  const findings = new Map(input.findings.map(row => [row.id, row]));
  for (const decision of input.decisions) {
    if (decision.action !== "confirm" || !decision.intended_word) continue;
    const finding = findings.get(decision.finding_id), source = sources.get(decision.source_id);
    if (finding && source && finding.source_id === source.id && finding.source_hash === source.source_hash)
      markNegative(source, finding.start_utf16, finding.end_utf16, finding.observed_text,
        decision.intended_word, `homophone-adle-decision:${decision.id}`);
  }
  const seen = new Set<string>();
  for (const credit of input.credits) {
    const review = credit.adle_review_id && reviews.get(credit.adle_review_id);
    const source = credit.adle_source_id && sources.get(credit.adle_source_id);
    if (!review || !source || !validSource(source) || review.source_id !== source.id
      || review.review_session_id !== source.review_session_id || review.source_hash !== source.source_hash
      || credit.supplied_spelling || normalizeContextWord(credit.observed_word) !==
        (credit.canonical_word_id ? words.get(credit.canonical_word_id) : normalizeContextWord(credit.observed_word))) continue;
    const word = normalizeContextWord(credit.observed_word);
    const wordId = credit.canonical_word_id ?? wordIds.get(word);
    if (!wordId || !members.size) continue;
    const occurrences = new Map(occurrenceFor(source).map(row => [row.id, row]));
    for (const occurrenceId of credit.occurrence_ids) {
      const occurrence = occurrences.get(occurrenceId);
      if (!occurrence || normalizeContextWord(occurrence.observedText) !== word
        || seen.has(`${source.id}\u0000${occurrenceId}`)) continue;
      seen.add(`${source.id}\u0000${occurrenceId}`);
      const sentence = sentenceContext(source.submitted_text, occurrence.start, occurrence.end)?.text;
      const challengeKey = sentence ? `context:sentence:${createHash("sha256")
        .update(sentence.toLocaleLowerCase("en-GB").replace(/\s+/g, " ")).digest("hex")}` : null;
      for (const member of input.members) {
        const skill = member.micro_skill_key;
        if (normalizeContextWord(member.member_normalized) !== word || negatives.has(
          `${source.id}\u0000${occurrence.start}\u0000${occurrence.end}\u0000${skill}`)) continue;
        emit(skill, { eventId: `homophone-adle-credit:${source.id}:${occurrenceId}`, wordId,
          groupKey: `role:${word}`, occurredOn: source.submitted_at.slice(0, 10), polarity: "positive",
          environment: "AUTHENTIC_WRITING", challengeKey, sourceKind: "approved_adle_review_occurrence" });
      }
    }
  }
  return result;
}
