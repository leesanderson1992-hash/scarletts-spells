import { redirect } from "next/navigation";

export default async function LegacyCanonicalMappingResolvePage({ searchParams }: {
  searchParams?: Promise<{ word?: string; skill?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const target = new URLSearchParams();
  if (params.word) target.set("q", params.word);
  if (params.skill) target.set("skill", params.skill);
  redirect(`/admin/canonical-mappings${target.size ? `?${target}` : ""}`);
}
