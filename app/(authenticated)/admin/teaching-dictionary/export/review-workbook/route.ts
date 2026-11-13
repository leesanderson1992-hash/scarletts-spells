import { requireAdminUser } from "@/lib/admin/access";
import { ING_REVIEW_LABELS, isIngReviewSkill, loadIngReviewWorkbook } from "@/lib/teaching-dictionary-manager/ing-review-data";
import { buildReviewWorkbook } from "@/lib/teaching-dictionary-manager/review-workbook";

export async function GET(request: Request) {
  await requireAdminUser();
  const params = new URL(request.url).searchParams;
  const skill = params.get("skill");
  const batch = Number(params.get("batch") ?? "1");
  if (!isIngReviewSkill(skill) || !Number.isSafeInteger(batch) || batch < 1)
    return new Response("Choose an -ing lesson and a valid batch.", { status: 400 });
  const data = await loadIngReviewWorkbook(skill, batch);
  if (!data) return new Response("There are no words in this batch.", { status: 404 });
  const bytes = await buildReviewWorkbook({ skill, title: ING_REVIEW_LABELS[skill], ...data });
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="teaching-dictionary-review-${skill}-${batch}.xlsx"`,
    "Cache-Control": "private, no-store",
  } });
}
