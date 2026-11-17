import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { summarizeWordPreflight, type WordReadinessResponse } from "@/lib/teaching-dictionary-manager/word-readiness-response";
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
const worker = randomUUID();
let readinessRequests = 0;

export async function GET(request: Request, { params }: { params: Promise<{ wordId: string }> }) {
  const started = performance.now();
  await requireAdminUser();
  const authorizedAt = performance.now();
  const { wordId } = await params;
  if (!isUuid(wordId)) return NextResponse.json({ error: "TEACHING_WORD_ID_INVALID" }, { status: 400 });
  const previewSkill = new URL(request.url).searchParams.get("preview");
  if (previewSkill !== null && !/^[a-z0-9_]{1,128}$/iu.test(previewSkill)) {
    return NextResponse.json({ error: "TEACHING_PREVIEW_SKILL_INVALID" }, { status: 400 });
  }
  const requestNumber = previewSkill ? null : ++readinessRequests;
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
  const preflightStarted = performance.now();
  const preflights = await loadLessonReadiness({ wordId, approvedSkillKeys: assignedSkillKeys,
    requestedWordSkill: previewSkill ?? undefined, sharePackageHashes: true });
  const preflightMs = Math.round(performance.now() - preflightStarted);
  if (previewSkill) {
    const preview = preflights.find(row => row.microSkillKey === previewSkill);
    return NextResponse.json({ compiledPreview: preview?.compiledPreview ?? null,
      releaseContentPreview: preview?.releaseContentPreview ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
  }
  const schwaStatuses = await Promise.all(preflights.filter((lesson) => lesson.routeId === "weak_vowel_word_lab")
    .map(async (lesson) => (await loadRouteWordStatuses({ routeId: lesson.routeId, microSkillKey: lesson.microSkillKey,
      lesson, wordIds: [wordId] })).words[0]?.status));
  const schwaBySkill = new Map(schwaStatuses.filter((status) => Boolean(status))
    .map((status) => [status!.microSkillKey, status!]));
  const timing = {
    authMs: Math.round(authorizedAt - started),
    evidenceMs: Math.round(preflightStarted - authorizedAt),
    preflightMs,
    totalMs: Math.round(performance.now() - started),
  };
  if (process.env.ADLE_READ_METRICS_ENABLED === "1") {
    console.info(JSON.stringify({ event: "teaching_dictionary_readiness_timing", worker, requestNumber, ...timing }));
  }
  return NextResponse.json({
    routeContents: wordRoutesFromPreflights(preflights, wordId, ""),
    assignedSkillKeys,
    wordRouteStatuses: preflights.map(lesson => schwaBySkill.get(lesson.microSkillKey) ?? wordRouteStatus({
      wordId,
      dictionaryApproved: dictionary.data.row_status === "active" && dictionary.data.review_status === "approved_for_first_exposure",
      approvedSkillKeys,
      lesson,
    })),
    preflights: preflights.map(row => summarizeWordPreflight(row, wordId)),
  } satisfies WordReadinessResponse, { headers: {
    "Cache-Control": "private, no-store",
    "Server-Timing": `lesson-readiness;dur=${timing.totalMs}, auth;dur=${timing.authMs}, evidence;dur=${timing.evidenceMs}, preflight;dur=${timing.preflightMs}`,
    "X-Readiness-Worker": worker,
    "X-Readiness-Request-Number": String(requestNumber),
  } });
}
