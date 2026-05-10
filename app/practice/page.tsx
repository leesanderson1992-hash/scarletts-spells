import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getChildRewardLedgerReadModel } from "@/lib/rewards/read-model";
import {
  resolvePracticeFamily,
  type WordFamilyRecord,
} from "@/lib/spelling/familyCatalog";
import {
  findWordFamilyForWord,
  getWordFamilyById,
  type WordFamilyId,
} from "@/lib/spelling/wordFamilies";
import { ensureChildDailyAssignment } from "@/lib/spelling/ensureDailyAssignment";
import { createClient } from "@/lib/supabase/server";

import { PracticeSession } from "./practice-session";

type PracticeLessonType = "tricky_word" | "rule" | "morphology" | "sound" | "homophone";
type HomophonePromptExample = {
  answer: string;
  sentence: string;
};
type PracticeQueuePhase =
  | "core"
  | "due_review";

type ChildRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  is_archived: boolean;
};

type DailyAssignmentRow = {
  id: string;
  title: string | null;
  instructions: string | null;
  focus_word?: string | null;
  selected_family_slug?: string | null;
  assignment_generation_source?: string | null;
  source_learning_item_ids?: string[] | null;
  target_words: string[] | null;
  review_words: string[] | null;
  status: string | null;
  assignment_date: string;
  session_started_at?: string | null;
  session_completed_at?: string | null;
  session_completed_words?: number | null;
  gold_coin_awarded?: boolean | null;
  ingredient_awarded?: boolean | null;
};

type CanonicalPracticeCatalogRow = {
  display_name: string;
  skill_family_key: string | null;
  metadata: Record<string, unknown>;
};

function getAssignmentSourceLabel(source: string | null | undefined) {
  if (source === "learning_items") {
    return "Built from active learning items";
  }

  if (source === "historical_pre_phase5") {
    return "Historic pre-Phase 5 assignment";
  }

  return null;
}

function getAssignmentSourceDescription(source: string | null | undefined) {
  if (source === "learning_items") {
    return "Teaching context is coming from the linked canonical learning stream for this assignment.";
  }

  if (source === "historical_pre_phase5") {
    return "This older assignment was created before the final Phase 5 destructive cleanup pass completed.";
  }

  return null;
}

function getChildName(child: ChildRow) {
  return [child.first_name, child.last_name].filter(Boolean).join(" ");
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(dateString));
}

function getCleanWords(words: string[] | null) {
  return Array.from(
    new Set((words ?? []).map((word) => word.trim().toLowerCase()).filter(Boolean)),
  );
}

function getDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

const RELATED_FAMILY_MAP: Record<string, string[]> = {
  silent_e_words: ["drop_final_e_ing"],
  drop_final_e_ing: ["silent_e_words"],
  double_consonant_suffix: ["no_double_consonant"],
  no_double_consonant: ["double_consonant_suffix"],
  change_y_to_i: ["double_consonant_suffix"],
  double_letters: ["double_consonant_suffix"],
  homophone_there_their_theyre: ["homophones_year_2"],
  homophone_to_too_two: ["homophones_year_2"],
  homophone_weather_whether: ["homophones_year_3_4"],
  homophone_whose_whos: ["homophones_year_3_4"],
};

const MAX_SAME_FAMILY_BONUS_WORDS = 4;
const MAX_RELATED_FAMILY_BONUS_WORDS = 2;
const MIN_QUEUE_BEFORE_RELATED_FAMILY = 10;

function wordMatchesFamily(
  word: string,
  familySlug: string | null | undefined,
  availableFamilies: WordFamilyRecord[],
) {
  if (!familySlug) {
    return false;
  }

  const resolvedFamily = resolvePracticeFamily(familySlug, availableFamilies);
  if (resolvedFamily?.practiceWords.includes(word)) {
    return true;
  }

  const builtinFamily =
    resolvedFamily?.builtinFamilyId
      ? getWordFamilyById(resolvedFamily.builtinFamilyId)
      : getWordFamilyById(familySlug as WordFamilyId);

  if (builtinFamily?.practiceWords.includes(word)) {
    return true;
  }

  return builtinFamily ? findWordFamilyForWord(word)?.id === builtinFamily.id : false;
}

function buildCoreLessonWords(
  focusWord: string | null | undefined,
  selectedFamilySlug: string | null | undefined,
  targetWords: string[],
  availableFamilies: WordFamilyRecord[],
) {
  const cleanFocusWord = focusWord?.trim().toLowerCase() ?? "";

  if (!selectedFamilySlug) {
    return getCleanWords([cleanFocusWord, ...targetWords]).slice(0, 6);
  }

  const sameFamilyTargets = getCleanWords(targetWords).filter(
    (word) =>
      word !== cleanFocusWord &&
      wordMatchesFamily(word, selectedFamilySlug, availableFamilies),
  );
  const familyBonusWords = buildFamilyBonusWords(
    selectedFamilySlug,
    availableFamilies,
    cleanFocusWord ? [cleanFocusWord, ...sameFamilyTargets] : sameFamilyTargets,
  );

  return getCleanWords([
    cleanFocusWord,
    ...sameFamilyTargets,
    ...familyBonusWords,
  ]).slice(0, 6);
}

function getCanonicalTeachingNote(metadata: Record<string, unknown>) {
  const teachingPoint = metadata.teaching_point;
  return typeof teachingPoint === "string" ? teachingPoint : null;
}

function getCanonicalStarterWords(metadata: Record<string, unknown>) {
  const starterWordBank = metadata.starter_word_bank;
  if (!Array.isArray(starterWordBank)) {
    return [] as string[];
  }

  return getCleanWords(
    starterWordBank.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const word = "word" in entry ? entry.word : null;
      return typeof word === "string" ? [word] : [];
    }),
  );
}

function getCanonicalPracticeLessonType(
  skillFamilyKey: string | null | undefined,
): PracticeLessonType {
  switch (skillFamilyKey) {
    case "D4_PG":
      return "sound";
    case "D4_MOR":
      return "morphology";
    default:
      return "rule";
  }
}

function buildFamilyBonusWords(
  selectedFamilySlug: string | null | undefined,
  availableFamilies: WordFamilyRecord[],
  usedWords: string[],
) {
  if (!selectedFamilySlug) {
    return [];
  }

  const resolvedFamily = resolvePracticeFamily(selectedFamilySlug, availableFamilies);
  const familyWords = resolvedFamily?.practiceWords ?? [];

  return getCleanWords(familyWords)
    .filter((word) => !usedWords.includes(word))
    .slice(0, MAX_SAME_FAMILY_BONUS_WORDS);
}

function buildRelatedFamilyBonusWords(
  selectedFamilySlug: string | null | undefined,
  availableFamilies: WordFamilyRecord[],
  usedWords: string[],
) {
  const relatedFamilySlugs = selectedFamilySlug
    ? RELATED_FAMILY_MAP[selectedFamilySlug] ?? []
    : [];

  return getCleanWords(
    relatedFamilySlugs.flatMap((familySlug) => {
      const resolvedFamily = resolvePracticeFamily(familySlug, availableFamilies);
      const builtinFamily =
        resolvedFamily?.builtinFamilyId
          ? getWordFamilyById(resolvedFamily.builtinFamilyId)
          : getWordFamilyById(familySlug as WordFamilyId);

      return [
        ...(resolvedFamily?.practiceWords ?? []),
        ...(builtinFamily?.practiceWords ?? []),
      ];
    }),
  )
    .filter((word) => !usedWords.includes(word))
    .slice(0, MAX_RELATED_FAMILY_BONUS_WORDS);
}

function getPracticeTeachingNote(
  familyId: string | null | undefined,
  availableFamilies: WordFamilyRecord[],
) {
  if (!familyId) {
    return null;
  }

  const resolvedFamily = resolvePracticeFamily(familyId, availableFamilies);
  if (resolvedFamily?.teachingNote) {
    return resolvedFamily.teachingNote;
  }

  const builtinFamily =
    resolvedFamily?.builtinFamilyId
      ? getWordFamilyById(resolvedFamily.builtinFamilyId)
      : getWordFamilyById(familyId as WordFamilyId);

  return builtinFamily?.description ?? null;
}

function getPracticeFamilyLabel(
  familyId: string | null | undefined,
  availableFamilies: WordFamilyRecord[],
) {
  if (!familyId) {
    return null;
  }

  const resolvedFamily = resolvePracticeFamily(familyId, availableFamilies);
  if (resolvedFamily?.label) {
    return resolvedFamily.label;
  }

  const builtinFamily =
    resolvedFamily?.builtinFamilyId
      ? getWordFamilyById(resolvedFamily.builtinFamilyId)
      : getWordFamilyById(familyId as WordFamilyId);

  return builtinFamily?.label ?? null;
}

function getPracticeLessonType(
  familyId: string | null | undefined,
  availableFamilies: WordFamilyRecord[],
): PracticeLessonType {
  if (!familyId) {
    return "rule";
  }

  const resolvedFamily = resolvePracticeFamily(familyId, availableFamilies);
  const resolvedCategory = resolvedFamily?.category.trim().toLowerCase();

  if (resolvedCategory?.includes("irregular") || resolvedCategory?.includes("tricky")) {
    return "tricky_word";
  }

  if (resolvedCategory?.includes("homophone")) {
    return "homophone";
  }

  if (resolvedCategory?.includes("morphology")) {
    return "morphology";
  }

  if (resolvedCategory?.includes("phonic") || resolvedCategory?.includes("sound")) {
    return "sound";
  }

  const builtinFamily =
    resolvedFamily?.builtinFamilyId
      ? getWordFamilyById(resolvedFamily.builtinFamilyId)
      : getWordFamilyById(familyId as WordFamilyId);

  switch (builtinFamily?.id) {
    case "schwa_unstressed_vowel":
    case "ie_ei_patterns":
      return "sound";
    case "homophones_year_2":
    case "homophones_year_3_4":
    case "homophone_there_their_theyre":
    case "homophone_to_too_two":
    case "homophone_weather_whether":
    case "homophone_whose_whos":
      return "homophone";
    case "change_y_to_i":
    case "drop_final_e_ing":
    case "double_consonant_suffix":
    case "no_double_consonant":
      return "morphology";
    case "tricky_common_words":
      return "tricky_word";
    default:
      return "rule";
  }
}

function getPracticeFamilyWords(
  familyId: string | null | undefined,
  availableFamilies: WordFamilyRecord[],
) {
  if (!familyId) {
    return [];
  }

  const resolvedFamily = resolvePracticeFamily(familyId, availableFamilies);
  if (resolvedFamily?.practiceWords.length) {
    return resolvedFamily.practiceWords;
  }

  const builtinFamily =
    resolvedFamily?.builtinFamilyId
      ? getWordFamilyById(resolvedFamily.builtinFamilyId)
      : getWordFamilyById(familyId as WordFamilyId);

  return builtinFamily?.practiceWords ?? [];
}

function getPracticePromptExamples(
  familyId: string | null | undefined,
  availableFamilies: WordFamilyRecord[],
): HomophonePromptExample[] {
  if (!familyId) {
    return [];
  }

  const resolvedFamily = resolvePracticeFamily(familyId, availableFamilies);
  return resolvedFamily?.promptExamples ?? [];
}

type PracticePageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
  }>;
};

export default async function PracticePage({ searchParams }: PracticePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);
  const isChildMode = resolvedSearchParams?.mode === "child";
  const activeChildIdFromCookie = await getActiveChildIdFromCookies();

  const { data: children } = await supabase
    .from("children")
    .select("id, first_name, last_name, is_archived")
    .eq("parent_user_id", user.id)
    .order("created_at", { ascending: true });

  if (!children || children.length === 0) {
    return (
      <AppShell currentPath="/practice" mode={mode} activeChildId={null} availableChildren={[]} userEmail={user.email}>
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Practice
            </h1>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              Create a child profile first so we know whose daily spelling work to load.
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

  if (isChildMode) {
    redirect(buildScopedPath("/learn/week", selectedChild?.id ?? null, "child"));
  }

  if (activeChildren.length === 0) {
    return (
      <AppShell currentPath="/practice" mode={mode} activeChildId={null} availableChildren={[]} userEmail={user.email}>
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Practice
            </h1>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              There are no active child profiles to practise with right now. Restore one or add a new child from the children page first.
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
    redirect(buildScopedPath("/practice", activeChildren[0]?.id ?? null, mode));
  }

  const today = getDateOnly(new Date());
  let latestAssignment: DailyAssignmentRow | null = null;
  let canonicalPrimaryCatalogRow: CanonicalPracticeCatalogRow | null = null;
  const { data: wordFamilyRows } = await supabase
    .from("word_families")
    .select("*")
    .order("priority", { ascending: true })
    .order("family_name", { ascending: true });
  const availableFamilies = (wordFamilyRows ?? []) as WordFamilyRecord[];

  if (mode === "child") {
    latestAssignment = await ensureChildDailyAssignment({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      today,
      availableFamilies,
    });
  } else {
    const { data } = await supabase
      .from("daily_assignments")
      .select(
        "id, title, instructions, focus_word, selected_family_slug, assignment_generation_source, source_learning_item_ids, target_words, review_words, status, assignment_date, session_started_at, session_completed_at, session_completed_words, gold_coin_awarded, ingredient_awarded",
      )
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .order("assignment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<DailyAssignmentRow>();

    latestAssignment = data;
  }

  if (!latestAssignment) {
    return (
      <AppShell currentPath="/practice" mode={mode} activeChildId={selectedChild.id} availableChildren={activeChildren} userEmail={user.email}>
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Practice
            </h1>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              {mode === "child"
                ? `There are no due practice words ready for ${getChildName(selectedChild)} just yet. Ask a parent to generate a new assignment after fresh analysis, or come back when review words are due.`
                : `There isn&apos;t a daily assignment ready for ${getChildName(selectedChild)} yet. Create one from the analysis page first.`}
            </p>
            <Link
              href={buildScopedPath("/analyse", selectedChild.id, mode)}
              className="brand-primary-btn mt-5"
            >
              Go to analyse
            </Link>
          </section>
        </div>
      </div>
      </AppShell>
    );
  }

  const canonicalLearningItemIds =
    latestAssignment.assignment_generation_source === "learning_items"
      ? latestAssignment.source_learning_item_ids ?? []
      : [];
  const assignmentSourceLabel = getAssignmentSourceLabel(
    latestAssignment.assignment_generation_source,
  );
  const assignmentSourceDescription = getAssignmentSourceDescription(
    latestAssignment.assignment_generation_source,
  );

  if (canonicalLearningItemIds.length > 0) {
    const { data: linkedLearningItems } = await supabase
      .from("learning_items")
      .select("id, micro_skill_key, skill_family_key")
      .eq("parent_user_id", user.id)
      .eq("child_id", selectedChild.id)
      .in("id", canonicalLearningItemIds);
    const learningItemById = new Map(
      (linkedLearningItems ?? []).map((item) => [item.id, item]),
    );
    const primaryLearningItem =
      canonicalLearningItemIds
        .map((id) => learningItemById.get(id))
        .find(Boolean) ?? null;

    if (primaryLearningItem?.micro_skill_key) {
      const { data: catalogRow } = await supabase
        .from("micro_skill_catalog")
        .select("display_name, skill_family_key, metadata")
        .eq("micro_skill_key", primaryLearningItem.micro_skill_key)
        .maybeSingle<CanonicalPracticeCatalogRow>();

      canonicalPrimaryCatalogRow = catalogRow ?? null;
    }
  }

  const targetWords = getCleanWords(latestAssignment.target_words);
  const reviewWords = getCleanWords(latestAssignment.review_words).filter(
    (word) => !targetWords.includes(word),
  );
  const practiceTeachingNote = canonicalPrimaryCatalogRow
    ? getCanonicalTeachingNote(canonicalPrimaryCatalogRow.metadata)
    : getPracticeTeachingNote(latestAssignment.selected_family_slug, availableFamilies);
  const practiceFamilyWords = canonicalPrimaryCatalogRow
    ? getCanonicalStarterWords(canonicalPrimaryCatalogRow.metadata)
    : getPracticeFamilyWords(latestAssignment.selected_family_slug, availableFamilies);
  const practicePromptExamples = canonicalPrimaryCatalogRow
    ? []
    : getPracticePromptExamples(latestAssignment.selected_family_slug, availableFamilies);
  const practiceFamilyLabel = canonicalPrimaryCatalogRow
    ? canonicalPrimaryCatalogRow.display_name
    : getPracticeFamilyLabel(latestAssignment.selected_family_slug, availableFamilies);
  const practiceLessonType = canonicalPrimaryCatalogRow
    ? getCanonicalPracticeLessonType(canonicalPrimaryCatalogRow.skill_family_key)
    : getPracticeLessonType(latestAssignment.selected_family_slug, availableFamilies);
  const allAssignmentWords = [...targetWords, ...reviewWords];
  const rewardLedgerReadModel = await getChildRewardLedgerReadModel({
    supabase,
    parentUserId: user.id,
    childId: selectedChild.id,
  });

  if (allAssignmentWords.length === 0) {
    return (
      <AppShell currentPath="/practice" mode={mode} activeChildId={selectedChild.id} availableChildren={activeChildren} userEmail={user.email}>
      <div className="brand-page px-6 py-12">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Practice
            </h1>
            <p className="brand-copy mt-3 max-w-2xl text-sm leading-6">
              The latest assignment for {getChildName(selectedChild)} doesn&apos;t contain any
              words yet. Generate a fresh assignment from the analysis page first.
            </p>
            <Link
              href={buildScopedPath("/analyse", selectedChild.id, mode)}
              className="brand-primary-btn mt-5"
            >
              Go to analyse
            </Link>
          </section>
        </div>
      </div>
      </AppShell>
    );
  }

  const practiceWords = [
    ...targetWords.map((word) => ({
      word,
      kind: "target" as const,
      phase: "core" as const satisfies PracticeQueuePhase,
    })),
    ...reviewWords.map((word) => ({
      word,
      kind: "review" as const,
      phase: "due_review" as const satisfies PracticeQueuePhase,
    })),
  ];

  return (
    <AppShell currentPath="/practice" mode={mode} activeChildId={selectedChild.id} availableChildren={activeChildren} userEmail={user.email}>
    <div className="brand-page px-6 py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {mode === "child" ? null : (
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">
              Scarlett&apos;s Spells
            </p>
            <h1 className="brand-title mt-3 text-4xl font-semibold tracking-tight">
              Practice
            </h1>
            <p className="brand-copy mt-3 max-w-3xl text-sm leading-6">
              Today&apos;s practice for {getChildName(selectedChild)} is ready. Move slowly through
              each word using the Look, Say, Explain, Cover, Write, Check, Use routine.
            </p>
            <p className="brand-copy mt-4 text-sm">
              Latest assignment saved {formatDate(latestAssignment.assignment_date)}.
            </p>
            {assignmentSourceLabel ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-zinc-700">
                <span className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-700">
                  {assignmentSourceLabel}
                </span>
                {assignmentSourceDescription ? (
                  <span>{assignmentSourceDescription}</span>
                ) : null}
              </div>
            ) : null}
          </section>
        )}

        <PracticeSession
          childId={selectedChild.id}
          childName={getChildName(selectedChild)}
          sessionMode={mode}
          assignmentId={latestAssignment.id}
          assignmentTitle={latestAssignment.title ?? "Daily spelling practice"}
          lessonType={practiceLessonType}
          familyId={canonicalPrimaryCatalogRow ? null : latestAssignment.selected_family_slug ?? null}
          familyLabel={practiceFamilyLabel}
          teachingNote={practiceTeachingNote}
          familyWords={practiceFamilyWords}
          promptExamples={practicePromptExamples}
          targetWords={targetWords}
          reviewWords={reviewWords}
          words={practiceWords}
          plannedWordCount={allAssignmentWords.length}
          status={latestAssignment.status ?? "pending"}
          isReviewOnly={targetWords.length === 0 && reviewWords.length > 0}
          sameFamilyBonusCount={0}
          dueReviewCount={reviewWords.length}
          relatedBonusCount={0}
          goldCoinCount={rewardLedgerReadModel.spendableSnapshot.spendableGoldCoins}
        />
      </div>
    </div>
    </AppShell>
  );
}
