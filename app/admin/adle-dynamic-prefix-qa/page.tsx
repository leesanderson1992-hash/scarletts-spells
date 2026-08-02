import { notFound } from "next/navigation";

import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getDateOnly } from "@/lib/courses/progress";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireDynamicPrefixQaUser } from "@/lib/adle/morphology/dynamic-prefix-qa-access";
import {
  DYNAMIC_PREFIX_QA_PROFILES,
  dynamicPrefixQaAuthority,
} from "@/lib/adle/morphology/dynamic-prefix-qa-catalog";
import { loadDynamicPrefixProfiles } from "@/lib/adle/morphology/dynamic-prefix-profile-loader";
import { DynamicPrefixQaLauncher } from "./launcher";

export const dynamic = "force-dynamic";

export default async function AdleDynamicPrefixQaPage() {
  const user = await requireDynamicPrefixQaUser();
  const userClient = await createClient();
  const children = await getActiveChildrenForUser(userClient, user.id);
  const firstChild = children[0];
  const loaded = firstChild
    ? await loadDynamicPrefixProfiles(createServiceRoleClient(), firstChild.id, { allowStagingProfiles: true })
    : { profiles: [], learningItems: [] };
  const readyKeys = new Set(loaded.profiles.map((profile) => profile.microSkillKey));
  const profiles = DYNAMIC_PREFIX_QA_PROFILES.map((profile) => ({
    ...profile,
    authority: dynamicPrefixQaAuthority(profile.key) ?? "unmapped",
    dictionaryReady: readyKeys.has(profile.key),
  }));
  if (profiles.some((profile) => profile.authority !== "shared_migration")) notFound();
  return (
    <main className="brand-page min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <p className="brand-eyebrow">Staging only · authorised adult QA</p>
          <h1 className="brand-title mt-3 text-4xl font-semibold">Dynamic Prefix Word Lab launcher</h1>
          <p className="brand-copy mt-3 max-w-3xl text-sm leading-6">This page creates persisted assignments through the existing selector, shared writer, Prefix V2 payload, route resolver, runtime adapter, and learner renderer. It has no preview renderer and never constructs lesson content.</p>
          <p className="brand-copy mt-2 text-sm">Sign in as the authorised owner, select an existing staging child with an authentic target for each required profile, then open the returned child-session links.</p>
        </header>
        <section className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white p-5">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead><tr className="border-b border-[var(--border)]"><th className="py-2 pr-3">Profile</th><th className="py-2 pr-3">Expected items</th><th className="py-2 pr-3">Compiler authority</th><th className="py-2">Dictionary profile</th></tr></thead>
            <tbody>{profiles.map((profile) => <tr key={profile.key} className="border-b border-[var(--border)]"><td className="py-3 pr-3 font-semibold">{profile.label}<span className="mt-1 block font-mono text-xs font-normal text-[color:var(--muted)]">{profile.key}</span></td><td className="py-3 pr-3">{profile.expectedItemCount}</td><td className="py-3 pr-3">{profile.authority}</td><td className="py-3">{profile.dictionaryReady ? "ready" : "unavailable"}</td></tr>)}</tbody>
          </table>
        </section>
        {children.length ? <DynamicPrefixQaLauncher childOptions={children.map((child) => ({ id: child.id, label: [child.first_name, child.last_name].filter(Boolean).join(" ") }))} profiles={profiles} defaultDate={getDateOnly()} /> : <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">This authorised staging account has no active child. Use an existing owned QA child; the launcher does not create or mutate child identities.</section>}
      </div>
    </main>
  );
}
