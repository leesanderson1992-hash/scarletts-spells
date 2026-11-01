import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { BaseWordTeachingReview } from "./review";

export const dynamic = "force-dynamic";

export default async function BaseWordTeachingReviewPage(props: { searchParams?: Promise<{ page?: string }> }) {
  if (!canOpenAdleDesignPreview()) notFound();
  const value = (await props.searchParams)?.page;
  const page = value === "2" ? 2 : value === "3" ? 3 : value === "4" ? 4 : 1;
  return <BaseWordTeachingReview page={page} />;
}
