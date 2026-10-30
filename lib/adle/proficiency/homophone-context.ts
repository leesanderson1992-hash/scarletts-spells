import type { V2Evidence } from "./v2";

export const HOMOPHONE_CONTEXT_EVIDENCE_VERSION = "HOMOPHONE_CONTEXT_EVIDENCE_V2_2026_10_30";
export const normalizeContextWord = (value: string) => value.trim().toLocaleLowerCase("en-GB").replaceAll("’", "'");
type Word = { id: string; normalised_word: string };
type Member = { micro_skill_key: string; member_normalized: string };
type Pair = { micro_skill_key: string; member_a: string; member_b: string };
type Assignment = { id: string; status: string; compiled_lesson_snapshot: unknown };
type Item = { id: string; daily_assignment_id: string; metadata: Record<string, unknown>; prompt_data: Record<string, unknown> };
type Attempt = { id: string; daily_assignment_id: string; assignment_item_id: string; canonical_word_id: string | null;
  attempt_text: string | null; is_correct: boolean | null; section_key: string; attempt_kind: string;
  source_ref: string; created_at: string; micro_skill_key: string | null };
type Checkpoint = { daily_assignment_id: string; adapter_key: string; lesson_snapshot_fingerprint: string;
  checkpoint_payload: { state?: { completed?: boolean; guided?: { dictationValues?: Record<string, string[]>;
    dictationChecked?: Record<string, boolean> } } }; completed_at: string | null };
type Passage = { id: string; targets: string[]; segments: string[] };
type Activity = { id: string; answerVisibility: string };
type Snapshot = { route?: { routeId?: string }; sourceFingerprint?: string; microSkillKey?: string;
  payload?: { resolvedLesson?: { activities?: Activity[]; lesson?: { microSkillKey?: string; dictationPassages?: Passage[] } } };
  guidedLesson?: { activities?: Activity[]; lesson?: { dictationPassages?: Passage[] } } };

/** Only exact approved alternatives diagnose a meaning choice; typos stay unscored. */
export function homophoneLessonEvidence(input: { attempts: readonly Attempt[]; words: readonly Word[];
  members: readonly Member[]; pairs: readonly Pair[]; assignments: readonly Assignment[];
  items: readonly Item[]; checkpoints: readonly Checkpoint[];
}): Map<string, V2Evidence[]> {
  const words = new Map(input.words.map(row => [row.id, normalizeContextWord(row.normalised_word)]));
  const wordIds = new Map(input.words.map(row => [normalizeContextWord(row.normalised_word), row.id]));
  const members = new Set(input.members.map(row => `${row.micro_skill_key}\u0000${normalizeContextWord(row.member_normalized)}`));
  const pairs = new Set(input.pairs.flatMap(row => [
    `${row.micro_skill_key}\u0000${normalizeContextWord(row.member_a)}\u0000${normalizeContextWord(row.member_b)}`,
    `${row.micro_skill_key}\u0000${normalizeContextWord(row.member_b)}\u0000${normalizeContextWord(row.member_a)}`]));
  const assignments = new Map(input.assignments.filter(row => row.status === "completed").map(row => [row.id, row]));
  const items = new Map(input.items.map(row => [row.id, row]));
  const result = new Map<string, V2Evidence[]>();
  const emit = (source: string, skill: string, wordId: string, expected: string, answer: string, stamp: string) => {
    const chosen = normalizeContextWord(answer);
    if (!/^\d{4}-\d{2}-\d{2}/.test(stamp) || !members.has(`${skill}\u0000${expected}`)) return;
    if (chosen !== expected && !pairs.has(`${skill}\u0000${chosen}\u0000${expected}`)) return;
    const event: V2Evidence = { eventId: source, wordId, groupKey: `role:${expected}`,
      occurredOn: stamp.slice(0, 10), polarity: chosen === expected ? "positive" : "negative",
      environment: "CONTROLLED_LESSON", challengeKey: null, sourceKind: "homophone_lesson_dictation" };
    result.set(skill, [...(result.get(skill) ?? []), event]);
  };
  for (const row of input.attempts) {
    if (row.section_key !== "lesson_dictation" || row.attempt_kind !== "lesson_dictation"
      || !row.canonical_word_id || !row.micro_skill_key || !row.attempt_text) continue;
    const assignment = assignments.get(row.daily_assignment_id);
    const item = items.get(row.assignment_item_id);
    const snapshot = assignment?.compiled_lesson_snapshot as Snapshot | undefined;
    const activity = String(item?.prompt_data?.homophoneActivityId ?? "");
    const match = /^dictation:(\d+)$/.exec(activity);
    const passage = match && snapshot?.payload?.resolvedLesson?.lesson?.dictationPassages?.[Number(match[1])];
    const slot = Number(item?.prompt_data?.targetSlot);
    const expected = words.get(row.canonical_word_id);
    if (snapshot?.route?.routeId !== "homophone_word_lab" || !passage || !expected || !Number.isInteger(slot)
      || slot < 0 || slot > 1 || snapshot.payload?.resolvedLesson?.lesson?.microSkillKey !== row.micro_skill_key
      || !snapshot.payload?.resolvedLesson?.activities?.some(activity =>
        activity.id === `dictation-${Number(match?.[1]) + 1}` && activity.answerVisibility === "recall_neutral")
      || normalizeContextWord(passage.targets?.[slot] ?? "") !== expected
      || item?.daily_assignment_id !== row.daily_assignment_id
      || item.metadata?.microSkillKey !== row.micro_skill_key || item.metadata?.canonicalWordId !== row.canonical_word_id
      || item.prompt_data?.passageId !== passage.id || item.prompt_data?.targetSlot !== slot
      || JSON.stringify(item.prompt_data?.segments) !== JSON.stringify(passage.segments)
      || !row.source_ref.endsWith(`:${row.micro_skill_key}:passage:${passage.id}:slot:${slot}`)
      || row.is_correct !== (normalizeContextWord(row.attempt_text) === expected)) continue;
    emit(`homophone-dictation:${row.id}`, row.micro_skill_key, row.canonical_word_id,
      expected, row.attempt_text, row.created_at);
  }
  for (const checkpoint of input.checkpoints) {
    const assignment = assignments.get(checkpoint.daily_assignment_id);
    const snapshot = assignment?.compiled_lesson_snapshot as Snapshot | undefined;
    const state = checkpoint.checkpoint_payload?.state;
    if (checkpoint.adapter_key !== "homophone_contextual_v1" || !checkpoint.completed_at
      || state?.completed !== true || snapshot?.route?.routeId !== "homophone_contextual_choice"
      || checkpoint.lesson_snapshot_fingerprint !== snapshot.sourceFingerprint || !snapshot.microSkillKey) continue;
    for (const [index, passage] of (snapshot.guidedLesson?.lesson?.dictationPassages ?? []).entries()) {
      const answers = state.guided?.dictationValues?.[String(index)];
      if (state.guided?.dictationChecked?.[String(index)] !== true || answers?.length !== 2
        || passage.targets?.length !== 2 || passage.segments?.length !== 3
        || !snapshot.guidedLesson?.activities?.some(activity =>
          activity.id === `dictation-${index + 1}` && activity.answerVisibility === "recall_neutral")) continue;
      for (const slot of [0, 1]) {
        const expected = normalizeContextWord(passage.targets[slot]);
        const wordId = wordIds.get(expected);
        if (wordId) emit(`homophone-checkpoint:${checkpoint.daily_assignment_id}:${passage.id}:${slot}`,
          snapshot.microSkillKey, wordId, expected, answers[slot], checkpoint.completed_at);
      }
    }
  }
  return result;
}
