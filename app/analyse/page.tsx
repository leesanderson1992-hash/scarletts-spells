import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AnalyseBulkReviewBar,
  AnalyseBulkReviewProvider,
  AnalyseBulkSelectionCheckbox,
} from "@/components/analyse-bulk-review";
import { AppShell } from "@/components/app-shell";
import { ChildSwitcher } from "@/components/child-switcher";
import { FamilyCombobox } from "@/components/family-combobox";
import {
  type AppMode,
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import {
  buildRecommendedFamilyOptions,
  buildFamilyCatalogOptions,
  resolvePracticeFamily,
  type WordFamilyRecord,
} from "@/lib/spelling/familyCatalog";
import type { SpellingCategory } from "@/lib/spelling/categoriseError";
import {
  ERROR_PATTERN_OPTIONS,
  formatErrorPatternLabel,
} from "@/lib/spelling/errorPatterns";
import { generateDailyAssignmentPlan } from "@/lib/spelling/generateDailyAssignment";
import { getWordFamilyById, type WordFamilyId } from "@/lib/spelling/wordFamilies";
import { createClient } from "@/lib/supabase/server";

import {
  reanalyseWritingSample,
  saveWritingSample,
  updateMisspellingClassification,
} from "./actions";
import { replaceAnalysisForSample } from "./analysis";
import {
  parseAnalysisRow,
} from "./types";

type AnalysePageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
    review?: string;
    error?: string;
    saved?: string;
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

type AssignmentDebugPreview = {
  key: string;
  misspelledWord: string;
  correctedWord: string;
  detectedCategory: string;
  detectedDiagnosis: string;
  finalDiagnosis: string;
  detectedFamilyLabel: string | null;
  parentOverrideFamilyLabel: string | null;
  finalFamilyLabel: string | null;
  focusWord: string | null;
  targetWords: string[];
};

type ReviewBucket = {
  needsReview: GroupedMisspellingReviewItem[];
  reviewed: GroupedMisspellingReviewItem[];
};

type ReviewTab = "needs" | "reviewed";
type EngineMistakeKind =
  | "false_positive"
  | "diagnosis"
  | "teaching_mode"
  | "lesson_family";

type EngineMistakeItem = {
  key: string;
  misspelledWord: string;
  correctedWord: string;
  kinds: EngineMistakeKind[];
  engineDiagnosis: string;
  finalDiagnosis: string;
  engineTeachingMode: string;
  finalTeachingMode: string;
  engineFamily: string;
  finalFamily: string;
  reviewedLabel: string;
};

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

function getPreviewText(sampleText: string) {
  return sampleText.length > 240
    ? `${sampleText.slice(0, 240).trimEnd()}...`
    : sampleText;
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

  if (builtInHelp[familyId]) {
    return builtInHelp[familyId];
  }

  return null;
}

function getDiagnosisSummaryLabel(
  diagnosis: ReturnType<typeof parseAnalysisRow>["effectiveDiagnosis"],
) {
  return diagnosis ? formatErrorPatternLabel(diagnosis) : "Diagnosis still unclear";
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

  const weakFamilyIds = new Set(["tricky_common_words", "tricky-words"]);
  if (weakFamilyIds.has(familyId)) {
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

function buildAssignmentDebugPreviews(
  groupedItems: GroupedMisspellingReviewItem[],
  wordFamilyLabelByValue: Map<string, string>,
  rawWordFamilyRows: Array<Record<string, unknown>>,
): AssignmentDebugPreview[] {
  const previews: Array<AssignmentDebugPreview | null> = groupedItems.map(
    (groupedItem): AssignmentDebugPreview | null => {
      const instance = groupedItem.representative;
      const analysis = parseAnalysisRow(instance, instance.corrected_word);

      if (analysis.isFalsePositive) {
        return null;
      }

      const detectedFamilyId = analysis.extra.selectedWordFamilyId;
      const parentOverrideFamilyId = analysis.extra.parentOverrideFamilyId;
      const debugPlan = generateDailyAssignmentPlan(
        [
          {
            misspelledWord: instance.misspelled_word,
            correctedWord: instance.corrected_word,
            category: analysis.effectiveCategory,
            errorPattern: analysis.effectiveDiagnosis,
            selectedWordFamilyId:
              parentOverrideFamilyId ?? detectedFamilyId,
          },
        ],
        [],
        rawWordFamilyRows,
      );

      return {
        key: groupedItem.key,
        misspelledWord: instance.misspelled_word,
        correctedWord: instance.corrected_word,
        detectedCategory: analysis.primaryCategory,
        detectedDiagnosis: formatErrorPatternLabel(analysis.detectedDiagnosis),
        finalDiagnosis: formatErrorPatternLabel(analysis.effectiveDiagnosis),
        detectedFamilyLabel:
          (detectedFamilyId
            ? wordFamilyLabelByValue.get(detectedFamilyId)
            : null) ??
          (detectedFamilyId
            ? getWordFamilyById(detectedFamilyId as WordFamilyId)?.label ?? null
            : null),
        parentOverrideFamilyLabel:
          (parentOverrideFamilyId
            ? wordFamilyLabelByValue.get(parentOverrideFamilyId)
            : null) ??
          (parentOverrideFamilyId
            ? getWordFamilyById(parentOverrideFamilyId as WordFamilyId)?.label ?? null
            : null),
        finalFamilyLabel: debugPlan.familyLabel,
        focusWord: debugPlan.focusWord,
        targetWords: debugPlan.targetWords,
      };
    },
  );

  return previews.filter(
    (preview): preview is AssignmentDebugPreview => preview !== null,
  );
}

function buildEngineMistakeItems(
  groupedItems: GroupedMisspellingReviewItem[],
  familyRows: WordFamilyRecord[],
): EngineMistakeItem[] {
  return groupedItems.flatMap((groupedItem) => {
    const instance = groupedItem.representative;
    const analysis = parseAnalysisRow(instance, instance.corrected_word);

    if (!analysis.extra.parentReviewedAt) {
      return [];
    }

    const detectedFamilyId = analysis.extra.selectedWordFamilyId;
    const finalFamilyId =
      analysis.extra.parentOverrideFamilyId ?? analysis.extra.selectedWordFamilyId;
    const detectedFamilyLabel =
      detectedFamilyId
        ? resolvePracticeFamily(detectedFamilyId, familyRows)?.label ??
          getWordFamilyById(detectedFamilyId as WordFamilyId)?.label ??
          detectedFamilyId
        : "No specific family selected";
    const finalFamilyLabel =
      finalFamilyId
        ? resolvePracticeFamily(finalFamilyId, familyRows)?.label ??
          getWordFamilyById(finalFamilyId as WordFamilyId)?.label ??
          finalFamilyId
        : "No specific family selected";

    const kinds: EngineMistakeKind[] = [];

    if (analysis.isFalsePositive) {
      kinds.push("false_positive");
    }

    if (
      analysis.effectiveDiagnosis &&
      analysis.effectiveDiagnosis !== analysis.detectedDiagnosis
    ) {
      kinds.push("diagnosis");
    }

    if (analysis.effectiveCategory !== analysis.primaryCategory) {
      kinds.push("teaching_mode");
    }

    if (finalFamilyId !== detectedFamilyId) {
      kinds.push("lesson_family");
    }

    if (kinds.length === 0) {
      return [];
    }

    return [
      {
        key: groupedItem.key,
        misspelledWord: instance.misspelled_word,
        correctedWord: instance.corrected_word,
        kinds,
        engineDiagnosis: getDiagnosisSummaryLabel(analysis.detectedDiagnosis),
        finalDiagnosis: getDiagnosisSummaryLabel(analysis.effectiveDiagnosis),
        engineTeachingMode: analysis.primaryCategory,
        finalTeachingMode: analysis.effectiveCategory,
        engineFamily: detectedFamilyLabel,
        finalFamily: finalFamilyLabel,
        reviewedLabel: getReviewedLabel(analysis),
      },
    ];
  });
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
  const path = buildScopedPath("/analyse", childId, mode);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}review=${tab}`;
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

export default async function AnalysePage({ searchParams }: AnalysePageProps) {
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
    return (
      <AppShell currentPath="/analyse" mode={mode} activeChildId={null} availableChildren={[]} userEmail={user.email}>
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Analyse writing
            </h1>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              You&apos;ll need to create a child profile before you can save a
              writing sample for analysis.
            </p>
            <Link
              href={buildScopedPath("/children", null, mode)}
              className="brand-primary-btn mt-5"
            >
              Manage children
            </Link>
          </section>
        </div>
      </div>
      </AppShell>
    );
  }

  const activeChildren = children.filter((child) => !child.is_archived);
  const selectedChild = selectChildById(
    activeChildren,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (activeChildren.length === 0) {
    return (
      <AppShell currentPath="/analyse" mode={mode} activeChildId={null} availableChildren={[]} userEmail={user.email}>
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Analyse writing
            </h1>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              There are no active child profiles right now. Restore one or add a new child from the children page first.
            </p>
            <Link
              href={buildScopedPath("/children", null, mode)}
              className="brand-primary-btn mt-5"
            >
              Manage children
            </Link>
          </section>
        </div>
      </div>
      </AppShell>
    );
  }

  if (!selectedChild) {
    redirect(buildScopedPath("/analyse", activeChildren[0]?.id ?? null, mode));
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
  const wordFamilyLabelByValue = new Map(
    wordFamilyOptions.map((option) => [option.value, option.label]),
  );

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
  const engineMistakeItems = buildEngineMistakeItems(
    reviewBuckets.reviewed,
    familyRows,
  );
  const engineMistakeCounts = {
    falsePositive: engineMistakeItems.filter((item) =>
      item.kinds.includes("false_positive"),
    ).length,
    diagnosis: engineMistakeItems.filter((item) =>
      item.kinds.includes("diagnosis"),
    ).length,
    teachingMode: engineMistakeItems.filter((item) =>
      item.kinds.includes("teaching_mode"),
    ).length,
    lessonFamily: engineMistakeItems.filter((item) =>
      item.kinds.includes("lesson_family"),
    ).length,
  };
  const assignmentDebugPreviews = buildAssignmentDebugPreviews(
    groupedMisspellingItems,
    wordFamilyLabelByValue,
    familyRows,
  );

  return (
    <AppShell currentPath="/analyse" mode={mode} activeChildId={selectedChild.id} availableChildren={activeChildren} userEmail={user.email}>
    <div className="brand-page px-6 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="brand-card rounded-3xl p-6">
          <p className="brand-eyebrow">
            Scarlett&apos;s Spells
          </p>
          <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
            Analyse writing
          </h1>
          <p className="brand-copy mt-3 max-w-3xl text-sm leading-6">
            Paste a piece of your child&apos;s writing so we can store it and
            prepare it for spelling analysis. This page saves the intake only;
            the real spelling engine comes next.
          </p>
          <ChildSwitcher
            children={activeChildren}
            activeChildId={selectedChild.id}
            redirectPath="/analyse"
          />
        </section>

        <section className="brand-card rounded-3xl p-6">
          <form action={saveWritingSample} className="grid gap-5">
            <input type="hidden" name="redirect_child" value={selectedChild.id} />
            <div className="grid gap-5 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-zinc-800">
                Child
                <select
                  name="child_id"
                  defaultValue={selectedChild.id}
                  className="h-11 rounded-2xl border border-zinc-300 bg-white px-4 text-sm outline-none transition focus:border-zinc-950"
                >
                  {activeChildren.map((child) => (
                    <option key={child.id} value={child.id}>
                      {getChildName(child)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium text-zinc-800">
                Title
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="Friday spelling journal"
                  className="h-11 rounded-2xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium text-zinc-800">
              Prompt or context
              <input
                type="text"
                name="context"
                placeholder="Optional: school diary entry, homework response, free writing..."
                className="h-11 rounded-2xl border border-zinc-300 px-4 text-sm outline-none transition focus:border-zinc-950"
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-zinc-800">
              Writing sample
              <textarea
                name="sample_text"
                required
                rows={12}
                placeholder="Paste your child's writing here..."
                className="min-h-[240px] rounded-3xl border border-zinc-300 px-4 py-3 text-sm leading-6 outline-none transition focus:border-zinc-950"
              />
            </label>

            {resolvedSearchParams?.error ? (
              <p className="text-sm text-rose-600">{resolvedSearchParams.error}</p>
            ) : null}

            {resolvedSearchParams?.saved ? (
              <p className="text-sm text-emerald-600">
                Writing sample saved successfully.
              </p>
            ) : null}

            {resolvedSearchParams?.updated ? (
              <p className="text-sm text-emerald-600">
                Analysis item updated successfully.
              </p>
            ) : null}

            {resolvedSearchParams?.reanalysed ? (
              <p className="text-sm text-emerald-600">
                Writing sample reanalysed successfully.
              </p>
            ) : null}

            {resolvedSearchParams?.assigned ? (
              <p className="text-sm text-emerald-600">
                Practice queue refreshed successfully.
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-zinc-500">
                The saved sample will appear in the analysis panel below for {getChildName(selectedChild)}.
              </p>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Save writing sample
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-dashed border-zinc-300 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                Analysis preview
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Review the latest saved writing sample for {getChildName(selectedChild)}.
              </p>
            </div>
            {latestSample ? (
              <p className="text-sm text-zinc-500">
                Last saved {formatDate(latestSample.created_at)}
              </p>
            ) : null}
          </div>

          {latestSample ? (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 md:col-span-2">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Latest sample
                    </p>
                    <h3 className="mt-2 text-lg font-semibold text-zinc-950">
                      {latestSample.title ?? "Untitled sample"}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">
                      {getPreviewText(latestSample.sample_text)}
                    </p>
                  </div>

                  <form action={reanalyseWritingSample}>
                    <input
                      type="hidden"
                      name="writing_sample_id"
                      value={latestSample.id}
                    />
                    <input
                      type="hidden"
                      name="redirect_child"
                      value={selectedChild.id}
                    />
                    <button
                      type="submit"
                      className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                    >
                      Reanalyse work
                    </button>
                  </form>
                </div>
              </article>

              <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Intake details
                </p>
                <dl className="mt-3 grid gap-3 text-sm text-zinc-600">
                  <div>
                    <dt className="font-medium text-zinc-950">Child</dt>
                    <dd>{getChildName(selectedChild)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-950">Written date</dt>
                    <dd>{formatDate(latestSample.written_at)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-950">Source</dt>
                    <dd>{latestSample.source ?? "Not provided"}</dd>
                  </div>
                </dl>
              </article>

              <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                  Placeholder analysis
                </p>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-zinc-600">
                  <li>
                    {groupedMisspellingItems.length > 0
                      ? `${groupedMisspellingItems.length} unique likely misspelling ${
                          groupedMisspellingItems.length === 1 ? "item" : "items"
                        } saved for review.`
                      : "No likely misspellings detected in the latest sample."}
                  </li>
                  <li>Parents can override categories or mark slips as careless errors.</li>
                  <li>Reviewed items refresh the child’s spelling queue automatically.</li>
                </ul>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={buildScopedPath("/analyse/review", selectedChild.id, mode)}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                  >
                    Open misspelling review
                  </Link>
                  <Link
                    href={buildScopedPath("/practice", selectedChild.id, mode)}
                    className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800"
                  >
                    Open practice
                  </Link>
                </div>
              </article>
            </div>
          ) : (
            <p className="mt-6 text-sm leading-6 text-zinc-600">
              No writing sample has been saved yet. Once you submit one above,
              the latest sample for {getChildName(selectedChild)} will appear here with a structured analysis placeholder.
            </p>
          )}
        </section>

        {latestSample ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                  Misspelling review
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Open the dedicated review page to work through detected items for {latestSample.title ?? "the latest sample"}.
                </p>
              </div>
              <Link
                href={buildScopedPath("/analyse/review", selectedChild.id, mode)}
                className="inline-flex h-11 items-center justify-center rounded-full bg-zinc-950 px-5 text-sm font-medium text-white transition hover:bg-zinc-800"
              >
                Open review page
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                Needs review: {reviewBuckets.needsReview.length}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Reviewed: {reviewBuckets.reviewed.length}
              </span>
            </div>
          </section>
        ) : null}

        {latestSample && engineMistakeItems.length > 0 ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                  Engine mistakes
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Reviewed items where the parent changed what the engine first suggested.
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                {engineMistakeItems.length} item{engineMistakeItems.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                False positive: {engineMistakeCounts.falsePositive}
              </span>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                Diagnosis: {engineMistakeCounts.diagnosis}
              </span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                Teaching mode: {engineMistakeCounts.teachingMode}
              </span>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700">
                Lesson family: {engineMistakeCounts.lessonFamily}
              </span>
            </div>

            <div className="mt-6 grid gap-4">
              {engineMistakeItems.map((item) => (
                <article
                  key={item.key}
                  className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <p className="text-sm font-semibold text-zinc-950">
                        {item.misspelledWord} <span className="text-zinc-400">→</span>{" "}
                        {item.correctedWord}
                      </p>
                      <p className="text-xs text-zinc-500">{item.reviewedLabel}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {item.kinds.includes("false_positive") ? (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                          False positive
                        </span>
                      ) : null}
                      {item.kinds.includes("diagnosis") ? (
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                          Diagnosis changed
                        </span>
                      ) : null}
                      {item.kinds.includes("teaching_mode") ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                          Teaching mode changed
                        </span>
                      ) : null}
                      {item.kinds.includes("lesson_family") ? (
                        <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800">
                          Lesson family changed
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        Engine diagnosis
                      </p>
                      <p className="mt-1 text-sm text-zinc-700">
                        {item.engineDiagnosis}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Final: {item.finalDiagnosis}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        Engine teaching mode
                      </p>
                      <p className="mt-1 text-sm text-zinc-700">
                        {item.engineTeachingMode}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Final: {item.finalTeachingMode}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                        Engine lesson family
                      </p>
                      <p className="mt-1 text-sm text-zinc-700">
                        {item.engineFamily}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Final: {item.finalFamily}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {latestSample ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
                  Assignment quality check
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Compact parent/debug preview of the family choice and six-word list for each analysed misspelling.
                </p>
              </div>
            </div>

            {assignmentDebugPreviews.length > 0 ? (
              <div className="mt-6 grid gap-4">
                {assignmentDebugPreviews.map((preview) => (
                  <article
                    key={preview.key}
                    className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <div className="grid gap-3">
                      <div className="grid gap-3">
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              Misspelled word
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-950">
                              {preview.misspelledWord}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              Corrected word
                            </p>
                            <p className="mt-1 text-sm font-semibold text-zinc-950">
                              {preview.correctedWord}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              Detected category
                            </p>
                            <p className="mt-1 text-sm text-zinc-700">
                              {preview.detectedCategory}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              Detected family
                            </p>
                            <p className="mt-1 text-sm text-zinc-700">
                              {preview.detectedFamilyLabel ?? "None"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              Parent override family
                            </p>
                            <p className="mt-1 text-sm text-zinc-700">
                              {preview.parentOverrideFamilyLabel ?? "None"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              Final family used
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-950">
                              {preview.finalFamilyLabel ?? "Review words"}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-1 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              Detected diagnosis
                            </p>
                            <p className="mt-1 text-sm text-zinc-700">
                              {preview.detectedDiagnosis}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                              Final diagnosis
                            </p>
                            <p className="mt-1 text-sm font-medium text-zinc-950">
                              {preview.finalDiagnosis}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                            Focus word
                          </p>
                          <p className="mt-1 text-sm font-semibold text-zinc-950">
                            {preview.focusWord ?? "None"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                            Generated target words
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {preview.targetWords.length > 0 ? (
                              preview.targetWords.map((word) => (
                                <span
                                  key={`${preview.key}-${word}`}
                                  className="rounded-full bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-800"
                                >
                                  {word}
                                </span>
                              ))
                            ) : (
                              <p className="text-sm text-zinc-500">
                                No target words generated.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-6 text-sm leading-6 text-zinc-600">
                No analysed misspellings are available for assignment quality review yet.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </div>
    </AppShell>
  );
}
