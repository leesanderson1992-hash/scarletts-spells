import type {
  ReviewR3AudioSubmission,
  ReviewR3Gateway,
  ReviewR3GatewayResult,
  ReviewR3SessionView,
  ReviewR3WritingSubmission,
} from "./r3-contracts";
import type {
  ReviewR4Gateway,
  ReviewR4GatewayResult,
  ReviewR4SessionView,
} from "./r4-contracts";

const ENDPOINT = "/api/dev/adle/review-writing-challenge";

async function post(body: Record<string, unknown>): Promise<ReviewR3GatewayResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Development Review R3 request failed (${response.status}).`);
  return response.json() as Promise<ReviewR3GatewayResult>;
}

async function postR4(body: Record<string, unknown>): Promise<ReviewR4GatewayResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Development Review R4 request failed (${response.status}).`);
  return response.json() as Promise<ReviewR4GatewayResult>;
}

export function reviewR3DevelopmentGateway(): ReviewR3Gateway {
  return {
    async hydrate(): Promise<ReviewR3SessionView | null> {
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      if (!response.ok) return null;
      return response.json() as Promise<ReviewR3SessionView>;
    },
    submitWriting(input: ReviewR3WritingSubmission) {
      return post({ action: "submit_writing", ...input });
    },
    submitAudioCheck(input: ReviewR3AudioSubmission) {
      return post({ action: "submit_audio_check", ...input });
    },
    confirmSuggestion(input) {
      return post({ action: "confirm_suggestion", ...input });
    },
    answerAttemptQuestion(input) {
      return post({ action: "answer_attempt_question", ...input });
    },
    confirmWritingSpan(input) {
      return post({ action: "confirm_writing_span", ...input });
    },
  };
}

export function reviewR4DevelopmentGateway(): ReviewR4Gateway {
  return {
    async hydrate(): Promise<ReviewR4SessionView> {
      const response = await fetch(`${ENDPOINT}?view=r4`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Development Review R4 hydrate failed (${response.status}).`);
      return response.json() as Promise<ReviewR4SessionView>;
    },
    beginRepair(input) { return postR4({ action: "begin_repair", ...input }); },
    moveToTrickyPart(input) { return postR4({ action: "move_to_tricky_part", ...input }); },
    saveTrickySpan(input) { return postR4({ action: "save_tricky_part", ...input }); },
    saveMemoryCue(input) { return postR4({ action: "save_memory_cue", ...input }); },
    moveToCover(input) { return postR4({ action: "move_to_cover", ...input }); },
    moveToTryAgain(input) { return postR4({ action: "move_to_try_again", ...input }); },
    submitRepairRetry(input) { return postR4({ action: "submit_repair_retry", ...input }); },
  };
}

export async function resetReviewR3DevelopmentGateway(): Promise<void> {
  const response = await fetch(ENDPOINT, { method: "DELETE" });
  if (!response.ok) throw new Error(`Development Review R3 reset failed (${response.status}).`);
}
