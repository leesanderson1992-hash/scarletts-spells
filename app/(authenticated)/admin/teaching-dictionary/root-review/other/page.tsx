import { RootReviewPage } from "../review-page";
export default async function Page({ searchParams }: { searchParams: Promise<{ completed?: string }> }) {
  const query = await searchParams;
  return <RootReviewPage other showCompleted={query.completed === "1"} />;
}
