"use client";

import { speakAuthoredNarration } from "@/components/adle/activities/shared/narration";
import type { ReviewTargetSnapshotV3 } from "@/lib/adle/review-v3/contracts";

export function TargetAudioButton(props: {
  index: number;
  target: ReviewTargetSnapshotV3;
  onPlay?: (target: ReviewTargetSnapshotV3, index: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (props.onPlay) {
          props.onPlay(props.target, props.index);
          return;
        }
        if (props.target.audioAuthority.kind === "speech_text") {
          speakAuthoredNarration(props.target.audioAuthority.speechText ?? "", "word");
        }
      }}
      className="review-audio"
      aria-label={`Play target word ${props.index + 1}`}
      title={`Play target word ${props.index + 1}`}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
      </svg>
      <span className="review-audio-number" aria-hidden="true">{props.index + 1}</span>
    </button>
  );
}
