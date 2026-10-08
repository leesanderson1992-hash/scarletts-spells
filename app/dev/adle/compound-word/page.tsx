import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";

import { CompoundWordPreview } from "./preview";
import { COMPOUND_WORD_PREVIEW_PAYLOAD } from "@/lib/adle/morphology/compound-word-preview-fixture";

export const dynamic = "force-dynamic";

export default function CompoundWordPreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <main className="brand-shell min-h-screen px-4 py-8 sm:px-6"><CompoundWordPreview payload={COMPOUND_WORD_PREVIEW_PAYLOAD} /></main>;
}
