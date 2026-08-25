import { NextResponse } from "next/server";

import {
  hydrateReviewR3DevSession,
  resetReviewR3DevSession,
  submitReviewR3DevAudio,
  submitReviewR3DevWriting,
  answerReviewR31DevAttemptQuestion,
  answerReviewR31DevSuggestion,
  confirmReviewR31DevWritingSpan,
} from "@/lib/adle/review-v3/dev-store";

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET() {
  if (process.env.NODE_ENV === "production") return unavailable();
  return NextResponse.json(hydrateReviewR3DevSession());
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return unavailable();
  const body = await request.json() as Record<string, unknown>;
  if (body.action === "submit_writing") {
    return NextResponse.json(submitReviewR3DevWriting({
      finalWriting: String(body.finalWriting ?? ""),
      idempotencyKey: String(body.idempotencyKey ?? ""),
    }));
  }
  if (body.action === "submit_audio_check") {
    return NextResponse.json(submitReviewR3DevAudio({
      encounterId: String(body.encounterId ?? ""),
      response: String(body.response ?? ""),
      idempotencyKey: String(body.idempotencyKey ?? ""),
    }));
  }
  if (body.action === "confirm_suggestion" || body.action === "answer_attempt_question") {
    const submission = {
      encounterId: String(body.encounterId ?? ""),
      decision: body.decision === "yes" ? "yes" as const : "no" as const,
      idempotencyKey: String(body.idempotencyKey ?? ""),
    };
    return NextResponse.json(body.action === "confirm_suggestion"
      ? answerReviewR31DevSuggestion(submission)
      : answerReviewR31DevAttemptQuestion(submission));
  }
  if (body.action === "confirm_writing_span") {
    return NextResponse.json(confirmReviewR31DevWritingSpan({
      encounterId: String(body.encounterId ?? ""),
      startOffset: Number(body.startOffset),
      endOffset: Number(body.endOffset),
      idempotencyKey: String(body.idempotencyKey ?? ""),
    }));
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") return unavailable();
  return NextResponse.json(resetReviewR3DevSession());
}
