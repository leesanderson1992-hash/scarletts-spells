import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { DailySpellingPracticeViewer } from "@/components/daily-spelling-practice-viewer";
import { completeDailySpellingPracticeAction } from "./actions";
import {
  buildScopedPath,
  getActiveChildIdFromCookies,
  normaliseAppMode,
  selectChildById,
} from "@/lib/children";
import { getActiveChildrenForUser } from "@/lib/courses/queries";
import { getDateOnly } from "@/lib/courses/progress";
import { createClient } from "@/lib/supabase/server";
import {
  buildMissingDailySpellingPracticeReadModel,
  getDailySpellingPracticeReadModel,
  type DailySpellingPracticeReadModel,
} from "@/lib/writing-practice/daily-spelling-practice-read-model";

type LearnWeekPracticePageProps = {
  searchParams?: Promise<{
    child?: string;
    mode?: string;
  }>;
};

async function withReadBoundaryTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Daily spelling practice read timed out."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function getPracticeStateCopy(practice: DailySpellingPracticeReadModel) {
  if (practice.state === "completed" || practice.state === "skipped") {
    return {
      title: practice.childCopy.done,
      body: "You can carry on with your week.",
    };
  }

  if (practice.state === "blocked") {
    return {
      title: "This practice item is not ready here yet.",
      body: "You can carry on with your week.",
    };
  }

  return {
    title: practice.childCopy.empty,
    body: "You can carry on with your week.",
  };
}

export default async function LearnWeekPracticePage({
  searchParams,
}: LearnWeekPracticePageProps) {
  const resolvedSearchParams = await searchParams;
  const mode = normaliseAppMode(resolvedSearchParams?.mode);

  if (mode !== "child") {
    redirect(buildScopedPath("/dashboard", resolvedSearchParams?.child, "parent"));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const activeChildIdFromCookie = await getActiveChildIdFromCookies();
  const children = await getActiveChildrenForUser(supabase, user.id);
  const selectedChild = selectChildById(
    children,
    resolvedSearchParams?.child ?? activeChildIdFromCookie,
  );

  if (!selectedChild) {
    notFound();
  }

  const today = getDateOnly();
  const backHref = buildScopedPath("/learn/week", selectedChild.id, "child");
  const practice = await withReadBoundaryTimeout(
    getDailySpellingPracticeReadModel({
      supabase,
      parentUserId: user.id,
      childId: selectedChild.id,
      practiceDate: today,
    }),
    2500,
  ).catch(() => buildMissingDailySpellingPracticeReadModel(today));
  const supportedItems = practice.items.filter(
    (item) => item.isSupportedForChildSurface,
  );
  const currentPath = "/learn/week/practice";

  return (
    <AppShell
      currentPath={currentPath}
      mode="child"
      activeChildId={selectedChild.id}
      availableChildren={children}
      userEmail={user.email}
      layout="focus"
    >
      <main className="mx-auto grid w-full max-w-3xl gap-5 px-4 py-6 sm:px-6">
        {practice.state === "ready" && supportedItems.length > 0 ? (
          <DailySpellingPracticeViewer
            items={supportedItems}
            backHref={backHref}
            dailyAssignmentId={practice.assignment?.id ?? ""}
            practiceDate={practice.practiceDate}
            childId={selectedChild.id}
            completeAction={completeDailySpellingPracticeAction}
          />
        ) : (
          <section className="brand-card rounded-3xl p-6">
            <p className="brand-eyebrow">{practice.childCopy.title}</p>
            <h1 className="brand-title mt-2 text-2xl font-semibold">
              {getPracticeStateCopy(practice).title}
            </h1>
            <p className="brand-copy mt-3 text-sm">
              {getPracticeStateCopy(practice).body}
            </p>
            <Link href={backHref} className="brand-link mt-5 inline-flex text-sm font-medium">
              Back to this week
            </Link>
          </section>
        )}
      </main>
    </AppShell>
  );
}
