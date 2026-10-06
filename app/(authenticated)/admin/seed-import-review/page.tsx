import { redirect } from "next/navigation";

export default function LegacySeedImportReviewPage() {
  redirect("/admin/canonical-mappings");
}
