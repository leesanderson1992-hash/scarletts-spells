import { notFound } from "next/navigation";

import { CommonWordLabPreview } from "./preview";
import { COMMON_WORD_LAB_PREVIEW_SNAPSHOT } from "@/lib/adle/word-lab/preview-fixture";

export default function CommonWordLabPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CommonWordLabPreview snapshot={COMMON_WORD_LAB_PREVIEW_SNAPSHOT} />;
}
