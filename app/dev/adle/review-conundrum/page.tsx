import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { ReviewConundrumPreview } from "./preview";

export const dynamic = "force-dynamic";

export default async function ReviewConundrumDevPage({ searchParams }: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  if (!canOpenAdleDesignPreview()) notFound();
  const params = await searchParams;
  // No persistence gateway, Supabase access or real learner identity.
  return (
    <div className="mx-auto max-w-6xl"><ReviewConundrumPreview invalid={params.invalid === "1"} /></div>
  );
}
