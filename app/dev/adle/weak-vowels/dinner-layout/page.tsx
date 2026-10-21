import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { DinnerLayoutPreview } from "./preview";

export const dynamic = "force-dynamic";

export default function DinnerLayoutPreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <DinnerLayoutPreview />;
}
