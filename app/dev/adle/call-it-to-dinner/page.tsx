import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import candidates from "@/content/secret-life-of-vowels/dinner-preview-candidates.json";
import { parseDinnerActivityConfig } from "@/lib/adle/word-lab/call-it-to-dinner";
import { DinnerPreview } from "./preview";

export const dynamic = "force-dynamic";

export default function DinnerPreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  const config = parseDinnerActivityConfig(candidates, true);
  if (!config) throw new Error("Dinner preview candidates failed contract validation.");
  return <DinnerPreview config={config} />;
}
