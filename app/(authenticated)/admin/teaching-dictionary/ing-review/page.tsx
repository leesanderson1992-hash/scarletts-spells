import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { IngReviewQueue } from "./queue";

export const dynamic = "force-dynamic";

export default async function IngReviewPage() {
  const admin = await requireAdminUser();
  const db = createServiceRoleClient();
  const batches = await db.from("teaching_dictionary_ing_review_batches")
    .select("id,filename,updated_at").eq("created_by", admin.id).order("updated_at", { ascending: false }).limit(25);
  if (batches.error) throw new Error("Could not load saved bulk reviews.");
  return <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-8">
    <header className="space-y-2">
      <Link href="/admin/teaching-dictionary" className="text-sm font-medium underline">Teaching Dictionary</Link>
      <h1 className="text-3xl font-semibold tracking-tight">Bulk word review</h1>
      <p className="text-sm">Regular <strong>-ing</strong> lesson · Add <em>ing</em> without changing the base spelling.</p>
    </header>
    <IngReviewQueue recent={batches.data} />
  </main>;
}
