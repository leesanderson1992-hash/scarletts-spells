export type WordLabCompletionStage =
  | "context_auth_ownership"
  | "plan_read_model"
  | "retry_guard"
  | "policy_learning_items"
  | "attempt_persistence"
  | "lesson_persistence"
  | "reflection_persistence"
  | "atomic_durable_completion"
  | "assignment_completion"
  | "redirect"
  | "completed_route_reads"
  | "reward_follow_up";

export interface WordLabCompletionTimingEvent {
  event: "adle_word_lab_completion_timing";
  traceId: string;
  outcome: string;
  totalMs: number;
  stages: Partial<Record<WordLabCompletionStage, number>>;
}

function elapsedMs(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

export class WordLabCompletionTimer {
  readonly traceId: string;
  private readonly startedAt = performance.now();
  private readonly stages: Partial<Record<WordLabCompletionStage, number>> = {};

  constructor(traceId: string) {
    this.traceId = traceId;
  }

  async measure<T>(stage: WordLabCompletionStage, task: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    try {
      return await task();
    } finally {
      this.stages[stage] = elapsedMs(startedAt);
    }
  }

  mark(stage: WordLabCompletionStage, startedAt: number): void {
    this.stages[stage] = elapsedMs(startedAt);
  }

  emit(outcome: string): void {
    const event: WordLabCompletionTimingEvent = {
      event: "adle_word_lab_completion_timing",
      traceId: this.traceId,
      outcome,
      totalMs: elapsedMs(this.startedAt),
      stages: this.stages,
    };
    console.info(JSON.stringify(event));
  }
}

export function safeCompletionTraceId(value: FormDataEntryValue | null, fallback: string): string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : fallback;
}
