import { getAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { isSchwaWorkbookSkill } from "@/lib/teaching-dictionary-manager/weak-vowel-workbook";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { readSchwaPublishJob, startSchwaPublishJob, processSchwaPublishBatch, controlSchwaPublishJob } from "@/lib/teaching-dictionary-manager/schwa-publish-jobs";
import { revalidateTag } from "next/cache";
import { TEACHING_DICTIONARY_EVIDENCE_TAG } from "@/lib/teaching-dictionary-manager/evidence-authority";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Use this site's publishing controls." }, 403);
  return handle(request, true);
}
async function handle(request: Request, write: boolean) {
  const access = await getAdminUser();
  if (access.status !== "authorized") return json({ error: "Sign in as an admin to continue." }, access.status === "unauthenticated" ? 401 : 403);
  const environment = resolveAdleRouteActivationEnvironment();
  if (environment !== "staging" && environment !== "production") return json({ error: "Publishing is unavailable here." }, 400);
  try {
    const body = write ? await request.json() : Object.fromEntries(new URL(request.url).searchParams);
    if (!isSchwaWorkbookSkill(body.skill) || body.jobId && !isUuid(body.jobId)) return json({ error: "Choose a Schwa lesson and saved publish job." }, 400);
    const db = createServiceRoleClient(), scope = { environment, actor: access.user.id, skill: body.skill };
    let job;
    if (!write) job = await readSchwaPublishJob(db, scope, body.jobId);
    else if (body.action === "start") {
      if (!isUuid(body.requestId) || !Array.isArray(body.draftIds) || body.draftIds.length < 1 || body.draftIds.length > 200 || body.draftIds.some((id: unknown) => typeof id !== "string" || !isUuid(id)))
        return json({ error: "Choose up to 200 reviewed words." }, 400);
      job = await startSchwaPublishJob(db, scope, body.requestId, body.draftIds);
    } else if (body.jobId && body.action === "process") {
      job = await processSchwaPublishBatch(db, scope, body.jobId);
      revalidateTag(TEACHING_DICTIONARY_EVIDENCE_TAG, { expire: 0 });
    } else if (body.jobId && (body.action === "pause" || body.action === "resume")) job = await controlSchwaPublishJob(db, scope, body.jobId, body.action);
    else return json({ error: "Choose a publishing action." }, 400);
    return json({ job });
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : "";
    return json({ error: text.includes("PUBLISH_JOB_") ? "The selected reviews changed. Refresh the preview and try again. Saved publications are retained."
      : "Publishing was interrupted. Your progress is saved; resume to retry unfinished words." }, 409);
  }
}
