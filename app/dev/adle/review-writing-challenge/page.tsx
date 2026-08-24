import { notFound } from "next/navigation";

import { reviewWritingChallengeDevSnapshot } from "@/lib/adle/review-v3/dev-snapshot";
import { ReviewWritingChallengeDevFixture } from "./fixture";

export default function ReviewWritingChallengeDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ReviewWritingChallengeDevFixture snapshot={reviewWritingChallengeDevSnapshot()} />;
}
