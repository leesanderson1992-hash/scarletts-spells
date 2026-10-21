import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { ReflectionLayoutPreview } from "./preview";

export const dynamic = "force-dynamic";

export default function ReflectionLayoutPreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <ReflectionLayoutPreview />;
}
