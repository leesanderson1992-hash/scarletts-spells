import { getAdminUser } from "@/lib/admin/access";
import { isImportableRecommendation, renderRecommendationCsv } from "@/lib/admin/recommend-dictionary-csv";
import { loadRecommendationsForExport, RECOMMENDATION_EXPORT_LIMIT } from "@/lib/admin/recommend-dictionary-entries";

export const dynamic = "force-dynamic";

type ExportRequest = { mode: "selected" | "all"; keys: string[]; excludedKeys: string[]; search: string };

function validKeys(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= RECOMMENDATION_EXPORT_LIMIT
    && value.every((key) => typeof key === "string" && key.length > 0 && key.length <= 100);
}

export async function POST(request: Request) {
  const access = await getAdminUser();
  if (access.status !== "authorized") return Response.json({ error: "Access denied." }, {
    status: access.status === "unauthenticated" ? 401 : 403,
    headers: { "Cache-Control": "no-store" },
  });
  const bodyText = await request.text();
  if (bodyText.length > 2_000_000) return Response.json({ error: "Selection is too large." }, { status: 413 });
  let body: Partial<ExportRequest>;
  try { body = JSON.parse(bodyText) as Partial<ExportRequest>; }
  catch { return Response.json({ error: "Invalid export request." }, { status: 400 }); }
  if (!body || (body.mode !== "selected" && body.mode !== "all")
    || !validKeys(body.keys) || !validKeys(body.excludedKeys)
    || typeof body.search !== "string" || body.search.length > 100) {
    return Response.json({ error: "Invalid export selection." }, { status: 400 });
  }
  let rows;
  try { rows = await loadRecommendationsForExport(body as ExportRequest); }
  catch (error) {
    if (error instanceof Error && error.message === "EXPORT_ROW_LIMIT") {
      return Response.json({ error: "More than 10,000 words match. Narrow the search." }, { status: 413 });
    }
    throw error;
  }
  if (!rows.length) return Response.json({ error: "No eligible words remain in this selection." }, { status: 409 });
  if (rows.some((row) => !isImportableRecommendation(row.word_key))) {
    return Response.json({ error: "This selection includes a word that needs spelling review before dictionary import." }, { status: 422 });
  }
  const csv = renderRecommendationCsv(rows);
  if (Buffer.byteLength(csv, "utf8") > 4_000_000) {
    return Response.json({ error: "CSV exceeds the 4 MB dictionary import limit. Narrow the selection." }, { status: 413 });
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=recommend-dictionary-entries.csv",
      "Cache-Control": "no-store",
    },
  });
}
