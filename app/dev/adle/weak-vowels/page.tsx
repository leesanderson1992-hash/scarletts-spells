import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { WeakVowelLessonsPreview } from "./preview";

export const dynamic = "force-dynamic";

export default function WeakVowelLessonsPreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <WeakVowelLessonsPreview />;
}
