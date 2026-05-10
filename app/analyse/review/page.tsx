import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AnalyseBulkReviewBar,
  AnalyseBulkReviewProvider,
  AnalyseBulkSelectionCheckbox,
} from "@/components/analyse-bulk-review";
import { AppShell } from "@/components/app-shell";
import { ChildSwitcher } from "@/components/child-switcher";
import {
  FamilyCombobox,
  FamilyComboboxProvider,
} from "@/components/family-combobox";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
  type AppMode,
} from "@/lib/children";
import type { SpellingCategory } from "@/lib/spelling/categoriseError";
import { getTeachingModeForDiagnosis } from "@/lib/spelling/categoriseError";
import {
  ERROR_PATTERN_OPTIONS,
  formatErrorPatternLabel,
} from "@/lib/spelling/errorPatterns";
import {
  buildFamilyCatalogOptions,
  buildRelevantFamilyOptions,
  buildRecommendedFamilyOptions,
  resolvePracticeFamily,
  type WordFamilyRecord,
} from "@/lib/spelling/familyCatalog";
import { getWordFamilyById, type WordFamilyId } from "@/lib/spelling/wordFamilies";
import { createClient } from "@/lib/supabase/server";

import {
  reanalyseWritingSample,
  updateMisspellingClassification,
} from "../actions";
import { replaceAnalysisForSample } from "../analysis";
import { parseAnalysisRow } from "../types";

type ReviewPageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    review?: string;
    error?: string;
    updated?: string;
    reanalysed?: string;
    assigned?: string;
  }>;
};

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  is_archived: boolean;
};

type WritingSampleRow = {
  id: string;
  title: string | null;
  sample_text: string;
  source: string | null;
  written_at: string | null;
  created_at: string;
  child_id: string;
};

type MisspellingInstanceRow = {
  id: string;
  misspelled_word: string;
  corrected_word: string;
  suggested_word: string | null;
  error_type: SpellingCategory | null;
  secondary_error_type: SpellingCategory | null;
  confidence_score: number | null;
  is_parent_overridden: boolean | null;
  is_false_positive: boolean | null;
  word_family_id: string | null;
  context_text: string | null;
  position_start: number | null;
  position_end: number | null;
  notes: string | null;
};

type GroupedMisspellingReviewItem = {
  key: string;
  instanceIds: string[];
  representative: MisspellingInstanceRow;
  occurrenceCount: number;
};

type ReviewBucket = {
  needsReview: GroupedMisspellingReviewItem[];
  reviewed: GroupedMisspellingReviewItem[];
};

type ReviewTab = "needs" | "reviewed";

const CATEGORY_OPTIONS: SpellingCategory[] = [
  "Phonic",
  "Pattern/rule",
  "Morphology",
  "Homophone",
  "Irregular/tricky memory word",
  "Careless performance error",
];

function getChildName(child: ChildRow) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

function formatDate(dateString: string | null) {
  if (!dateString) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

function getBitOfHelp(familyId: string | null, familyRows: WordFamilyRecord[]) {
  if (!familyId) {
    return null;
  }

  const family = resolvePracticeFamily(familyId, familyRows);
  const supabaseNote = family?.teachingNote || family?.description || "";
  if (supabaseNote && supabaseNote.length <= 140) {
    return supabaseNote;
  }

  const builtInHelp: Record<string, string> = {
    silent_e_words: "Some words need a final silent e at the end.",
    "split-digraphs": "Some words need a final silent e at the end.",
    double_letters: "Some words need two of the same letter in the middle.",
    "double-letters": "Some words need two of the same letter in the middle.",
    ck_pattern: "After a short vowel, we often use ck.",
    schwa_unstressed_vowel: "The middle vowel can sound unclear, so it helps to remember the whole word.",
    ie_ei_patterns: "These words use ie or ei, so it helps to notice the exact letter pattern.",
    tricky_common_words: "This is a tricky word. It helps to remember it as a whole word.",
    "tricky-words": "This is a tricky word. It helps to remember it as a whole word.",
    soft_c: "Before e, i or y, c can sound like s.",
    soft_g: "Before e, i or y, g can sound like j.",
    drop_final_e_ing: "When we add ing, we often drop the final e.",
    drop_keep_final_e_suffixes: "Some endings make the final e drop, but some words keep it. It helps to compare both patterns.",
    change_y_to_i: "Sometimes y changes to i before the ending.",
    common_prefixes: "Keep the base word clear when a prefix is added at the front.",
    common_suffixes: "Keep the root word clear, then choose the ending that fits.",
    root_family_preservation: "Related words often keep the same root spelling, even when they get longer.",
    tion_sion_suffixes: "These endings can sound similar, so it helps to notice the exact ending pattern.",
    double_consonant_suffix: "After a short vowel, we often double the consonant before the ending.",
    no_double_consonant: "Not every ending needs a double consonant. Some words keep just one.",
    final_le_patterns: "Some words end in -le, -el, or -al, so it helps to remember the exact ending pattern.",
    homophones_year_2: "These words can sound the same, so choose the word that fits the sentence meaning.",
    homophones_year_3_4: "These words sound alike, so the sentence meaning helps you choose the right one.",
    homophone_there_their_theyre: "Choose the word that makes sense: place, belonging, or they are.",
    homophone_to_too_two: "Choose the word that means going somewhere, also, or the number 2.",
    homophone_weather_whether: "One word is about the sky. The other means if.",
    homophone_whose_whos: "One asks who something belongs to. The other means who is.",
  };

  return builtInHelp[familyId] ?? null;
}

function getDiagnosisSummaryLabel(
  diagnosis: ReturnType<typeof parseAnalysisRow>["effectiveDiagnosis"],
) {
  return diagnosis ? formatErrorPatternLabel(diagnosis) : "Diagnosis still unclear";
}

function getReviewSelections(
  analysis: ReturnType<typeof parseAnalysisRow>,
  correctedWord: string,
) {
  const diagnosis =
    analysis.extra.parentOverrideDiagnosis ?? analysis.detectedDiagnosis ?? null;
  const teachingMode = analysis.extra.markedCareless
    ? "Careless performance error"
    : analysis.extra.parentOverrideCategory ??
      getTeachingModeForDiagnosis(diagnosis, correctedWord) ??
      analysis.primaryCategory;

  return {
    diagnosis,
    teachingMode,
  };
}

function getReviewedLabel(analysis: ReturnType<typeof parseAnalysisRow>) {
  if (analysis.isFalsePositive) {
    return "False positive";
  }

  if (analysis.extra.markedCareless) {
    return "Marked careless";
  }

  if (analysis.extra.parentOverrideFamilyId) {
    return "Family set";
  }

  if (analysis.extra.parentOverrideDiagnosis) {
    return "Diagnosis set";
  }

  if (analysis.extra.parentOverrideCategory) {
    return "Category set";
  }

  return "Reviewed";
}

type LessonFamilyPresentation = {
  isProminent: boolean;
  prominentLabel: string | null;
  compactLabel: string | null;
};

function getLessonFamilyPresentation(
  familyId: string | null,
  diagnosis: ReturnType<typeof parseAnalysisRow>["effectiveDiagnosis"],
  familyRows: WordFamilyRecord[],
): LessonFamilyPresentation {
  if (!familyId || !diagnosis) {
    return {
      isProminent: false,
      prominentLabel: null,
      compactLabel: diagnosis ? "No specific family selected" : "No clear family yet",
    };
  }

  const family = resolvePracticeFamily(familyId, familyRows);
  const label =
    family?.label ??
    getWordFamilyById(familyId as WordFamilyId)?.label ??
    familyId;
  const usablePracticeWords = family?.practiceWords.filter(
    (word) => /^[a-z]+$/.test(word) && word.length >= 3,
  ) ?? [];

  if (new Set(["tricky_common_words", "tricky-words"]).has(familyId)) {
    return {
      isProminent: false,
      prominentLabel: null,
      compactLabel: "Tricky/common word",
    };
  }

  const isStrong =
    Boolean(family) &&
    usablePracticeWords.length >= 5 &&
    Boolean(family?.teachingNote || family?.description);

  return {
    isProminent: isStrong,
    prominentLabel: isStrong ? label : null,
    compactLabel: isStrong ? null : "No specific family selected",
  };
}

function getGroupedMisspellingItems(
  instances: MisspellingInstanceRow[],
): GroupedMisspellingReviewItem[] {
  const grouped = new Map<string, GroupedMisspellingReviewItem>();

  instances.forEach((instance) => {
    const analysis = parseAnalysisRow(instance, instance.corrected_word);
    const key = [
      instance.misspelled_word.toLowerCase(),
      instance.corrected_word.toLowerCase(),
      analysis.suggestedWord.toLowerCase(),
    ].join("::");

    const existing = grouped.get(key);
    if (existing) {
      existing.instanceIds.push(instance.id);
      existing.occurrenceCount += 1;
      return;
    }

    grouped.set(key, {
      key,
      instanceIds: [instance.id],
      representative: instance,
      occurrenceCount: 1,
    });
  });

  return Array.from(grouped.values());
}

function splitReviewedItems(
  groupedItems: GroupedMisspellingReviewItem[],
): ReviewBucket {
  return groupedItems.reduce<ReviewBucket>(
    (accumulator, item) => {
      const analysis = parseAnalysisRow(
        item.representative,
        item.representative.corrected_word,
      );

      if (analysis.extra.parentReviewedAt) {
        accumulator.reviewed.push(item);
      } else {
        accumulator.needsReview.push(item);
      }

      return accumulator;
    },
    { needsReview: [], reviewed: [] },
  );
}

function normaliseReviewTab(value: string | undefined): ReviewTab {
  return value === "reviewed" ? "reviewed" : "needs";
}

function buildReviewTabPath(
  childId: string,
  mode: AppMode,
  tab: ReviewTab,
) {
  const path = buildScopedPath("/analyse/review", childId, mode);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}review=${tab}`;
}

function buildNextStepMessage(
  needsReviewCount: number,
  reviewedCount: number,
  totalCount: number,
) {
  if (totalCount === 0) {
    return "Add writing first so the app can build a spelling plan from real mistakes.";
  }

  if (needsReviewCount === 0 && reviewedCount > 0) {
    return "This sample is fully reviewed. The next spelling assignment can now be generated from the active canonical learning streams with confidence.";
  }

  if (reviewedCount === 0) {
    return "Review the strongest items first so the assignment is driven by the mistakes you actually want to teach.";
  }

  return "You can generate an assignment now, but finishing the remaining review items will make the next canonical practice set more trustworthy.";
}

async function ensureAnalysisForSample(
  latestSample: WritingSampleRow | null,
  parentUserId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  if (!latestSample) {
    return [] as MisspellingInstanceRow[];
  }

  const { data: existingInstances } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, word_family_id, context_text, position_start, position_end, notes",
    )
    .eq("writing_sample_id", latestSample.id)
    .eq("parent_user_id", parentUserId)
    .order("position_start", { ascending: true });

  if (existingInstances && existingInstances.length > 0) {
    return existingInstances as MisspellingInstanceRow[];
  }

  const { error } = await replaceAnalysisForSample(
    supabase,
    latestSample,
    parentUserId,
  );

  if (error) {
    return [] as MisspellingInstanceRow[];
  }

  const { data: savedInstances } = await supabase
    .from("misspelling_instances")
    .select(
      "id, misspelled_word, corrected_word, suggested_word, error_type, secondary_error_type, confidence_score, is_parent_overridden, is_false_positive, word_family_id, context_text, position_start, position_end, notes",
    )
    .eq("writing_sample_id", latestSample.id)
    .eq("parent_user_id", parentUserId)
    .order("position_start", { ascending: true });

  return (savedInstances ?? []) as MisspellingInstanceRow[];
}

export default async function AnalyseReviewPage({
  searchParams,
}: ReviewPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const activeReviewTab = normaliseReviewTab(resolvedSearchParams?.review);
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();

  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, is_archived")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: true });

  if (!children || children.length === 0) {
    redirect(buildScopedPath("/children", null, mode));
  }

  const activeChildren = children.filter((child) => !child.is_archived);
  const selectedChild = selectChildById(
    activeChildren,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (!selectedChild) {
    redirect(buildScopedPath("/analyse/review", activeChildren[0]?.id ?? null, mode));
  }

  const { data: latestSample } = await supabase
    .from("writing_samples")
    .select("id, title, sample_text, source, written_at, created_at, child_id")
    .eq("parent_user_id", user.id)
    .eq("child_id", selectedChild.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<WritingSampleRow>();

  const { data: rawWordFamilyRows } = await supabase
    .from("word_families")
    .select("*")
    .order("priority", { ascending: true })
    .order("family_name", { ascending: true });

  const familyRows = (rawWordFamilyRows ?? []) as Array<Record<string, unknown>>;
  const wordFamilyOptions = buildFamilyCatalogOptions(familyRows);
  const misspellingInstances = await ensureAnalysisForSample(
    latestSample,
    user.id,
    supabase,
  );
  const groupedMisspellingItems = getGroupedMisspellingItems(misspellingInstances);
  const reviewBuckets = splitReviewedItems(groupedMisspellingItems);
  const visibleReviewItems =
    activeReviewTab === "reviewed"
      ? reviewBuckets.reviewed
      : reviewBuckets.needsReview;
  const nextStepMessage = buildNextStepMessage(
    reviewBuckets.needsReview.length,
    reviewBuckets.reviewed.length,
    groupedMisspellingItems.length,
  );

  return (
    <AppShell
      currentPath="/analyse/review"
      mode={mode}
      activeChildId={selectedChild.id}
      availableChildren={activeChildren}
      userEmail={user.email}
    >
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <section className="brand-card rounded-3xl p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="brand-eyebrow">Scarlett&apos;s Spells</p>
                <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
                  Misspelling review
                </h1>
                <p className="brand-copy mt-3 max-w-3xl text-sm leading-6">
                  Review the analysed spelling items for {getChildName(selectedChild)} without the writing-intake screen getting in the way.
                </p>
              </div>
              <Link
                href={buildScopedPath("/analyse", selectedChild.id, mode)}
                className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
              >
                Back to analyse
              </Link>
            </div>

            <ChildSwitcher
              childOptions={activeChildren}
              activeChildId={selectedChild.id}
              redirectPath="/analyse/review"
            />
          </section>

          <section className="rounded-3xl border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                  Latest analysed sample
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  {latestSample
                    ? `Reviewing ${latestSample.title ?? "the latest sample"}`
                    : "No writing sample has been saved yet."}
                </p>
              </div>
              {latestSample ? (
                <p className="text-sm text-zinc-500">
                  Last saved {formatDate(latestSample.created_at)}
                </p>
              ) : null}
            </div>

            {latestSample ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <form action={reanalyseWritingSample}>
                  <input type="hidden" name="writing_sample_id" value={latestSample.id} />
                  <input type="hidden" name="redirect_child" value={selectedChild.id} />
                  <input type="hidden" name="redirect_path" value="/analyse/review" />
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                  >
                    Reanalyse work
                  </button>
                </form>

              </div>
            ) : (
              <div className="mt-5">
                <Link
                  href={buildScopedPath("/analyse", selectedChild.id, mode)}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
                >
                  Add writing sample
                </Link>
              </div>
            )}

            {resolvedSearchParams?.error ? (
              <p className="mt-4 text-sm text-rose-600">{resolvedSearchParams.error}</p>
            ) : null}
            {resolvedSearchParams?.updated ? (
              <p className="mt-4 text-sm text-emerald-600">Review updated successfully.</p>
            ) : null}
            {resolvedSearchParams?.reanalysed ? (
              <p className="mt-4 text-sm text-emerald-600">Writing sample reanalysed successfully.</p>
            ) : null}
            {resolvedSearchParams?.assigned ? (
              <p className="mt-4 text-sm text-emerald-600">Spelling assignment refreshed successfully.</p>
            ) : null}
          </section>

          {latestSample ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid gap-2">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-700">
                    Next step
                  </p>
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                    Move from review into practice
                  </h2>
                  <p className="max-w-3xl text-sm leading-6 text-zinc-700">
                    {nextStepMessage}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                      {reviewBuckets.reviewed.length} reviewed
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700">
                      {reviewBuckets.needsReview.length} still to check
                    </span>
                  </div>
                </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={buildScopedPath("/courses/review", selectedChild.id, mode)}
                      className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                    >
                      Review submitted work
                    </Link>
                  <Link
                    href={buildScopedPath("/practice", selectedChild.id, mode)}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                  >
                    Open practice
                  </Link>
                </div>
              </div>
            </section>
          ) : null}

          {latestSample ? (
            <FamilyComboboxProvider options={wordFamilyOptions}>
            <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                    Misspelling review
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">
                    Review the detected items for {latestSample.title ?? "the latest sample"}.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                    Needs review: {reviewBuckets.needsReview.length}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Reviewed: {reviewBuckets.reviewed.length}
                  </span>
                </div>
              </div>

              <div className="mt-6 rounded-[1.75rem] border border-[#b7cf8a] bg-[#eaf2dc] p-1">
                <div className="grid gap-1 sm:grid-cols-2">
                  <Link
                    href={buildReviewTabPath(selectedChild.id, mode, "needs")}
                    className={`inline-flex items-center justify-center gap-3 rounded-[1.3rem] px-5 py-3 text-base font-medium transition ${
                      activeReviewTab === "needs"
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-700 hover:bg-white/60"
                    }`}
                  >
                    <span>To check</span>
                    <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[#94b351] px-2 py-1 text-xs font-semibold text-white">
                      {reviewBuckets.needsReview.length}
                    </span>
                  </Link>
                  <Link
                    href={buildReviewTabPath(selectedChild.id, mode, "reviewed")}
                    className={`inline-flex items-center justify-center gap-3 rounded-[1.3rem] px-5 py-3 text-base font-medium transition ${
                      activeReviewTab === "reviewed"
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-700 hover:bg-white/60"
                    }`}
                  >
                    <span>Reviewed</span>
                    <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-[#94b351] px-2 py-1 text-xs font-semibold text-white">
                      {reviewBuckets.reviewed.length}
                    </span>
                  </Link>
                </div>
              </div>

              {visibleReviewItems.length > 0 ? (
                <div className="mt-6 grid gap-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      {activeReviewTab === "reviewed" ? "Reviewed" : "Needs review"}
                    </h3>
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                      {visibleReviewItems.length} item{visibleReviewItems.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {activeReviewTab === "needs" ? (
                    <AnalyseBulkReviewProvider
                      allVisibleIds={visibleReviewItems.flatMap((item) => item.instanceIds)}
                    >
                      <AnalyseBulkReviewBar
                        redirectChildId={selectedChild.id}
                        redirectPath="/analyse/review"
                      />
                      {visibleReviewItems.map((groupedItem) => {
                        const instance = groupedItem.representative;
                        const analysis = parseAnalysisRow(instance, instance.corrected_word);
                        const reviewSelections = getReviewSelections(
                          analysis,
                          instance.corrected_word,
                        );
                        const effectiveFamilyId =
                          analysis.extra.parentOverrideFamilyId ??
                          analysis.extra.selectedWordFamilyId;
                        const bitOfHelp = getBitOfHelp(effectiveFamilyId, familyRows);
                        const lessonFamilyPresentation = getLessonFamilyPresentation(
                          effectiveFamilyId,
                          analysis.effectiveDiagnosis,
                          familyRows,
                        );
                        const recommendedFamilyOptions = buildRecommendedFamilyOptions(
                          familyRows,
                          wordFamilyOptions,
                          {
                            diagnosis: reviewSelections.diagnosis,
                            teachingMode: reviewSelections.teachingMode,
                            correctedWord: instance.corrected_word,
                            detectedFamilyId: analysis.extra.selectedWordFamilyId,
                            parentOverrideFamilyId: analysis.extra.parentOverrideFamilyId,
                          },
                        );
                        const relevantFamilyOptions = buildRelevantFamilyOptions(
                          familyRows,
                          wordFamilyOptions,
                          {
                            diagnosis: reviewSelections.diagnosis,
                            teachingMode: reviewSelections.teachingMode,
                            correctedWord: instance.corrected_word,
                            detectedFamilyId: analysis.extra.selectedWordFamilyId,
                            parentOverrideFamilyId: analysis.extra.parentOverrideFamilyId,
                            includeAllFallback: true,
                          },
                        );

                        return (
                          <article
                            key={groupedItem.key}
                            className={`rounded-2xl border p-4 ${
                              analysis.isFalsePositive
                                ? "border-amber-200 bg-amber-50"
                                : "border-zinc-200 bg-zinc-50"
                            }`}
                          >
                            <div className="grid gap-4">
                              <div className="grid gap-3">
                                <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="grid gap-2">
                                      <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                                        Misspelling
                                      </p>
                                      <div className="flex flex-wrap items-center gap-3 text-sm">
                                        <span className="font-semibold text-zinc-950">
                                          {instance.misspelled_word}
                                        </span>
                                        <span className="text-zinc-400">→</span>
                                        <span className="font-semibold text-zinc-950">
                                          {instance.corrected_word}
                                        </span>
                                      </div>
                                      {groupedItem.occurrenceCount > 1 ? (
                                        <p className="text-xs text-zinc-500">
                                          Repeated {groupedItem.occurrenceCount} times in this sample
                                        </p>
                                      ) : null}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                      <AnalyseBulkSelectionCheckbox ids={groupedItem.instanceIds} />
                                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                                        What went wrong
                                      </span>
                                    </div>
                                  </div>

                                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <div className="grid gap-3">
                                      <div className="flex flex-wrap gap-2">
                                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                                          {getDiagnosisSummaryLabel(analysis.effectiveDiagnosis)}
                                        </span>
                                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                                          {analysis.effectiveCategory}
                                        </span>
                                        {lessonFamilyPresentation.isProminent &&
                                        lessonFamilyPresentation.prominentLabel ? (
                                          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                                            {lessonFamilyPresentation.prominentLabel}
                                          </span>
                                        ) : null}
                                      </div>
                                      {!lessonFamilyPresentation.isProminent &&
                                      lessonFamilyPresentation.compactLabel ? (
                                        <p className="text-sm text-zinc-500">
                                          {lessonFamilyPresentation.compactLabel}
                                        </p>
                                      ) : null}
                                    </div>

                                    {bitOfHelp ? (
                                      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-sky-700">
                                          Bit of help
                                        </p>
                                        <p className="mt-2 text-sm leading-6 text-sky-900">
                                          {bitOfHelp}
                                        </p>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                                <form action={updateMisspellingClassification} className="grid gap-4">
                                  <input type="hidden" name="misspelling_instance_id" value={instance.id} />
                                  <input type="hidden" name="misspelling_instance_ids" value={groupedItem.instanceIds.join(",")} />
                                  <input type="hidden" name="redirect_child" value={selectedChild.id} />
                                  <input type="hidden" name="redirect_path" value="/analyse/review" />

                                  <label className="grid gap-2 text-sm font-medium text-zinc-800">
                                    What went wrong
                                    <select
                                      name="override_diagnosis"
                                      defaultValue={analysis.extra.parentOverrideDiagnosis ?? ""}
                                      className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none transition focus:border-zinc-950"
                                    >
                                      <option value="">Use detected diagnosis</option>
                                      {ERROR_PATTERN_OPTIONS.map((diagnosis) => (
                                        <option key={diagnosis} value={diagnosis}>
                                          {formatErrorPatternLabel(diagnosis)}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <label className="grid gap-2 text-sm font-medium text-zinc-800">
                                    Teaching mode
                                    <select
                                      name="override_category"
                                      defaultValue={
                                        analysis.extra.markedCareless
                                          ? "Careless performance error"
                                          : analysis.extra.parentOverrideCategory ?? ""
                                      }
                                      className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none transition focus:border-zinc-950"
                                    >
                                      <option value="">Use suggested teaching mode</option>
                                      {CATEGORY_OPTIONS.map((category) => (
                                        <option key={category} value={category}>
                                          {category}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <label className="grid gap-2 text-sm font-medium text-zinc-800">
                                    Lesson family
                                    <FamilyCombobox
                                      name="override_family_id"
                                      defaultValue={analysis.extra.parentOverrideFamilyId ?? ""}
                                      options={relevantFamilyOptions}
                                      allOptions={wordFamilyOptions}
                                      recommendedOptions={recommendedFamilyOptions}
                                      placeholder="Search relevant lesson families"
                                    />
                                    <p className="text-xs leading-5 text-zinc-500">
                                      Showing families that match the diagnosis and teaching mode first.
                                    </p>
                                  </label>

                                  <label className="flex items-center gap-3 text-sm text-zinc-700">
                                    <input
                                      type="checkbox"
                                      name="flag_false_positive"
                                      defaultChecked={analysis.isFalsePositive}
                                      className="peer sr-only"
                                    />
                                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 transition peer-checked:border-amber-500 peer-checked:bg-amber-100 peer-checked:text-amber-700">
                                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                                        <path d="M5 2a1 1 0 0 1 1 1v1h7.2l-.6 1.6 1.4 3.4H6v6a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Z" />
                                      </svg>
                                    </span>
                                    <span className="peer-checked:font-medium peer-checked:text-amber-700">
                                      Flag as not actually wrong
                                    </span>
                                  </label>

                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="submit"
                                      aria-label="Save review choice"
                                      title="Save review choice"
                                      className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-zinc-950 text-white transition hover:bg-zinc-800"
                                    >
                                      <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5 fill-current">
                                        <path d="M4 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6.8a2 2 0 0 0-.59-1.42l-2.8-2.8A2 2 0 0 0 13.2 2H4Zm1 2h7v3H5V4Zm0 7h10v5H5v-5Z" />
                                      </svg>
                                    </button>
                                    <button
                                      type="submit"
                                      name="mark_reviewed"
                                      value="on"
                                      className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                                    >
                                      Mark reviewed
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </AnalyseBulkReviewProvider>
                  ) : (
                    <div className="grid gap-4">
                      {visibleReviewItems.map((groupedItem) => {
                        const instance = groupedItem.representative;
                        const analysis = parseAnalysisRow(instance, instance.corrected_word);
                        const effectiveFamilyId =
                          analysis.extra.parentOverrideFamilyId ??
                          analysis.extra.selectedWordFamilyId;
                        const lessonFamilyPresentation = getLessonFamilyPresentation(
                          effectiveFamilyId,
                          analysis.effectiveDiagnosis,
                          familyRows,
                        );

                        return (
                          <article
                            key={groupedItem.key}
                            className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                          >
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                                  Misspelled word
                                </p>
                                <p className="mt-1 text-sm font-semibold text-zinc-950">
                                  {instance.misspelled_word}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                                  Corrected word
                                </p>
                                <p className="mt-1 text-sm font-semibold text-zinc-950">
                                  {instance.corrected_word}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                                  Final teaching mode
                                </p>
                                <p className="mt-1 text-sm text-zinc-700">
                                  {analysis.effectiveCategory}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                                  What went wrong
                                </p>
                                <p className="mt-1 text-sm text-zinc-700">
                                  {getDiagnosisSummaryLabel(analysis.effectiveDiagnosis)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                                  Lesson family
                                </p>
                                <p className="mt-1 text-sm text-zinc-700">
                                  {lessonFamilyPresentation.isProminent
                                    ? lessonFamilyPresentation.prominentLabel
                                    : lessonFamilyPresentation.compactLabel}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                                  Status
                                </p>
                                <p className="mt-1 text-sm font-medium text-emerald-700">
                                  {getReviewedLabel(analysis)}
                                </p>
                              </div>
                            </div>

                            <form action={updateMisspellingClassification} className="mt-4">
                              <input type="hidden" name="misspelling_instance_id" value={instance.id} />
                              <input type="hidden" name="misspelling_instance_ids" value={groupedItem.instanceIds.join(",")} />
                              <input type="hidden" name="redirect_child" value={selectedChild.id} />
                              <input type="hidden" name="redirect_path" value="/analyse/review" />
                              <button
                                type="submit"
                                name="reopen_review"
                                value="on"
                                className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                              >
                                Review again
                              </button>
                            </form>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-6 text-sm leading-6 text-zinc-600">
                  {activeReviewTab === "reviewed"
                    ? "No reviewed items yet in the latest sample."
                    : "No items currently need review in the latest sample."}
                </p>
              )}
            </section>
            </FamilyComboboxProvider>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
