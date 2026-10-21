import { notFound } from "next/navigation";
import { canOpenAdleDesignPreview } from "@/lib/adle/design-preview-access";
import { FinalArTeachingMockup } from "./preview";

export const dynamic = "force-dynamic";

export default function FinalArTeachingMockupPage() {
  if (!canOpenAdleDesignPreview()) notFound();
  return <FinalArTeachingMockup />;
}
