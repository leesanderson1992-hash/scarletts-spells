import { notFound } from "next/navigation";

import { AdleReviewWorkDevFixture } from "./fixture";

export default function AdleReviewWorkDevPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <AdleReviewWorkDevFixture />;
}
