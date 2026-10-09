import { notFound } from "next/navigation";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { TeachingDictionaryDetail } from "../detail";

export const dynamic = "force-dynamic";
export default async function WordPage({ params, searchParams }: {
  params: Promise<{ wordId: string }>;
  searchParams: Promise<{ draft?: string; saved?: string; error?: string; route_error?: string }>;
}) {
  const { wordId } = await params;
  if (!isUuid(wordId)) notFound();
  return <TeachingDictionaryDetail wordId={wordId} params={await searchParams} />;
}
