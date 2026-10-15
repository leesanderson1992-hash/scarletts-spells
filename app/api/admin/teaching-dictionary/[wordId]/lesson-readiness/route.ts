import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin/access";
import { isUuid } from "@/lib/writing-engine/whole-writing/knowledge-review";
import { loadLessonReadiness } from "@/lib/teaching-dictionary-manager/lesson-preflight";
import { wordRoutesFromPreflights } from "@/lib/teaching-dictionary-manager/workspace-read-model";
import { loadCachedTeachingDictionaryEvidenceAuthority } from "@/lib/teaching-dictionary-manager/evidence-authority";
import { resolveAdleRouteActivationEnvironment } from "@/lib/adle/route-activation-environment";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ wordId: string }> }) {
  const started = performance.now();
  await requireAdminUser();
  const { wordId } = await params;
  if (!isUuid(wordId)) return NextResponse.json({ error: "TEACHING_WORD_ID_INVALID" }, { status: 400 });
  const environment = resolveAdleRouteActivationEnvironment();
  const [preflights, authority] = await Promise.all([
    loadLessonReadiness({ wordId }),
    environment ? loadCachedTeachingDictionaryEvidenceAuthority(environment) : null,
  ]);
  return NextResponse.json({
    routeContents: wordRoutesFromPreflights(preflights, wordId, ""),
    skillKeys: [...new Set([
      ...(authority?.relationships ?? []).filter(row => row.canonicalWordId === wordId).map(row => row.microSkillKey),
      ...preflights.map(row => row.microSkillKey),
    ])],
    preflights: preflights.map(({ releasePackage: _package, ...row }) => {
      void _package;
      return { ...row, compilerWitnesses: row.compilerWitnesses[wordId] ? { [wordId]: row.compilerWitnesses[wordId] } : {}, words: row.words.filter(word => word.id === wordId),
        issues: row.issues.filter(issue => !issue.wordId || issue.wordId === wordId) };
    }),
  }, { headers: { "Cache-Control": "private, no-store", "Server-Timing": `lesson-readiness;dur=${Math.round(performance.now() - started)}` } });
}
