import "./word-workspace.css";
import Link from "next/link";
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
import { fingerprintSnapshotValue } from "@/lib/adle/composable-lesson/canonical-fingerprint";
import { WordWorkspace } from "./word-workspace";

type Params = {
  draft?: string;
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
  ]);
  for (const result of [
    wordResult,
    draftResult,
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
  const initial: WordDraftPayload = draft
    ? (draft.payload as WordDraftPayload)
    : {
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
      <WordWorkspace
        key={`${draft?.id ?? wordId}:${fingerprintSnapshotValue(JSON.parse(JSON.stringify(initial)))}`}
        wordId={wordId}
        draftId={draft?.id ?? null}
        normalisedWord={draft?.normalised_word ?? word?.normalised_word ?? ""}
        initial={initial}
        sourceReference={
          draft?.source_reference ??
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
          (draft
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
    </main>
  );
}
