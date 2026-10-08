import { DynamicAffixV3DevFixturePage } from "../page";
import ousPackage from "@/docs/implementation/seed-data/teaching-dictionary/candidates/2026-07-28-dynamic-suffix-ous/reviewed-staging-package.json";

export const dynamic = "force-dynamic";

export default function DynamicSuffixOusPreviewPage() {
  return <DynamicAffixV3DevFixturePage
    assignmentId="dev-dynamic-affix-v3-ous-cleaver"
    reviewedPackage={ousPackage}
  />;
}
