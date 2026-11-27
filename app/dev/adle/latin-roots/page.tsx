import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { LatinRootsPreview } from "./preview";

export const dynamic = "force-dynamic";
export default async function LatinRootsPreviewPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  if (!canOpenAdleDesignPreview()) notFound();
  const { stage } = await searchParams;
  return <LatinRootsPreview initialStage={stage === "spell" ? "spell" : "learn"} />;
}
