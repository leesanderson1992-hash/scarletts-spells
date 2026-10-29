import "./word-workspace.css";
import { createHash } from "node:crypto";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireAdminUser } from "@/lib/admin/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getSharedAffixProfileMapping } from "@/lib/adle/morphology/shared-affix-profile-registry";
import {
  emptyMetadata,
  emptyMorphology,
  publicationBlockers,
  routeContentFromStoredRow,
  type RouteContentDraft,
  type WordDraftPayload,
} from "@/lib/teaching-dictionary-manager/contracts";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadWordBaseFamilies } from "@/lib/teaching-dictionary-manager/base-family-summary";
import { loadWeakVowelFamilyPrefill } from "@/lib/teaching-dictionary-manager/weak-vowel-family-prefill";
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { approvedFactsSupersedeDraft } from "@/lib/teaching-dictionary-manager/draft-freshness";
import { loadCachedTeachingDictionaryEvidenceAuthorityForWord } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { WordWorkspace } from "./word-workspace";
import { BritishRecordingPanel } from "./british-recording-panel";
import { approvedBritishRecording } from "@/lib/teaching-dictionary-manager/british-recordings";
import { deviceSpeechSource } from "@/lib/adle/weak-vowel/audio-source";
import type { ReviewedWeakVowelSource, ReviewedWeakVowelWrittenFact } from "@/lib/teaching-dictionary-manager/weak-vowel-prefill";
import type { WeakVowelRouteFactsV1 } from "@/lib/teaching-dictionary-manager/weak-vowel-authoring";
import { SpellingCasesForWord } from "./spelling-cases";
import { reviewTeachingDictionaryRouteContent, publishWeakVowelRouteContent } from "./actions";

type Params = {
  draft?: string;
  historical?: string;
  saved?: string;
  error?: string;
  route_error?: string;
  publish_error?: string;
  family_error?: string;
  manual_family?: string;
};

export async function TeachingDictionaryDetail({
  wordId,
  params,
}: {
  wordId: string | null;
  params: Params;
}) {
  await requireAdminUser();
  const db = createServiceRoleClient();
  const [
    wordResult,
    draftResult,
    draftPublicationResult,
    skillResult,
    prefixProfiles,
    suffixProfiles,
    metadataResult,
    morphologyResult,
    dictationResult,
    definitions,
    routeVersions,
    history,
    dictationHead,
    overviewReview,
    submissions,
    baseFamilies,
    weakFamilyPrefill,
  ] = await Promise.all([
    wordId
      ? db
          .from("canonical_teaching_dictionary_words")
          .select("*")
          .eq("id", wordId)
          .maybeSingle()
      : null,
    params.draft && isUuid(params.draft)
      ? db
          .from("teaching_dictionary_manager_drafts")
          .select("*")
          .eq("id", params.draft)
          .maybeSingle()
      : null,
    params.draft && isUuid(params.draft)
      ? db.from("teaching_dictionary_manager_publications")
          .select("published_at").eq("draft_id", params.draft).maybeSingle()
      : null,
    db
      .from("micro_skill_catalog")
      .select("micro_skill_key,display_name,skill_family_key,skill_cluster_key")
      .eq("is_active", true)
      .eq("is_assignable", true)
      .order("display_name"),
    db
      .from("canonical_teaching_dictionary_prefix_profiles")
      .select("micro_skill_key,meaning_bins,prefix_choices")
      .eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure"),
    db
      .from("canonical_teaching_dictionary_suffix_profiles")
      .select("micro_skill_key,meaning_bins,suffix_choices")
      .eq("row_status", "active")
      .eq("review_status", "approved_for_first_exposure"),
    wordId
      ? db
          .from("canonical_teaching_dictionary_word_metadata")
          .select("*")
          .eq("canonical_word_id", wordId)
          .eq("row_status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
      : null,
    wordId
      ? db
          .from("canonical_teaching_dictionary_word_morphology")
          .select("*")
          .eq("canonical_word_id", wordId)
          .eq("row_status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
      : null,
    wordId
      ? db
          .from("canonical_teaching_dictionary_dictation_sentences")
          .select("*")
          .eq("canonical_word_id", wordId)
          .eq("row_status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
      : null,
    wordId
      ? db
          .from("teaching_dictionary_definition_versions")
          .select("definition,published_at")
          .eq("canonical_word_id", wordId)
          .is("route_id", null)
          .order("published_at", { ascending: false })
          .limit(1)
      : null,
    wordId
      ? db
          .from("teaching_dictionary_route_content_versions")
          .select(
            "id,draft_id,route_id,route_version,micro_skill_key,content,published_at",
          )
          .eq("canonical_word_id", wordId)
          .order("published_at", { ascending: false })
          .limit(100)
      : null,
    wordId
      ? db
          .from("teaching_dictionary_manager_drafts")
          .select("id,source_reference,created_at")
          .eq("canonical_word_id", wordId)
          .order("created_at", { ascending: false })
          .limit(30)
      : null,
    wordId
      ? db
          .from("teaching_dictionary_dictation_heads")
          .select("set_id,teaching_dictionary_dictation_sets(variants)")
          .eq("canonical_word_id", wordId)
          .maybeSingle()
      : null,
    params.draft
      ? db
          .from("teaching_dictionary_overview_reviews")
          .select("draft_id")
          .eq("draft_id", params.draft)
          .maybeSingle()
      : null,
    wordId
      ? db
          .from("adle_word_teaching_content_submissions")
          .select("id,route_id,route_version,micro_skill_key,content")
          .eq("canonical_word_id", wordId)
          .eq("approval_status", "approved_for_import")
          .order("imported_at", { ascending: false })
          .limit(50)
      : null,
    wordId ? loadWordBaseFamilies(db, wordId) : Promise.resolve([]),
    wordId ? loadWeakVowelFamilyPrefill(db, wordId) : Promise.resolve({ status: "none" as const, authorityId: null, members: [] }),
  ]);
  for (const result of [
    wordResult,
    draftResult,
    draftPublicationResult,
    skillResult,
    prefixProfiles,
    suffixProfiles,
    metadataResult,
    morphologyResult,
    dictationResult,
    definitions,
    routeVersions,
    history,
    dictationHead,
    overviewReview,
    submissions,
  ]) {
    if (result?.error)
      throw new Error(`TEACHING_DICTIONARY_READ_FAILED: ${result.error.code}`);
  }
  const word = wordResult?.data;
  const draft = draftResult?.data;
  const createdWordDraft =
    draft?.canonical_word_id === null && wordId
      ? await db
          .from("teaching_dictionary_manager_publications")
          .select("canonical_word_id")
          .eq("draft_id", draft.id)
          .eq("canonical_word_id", wordId)
          .maybeSingle()
      : null;
  if (createdWordDraft?.error)
    throw new Error("TEACHING_DRAFT_IDENTITY_READ_FAILED");
  if (
    (wordId && !word) ||
    (params.draft && !draft) ||
    (draft && draft.canonical_word_id !== wordId && !createdWordDraft?.data)
  )
    notFound();
  const metadata = metadataResult?.data?.[0];
  const morphology = morphologyResult?.data?.[0];
  const dictation = dictationResult?.data?.[0];
  const approvedSentence = dictation?.review_status === "approved_for_first_exposure"
    ? dictation.dictation_sentence as string : null;
  const [wordClip, sentenceClip] = wordId && word?.row_status === "active" && word?.review_status === "approved_for_first_exposure"
    ? await Promise.all([
      approvedBritishRecording({ client: db, wordId, kind: "word", text: word.display_word }),
      approvedSentence ? approvedBritishRecording({ client: db, wordId, kind: "sentence", text: approvedSentence }) : null,
    ]) : [null, null];
  const deviceClip = (text: string) => {
    const src = deviceSpeechSource(text);
    return { src, sha256: createHash("sha256").update(src).digest("hex") };
  };
  const deviceWordClip = word?.review_status === "approved_for_first_exposure" ? deviceClip(word.display_word) : null;
  const deviceSentenceClip = approvedSentence ? deviceClip(approvedSentence) : null;
  const dictationSet = dictationHead?.data?.teaching_dictionary_dictation_sets;
  const set = Array.isArray(dictationSet) ? dictationSet[0] : dictationSet;
  const rolledBack = wordId
    ? await db
        .from("teaching_dictionary_route_content_rollbacks")
        .select("content_version_id")
        .in(
          "content_version_id",
          (routeVersions?.data ?? []).map((row) => row.id),
        )
    : null;
  if (rolledBack?.error) throw new Error("TEACHING_ROLLBACK_READ_FAILED");
  const rolledBackIds = new Set(
    (rolledBack?.data ?? []).map((row) => row.content_version_id),
  );
  const weakVersions = (routeVersions?.data ?? []).filter((row) =>
    row.route_id === "weak_vowel_word_lab" && !rolledBackIds.has(row.id));
  const weakVersionIds = weakVersions.map((row) => row.id);
  const [weakReviews, weakPublications] = weakVersionIds.length ? await Promise.all([
    db.from("teaching_dictionary_route_content_reviews").select("content_version_id")
      .in("content_version_id", weakVersionIds),
    db.from("adle_weak_vowel_content_publications").select("content_version_id,micro_skill_key,dictionary_fingerprint,published_at")
      .in("content_version_id", weakVersionIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (weakReviews.error || weakPublications.error) throw new Error("WEAK_VOWEL_PUBLICATION_STATE_READ_FAILED");
  const reviewedWeakIds = new Set((weakReviews.data ?? []).map((row) => row.content_version_id));
  const publishedWeakIds = new Set((weakPublications.data ?? []).map((row) => row.content_version_id));
  const dictionaryFingerprint = wordId && word?.row_status === "active" && word?.review_status === "approved_for_first_exposure"
    ? await db.rpc("teaching_dictionary_route_dictionary_fingerprint", { p_word: wordId })
    : null;
  if (dictionaryFingerprint?.error) throw new Error("WEAK_VOWEL_DICTIONARY_FINGERPRINT_READ_FAILED");
  const writtenReviews = wordId && typeof dictionaryFingerprint?.data === "string"
    ? await db.from("teaching_dictionary_weak_vowel_written_reviews")
      .select("micro_skill_key,lesson_target,selected_vowel,family_decision,decision_reference,dictionary_fingerprint,reviewed_at")
      .eq("canonical_word_id", wordId).eq("decision_status", "approved_written")
      .eq("dictionary_fingerprint", dictionaryFingerprint.data).order("reviewed_at", { ascending: false })
    : null;
  if (writtenReviews?.error) throw new Error("WEAK_VOWEL_WRITTEN_REVIEW_READ_FAILED");
  const approvedWrittenFacts: ReviewedWeakVowelWrittenFact[] = (writtenReviews?.data ?? [])
    .filter((row, index, rows) => rows.findIndex(candidate => candidate.micro_skill_key === row.micro_skill_key) === index)
    .map(row => ({ microSkillKey: row.micro_skill_key,
      target: row.lesson_target as ReviewedWeakVowelWrittenFact["target"],
      selectedVowel: row.selected_vowel as ReviewedWeakVowelWrittenFact["selectedVowel"],
      familyDecision: row.family_decision as ReviewedWeakVowelWrittenFact["familyDecision"],
      decisionReference: row.decision_reference }));
  const weakPublicationState = [...(weakPublications.data ?? [])]
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .filter((row, index, rows) => rows.findIndex(candidate => candidate.micro_skill_key === row.micro_skill_key) === index)
    .map((row) => ({
    microSkillKey: row.micro_skill_key,
    contentVersionId: row.content_version_id,
    sourceCurrent: row.dictionary_fingerprint === dictionaryFingerprint?.data,
  }));
  const activeSkillKeys = new Set((skillResult.data ?? []).map(row => row.micro_skill_key));
  const approvedWeakSources: ReviewedWeakVowelSource[] = weakPublicationState
    .filter(row => row.sourceCurrent && activeSkillKeys.has(row.microSkillKey))
    .flatMap(row => {
      const version = weakVersions.find(candidate => candidate.id === row.contentVersionId);
      const facts = version ? routeContentFromStoredRow(version).content.weakVowel : null;
      return facts && typeof facts === "object" && !Array.isArray(facts)
        ? [{ microSkillKey: row.microSkillKey, contentVersionId: row.contentVersionId,
          facts: facts as Partial<WeakVowelRouteFactsV1> }] : [];
    });
  const environment = resolveAdleRouteActivationEnvironment();
  const assignmentAuthority = wordId && environment
    ? await loadCachedTeachingDictionaryEvidenceAuthorityForWord(environment, wordId)
    : null;
  const initialAssignedSkillKeys = (assignmentAuthority?.relationships ?? [])
    .filter(row => row.canonicalWordId === wordId)
    .map(row => row.microSkillKey);
  const routeContents: RouteContentDraft[] = [];
  for (const row of (routeVersions?.data ?? []).filter(
    (row) => !rolledBackIds.has(row.id),
  ))
    if (
      !routeContents.some(
        (content) => content.microSkillKey === row.micro_skill_key,
      )
    )
      routeContents.push(routeContentFromStoredRow(row));
  const currentInitial: WordDraftPayload = {
        displayWord: word?.display_word ?? "",
        definition:
          definitions?.data?.[0]?.definition ??
          routeContents.find((route) => route.wordMeaning)?.wordMeaning ??
          "",
        dictationSentence: dictation?.dictation_sentence ?? "",
        dictationTargetTokenIndex: dictation?.dictation_target_token_index ?? 0,
        dictationVariants:
          set?.variants as WordDraftPayload["dictationVariants"],
        writtenSyllableBreakdown: metadata?.written_syllable_breakdown ?? "",
        ageBand: word?.age_band ?? "",
        frequencyBand: word?.frequency_band ?? "",
        complexityBand: word?.complexity_band ?? "",
        metadata: {
          ...emptyMetadata(),
          ...Object.fromEntries(
            Object.keys(emptyMetadata()).map((key) => [
              key,
              metadata?.[key] ?? (key === "has_schwa" ? null : ""),
            ]),
          ),
        },
        canonicalMorphology: morphology
          ? {
              rawSegmentation: morphology.raw_morpholex_segmentation ?? "",
              rawPartOfSpeech: morphology.raw_morpholex_pos ?? "",
              parts: morphology.morphology_parts ?? [],
              joins: morphology.morphology_joins ?? [],
              featureKeys: morphology.feature_keys ?? [],
              transformations: morphology.morphology_transformations ?? [],
              transformationNotes: morphology.transformation_notes ?? "",
              wordSum: morphology.word_sum ?? "",
              analysisStatus: morphology.analysis_status,
              reviewNotes: morphology.review_notes ?? "",
            }
          : emptyMorphology(),
        provenance: {
          sourceCategory: word?.source_category ?? "internal_authored",
          sourceName:
            word?.source_name ?? "Teaching Dictionary editorial review",
          sourceUrl: word?.source_url ?? "",
          sourceLicence: word?.source_licence ?? "",
          sourceUseNote:
            word?.source_use_note ?? "Internally authored and reviewed",
          confidence: word?.confidence ?? "high",
        },
        skillKeys: [
          ...new Set([
            ...routeContents.map((content) => content.microSkillKey),
          ]),
        ],
        routeContents,
      };
  const staleDraft = Boolean(draft && approvedFactsSupersedeDraft(
    draftPublicationResult?.data?.published_at ?? draft.created_at, [
    word?.updated_at, metadata?.created_at, morphology?.created_at,
    dictation?.created_at, definitions?.data?.[0]?.published_at,
  ]));
  const approvedFactDates = [word?.updated_at, metadata?.created_at, morphology?.created_at,
    dictation?.created_at, definitions?.data?.[0]?.published_at]
    .map((date) => Date.parse(date ?? "")).filter(Number.isFinite);
  const latestSavedDraft = !params.draft && (history?.data ?? []).find((version) =>
    Date.parse(version.created_at) > Math.max(0, ...approvedFactDates));
  const activeDraft = staleDraft ? null : draft;
  const initial: WordDraftPayload = activeDraft ? activeDraft.payload as WordDraftPayload : currentInitial;
  const suggestions = [
    ...routeContents.map((route) => ({
      label: `Existing ${route.microSkillKey.replaceAll("_", " ")} analysis`,
      route,
    })),
    ...(submissions?.data ?? []).map((row) => ({
      label: "Imported teaching analysis",
      route: routeContentFromStoredRow(row),
    })),
  ].flatMap(({ label, route }) => {
    const parts =
      route.content.trueMorphologyParts ??
      route.content.morphologyParts ??
      route.content.teachingSplitParts;
    const joins =
      route.content.trueMorphologyJoins ??
      route.content.morphologyJoins ??
      route.content.teachingSplitJoins;
    return Array.isArray(parts) && parts.length && Array.isArray(joins)
      ? [
          {
            label,
            parts,
            joins,
            transformations: (route.content.trueMorphologyTransformations ??
              route.content.morphologyTransformations ??
              []) as NonNullable<
              WordDraftPayload["canonicalMorphology"]["transformations"]
            >,
          },
        ]
      : [];
  });
  const partSuggestions = [
    ...new Map(
      suggestions.map((suggestion) => [
        JSON.stringify(suggestion.parts),
        suggestion,
      ]),
    ).values(),
  ];
  const affixMeanings: Record<string, string[]> = {};
  for (const profile of prefixProfiles.data ?? [])
    for (const raw of Array.isArray(profile.prefix_choices)
      ? profile.prefix_choices
      : []) {
      const choice = raw as { text?: string; meaning?: string };
      if (choice.text && choice.meaning)
        (affixMeanings[choice.text] ??= []).push(choice.meaning);
    }
  for (const profile of suffixProfiles.data ?? [])
    for (const form of getSharedAffixProfileMapping(profile.micro_skill_key)
      ?.forms ?? []) {
      for (const raw of Array.isArray(profile.meaning_bins)
        ? profile.meaning_bins
        : []) {
        const bin = raw as { label?: string; description?: string };
        if (bin.label)
          (affixMeanings[form] ??= []).push(bin.description || bin.label);
      }
    }
  if (staleDraft && params.historical === "1" && draft && wordId) return (
    <main className="mx-auto grid max-w-5xl gap-4 p-6 text-[color:var(--ink)]">
      <Link className="underline" href={`/admin/teaching-dictionary/${wordId}?draft=${draft.id}`}>← Current approved facts</Link>
      <h1 className="text-2xl font-semibold">Historical draft for {word?.display_word}</h1>
      <p role="status">This older snapshot is read-only. It cannot replace the current approved dictionary word.</p>
      <pre className="overflow-auto rounded border border-[var(--border)] bg-[var(--paper)] p-4 text-xs">{JSON.stringify(draft.payload, null, 2)}</pre>
    </main>
  );
  return (
    <main className="mx-auto grid w-full min-w-0 max-w-7xl grid-cols-[minmax(0,1fr)] gap-4 p-4 text-[color:var(--ink)] sm:p-6">
      <nav className="flex gap-4 text-sm">
        <Link href="/admin/teaching-dictionary" className="underline">
          ← All words
        </Link>
        <Link href="/admin/adle-lesson-readiness" className="underline">
          ADLE lesson readiness
        </Link>
      </nav>
      <header>
        <h1 className="text-3xl font-semibold">
          {word?.display_word ?? "New word"}
        </h1>
      </header>
      {wordId && word?.row_status === "active" && word?.review_status === "approved_for_first_exposure" && <BritishRecordingPanel wordId={wordId}
        word={word.display_word} sentence={approvedSentence} wordClip={wordClip} sentenceClip={sentenceClip} />}
      {wordId && latestSavedDraft && <div role="status" className="rounded-xl border border-sky-300 bg-sky-50 p-4 text-sm">
        A newer saved draft exists, but its changes are not yet in the live dictionary.{" "}
        <Link className="underline" href={`/admin/teaching-dictionary/${wordId}?draft=${latestSavedDraft.id}`}>
          Open the saved draft
        </Link>{" "}to continue its review.
      </div>}
      {staleDraft && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
        <strong>This draft predates newer approved dictionary facts.</strong>{" "}
        Current approved facts are shown. Save a new draft to review this lesson content; the older draft is preserved.
        {wordId && draft && <>{" "}<Link className="underline" href={`/admin/teaching-dictionary/${wordId}?draft=${draft.id}&historical=1`}>
          View historical draft
        </Link></>}
      </div>}
      <WordWorkspace
        key={`${activeDraft?.id ?? wordId}:${fingerprintSnapshotValue(JSON.parse(JSON.stringify(initial)))}`}
        wordId={wordId}
        currentMorphologyId={morphology?.id ?? null}
        currentApprovedPartOfSpeech={morphology?.raw_morpholex_pos ?? ""}
        draftId={activeDraft?.id ?? null}
        normalisedWord={draft?.normalised_word ?? word?.normalised_word ?? ""}
        initial={initial}
        weakPublicationState={weakPublicationState}
        approvedWord={word?.review_status === "approved_for_first_exposure" ? word.display_word : null}
        approvedDefinition={definitions?.data?.[0]?.definition ?? null}
        approvedSentence={approvedSentence}
        wordClip={wordClip}
        sentenceClip={sentenceClip}
        deviceWordClip={deviceWordClip}
        deviceSentenceClip={deviceSentenceClip}
        approvedWeakSources={approvedWeakSources}
        approvedWrittenFacts={approvedWrittenFacts}
        weakFamilyPrefill={weakFamilyPrefill}
        approvedSourceReference={wordId && approvedSentence ? `Approved Teaching Dictionary word ${wordId}; dictation ${dictation?.id}` : ""}
        initialAssignedSkillKeys={assignmentAuthority ? initialAssignedSkillKeys : null}
        dictionaryFingerprint={typeof dictionaryFingerprint?.data === "string" ? dictionaryFingerprint.data : null}
        sourceReference={
          activeDraft?.source_reference ??
          word?.source_use_note ??
          "Internally authored and reviewed"
        }
        skills={skillResult.data ?? []}
        affixMeanings={affixMeanings}
        partSuggestions={partSuggestions}
        baseFamilies={baseFamilies}
        familyReviewContext={{ error: params.family_error, manualFamilyId: params.manual_family }}
        overviewReviewed={
          publicationBlockers(initial, word?.normalised_word ?? draft?.normalised_word ?? "").length === 0 &&
          (activeDraft
            ? Boolean(overviewReview?.data)
            : word?.review_status === "approved_for_first_exposure")
        }
        saved={Boolean(params.saved)}
        error={params.error ?? params.publish_error ?? params.route_error}
        profileOptions={[
          ...(prefixProfiles.data ?? []).map((profile) => ({
            microSkillKey: profile.micro_skill_key,
            meaningBins: profile.meaning_bins as {
              id: string;
              label: string;
            }[],
            choices: ((profile.prefix_choices as { text: string }[]) ?? []).map(
              (choice) => choice.text,
            ),
          })),
          ...(suffixProfiles.data ?? []).map((profile) => ({
            microSkillKey: profile.micro_skill_key,
            meaningBins: profile.meaning_bins as {
              id: string;
              label: string;
            }[],
            choices: [
              ...(getSharedAffixProfileMapping(profile.micro_skill_key)
                ?.forms ?? []),
            ],
          })),
        ]}
        advanced={
          <div className="text-sm">
            <p>Canonical ID: {wordId ?? "New word"}</p>
            <p>Source: {word?.source_name ?? "Internally authored"}</p>
            <ul className="mt-2 space-y-1">
              {(history?.data ?? []).map((version) => (
                <li key={version.id}>
                  <Link
                    className="underline"
                    href={`/admin/teaching-dictionary/${wordId}?draft=${version.id}`}
                  >
                    {new Date(version.created_at).toLocaleString("en-GB")}
                  </Link>{" "}
                  · {version.source_reference}
                </li>
              ))}
            </ul>
          </div>
        }
      />
      {wordId && word && <Suspense fallback={<p className="text-sm text-[color:var(--mid)]">Checking open spelling cases…</p>}>
        <SpellingCasesForWord wordId={wordId} normalisedWord={word.normalised_word} skills={skillResult.data ?? []} />
      </Suspense>}
      {wordId && weakVersions.length ? <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5" aria-label="Weak-vowel route publications">
        <h2 className="text-lg font-bold">Weak-vowel lesson content</h2>
        <p className="mt-1 text-sm">Each word–skill version needs editorial review, then publication. Publication prepares future assignments; it does not activate the route.</p>
        <div className="mt-4 grid gap-3">{weakVersions.map((version) => {
          const reviewed = reviewedWeakIds.has(version.id);
          const published = publishedWeakIds.has(version.id);
          return <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
            <div><p className="font-semibold">{version.micro_skill_key}</p><p className="text-xs">Version {version.id} · {published ? "Published" : reviewed ? "Reviewed" : "Awaiting review"}</p></div>
            {!published && <form action={reviewed ? publishWeakVowelRouteContent : reviewTeachingDictionaryRouteContent}>
              <input type="hidden" name="word_id" value={wordId} />
              <input type="hidden" name="content_version_id" value={version.id} />
              <button className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold" type="submit">
                {reviewed ? "Publish reviewed content" : "Review this version"}
              </button>
            </form>}
          </div>;
        })}</div>
      </section> : null}
    </main>
  );
}
