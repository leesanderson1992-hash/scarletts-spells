import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { loadTeachingDictionaryEvidenceAuthority } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { ADLE_CURRICULUM_ROUTE_REGISTRY } from "@/lib/adle/curriculum-readiness/route-registry";
import { emptyMetadata, emptyMorphology, publicationBlockers, routeBlockers, routeContentFromStoredRow, routeForSkill, type RouteContentDraft, type WordDraftPayload } from "@/lib/teaching-dictionary-manager/contracts";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadWordSkillReviewControls } from "@/lib/writing-engine/whole-writing/knowledge-review-repository";
import { importApprovedTeachingSubmission, publishTeachingDictionaryDraft, publishTeachingDictionaryPrefixContent, publishTeachingDictionarySuffixContent } from "./actions";
import { WordEditor } from "./word-editor";

type Params = { draft?: string; saved?: string; error?: string; route_error?: string };
type Group = { key: string; label: string; parent?: string };
type Word = { id: string; import_batch_id: string; source_row_hash: string; normalised_word: string; display_word: string; age_band: string | null; frequency_band: string | null; complexity_band: string | null; source_category: WordDraftPayload["provenance"]["sourceCategory"]; source_name: string | null; source_url: string | null; source_licence: string | null; source_use_note: string | null; confidence: WordDraftPayload["provenance"]["confidence"]; row_status: string; review_status: string };

export async function TeachingDictionaryDetail({ wordId, params }: { wordId: string | null; params: Params }) {
  await requireAdminUser();
  const db = createServiceRoleClient();
  const [wordResult, draftResult, skillResult, familyResult, clusterResult] = await Promise.all([
    wordId ? db.from("canonical_teaching_dictionary_words").select("id,import_batch_id,source_row_hash,normalised_word,display_word,age_band,frequency_band,complexity_band,source_category,source_name,source_url,source_licence,source_use_note,confidence,row_status,review_status").eq("id", wordId).maybeSingle() : null,
    params.draft && isUuid(params.draft) ? db.from("teaching_dictionary_manager_drafts").select("id,canonical_word_id,normalised_word,payload,source_reference,source_kind,created_at").eq("id", params.draft).maybeSingle() : null,
    db.from("micro_skill_catalog").select("micro_skill_key,display_name,skill_family_key,skill_cluster_key").eq("is_active", true).eq("is_assignable", true).order("display_name"),
    db.from("micro_skill_families").select("skill_family_key,display_name").eq("is_active", true).order("display_name"),
    db.from("micro_skill_clusters").select("skill_cluster_key,skill_family_key,display_name").eq("is_active", true).order("display_name"),
  ]);
  if (wordResult?.error || draftResult?.error || skillResult.error || familyResult.error || clusterResult.error) throw new Error("TEACHING_DICTIONARY_DETAIL_READ_FAILED");
  const word = wordResult?.data as Word | null;
  const draft = draftResult?.data ?? null;
  if ((wordId && !word) || (params.draft && !draft) || (draft && draft.canonical_word_id !== wordId)) notFound();
  const normalisedWord = draft?.normalised_word ?? word?.normalised_word ?? "";
  const [metadataResult, morphologyResult, dictationResult, definitionsResult, routeContentResult, submissionsResult, prefixResult, suffixResult, baseResult, historyResult] = await Promise.all([
    wordId ? db.from("canonical_teaching_dictionary_word_metadata").select("*").eq("canonical_word_id", wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1) : null,
    wordId ? db.from("canonical_teaching_dictionary_word_morphology").select("*").eq("canonical_word_id", wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1) : null,
    wordId ? db.from("canonical_teaching_dictionary_dictation_sentences").select("*").eq("canonical_word_id", wordId).eq("row_status", "active").order("created_at", { ascending: false }).limit(1) : null,
    wordId ? db.from("teaching_dictionary_definition_versions").select("route_id,micro_skill_key,definition,published_at").eq("canonical_word_id", wordId).order("published_at", { ascending: false }).limit(100) : null,
    wordId ? db.from("teaching_dictionary_route_content_versions").select("id,draft_id,route_id,route_version,micro_skill_key,content,runtime_status,published_at").eq("canonical_word_id", wordId).order("published_at", { ascending: false }).limit(50) : null,
    wordId ? db.from("adle_word_teaching_content_submissions").select("id,route_id,route_version,micro_skill_key,content,runtime_status,imported_at").eq("canonical_word_id", wordId).order("imported_at", { ascending: false }).limit(50) : null,
    wordId ? db.from("canonical_teaching_dictionary_prefix_members").select("id,prefix_profile_id,row_status,review_status,assignment_eligible,canonical_teaching_dictionary_prefix_profiles(micro_skill_key,production_enabled,row_status,review_status)").eq("canonical_word_id", wordId) : null,
    wordId ? db.from("canonical_teaching_dictionary_suffix_members").select("id,suffix_profile_id,row_status,review_status,assignment_eligible,canonical_teaching_dictionary_suffix_profiles(micro_skill_key,production_enabled,row_status,review_status)").eq("canonical_word_id", wordId) : null,
    wordId ? db.from("canonical_teaching_dictionary_base_word_family_members").select("id,row_status,review_status,assignment_eligible").eq("canonical_word_id", wordId) : null,
    wordId ? db.from("teaching_dictionary_manager_drafts").select("id,source_kind,source_reference,created_at,created_by").eq("canonical_word_id", wordId).order("created_at", { ascending: false }).limit(30) : null,
  ]);
  for (const result of [metadataResult, morphologyResult, dictationResult, definitionsResult, routeContentResult, submissionsResult, prefixResult, suffixResult, baseResult, historyResult]) if (result?.error) throw new Error("TEACHING_DICTIONARY_FACT_READ_FAILED");
  const publicationIds = (routeContentResult?.data ?? []).map((row) => row.id);
  const publicationResult = publicationIds.length ? await db.from("teaching_dictionary_route_content_publications").select("content_version_id,route_profile_id").in("content_version_id", publicationIds) : { data: [], error: null };
  const rollbackResult = publicationIds.length ? await db.from("teaching_dictionary_route_content_rollbacks").select("content_version_id").in("content_version_id", publicationIds) : { data: [], error: null };
  if (publicationResult.error || rollbackResult.error) throw new Error("TEACHING_ROUTE_PUBLICATION_READ_FAILED");
  const historyIds = (historyResult?.data ?? []).map((item) => item.id);
  const historyPublications = historyIds.length ? await db.from("teaching_dictionary_manager_publications")
    .select("draft_id,published_at,published_by").in("draft_id", historyIds) : { data: [], error: null };
  if (historyPublications.error) throw new Error("TEACHING_HISTORY_PUBLICATION_READ_FAILED");
  const historyPublicationByDraft = new Map((historyPublications.data ?? []).map((item) => [item.draft_id, item]));
  const rolledBackContent = new Set((rollbackResult.data ?? []).map((row) => row.content_version_id));
  const publishedContent = new Set((publicationResult.data ?? []).filter((row) => !rolledBackContent.has(row.content_version_id)).map((row) => row.content_version_id));
  const publishedDraftIds = new Set((routeContentResult?.data ?? []).filter((row) => publishedContent.has(row.id)).map((row) => row.draft_id));
  const publishedSubmissionIds = new Set((historyResult?.data ?? []).filter((row) => publishedDraftIds.has(row.id))
    .map((row) => /^Approved teaching submission ([0-9a-f-]{36})$/.exec(row.source_reference)?.[1]).filter(Boolean));
  const metadata = metadataResult?.data?.[0] ?? null;
  const morphology = morphologyResult?.data?.[0] ?? null;
  const dictation = dictationResult?.data?.[0] ?? null;
  const sharedDefinition = definitionsResult?.data?.find((row) => row.route_id == null)?.definition ?? "";
  const routeContents: RouteContentDraft[] = [];
  const seen = new Set<string>();
  const contentVersions = routeContentResult?.data ?? [];
  for (const row of [...contentVersions.filter((version) => publishedContent.has(version.id)),
    ...contentVersions.filter((version) => !publishedContent.has(version.id) && !rolledBackContent.has(version.id)),
    ...(submissionsResult?.data ?? [])]) {
    const key = `${row.route_id}:${row.micro_skill_key}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routeContents.push(routeContentFromStoredRow(row));
  }
  const environment = resolveAdleRouteActivationEnvironment();
  const approvalControls = environment ? await loadWordSkillReviewControls(db, environment) : null;
  const authority = environment && wordId ? await loadTeachingDictionaryEvidenceAuthority(db, environment) : null;
  const relationships = (authority?.relationships ?? []).filter((row) => row.canonicalWordId === wordId);
  const memberKeys = [...(prefixResult?.data ?? []), ...(suffixResult?.data ?? [])].flatMap((row) => {
    const raw = "canonical_teaching_dictionary_prefix_profiles" in row
      ? row.canonical_teaching_dictionary_prefix_profiles : row.canonical_teaching_dictionary_suffix_profiles;
    const profile = Array.isArray(raw) ? raw[0] : raw;
    return profile?.row_status === "active" && profile.micro_skill_key ? [profile.micro_skill_key as string] : [];
  });
  const selectedKeys = [...new Set([...relationships.map((row) => row.microSkillKey), ...routeContents.map((row) => row.microSkillKey), ...memberKeys])];
  const initial: WordDraftPayload = draft ? draft.payload as WordDraftPayload : {
    displayWord: word?.display_word ?? "", definition: sharedDefinition,
    dictationSentence: dictation?.dictation_sentence ?? "", dictationTargetTokenIndex: dictation?.dictation_target_token_index ?? 0,
    ageBand: word?.age_band ?? "", frequencyBand: word?.frequency_band ?? "", complexityBand: word?.complexity_band ?? "",
    metadata: { ...emptyMetadata(), ...Object.fromEntries(Object.keys(emptyMetadata()).map((key) => [key, metadata?.[key] ?? (key === "has_schwa" ? null : "")])) },
    canonicalMorphology: morphology ? {
      rawSegmentation: morphology.raw_morpholex_segmentation ?? "", rawPartOfSpeech: morphology.raw_morpholex_pos ?? "",
      parts: morphology.morphology_parts ?? [], featureKeys: morphology.feature_keys ?? [], joins: morphology.morphology_joins ?? [],
      transformationNotes: morphology.transformation_notes ?? "", wordSum: morphology.word_sum ?? "",
      analysisStatus: morphology.analysis_status ?? "in_review", reviewNotes: morphology.review_notes ?? "",
    } : emptyMorphology(),
    provenance: { sourceCategory: word?.source_category ?? "internal_authored", sourceName: word?.source_name ?? "",
      sourceUrl: word?.source_url ?? "", sourceLicence: word?.source_licence ?? "", sourceUseNote: word?.source_use_note ?? "",
      confidence: word?.confidence ?? "medium" },
    skillKeys: selectedKeys, routeContents,
  };
  const draftBlockers = draft ? publicationBlockers(draft.payload as WordDraftPayload, draft.normalised_word) : [];
  const families: Group[] = (familyResult.data ?? []).map((row) => ({ key: row.skill_family_key, label: row.display_name }));
  const clusters: Group[] = (clusterResult.data ?? []).map((row) => ({ key: row.skill_cluster_key, label: row.display_name, parent: row.skill_family_key }));
  const prefixes = (prefixResult?.data ?? []).map((row) => {
    const profile = Array.isArray(row.canonical_teaching_dictionary_prefix_profiles) ? row.canonical_teaching_dictionary_prefix_profiles[0] : row.canonical_teaching_dictionary_prefix_profiles;
    return { key: profile?.micro_skill_key as string, member: row, profile };
  });
  const suffixes = (suffixResult?.data ?? []).map((row) => {
    const profile = Array.isArray(row.canonical_teaching_dictionary_suffix_profiles) ? row.canonical_teaching_dictionary_suffix_profiles[0] : row.canonical_teaching_dictionary_suffix_profiles;
    return { key: profile?.micro_skill_key as string, member: row, profile };
  });
  return <main className="mx-auto grid max-w-6xl gap-6 p-6 text-[color:var(--ink)]">
    <nav className="text-sm"><Link href="/admin/teaching-dictionary" className="underline">← All words</Link></nav>
    <header><h1 className="text-3xl font-semibold">{word?.display_word ?? (normalisedWord || "New word")}</h1><p className="mt-2 text-sm">{wordId ? `Canonical ID ${wordId} · ${word?.row_status} / ${word?.review_status}` : "New dictionary word"}</p></header>
    {params.saved && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">Saved.</p>}
    {params.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-900">{params.error.replaceAll("_", " ")}</p>}
    {params.route_error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">Dictionary facts published. Route activation needs review: {params.route_error.replaceAll("_", " ")}.</p>}
    {draft && <section className="rounded-2xl border border-[var(--border)] bg-white p-5"><h2 className="text-lg font-semibold">Draft {draft.id}</h2><p className="text-sm">{draft.source_kind} · {draft.source_reference} · {new Date(draft.created_at).toLocaleString("en-GB")}</p>
      {draftBlockers.length ? <ul className="mt-3 list-disc pl-5 text-sm text-amber-900">{draftBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p className="mt-3 text-sm">Shared dictionary facts are complete. Route checks are shown below.</p>}
      {(draft.payload as WordDraftPayload).routeContents.map((route) => {
        const missing = routeBlockers(route, draft.payload as WordDraftPayload);
        return <div key={`${route.routeId}:${route.microSkillKey}`} className="mt-3 rounded-lg border border-[var(--border)] p-3 text-sm">
          <p className="font-semibold">{route.routeId} · {route.microSkillKey} · {missing.length ? `${missing.length} missing facts` : "content ready for route release"}</p>
          {missing.length > 0 && <ul className="list-disc pl-5 text-amber-900">{missing.map((item) => <li key={item}>{item}</li>)}</ul>}
        </div>;
      })}
      <form action={publishTeachingDictionaryDraft} className="mt-4"><input type="hidden" name="draft_id" value={draft.id} /><input type="hidden" name="word_id" value={wordId ?? ""} /><button disabled={draftBlockers.length > 0} className="rounded-lg bg-[var(--scarlett)] px-4 py-2 font-semibold text-white disabled:opacity-50">Publish dictionary facts</button></form>
      <p className="mt-2 text-xs">If an active route depends on changed facts, publication stops with a route-release blocker. Route content remains pending until its compiler and release authority approve it.</p>
    </section>}
    {wordId && <section className="grid gap-3 rounded-2xl border border-[var(--border)] bg-white p-5"><h2 className="text-lg font-semibold">Approval and lesson status</h2>
      <p className="text-sm">Recognition of the word in authentic writing is word-level. Verified independent use contributes to every effective approved skill below; ADLE lessons have separate route gates.</p>
      {(initial.skillKeys.length ? initial.skillKeys : selectedKeys).map((key) => {
        const relationship = relationships.find((row) => row.microSkillKey === key);
        const route = routeForSkill(key);
        const content = initial.routeContents.find((item) => item.microSkillKey === key && item.routeId === route?.routeId);
        const blockers = content ? routeBlockers(content, initial) : route ? ["Route-specific word content has not been published."] : [];
        const specialistReady = [...prefixes, ...suffixes].some((item) => item.key === key
          && item.member.row_status === "active" && item.member.review_status === "approved_for_first_exposure"
          && item.member.assignment_eligible && item.profile?.row_status === "active" && item.profile.production_enabled);
        const baseMember = route?.routeId === "base_word_lab" ? baseResult?.data?.find((item) => item.row_status === "active" && item.review_status === "approved_for_first_exposure") : null;
        return <article key={key} className="rounded-lg border border-[var(--border)] p-4 text-sm"><h3 className="font-semibold">{key}</h3>
          <p>Evidence: {relationship ? "approved" : "not approved"}{relationship && ` · ${relationship.sourceProvenance.map((source) => `${source.sourceAuthority} (${source.provenanceId})`).join(", ")}`}</p>
          <p>ADLE: {route ? specialistReady ? "approved profile member; child gates still apply" : baseMember ? "base member present; release and child gates need checking" : blockers.length ? "missing word facts / member" : "content present; route release pending" : "no specialist route"}</p>
          {blockers.length > 0 && <ul className="list-disc pl-5 text-amber-900">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
        </article>;
      })}
      {(submissionsResult?.data ?? []).map((submission) => <form key={submission.id} action={importApprovedTeachingSubmission} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] p-3 text-sm">
        <input type="hidden" name="submission_id" value={submission.id} /><input type="hidden" name="word_id" value={wordId} />
        <span>Approved submission · {submission.route_id} · {publishedSubmissionIds.has(submission.id) ? "published through manager" : submission.runtime_status.replaceAll("_", " ")}</span>
        <button className="rounded-lg border border-[var(--border)] px-3 py-1 font-semibold">Open as editable draft</button>
      </form>)}
      {(routeContentResult?.data ?? []).map((version) => {
        const content = version.content as RouteContentDraft;
        const blockers = routeBlockers(content, initial);
        const activated = publishedContent.has(version.id);
        return <article key={version.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
          <p className="font-semibold">{version.route_id} · {version.micro_skill_key} · {activated ? "route published" : rolledBackContent.has(version.id) ? "route rollback; revise content" : "route publication pending"}</p>
          {blockers.length > 0 && <ul className="list-disc pl-5 text-amber-900">{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>}
          {version.route_id === "dynamic_prefix_word_lab" && !activated && !rolledBackContent.has(version.id) && <form action={publishTeachingDictionaryPrefixContent} className="mt-2">
            <input type="hidden" name="word_id" value={wordId} /><input type="hidden" name="content_version_id" value={version.id} />
            <button disabled={blockers.length > 0} className="rounded-lg bg-[var(--scarlett)] px-3 py-2 font-semibold text-white disabled:opacity-50">Publish prefix route member</button>
          </form>}
          {version.route_id === "dynamic_affix_word_lab" && !activated && !rolledBackContent.has(version.id) && <form action={publishTeachingDictionarySuffixContent} className="mt-2">
            <input type="hidden" name="word_id" value={wordId} /><input type="hidden" name="content_version_id" value={version.id} />
            <button disabled={blockers.length > 0} className="rounded-lg bg-[var(--scarlett)] px-3 py-2 font-semibold text-white disabled:opacity-50">Publish suffix route member</button>
          </form>}
          {version.route_id === "base_word_lab" && !activated && <p>Base-word activation needs reviewed family membership, teaching-content authority, dictionary closure, and an enabled route release. These group-level approvals are checked in child-scoped readiness.</p>}
          {version.route_id === "compound_word_lab" && !activated && <p>Compound activation needs reviewed structure authority, teaching-content authority, dictionary closure, and an enabled route release. These group-level approvals are checked in child-scoped readiness.</p>}
        </article>;
      })}
      <Link className="text-sm underline" href="/admin/adle-canonical-intake-readiness">Check child-scoped readiness</Link>
    </section>}
    {wordId && <section className="rounded-2xl border border-[var(--border)] bg-white p-5"><h2 className="text-lg font-semibold">Source and review history</h2>
      <p className="mt-1 text-sm">Current dictionary source: {word?.source_category} · {word?.source_name || "unnamed source"} · {word?.source_use_note || "no note"}</p>
      <p className="mt-1 break-all text-xs">Import batch {word?.import_batch_id} · source row {word?.source_row_hash}</p>
      <ul className="mt-3 grid gap-2 text-sm">{(historyResult?.data ?? []).map((version) => <li key={version.id}>
        <Link className="underline" href={`/admin/teaching-dictionary/${wordId}?draft=${version.id}`}>{new Date(version.created_at).toLocaleString("en-GB")}</Link>
        {` · ${version.source_kind} · ${version.source_reference} · created by ${version.created_by}`}
        {historyPublicationByDraft.has(version.id) ? ` · published by ${historyPublicationByDraft.get(version.id)?.published_by}` : " · draft"}
      </li>)}</ul>
    </section>}
    <WordEditor wordId={wordId} normalisedWord={normalisedWord} initial={initial} sourceReference={draft?.source_reference ?? word?.source_use_note ?? "Internally authored and reviewed"}
      approvalEnabled={Boolean(approvalControls?.review_enabled && approvalControls.publication_enabled && approvalControls.withdrawal_enabled)}
      skills={skillResult.data ?? []} families={families} clusters={clusters}
      routes={ADLE_CURRICULUM_ROUTE_REGISTRY.filter((route) => route.routeId !== "generic_composer").map((route) => ({ routeId: route.routeId, routeVersion: route.routeVersion, supportedMicroSkillKeys: route.supportedMicroSkillKeys }))} />
  </main>;
}
