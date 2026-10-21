import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { FinalOrTeachingPreview } from "./preview";

export const dynamic = "force-dynamic";

export default function FinalOrTeachingPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <FinalOrTeachingPreview />;
}
