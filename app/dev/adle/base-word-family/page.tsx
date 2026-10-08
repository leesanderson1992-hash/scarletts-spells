import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";

import { BaseWordFamilyPreview } from "./preview";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "@/lib/adle/morphology/base-word-family-preview-fixture";

export const dynamic = "force-dynamic";

export default function BaseWordFamilyPreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <BaseWordFamilyPreview payload={BASE_WORD_FAMILY_PREVIEW_PAYLOAD} />;
}
