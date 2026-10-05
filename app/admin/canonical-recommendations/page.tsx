import { redirect } from "next/navigation";

export default function LegacyCanonicalRecommendationsPage() {
  redirect("/admin/canonical-mappings");
}
