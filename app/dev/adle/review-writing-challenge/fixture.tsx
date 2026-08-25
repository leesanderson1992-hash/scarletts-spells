"use client";

import { useEffect, useMemo, useState } from "react";

import { ReviewFreeWritingActivity } from "@/components/adle/review/review-free-writing-activity";
import type { CompiledReviewSnapshotV3 } from "@/lib/adle/review-v3/contracts";
import {
  resetReviewR3DevelopmentGateway,
  reviewR3DevelopmentGateway,
  reviewR4DevelopmentGateway,
} from "@/lib/adle/review-v3/dev-gateway";
import {
  browserReviewWritingChallengeDraftStore,
  reviewWritingChallengeDraftKey,
  type ReviewWritingChallengeDraftStore,
} from "@/lib/adle/review-v3/writing-challenge-draft";

export function ReviewWritingChallengeDevFixture(props: {
  snapshot: CompiledReviewSnapshotV3;
}) {
  const reviewR3Gateway = useMemo(() => reviewR3DevelopmentGateway(), []);
  const reviewR4Gateway = useMemo(() => reviewR4DevelopmentGateway(), []);
  const [draftStore, setDraftStore] = useState<ReviewWritingChallengeDraftStore | null>(null);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const store = browserReviewWritingChallengeDraftStore();
      const search = new URLSearchParams(window.location.search);
      if (search.get("retry") !== "incorrect" || store === null) {
        if (active) setDraftStore(store);
        return;
      }
      store.clear(reviewWritingChallengeDraftKey(props.snapshot));
      void resetReviewR3DevelopmentGateway().finally(() => {
        search.delete("retry");
        const nextSearch = search.toString();
        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
        );
        if (active) setDraftStore(store);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [props.snapshot]);
  if (draftStore === null) {
    return <section className="brand-card mx-auto max-w-3xl rounded-lg p-6" aria-busy="true" />;
  }
  return (
    <ReviewFreeWritingActivity
      snapshot={props.snapshot}
      draftStore={draftStore}
      reviewR3Gateway={reviewR3Gateway}
      reviewR4Gateway={reviewR4Gateway}
      requestParentReauthenticatedExtension={async () => true}
    />
  );
}
