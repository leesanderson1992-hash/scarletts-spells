import type {
  ReviewR3AudioSubmission,
  ReviewR3Gateway,
  ReviewR3GatewayResult,
  ReviewR3SessionView,
  ReviewR3WritingSubmission,
} from "./r3-contracts";

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
  };
}

export async function resetReviewR3DevelopmentGateway(): Promise<void> {
  const response = await fetch(ENDPOINT, { method: "DELETE" });
  if (!response.ok) throw new Error(`Development Review R3 reset failed (${response.status}).`);
}
