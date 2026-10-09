import { TeachingDictionaryDetail } from "../detail";

export const dynamic = "force-dynamic";
export default async function NewWordPage({ searchParams }: {
  searchParams: Promise<{ draft?: string; saved?: string; error?: string }>;
}) {
  return <TeachingDictionaryDetail wordId={null} params={await searchParams} />;
}
