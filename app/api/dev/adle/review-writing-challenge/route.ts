import { NextResponse } from "next/server";

import {
  hydrateReviewR3DevSession,
  resetReviewR3DevSession,
  submitReviewR3DevAudio,
  submitReviewR3DevWriting,
  answerReviewR31DevAttemptQuestion,
  answerReviewR31DevSuggestion,
  confirmReviewR31DevWritingSpan,
  beginReviewR4DevRepair,
  hydrateReviewR4DevSession,
  moveReviewR4DevToCover,
  moveReviewR4DevToTrickyPart,
  moveReviewR4DevToTryAgain,
  saveReviewR4DevMemoryCue,
  saveReviewR4DevTrickySpan,
  submitReviewR4DevRetry,
} from "@/lib/adle/review-v3/dev-store";

function unavailable() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return unavailable();
  if (new URL(request.url).searchParams.get("view") === "r4") {
    return NextResponse.json(hydrateReviewR4DevSession());
  }
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
  const encounterSubmission = {
    encounterId: String(body.encounterId ?? ""),
    idempotencyKey: String(body.idempotencyKey ?? ""),
  };
  if (body.action === "begin_repair") {
    return NextResponse.json(beginReviewR4DevRepair(encounterSubmission));
  }
  if (body.action === "move_to_tricky_part") {
    return NextResponse.json(moveReviewR4DevToTrickyPart(encounterSubmission));
  }
  if (body.action === "save_tricky_part") {
    return NextResponse.json(saveReviewR4DevTrickySpan({
      ...encounterSubmission,
      graphemeStart: Number(body.graphemeStart),
      graphemeEnd: Number(body.graphemeEnd),
      selectedText: String(body.selectedText ?? ""),
    }));
  }
  if (body.action === "save_memory_cue") {
    return NextResponse.json(saveReviewR4DevMemoryCue({
      ...encounterSubmission,
      cueText: String(body.cueText ?? ""),
      ...(typeof body.retainCueVersionId === "string"
        ? { retainCueVersionId: body.retainCueVersionId }
        : {}),
    }));
  }
  if (body.action === "move_to_cover") {
    return NextResponse.json(moveReviewR4DevToCover(encounterSubmission));
  }
  if (body.action === "move_to_try_again") {
    return NextResponse.json(moveReviewR4DevToTryAgain(encounterSubmission));
  }
  if (body.action === "submit_repair_retry") {
    return NextResponse.json(submitReviewR4DevRetry({
      ...encounterSubmission,
      response: String(body.response ?? ""),
    }));
  }
  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}

export async function DELETE() {
  if (process.env.NODE_ENV === "production") return unavailable();
  return NextResponse.json(resetReviewR3DevSession());
}
