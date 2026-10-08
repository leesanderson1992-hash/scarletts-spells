import { notFound } from "next/navigation";
import { ReviewConundrumPreview } from "./preview";

export default async function ReviewConundrumDevPage({ searchParams }: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  // No persistence gateway, Supabase access or real learner identity.
  return (
    <div className="mx-auto max-w-6xl"><ReviewConundrumPreview invalid={params.invalid === "1"} /></div>
  );
}
