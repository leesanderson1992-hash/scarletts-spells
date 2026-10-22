import type { AdleMajorStage } from "./r6-session-contracts";

export type OpenAdleSession = {
  daily_assignment_id: string;
  assignment_date: string;
  major_stage: AdleMajorStage;
  review_generation_status: string;
};

export type LaterReviewProgress = {
  stage: string;
  completed_at: string | null;
  selected_challenge_type: string | null;
  writing_started_at: string | null;
  submitted_writing_text: string | null;
};

/** A later, untouched Review may wait behind an older specialist stage.
 * Other overlaps remain blocked until they can be inspected individually. */
export function canResumeOlderAdleSession(
  sessions: readonly OpenAdleSession[],
  laterReview: LaterReviewProgress | null,
): boolean {
  if (sessions.length !== 2 || !laterReview) return false;
  const [older, newer] = sessions;
  return older.daily_assignment_id !== newer.daily_assignment_id
    && older.assignment_date < newer.assignment_date
    && older.review_generation_status === "completed"
    && ["blocked", "specialist_generation", "specialist_lesson"].includes(older.major_stage)
    && newer.major_stage === "review"
    && laterReview.stage === "challenge_selection"
    && laterReview.completed_at === null
    && laterReview.selected_challenge_type === null
    && laterReview.writing_started_at === null
    && laterReview.submitted_writing_text === null;
}
