import { notFound } from "next/navigation";

import { Group3ConvergencePreview, type Group3Fixture } from "./preview";

const FIXTURES = new Set<string>([
  "prefix-cover", "suffix-cover", "base-word-cover", "compound-cover",
  "prefix-sentence", "suffix-sentence", "base-word-sentence", "compound-sentence",
  "scheduled-review", "diagnostic-probe",
  "prefix-reflection-capital", "prefix-reflection-punctuation", "suffix-reflection",
  "base-word-reflection", "compound-reflection",
]);

export default async function Group3ConvergenceFixturePage(props: {
  searchParams?: Promise<{ fixture?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const fixture = (await props.searchParams)?.fixture;
  if (typeof fixture !== "string" || !FIXTURES.has(fixture)) notFound();
  return <Group3ConvergencePreview fixture={fixture as Group3Fixture} />;
}
