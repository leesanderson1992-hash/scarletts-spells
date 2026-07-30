import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { buildScopedPath, getActiveChildIdFromCookies, normaliseAppMode, selectChildById } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { compileClosedCompoundLesson } from "@/lib/adle/morphology/closed-compound-word-lab";
import { loadClosedCompoundProfiles } from "@/lib/adle/morphology/closed-compound-profile-loader";
import { isClosedCompoundRouteEnabled } from "@/lib/adle/morphology/closed-compound-route-gate";
import { createClosedCompoundAssignmentAction } from "./actions";

export const dynamic = "force-dynamic";
export default async function ClosedCompoundsPage(props: { searchParams?: Promise<{ child?: string; mode?: string }> }) {
  if (!isClosedCompoundRouteEnabled()) notFound();
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const search = await props.searchParams; const mode = normaliseAppMode(search?.mode ?? "child"); const children = await getActiveChildrenForUser(supabase, user.id); const child = selectChildById(children, search?.child ?? await getActiveChildIdFromCookies()); if (!child) notFound();
  const loaded = await loadClosedCompoundProfiles(createServiceRoleClient(), child.id, { allowStagingProfiles: true }); const payload = loaded.profiles.map((profile) => compileClosedCompoundLesson(profile, loaded.learningItems)).find(Boolean);
  return <AppShell currentPath="/learn/week/adle/closed-compounds" mode={mode} activeChildId={child.id} availableChildren={children} userEmail={user.email} layout="focus"><div className="grid gap-4"><Link href={buildScopedPath("/learn/week/adle", child.id, mode)} className="text-sm font-semibold">← Back to ADLE</Link>{payload ? <section className="brand-card rounded-3xl p-5"><p className="brand-eyebrow">Staging proof · Closed compounds</p><h1 className="mt-1 text-2xl font-semibold">Two words join together</h1><p className="mt-2 text-sm text-[color:var(--mid)]">Create one immutable four-word lesson from the reviewed dictionary pool.</p><form action={createClosedCompoundAssignmentAction}><input type="hidden" name="childId" value={child.id}/><button className="brand-primary-btn mt-4">Create staging compound lesson</button></form></section> : <section className="brand-card rounded-3xl p-6">Closed compound facts are not ready for this learner.</section>}</div></AppShell>;
}
