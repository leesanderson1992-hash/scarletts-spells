import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadLessonReadiness } from "@/lib/teaching-dictionary-manager/lesson-preflight";
import { wordRoutesFromPreflights } from "@/lib/teaching-dictionary-manager/workspace-read-model";
import { loadCachedTeachingDictionaryEvidenceAuthorityForWord } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { wordRouteStatus } from "@/lib/teaching-dictionary-manager/word-route-status";
import { loadRouteWordStatuses } from "@/lib/teaching-dictionary-manager/route-word-status-service";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ wordId: string }> }) {
  const started = performance.now();
  await requireAdminUser();
  const { wordId } = await params;
  if (!isUuid(wordId)) return NextResponse.json({ error: "TEACHING_WORD_ID_INVALID" }, { status: 400 });
  const environment = resolveAdleRouteActivationEnvironment();
  const db = createServiceRoleClient();
  const [authority, dictionary] = await Promise.all([
    environment ? loadCachedTeachingDictionaryEvidenceAuthorityForWord(environment, wordId) : null,
    db.from("canonical_teaching_dictionary_words")
      .select("id,row_status,review_status").eq("id", wordId).single(),
  ]);
  if (dictionary.error || !dictionary.data) return NextResponse.json({ error: "TEACHING_WORD_NOT_FOUND" }, { status: 404 });
  const assignedSkillKeys = [...new Set((authority?.relationships ?? [])
    .filter(row => row.canonicalWordId === wordId).map(row => row.microSkillKey))];
  const approvedSkillKeys = new Set(assignedSkillKeys);
  const preflights = await loadLessonReadiness({ wordId, approvedSkillKeys: assignedSkillKeys });
  const schwaStatuses = await Promise.all(preflights.filter((lesson) => lesson.routeId === "weak_vowel_word_lab")
    .map(async (lesson) => (await loadRouteWordStatuses({ routeId: lesson.routeId, microSkillKey: lesson.microSkillKey,
      lesson, wordIds: [wordId] })).words[0]?.status));
  const schwaBySkill = new Map(schwaStatuses.filter((status) => Boolean(status))
    .map((status) => [status!.microSkillKey, status!]));
  return NextResponse.json({
    routeContents: wordRoutesFromPreflights(preflights, wordId, ""),
    assignedSkillKeys,
    skillKeys: [...new Set([
      ...assignedSkillKeys,
      ...preflights.map(row => row.microSkillKey),
    ])],
    wordRouteStatuses: preflights.map(lesson => schwaBySkill.get(lesson.microSkillKey) ?? wordRouteStatus({
      wordId,
      dictionaryApproved: dictionary.data.row_status === "active" && dictionary.data.review_status === "approved_for_first_exposure",
      approvedSkillKeys,
      lesson,
    })),
    preflights: preflights.map(({ releasePackage: _package, ...row }) => {
      void _package;
      return { ...row, compilerWitnesses: row.compilerWitnesses[wordId] ? { [wordId]: row.compilerWitnesses[wordId] } : {}, words: row.words.filter(word => word.id === wordId),
        issues: row.issues.filter(issue => !issue.wordId || issue.wordId === wordId) };
    }),
  }, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `lesson-readiness;dur=${Math.round(performance.now() - started)}` } });
}
