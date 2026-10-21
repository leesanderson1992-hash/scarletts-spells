import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { FinalErTeachingPreview } from "./preview";

export const dynamic = "force-dynamic";

export default function FinalErTeachingPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <FinalErTeachingPreview />;
}
