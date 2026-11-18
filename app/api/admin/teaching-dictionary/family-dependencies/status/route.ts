import { getAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const access = await getAdminUser();
  if (access.status !== "authorized") return Response.json({ error: "Access denied." }, { status: access.status === "unauthenticated" ? 401 : 403 });
  const skill = new URL(request.url).searchParams.get("skill"), environment = resolveAdleRouteActivationEnvironment();
  if (!skill || !/^D\d+_[A-Z0-9_]+$/u.test(skill) || !environment) return Response.json({ error: "Choose a lesson." }, { status: 400 });
  const result = await createServiceRoleClient().from("teaching_dictionary_family_dependencies").select("id,status,detail")
    .eq("environment_key", environment).eq("micro_skill_key", skill).order("updated_at", { ascending: false }).limit(100);
  if (result.error) return Response.json({ error: "Could not read saved review status." }, { status: 500 });
  return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
