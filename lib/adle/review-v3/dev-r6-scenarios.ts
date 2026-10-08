/** Development controls only; never imported by a learner route. */
export const REVIEW_R6_QA_SCENARIOS = [
  { id: "review-lesson", label: "Review + specialist lesson", note: "Start with the frozen wheel; complete Review to open the Base Word Family lesson." },
  { id: "review-only", label: "Review only", note: "Complete Review to reach the shared final Celebration." },
  { id: "lesson-only", label: "Lesson only", note: "Open the real Base Word Family adapter with no Review." },
  { id: "nothing-due", label: "Nothing due", note: "The existing empty-plan presentation; no Review shell." },
  { id: "ten-targets", label: "10 Target Words", note: "Full wheel and writing journey with ten controlled targets." },
  { id: "one-target", label: "1 Target Word", note: "Full wheel and writing journey with one controlled target." },
  { id: "five-targets", label: "5 Target Words", note: "Full wheel and writing journey with five controlled targets." },
  { id: "known-misspelling", label: "Known misspelling", note: "Submitted neccesary: the authoritative development mapping goes straight to repair readiness." },
  { id: "learner-confirmed", label: "Learner-confirmed misspelling", note: "Submitted Wensday: answer Yes and highlight the attempted form." },
  { id: "suggested-candidate", label: "Suggested candidate", note: "Submitted buisness: neutral Yes/No attribution, without revealing the target." },
  { id: "audio-failure", label: "Audio-check failure", note: "Cold audio check was answered neccesary and is locked; continue into repair." },
  { id: "audio-sequence", label: "Several audio checks", note: "Three unused words, confirmed not attempted, ready for audio-only retrieval." },
  { id: "existing-cue", label: "Repair with existing Memory Cue", note: "Cold retrieval first. The saved cue appears only after failure and entering repair." },
  { id: "retry-second-success", label: "First repair failure → second success", note: "Resumes after one wrong retry. Study, cover, and answer necessary on the second attempt." },
  { id: "retry-second-failure", label: "Second repair failure", note: "Resumes after two wrong retries at the terminal attempted-not-secured state." },
  { id: "resume-writing", label: "Resumed mid-writing", note: "A substantial local draft and running timer, restored from server-side fixture storage." },
  { id: "resume-compare", label: "Resumed Compare", note: "The original answer is frozen; repair comparison is open." },
  { id: "resume-cue", label: "Resumed Memory Cue", note: "The tricky-part selection is saved; write a personal cue." },
  { id: "resume-look", label: "Resumed Look", note: "Saved personal cue and tricky part, ready to study." },
  { id: "resume-cover", label: "Resumed Cover", note: "The correct spelling and cue are hidden, with the durable Cover stage restored." },
  { id: "resume-try", label: "Resumed Try Again", note: "The covered word remains hidden; a single repair answer can be checked." },
  { id: "timer-warning", label: "Timer near expiry", note: "Writing resumes with 25 seconds remaining. Real timer policy; no clock override in learner code." },
  { id: "timer-expired", label: "Timer expired / parent extension", note: "Use only the disposable QA passphrase qa-parent. Never enter a real password." },
  { id: "review-finalized", label: "Review finalized → lesson", note: "Review is already frozen and finalized locally; continue to the real specialist adapter." },
  { id: "lesson-reflection", label: "Specialist final reflection", note: "Seeded completed specialist attempts; write a reflection and use the real Finish Word Lab control." },
  { id: "celebration", label: "Final Celebration", note: "Shared final Celebration with no fabricated reward awards and one local completion receipt." },
] as const;

export type ReviewR6QaScenario = typeof REVIEW_R6_QA_SCENARIOS[number]["id"];
export function isReviewR6QaScenario(value: unknown): value is ReviewR6QaScenario {
  return REVIEW_R6_QA_SCENARIOS.some((scenario) => scenario.id === value);
}

export const REVIEW_R6_QA_ROUTE = "/dev/adle/review-r6";
export const REVIEW_R6_QA_API = "/api/dev/adle/review-r6";

export function reviewR6QaEnabled(env: { NODE_ENV?: string; ADLE_REVIEW_R6_QA?: string }, host: string): boolean {
  return env.NODE_ENV === "development" && env.ADLE_REVIEW_R6_QA === "1"
    && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host);
}
