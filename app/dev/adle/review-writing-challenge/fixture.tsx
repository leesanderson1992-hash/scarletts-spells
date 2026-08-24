"use client";

import { useEffect, useState } from "react";

import { ReviewFreeWritingActivity } from "@/components/adle/review/review-free-writing-activity";
import type { CompiledReviewSnapshotV3 } from "@/lib/adle/review-v3/contracts";
import {
  browserReviewWritingChallengeDraftStore,
  type ReviewWritingChallengeDraftStore,
} from "@/lib/adle/review-v3/writing-challenge-draft";

export function ReviewWritingChallengeDevFixture(props: {
  snapshot: CompiledReviewSnapshotV3;
}) {
  const [draftStore, setDraftStore] = useState<ReviewWritingChallengeDraftStore | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDraftStore(browserReviewWritingChallengeDraftStore());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (draftStore === null) {
    return <section className="brand-card mx-auto max-w-3xl rounded-lg p-6" aria-busy="true" />;
  }
  return (
    <ReviewFreeWritingActivity
      snapshot={props.snapshot}
      draftStore={draftStore}
      requestParentReauthenticatedExtension={async () => true}
    />
  );
}
