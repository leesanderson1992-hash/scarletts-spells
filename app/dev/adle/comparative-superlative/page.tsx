import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { ComparativePreview } from "./preview";

export const dynamic = "force-dynamic";
export default function ComparativePreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <ComparativePreview />;
}
