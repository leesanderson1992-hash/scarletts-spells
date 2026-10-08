"use client";

import { useState } from "react";
import { WordLabScene } from "@/components/adle/morphology/word-lab-scene";
import { ReviewFreeWritingActivity } from "@/components/adle/review/review-free-writing-activity";
import { reviewConundrumDevSnapshot } from "@/lib/adle/review-v3/dev-conundrum-snapshot";

const beat = {
  id: "review-lookbook-guide", activityId: "review-writing-challenge", state: "focus" as const,
  say: "Listen, remember, and use your Target Words in your own writing.",
  goal: "Complete today’s Review", waitFor: "learner progress", onComplete: "Continue to today’s lesson",
};

export function ReviewConundrumPreview({ invalid }: { invalid: boolean }) {
  const [muted, setMuted] = useState(true);
  return <WordLabScene beat={beat} phase={0} muted={muted} onMutedChange={setMuted} guideName="Review Guide"
    phases={["Review", "Write", "Check", "Repair", "Lesson"]}
    phaseCues={["Choose your challenge", "Use your Target Words", "Check each word", "Repair tricky parts", "Today’s lesson"]}>
    <ReviewFreeWritingActivity snapshot={reviewConundrumDevSnapshot(invalid)} />
  </WordLabScene>;
}
