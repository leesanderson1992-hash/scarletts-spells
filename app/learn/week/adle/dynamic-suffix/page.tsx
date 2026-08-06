import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { buildScopedPath, getActiveChildIdFromCookies, normaliseAppMode, selectChildById } from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { previewDynamicAffixAssignment } from "@/lib/adle/morphology/dynamic-affix-assignment-writer";
import { isDynamicSuffixRouteEnabled } from "@/lib/adle/morphology/dynamic-suffix-route-gate";
import { createDynamicSuffixAssignmentAction } from "./actions";

export const dynamic = "force-dynamic";
export default async function DynamicSuffixPage(props: { searchParams?: Promise<{ child?: string; mode?: string }> }) {
  if (!isDynamicSuffixRouteEnabled()) notFound();
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const search = await props.searchParams; const mode = normaliseAppMode(search?.mode ?? "child"); const children = await getActiveChildrenForUser(supabase, user.id); const child = selectChildById(children, search?.child ?? await getActiveChildIdFromCookies()); if (!child) notFound();
  const preview = await previewDynamicAffixAssignment({ serviceClient: createServiceRoleClient(), childId: child.id, allowStagingProfiles: process.env.VERCEL_ENV !== "production", purpose: "readiness_preview" });
  const payload = preview.status === "ready" ? preview.payload : null;
  const isProduction = process.env.VERCEL_ENV === "production";
  return <AppShell currentPath="/learn/week/adle/dynamic-suffix" mode={mode} activeChildId={child.id} availableChildren={children} userEmail={user.email} layout="focus"><div className="grid gap-4"><Link href={buildScopedPath("/learn/week/adle", child.id, mode)} className="text-sm font-semibold">← Back to ADLE</Link>{payload ? <section className="brand-card rounded-3xl p-5"><p className="brand-eyebrow">{isProduction ? "Dynamic Suffix Word Lab" : "Staging proof · Dynamic Suffix Word Lab"}</p><h1 className="mt-1 text-2xl font-semibold">Explore {payload.affix.label}</h1><p className="mt-2 text-sm text-[color:var(--mid)]">{isProduction ? "This creates one immutable suffix assignment using four reviewed words." : "This creates one immutable, staging-gated suffix assignment using four reviewed words."}</p><form action={createDynamicSuffixAssignmentAction}><input type="hidden" name="childId" value={child.id}/><button className="brand-primary-btn mt-4">{isProduction ? "Start Suffix Word Lab" : "Create staging Suffix Word Lab"}</button></form></section> : <section className="brand-card rounded-3xl p-6"><h1 className="text-xl font-semibold">Dynamic Suffix Word Lab is not ready for this learner</h1><p className="mt-2 text-sm text-[color:var(--mid)]">A verified authentic target and four complete reviewed words are required.</p></section>}</div></AppShell>;
}
