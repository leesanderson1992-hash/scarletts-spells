import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isReviewR6QaScenario, REVIEW_R6_QA_ROUTE, reviewR6QaEnabled } from "@/lib/adle/review-v3/dev-r6-scenarios";
import { ReviewR6QaBoundary, ReviewR6QaFixture } from "./fixture";

export const dynamic = "force-dynamic";

export default async function ReviewR6QaPage(props: { searchParams: Promise<{ scenario?: string; run?: string }> }) {
  if (!reviewR6QaEnabled(process.env, (await headers()).get("host") ?? "")) notFound();
  const query = await props.searchParams;
  const scenario = query.scenario ?? "review-lesson";
  if (!isReviewR6QaScenario(scenario)) notFound();
  if (!query.run) redirect(`${REVIEW_R6_QA_ROUTE}?scenario=${scenario}&run=${randomUUID()}`);
  const { loadReviewR6QaState, validReviewR6QaRun } = await import("@/lib/adle/review-v3/dev-r6-files");
  if (!validReviewR6QaRun(query.run)) notFound();
  const state = loadReviewR6QaState(query.run, scenario);
  return <ReviewR6QaBoundary>
    <AppShell currentPath="/learn/week/adle" mode="child" activeChildId="dev-r6-qa-child"
      availableChildren={[{ id: "dev-r6-qa-child", first_name: "QA Learner", last_name: null }]} layout="focus">
      <ReviewR6QaFixture key={state.run} initialState={state} />
    </AppShell>
  </ReviewR6QaBoundary>;
}
