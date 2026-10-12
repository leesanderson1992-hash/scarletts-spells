import { getAdminUser } from "@/lib/admin/access";
import { loadRecommendationPage, recommendationSearch } from "@/lib/admin/recommend-dictionary-entries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getAdminUser();
  if (access.status !== "authorized") return Response.json({ error: "Access denied." }, {
    status: access.status === "unauthenticated" ? 401 : 403,
    headers: { "Cache-Control": "no-store" },
  });
  const params = new URL(request.url).searchParams;
  const search = recommendationSearch(params.get("q") ?? "");
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  const result = await loadRecommendationPage(search, page);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
