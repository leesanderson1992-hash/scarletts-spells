import { notFound } from "next/navigation";

import { BaseWordFamilyPreview } from "./preview";
import { BASE_WORD_FAMILY_PREVIEW_PAYLOAD } from "@/lib/adle/morphology/base-word-family-preview-fixture";

export default function BaseWordFamilyPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BaseWordFamilyPreview payload={BASE_WORD_FAMILY_PREVIEW_PAYLOAD} />;
}
