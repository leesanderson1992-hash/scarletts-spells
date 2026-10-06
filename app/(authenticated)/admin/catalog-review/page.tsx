import { redirect } from "next/navigation";

export default function LegacyCatalogReviewPage() {
  redirect("/admin/canonical-mappings");
}
