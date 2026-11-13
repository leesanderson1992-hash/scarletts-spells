import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { renderMultiSenseCsvBundles } from "@/lib/teaching-dictionary-manager/multi-sense-csv";
import { loadReviewedMeaningBundles } from "@/lib/teaching-dictionary-manager/multi-sense-export";

export const dynamic = "force-dynamic";
export const MULTI_SENSE_EXPORT_BATCH_SIZE = 100;

export async function GET(request: Request) {
  await requireAdminUser();
  const params = new URL(request.url).searchParams;
  if (params.get("template") === "1") return new NextResponse(renderMultiSenseCsvBundles([]), {
    headers: { "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="reviewed-teaching-dictionary-template.csv"',
      "Cache-Control": "no-store" },
  });
  const wordId = params.get("word_id") ?? "";
  const batch = params.get("batch") ? Number(params.get("batch")) : null;
  if (wordId && !isUuid(wordId) || wordId && batch !== null || !wordId &&
    (batch === null || !Number.isSafeInteger(batch) || batch < 1))
    return Response.json({ error: "Choose a word or a valid reviewed-meanings batch." }, { status: 400 });
  const db = createServiceRoleClient();
  const page = wordId ? null : await db.from("teaching_dictionary_reviewed_sense_sets")
    .select("canonical_word_id").order("canonical_word_id")
    .range((batch! - 1) * MULTI_SENSE_EXPORT_BATCH_SIZE, batch! * MULTI_SENSE_EXPORT_BATCH_SIZE - 1);
  if (page?.error) throw new Error("MULTI_SENSE_CSV_EXPORT_PAGE_READ_FAILED");
  const ids = wordId ? [wordId] : page?.data?.map(row => row.canonical_word_id) ?? [];
  if (!ids.length) return Response.json({ error: "No reviewed meanings in this batch." }, { status: 404 });
  const bundles = await loadReviewedMeaningBundles(db, ids);
  if (!bundles.length)
    return Response.json({ error: "Review the word's meanings in Overview first." }, { status: 404 });
  return new NextResponse(renderMultiSenseCsvBundles(bundles), { headers: {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="teaching-dictionary-meanings-${wordId || `batch-${batch}`}.csv"`,
    "Cache-Control": "no-store",
  } });
}
