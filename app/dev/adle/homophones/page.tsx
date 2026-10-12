import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { HomophonePreview } from "./preview";

export const dynamic = "force-dynamic";

export default function HomophonePreviewPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <main className="brand-shell min-h-screen px-4 py-8 sm:px-6"><HomophonePreview /></main>;
}
