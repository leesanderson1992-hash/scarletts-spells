import { notFound } from "next/navigation";

import { Group4ConvergencePreview, type Group4Fixture } from "./preview";

const FIXTURES = new Set<string>([
  "prefix-standard",
  "suffix-standard",
  "base-single",
  "base-multi",
  "base-multi-restored",
  "base-final-y",
  "scaffold",
]);

export default async function Group4ConvergenceFixturePage(props: {
  searchParams?: Promise<{ fixture?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const fixture = (await props.searchParams)?.fixture;
  if (typeof fixture !== "string" || !FIXTURES.has(fixture)) notFound();
  return <Group4ConvergencePreview fixture={fixture as Group4Fixture} />;
}
