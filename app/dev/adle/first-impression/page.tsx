import { notFound } from "next/navigation";

import { FirstImpressionAcceptanceFixture } from "./preview";

export default async function FirstImpressionDevPage(props: {
  searchParams?: Promise<{ pages?: string; stage?: string; locked?: string; teachingPage?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const search = await props.searchParams;
  const pageCount = search?.pages === "3" ? 3 : search?.pages === "2" ? 2 : 1;
  const requestedTeachingPage = Number(search?.teachingPage ?? "1");
  const initialTeachingPageIndex = Number.isInteger(requestedTeachingPage)
    ? Math.min(Math.max(requestedTeachingPage - 1, 0), pageCount)
    : 0;
  const stage = ["teaching", "activity", "cover", "dictation", "reflection"].includes(search?.stage ?? "")
    ? search?.stage as "teaching" | "activity" | "cover" | "dictation" | "reflection"
    : "teaching";
  return <FirstImpressionAcceptanceFixture pageCount={pageCount} initialStage={stage} initialTeachingPageIndex={initialTeachingPageIndex} lockedDictation={search?.locked === "1"} />;
}
