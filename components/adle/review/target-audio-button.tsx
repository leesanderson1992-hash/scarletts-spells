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
      className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-white text-lg text-[color:var(--scarlett)] shadow-sm transition hover:border-[color:var(--scarlett)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(194,24,91,0.2)]"
      aria-label={`Play target word ${props.index + 1}`}
      title={`Play target word ${props.index + 1}`}
    >
      <span aria-hidden="true">🔊</span>
    </button>
  );
}
