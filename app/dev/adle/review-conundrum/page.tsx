import { notFound } from "next/navigation";
import { ReviewFreeWritingActivity } from "@/components/adle/review/review-free-writing-activity";
import { reviewConundrumDevSnapshot } from "@/lib/adle/review-v3/dev-conundrum-snapshot";

export default async function ReviewConundrumDevPage({ searchParams }: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  // No persistence gateway, Supabase access or real learner identity.
  return (
    <div className="adle-presentation review-scene mx-auto max-w-6xl">
      <ReviewFreeWritingActivity snapshot={reviewConundrumDevSnapshot(params.invalid === "1")} />
    </div>
  );
}
