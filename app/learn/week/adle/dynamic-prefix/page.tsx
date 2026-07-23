import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DynamicPrefixStagingLab } from "@/components/adle/morphology/dynamic-prefix-staging-lab";
import { buildScopedPath, getActiveChildIdFromCookies, normaliseAppMode, selectChildById } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { compileDynamicPrefixWordLabPayload, selectDynamicPrefixWordLab } from "@/lib/adle/morphology/dynamic-prefix-word-lab";
import { isDynamicPrefixRouteEnabled } from "@/lib/adle/morphology/dynamic-prefix-staging-access";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { createDynamicPrefixStagingAssignmentAction } from "./actions";

// The staging gate is deliberately evaluated per request. Static generation
// would freeze the gate at build time and make a correctly configured preview
// indistinguishable from a disabled route.
export const dynamic = "force-dynamic";

export default async function DynamicPrefixStagingPage(props: { searchParams?: Promise<{ child?: string; mode?: string }> }) {
  if (!isDynamicPrefixRouteEnabled()) notFound();
  const isProduction = process.env.VERCEL_ENV === "production";
  const supabase = await createClient();
  // Dictionary provenance is intentionally not exposed through learner RLS.
  // This authenticated, preview-only proof route reads the reviewed public
  // teaching content server-side; learner-specific queue data still uses the
  // signed-in client and remains constrained to the selected child.
  const dictionary = createServiceRoleClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const search = await props.searchParams;
  const mode = normaliseAppMode(search?.mode ?? "child");
  const children = await getActiveChildrenForUser(supabase, user.id);
  const child = selectChildById(children, search?.child ?? await getActiveChildIdFromCookies());
  if (!child) notFound();
  const loaded = await loadDynamicPrefixProfiles(dictionary, child.id, { allowStagingProfiles: !isProduction });
  const payload = selectDynamicPrefixWordLab(loaded);
  const compiled = payload ? compileDynamicPrefixWordLabPayload(payload) : null;
  const back = buildScopedPath("/learn/week/adle", child.id, mode);
  return <AppShell currentPath="/learn/week/adle/dynamic-prefix" mode={mode} activeChildId={child.id} availableChildren={children} userEmail={user.email} layout="focus"><div className="grid gap-4"><Link href={back} className="text-sm font-semibold">← Back to ADLE</Link>{compiled ? <>{!isProduction ? <DynamicPrefixStagingLab payload={compiled} /> : null}<form action={createDynamicPrefixStagingAssignmentAction} className="brand-card rounded-3xl p-5"><input type="hidden" name="childId" value={child.id}/><p className="text-sm text-[color:var(--mid)]">{isProduction ? "Ready to begin the Dynamic Prefix Word Lab? This creates one immutable assignment for this child." : "Ready to test the durable Word Lab? This creates one staging-only, immutable assignment for this child."}</p><button type="submit" className="brand-primary-btn mt-3">{isProduction ? "Begin Dynamic Prefix Word Lab" : "Create staging Word Lab"}</button></form></> : <section className="brand-card rounded-3xl p-6"><h1 className="text-xl font-semibold">Dynamic Prefix Word Lab is not ready for this learner</h1><p className="mt-2 text-sm text-[color:var(--mid)]">A reviewed, verified authentic target queue and four safe words are required.</p></section>}</div></AppShell>;
}
