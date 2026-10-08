import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { IngPreview } from "./preview";

export const dynamic = "force-dynamic";

export default function IngPreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <IngPreview />;
}
