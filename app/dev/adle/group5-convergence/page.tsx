import { notFound } from "next/navigation";
import { Group5ConvergencePreview, type Group5Fixture } from "./preview";

const FIXTURES = new Set<string>([
  "prefix-discover", "suffix-discover", "meaning-match", "meaning-match-incorrect",
  "compound-match", "prefix-sort", "suffix-sort", "sort-sparkle", "sort-incorrect",
  "sort-overview", "sort-reduced-motion", "keyboard", "narrow",
]);

export default async function Group5ConvergenceFixturePage(props: { searchParams?: Promise<{ fixture?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const fixture = (await props.searchParams)?.fixture;
  if (typeof fixture !== "string" || !FIXTURES.has(fixture)) notFound();
  return <Group5ConvergencePreview fixture={fixture as Group5Fixture} />;
}
