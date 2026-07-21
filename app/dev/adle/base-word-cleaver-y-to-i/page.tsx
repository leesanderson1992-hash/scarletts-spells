import { notFound } from "next/navigation";

import { BaseWordCleaverYToIPreview } from "./preview";

export default function BaseWordCleaverYToIPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BaseWordCleaverYToIPreview />;
}
