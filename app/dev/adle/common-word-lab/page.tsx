import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";

import { CommonWordLabPreview } from "./preview";
import { COMMON_WORD_LAB_PREVIEW_SNAPSHOT } from "@/lib/adle/word-lab/preview-fixture";

export const dynamic = "force-dynamic";

export default function CommonWordLabPreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <CommonWordLabPreview snapshot={COMMON_WORD_LAB_PREVIEW_SNAPSHOT} />;
}
