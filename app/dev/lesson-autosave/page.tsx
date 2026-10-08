import { notFound, redirect } from "next/navigation";
import { StructuredLessonResponse } from "@/components/structured-lesson-response";
import type { StructuredLessonDocument } from "@/lib/lessons/schema";

const lesson: StructuredLessonDocument = {
  version: 1,
  theme: "scarlett-default",
  title: "Lesson autosave fixture",
  blocks: [{ block_id: "answer", block_type: "question_textarea", label: "Answer" }],
};

async function saveSilently(formData: FormData) {
  "use server";
  if (process.env.NODE_ENV === "production") return { ok: false };
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  return { ok: !String(formData.get("submission_text")).includes("FAIL") };
}

async function saveDraft(formData: FormData) {
  "use server";
  if (process.env.NODE_ENV === "production") notFound();
  redirect(`/dev/lesson-autosave?result=${encodeURIComponent(`draft:${formData.get("submission_text")}`)}`);
}

async function submit(formData: FormData) {
  "use server";
  if (process.env.NODE_ENV === "production") notFound();
  redirect(`/dev/lesson-autosave?result=${encodeURIComponent(`submit:${formData.get("submission_text")}`)}`);
}

export default async function LessonAutosavePage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; child?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { result, child } = await searchParams;
  const childId = child === "other" ? "fixture-other" : "fixture-child";
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Lesson autosave browser fixture</h1>
      {result ? <p data-testid="form-result">{result}</p> : null}
      <form action={submit}>
        <input type="hidden" name="task_id" value="fixture-task" />
        <input type="hidden" name="course_id" value="fixture-course" />
        <input type="hidden" name="child_id" value={childId} />
        <StructuredLessonResponse
          key={childId}
          lesson={lesson}
          submitLabel="Submit lesson"
          saveDraftAction={saveDraft}
          saveDraftSilentlyAction={saveSilently}
          draftContext={{
            taskId: "fixture-task",
            courseId: "fixture-course",
            childId,
            redirectPath: "/dev/lesson-autosave",
            sessionId: "fixture",
          }}
        />
      </form>
    </main>
  );
}
